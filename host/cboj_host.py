#!/usr/bin/env python3
"""Convenient BOJ - 내 PC 실행 도우미 (크롬 Native Messaging 호스트)

확장 프로그램이 보낸 코드를 이 PC에서 컴파일·실행하고, 출력을 실시간으로 돌려준다.
크롬이 이 프로그램을 직접 켜고 끄며, 화면에 창은 뜨지 않는다.

메시지 (확장 → 도우미)
  {"type": "info"}
  {"type": "run",   "id": n, "lang": {...}, "code": "...", "stdin": "...", "interactive": true}
  {"type": "batch", "id": n, "lang": {...}, "code": "...", "inputs": ["...", ...], "timeLimit": 10}
  {"type": "stdin", "id": n, "data": "..."}   실행 중인 프로그램에 입력 보내기
  {"type": "eof",   "id": n}                  입력 끝 (Ctrl+D)
  {"type": "kill",  "id": n}                  강제 종료

메시지 (도우미 → 확장)
  info / compile / compiled / start / out / exit / batch-result / error
"""
import codecs
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time

VERSION = '1.0.0'
IS_WIN = os.name == 'nt'
NO_WINDOW = 0x08000000 if IS_WIN else 0  # CREATE_NO_WINDOW: 콘솔 창이 뜨지 않게
OUT_LIMIT = 2_000_000                    # 실시간 출력 최대 바이트 (넘으면 종료)
BATCH_OUT_LIMIT = 200_000                # 예제 채점 결과 하나당 최대 문자 수

if IS_WIN:
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

_send_lock = threading.Lock()


def send(msg):
    data = json.dumps(msg, ensure_ascii=False).encode('utf-8')
    with _send_lock:
        sys.stdout.buffer.write(struct.pack('=I', len(data)) + data)
        sys.stdout.buffer.flush()


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    size = struct.unpack('=I', raw)[0]
    return json.loads(sys.stdin.buffer.read(size).decode('utf-8'))


