// 배경 테마 목록 — CSS는 styles.css의 [data-theme] 블록에 정의됨.
// swatch는 설정 화면 미리보기 카드용, card/edge는 미리보기 안 미니 유리 카드 색.
export const THEMES = [
  {
    id: 'light',
    name: '라이트',
    desc: '파스텔 유리',
    swatch: 'linear-gradient(135deg, #eef1fb, #e4e6ff 45%, #ffe9f6)',
    card: 'rgba(255,255,255,0.6)',
    edge: 'rgba(255,255,255,0.85)',
  },
  {
    id: 'dark',
    name: '다크',
    desc: '깊은 밤 인디고',
    swatch: 'linear-gradient(150deg, #0b1020, #1e1b4b 55%, #3b0f47)',
    card: 'rgba(148,163,184,0.22)',
    edge: 'rgba(148,163,184,0.35)',
  },
  {
    id: 'space',
    name: '스페이스',
    desc: '별이 반짝이는 우주',
    swatch:
      'radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 66% 62%, #fff, transparent), radial-gradient(1.2px 1.2px at 85% 22%, rgba(255,255,255,0.85), transparent), radial-gradient(1px 1px at 42% 78%, rgba(255,255,255,0.7), transparent), radial-gradient(circle at 72% 18%, rgba(88,28,135,0.85), transparent 55%), radial-gradient(circle at 18% 82%, rgba(30,58,138,0.8), transparent 55%), #050514',
    card: 'rgba(167,139,250,0.2)',
    edge: 'rgba(167,139,250,0.4)',
  },
  {
    id: 'analog',
    name: '아날로그',
    desc: '따뜻한 종이 질감',
    swatch: 'linear-gradient(150deg, #f8f2e4, #f3e5cc 55%, #eeddc0)',
    card: 'rgba(255,252,243,0.75)',
    edge: 'rgba(255,252,240,0.95)',
  },
  {
    id: 'aurora',
    name: '오로라',
    desc: '북극의 밤하늘',
    swatch:
      'linear-gradient(100deg, rgba(45,212,191,0.55), rgba(56,189,248,0.4) 45%, rgba(139,92,246,0.45) 80%, transparent), #04161e',
    card: 'rgba(45,212,191,0.18)',
    edge: 'rgba(45,212,191,0.35)',
  },
  {
    id: 'sunset',
    name: '선셋',
    desc: '노을빛 로즈',
    swatch: 'linear-gradient(160deg, #fff3e9, #ffd9e4 50%, #ffceb5)',
    card: 'rgba(255,255,255,0.6)',
    edge: 'rgba(255,255,255,0.85)',
  },
];
