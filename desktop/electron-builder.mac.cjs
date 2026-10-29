/* 맥 전용 설정 — productName 을 ASCII 로 바꾼다.
 * electron-builder 는 productName 으로 Chromium 헬퍼 앱(Helper (GPU)/(Renderer)/(Plugin))을 이름짓는데,
 * 이 이름이 비ASCII 면 패키징된 앱이 Chromium 초기화 중 조용히 죽는다(app.whenReady 가 오지 않음).
 * 사용자에게 보이는 이름은 CFBundleDisplayName 으로 "할 일 체커" 를 유지하므로 Finder·Dock·메뉴바는 그대로다.
 * 윈도우 설정(설치 경로·바로가기 이름)은 건드리지 않도록 package.json 과 분리해 둔다. */
const base = require('./package.json').build;
module.exports = {
  ...base,
  productName: 'todo-checker',
  mac: { ...base.mac, extendInfo: { ...base.mac.extendInfo, CFBundleDisplayName: '할 일 체커' } },
};
