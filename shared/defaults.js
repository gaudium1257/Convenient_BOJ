// 팝업과 콘텐츠 스크립트가 함께 쓰는 기본값
globalThis.BOJ_KITTY_DEFAULTS = Object.freeze({
  enabled: true,
  count: 1,
  colors: ['cheese', 'mackerel', 'tuxedo'],
  size: 'medium',
  speed: 'normal',
  quietWhileTyping: true,
  judgeReactions: true,
  eyeFollow: true,
  // 분할 화면 (코드 작성)
  splitAutoOpen: false,
  editorTheme: 'light',
  codeOpen: 'default', // default(백준 설정 따름) | open | close | onlyaccepted
});

globalThis.BOJ_KITTY_FURS = Object.freeze([
  { id: 'cheese', name: '치즈', fur: '#F6B35B', outline: '#B9732A' },
  { id: 'mackerel', name: '고등어', fur: '#A7AFB8', outline: '#5B636C' },
  { id: 'tuxedo', name: '턱시도', fur: '#37373F', outline: '#1A1A1F' },
  { id: 'white', name: '흰둥이', fur: '#FFFFFF', outline: '#BDB4AA' },
  { id: 'black', name: '까망이', fur: '#2A2A31', outline: '#121215' },
]);