# ───────── 컴파일러 찾기 ─────────
def _search_path():
    """크롬이 켜진 뒤에 gcc를 설치해도 찾을 수 있게 레지스트리의 PATH와 흔한 설치 위치까지 본다."""
    dirs = os.environ.get('PATH', '').split(os.pathsep)
    if IS_WIN:
        try:
            import winreg
            for root, sub in ((winreg.HKEY_CURRENT_USER, r'Environment'),
                              (winreg.HKEY_LOCAL_MACHINE, r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment')):
                try:
                    with winreg.OpenKey(root, sub) as k:
                        value, _ = winreg.QueryValueEx(k, 'Path')
                        dirs += os.path.expandvars(value).split(os.pathsep)
                except OSError:
                    pass
        except ImportError:
            pass
        local = os.environ.get('LOCALAPPDATA', '')
        dirs += [
            os.path.join(local, 'Microsoft', 'WinGet', 'Links'),
            r'C:\msys64\ucrt64\bin', r'C:\msys64\mingw64\bin', r'C:\MinGW\bin', r'C:\mingw64\bin',
        ]
        pkgs = os.path.join(local, 'Microsoft', 'WinGet', 'Packages')
        if os.path.isdir(pkgs):
            for name in os.listdir(pkgs):
                if name.lower().startswith('brechtsanders.winlibs'):
                    dirs.append(os.path.join(pkgs, name, 'mingw64', 'bin'))
    seen, out = set(), []
    for d in dirs:
        d = d.strip().strip('"')
        if d and d.lower() not in seen and os.path.isdir(d):
            seen.add(d.lower())
            out.append(d)
    return os.pathsep.join(out)


SEARCH_PATH = _search_path()


def find_tool(name):
    return shutil.which(name, path=SEARCH_PATH)


def tool_version(path):
    if not path:
        return None
    try:
        r = subprocess.run([path, '--version'], capture_output=True, timeout=10, creationflags=NO_WINDOW)
        return (r.stdout or r.stderr).decode('utf-8', 'replace').splitlines()[0].strip()
    except Exception:  # noqa: BLE001
        return None


TOOLS = {'gcc': find_tool('gcc'), 'g++': find_tool('g++')}


def child_env():
    env = dict(os.environ)
    extra = [os.path.dirname(p) for p in TOOLS.values() if p]
    env['PATH'] = os.pathsep.join(extra + [env.get('PATH', '')])
    env['PYTHONIOENCODING'] = 'utf-8'
    env['PYTHONUTF8'] = '1'
    return env


def info():
    return {
        'type': 'info',
        'version': VERSION,
        'python': sys.version.split()[0],
        'gcc': tool_version(TOOLS['gcc']),
        'gpp': tool_version(TOOLS['g++']),
    }


# ───────── 컴파일 ─────────
# 실시간 실행 때는 C 표준 출력 버퍼를 꺼서 printf가 바로 보이게 한다 (진짜 터미널처럼).
UNBUF_STUB = '#include <stdio.h>\n__attribute__((constructor)) static void cboj_unbuf(void) { setvbuf(stdout, NULL, _IONBF, 0); }\n'


def prepare(lang, code, workdir, interactive):
    """소스를 저장하고 필요하면 컴파일한다. (실행 명령, 표시용 명령, 오류) 를 돌려준다."""
    kind = lang.get('kind')
    if kind == 'python':
        src = os.path.join(workdir, 'main.py')
        with open(src, 'w', encoding='utf-8', newline='\n') as f:
            f.write(code)
        return [sys.executable, '-u', src], f'python main.py  (Python {sys.version.split()[0]})', None, None

    is_c = kind == 'c'
    compiler = TOOLS['gcc' if is_c else 'g++']
    if not compiler:
        return None, None, {
            'code': 'nocompiler',
            'message': ('gcc' if is_c else 'g++') + ' 컴파일러를 찾지 못했어요.',
        }, None
    src = os.path.join(workdir, 'main.c' if is_c else 'main.cpp')
    exe = os.path.join(workdir, 'main.exe' if IS_WIN else 'main')
    with open(src, 'w', encoding='utf-8', newline='\n') as f:
        f.write(code)
    std = lang.get('std') or ('gnu11' if is_c else 'gnu++17')
    args = [compiler, '-O2', f'-std={std}', '-DONLINE_JUDGE', '-DBOJ', src]
    if interactive:
        stub = os.path.join(workdir, 'cboj_unbuf.c')
        with open(stub, 'w', encoding='utf-8') as f:
            f.write(UNBUF_STUB)
        args.append(stub)
    args += ['-o', exe]
    if is_c:
        args.append('-lm')
    if IS_WIN:
        args.append('-static')  # MinGW DLL 없이 실행되게
    shown = f"{'gcc' if is_c else 'g++'} -O2 -std={std} {os.path.basename(src)}"
    try:
        r = subprocess.run(args, capture_output=True, timeout=60, cwd=workdir,
                           creationflags=NO_WINDOW, env=child_env())
    except subprocess.TimeoutExpired:
        return None, shown, {'code': 'compile', 'message': '컴파일이 60초를 넘겨 중단했어요.'}, None
    output = (r.stderr + r.stdout).decode('utf-8', 'replace').replace(workdir + os.sep, '')
    if r.returncode != 0:
        return None, shown, {'code': 'compile', 'message': output}, None
    return [exe], shown, None, output


def describe_exit(code):
    """윈도우 예외 코드 등을 알아보기 쉬운 말로."""
    if code is None:
        return ''
    known = {
        0xC0000005: '메모리 접근 오류 (Segmentation fault)',
        0xC00000FD: '스택 오버플로 (재귀가 너무 깊어요)',
        0xC0000094: '0으로 나누기',
        0xC0000409: '버퍼 오버런 / abort',
        3: 'abort() 호출',
    }
    return known.get(code & 0xFFFFFFFF, '')


# ───────── 실행 ─────────
class Job:
    def __init__(self, msg):
        self.id = msg.get('id')
        self.msg = msg
        self.proc = None
        self.killed = False
        self.over_limit = False
        self.lock = threading.Lock()
        threading.Thread(target=self.run, daemon=True).start()

    def run(self):
        msg = self.msg
        workdir = tempfile.mkdtemp(prefix='cboj_')
        try:
            send({'id': self.id, 'type': 'compile'})
            cmd, shown, err, warnings = prepare(msg.get('lang') or {}, msg.get('code') or '', workdir, True)
            if err:
                send({'id': self.id, 'type': 'compiled', 'ok': False, 'cmd': shown, **err})
                send({'id': self.id, 'type': 'exit', 'code': None, 'ms': 0, 'compileFailed': True})
                return
            send({'id': self.id, 'type': 'compiled', 'ok': True, 'cmd': shown, 'warnings': warnings or ''})
            if self.killed:
                send({'id': self.id, 'type': 'exit', 'code': None, 'ms': 0, 'killed': True})
                return
            with self.lock:
                self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                             stderr=subprocess.PIPE, cwd=workdir, bufsize=0,
                                             creationflags=NO_WINDOW, env=child_env())
            started = time.perf_counter()
            send({'id': self.id, 'type': 'start'})
            if msg.get('stdin'):
                self.write(msg['stdin'])
            readers = [threading.Thread(target=self.pump, args=(self.proc.stdout, 'stdout'), daemon=True),
                       threading.Thread(target=self.pump, args=(self.proc.stderr, 'stderr'), daemon=True)]
            for t in readers:
                t.start()
            code = self.proc.wait()
            ms = int((time.perf_counter() - started) * 1000)
            for t in readers:
                t.join(timeout=2)
            send({'id': self.id, 'type': 'exit', 'code': code, 'ms': ms, 'killed': self.killed,
                  'overLimit': self.over_limit, 'note': describe_exit(code)})
        except Exception as e:  # noqa: BLE001
            send({'id': self.id, 'type': 'error', 'message': str(e)})
            send({'id': self.id, 'type': 'exit', 'code': None, 'ms': 0})
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def pump(self, stream, name):
        decoder = codecs.getincrementaldecoder('utf-8')('replace')
        total = 0
        while True:
            try:
                chunk = stream.read(4096)
            except OSError:
                break
            if not chunk:
                break
            total += len(chunk)
            if total > OUT_LIMIT:
                self.over_limit = True
                self.kill()
                break
            text = decoder.decode(chunk)
            if text:
                send({'id': self.id, 'type': 'out', 'stream': name, 'data': text})
        rest = decoder.decode(b'', final=True)
        if rest:
            send({'id': self.id, 'type': 'out', 'stream': name, 'data': rest})

    def write(self, data):
        try:
            if self.proc and self.proc.stdin:
                self.proc.stdin.write(data.encode('utf-8'))
                self.proc.stdin.flush()
        except (BrokenPipeError, OSError, ValueError):
            pass

    def eof(self):
        try:
            if self.proc and self.proc.stdin:
                self.proc.stdin.close()
        except OSError:
            pass

    def kill(self):
        self.killed = True
        with self.lock:
            if self.proc and self.proc.poll() is None:
                try:
                    self.proc.kill()
                except OSError:
                    pass


def run_batch(msg):
    """예제 채점용: 한 번 컴파일하고 입력마다 실행해서 결과를 한 번에 돌려준다."""
    rid = msg.get('id')
    workdir = tempfile.mkdtemp(prefix='cboj_')
    try:
        cmd, shown, err, warnings = prepare(msg.get('lang') or {}, msg.get('code') or '', workdir, False)
        if err:
            send({'id': rid, 'type': 'batch-result', 'cmd': shown, 'error': err, 'results': []})
            return
        limit = float(msg.get('timeLimit') or 10)
        results = []
        for data in msg.get('inputs') or []:
            started = time.perf_counter()
            try:
                r = subprocess.run(cmd, input=(data or '').encode('utf-8'), capture_output=True, timeout=limit,
                                   cwd=workdir, creationflags=NO_WINDOW, env=child_env())
                ms = int((time.perf_counter() - started) * 1000)
                results.append({
                    'stdout': r.stdout.decode('utf-8', 'replace')[:BATCH_OUT_LIMIT],
                    'stderr': r.stderr.decode('utf-8', 'replace')[:BATCH_OUT_LIMIT],
                    'code': r.returncode, 'ms': ms, 'note': describe_exit(r.returncode),
                })
            except subprocess.TimeoutExpired as e:
                results.append({
                    'stdout': (e.stdout or b'').decode('utf-8', 'replace')[:BATCH_OUT_LIMIT],
                    'stderr': (e.stderr or b'').decode('utf-8', 'replace')[:BATCH_OUT_LIMIT],
                    'code': None, 'ms': int(limit * 1000), 'timeout': True,
                })
        send({'id': rid, 'type': 'batch-result', 'cmd': shown, 'warnings': warnings or '', 'results': results})
    except Exception as e:  # noqa: BLE001
        send({'id': rid, 'type': 'batch-result', 'error': {'code': 'host', 'message': str(e)}, 'results': []})
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def main():
    job = None
    while True:
        msg = read_message()
        if msg is None:  # 크롬이 연결을 끊음
            if job:
                job.kill()
            return
        t = msg.get('type')
        if t == 'info':
            send(info())
        elif t == 'run':
            if job:
                job.kill()
            job = Job(msg)
        elif t == 'batch':
            threading.Thread(target=run_batch, args=(msg,), daemon=True).start()
        elif job and msg.get('id') == job.id:
            if t == 'stdin':
                job.write(msg.get('data') or '')
            elif t == 'eof':
                job.eof()
            elif t == 'kill':
                job.kill()


if __name__ == '__main__':
    main()
