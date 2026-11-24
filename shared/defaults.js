// 팝업과 콘텐츠 스크립트가 함께 쓰는 기본값
globalThis.CBOJ_DEFAULTS = Object.freeze({
  splitAutoOpen: false,
  editorTheme: 'light',
  indent: 'tab', // tab(탭 문자) | space(공백 4칸)
  codeOpen: 'default', // default(백준 설정 따름) | open | close | onlyaccepted
  templates: {}, // 사용자가 바꾼 기본 코드 { cpp, c, py } (비어 있으면 아래 기본값)
});

// 언어별 기본 코드. $0 은 처음 커서가 놓일 자리.
globalThis.CBOJ_TEMPLATES = Object.freeze({
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    $0\n    return 0;\n}\n',
  c: '#include <stdio.h>\n\nint main(void) {\n    $0\n    return 0;\n}\n',
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
