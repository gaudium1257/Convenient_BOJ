// 팝업과 콘텐츠 스크립트가 함께 쓰는 기본값
globalThis.CBOJ_DEFAULTS = Object.freeze({
  splitAutoOpen: false,
  editorTheme: 'light',
  indent: 'tab', // tab(탭 문자) | space(공백 4칸)
  codeOpen: 'default', // default(백준 설정 따름) | open | close | onlyaccepted
  templates: {}, // 사용자가 바꾼 기본 코드 { cpp, c, java, py } (비어 있으면 아래 기본값)
  autocomplete: true, // 입력하면서 자동완성 목록 띄우기 (Ctrl+Space는 항상 가능)
  timerAutoStart: false, // 분할 화면을 열면 풀이 타이머 자동 시작
});

// 언어별 기본 코드. $0 은 처음 커서가 놓일 자리.
globalThis.CBOJ_TEMPLATES = Object.freeze({
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    $0\n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main(void) {\n    $0\n    return 0;\n}\n',
  // 백준 Java 규칙: public class Main. 빠른 입력은 BufferedReader가 백준에서 흔한 형태
  java: 'import java.io.*;\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n'
    + '        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        $0\n    }\n}\n',
  // 입력을 한 번에 읽어 공백으로 나누고, BufWriter로 모아서 출력하는 백준에서 흔한 형태
  rust: 'use std::io::{self, Read, Write};\n\nfn main() {\n    let mut input = String::new();\n'
    + '    io::stdin().read_to_string(&mut input).unwrap();\n    let mut it = input.split_ascii_whitespace();\n'
    + '    let mut out = io::BufWriter::new(io::stdout().lock());\n\n    $0\n}\n',
  py: '', // 파이썬은 보통 기본 코드 없이 시작한다 (빠른 입력이 필요하면 팝업에서 추가)
});

// 기본 코드 문자열에서 $0 을 빼고 커서 위치를 돌려준다.
globalThis.cbojExpandTemplate = (text) => {
  const s = String(text == null ? '' : text);
  const i = s.indexOf('$0');
  if (i < 0) return { code: s, line: null, ch: null };
  const code = s.slice(0, i) + s.slice(i + 2);
  const before = s.slice(0, i).split('\n');
  return { code, line: before.length - 1, ch: before[before.length - 1].length };
};
