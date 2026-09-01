/* 자동 업데이트 — package.json 의 build.publish(GitHub Releases)와 짝.
 * 릴리스에 올라간 latest.yml 을 보고 새 버전을 받아 다음 실행 때 적용한다. */
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

const check = () => autoUpdater.checkForUpdates().catch(() => {});

/* 시작 시 + 6시간마다 조용히 확인. beforeInstall 로 트레이 상주 종료 플래그를 넘겨받는다. */
function start({ beforeInstall } = {}) {
  // 개발 실행에는 latest.yml 이 없어 매번 실패하므로 패키징된 앱에서만 돈다
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (e) => console.error('업데이트 확인 실패:', e && e.message));

  autoUpdater.on('update-downloaded', async ({ version }) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '업데이트 준비 완료',
      message: `새 버전 ${version} 을 받았습니다.`,
      detail: '지금 재시작하면 바로 적용됩니다. 나중을 고르면 다음 종료 때 자동으로 설치됩니다.',
    });
    if (response !== 0) return;
    if (beforeInstall) beforeInstall();
    autoUpdater.quitAndInstall();
  });

  check();
  setInterval(check, CHECK_INTERVAL);
}

/* 트레이 메뉴에서 수동 확인 — 조용한 자동 확인과 달리 결과를 항상 알려준다 */
async function checkNow() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', title: '업데이트', message: '개발 실행에서는 업데이트를 확인하지 않습니다.' });
    return;
  }
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r && r.updateInfo && r.updateInfo.version;
    if (!latest || latest === app.getVersion()) {
      dialog.showMessageBox({
        type: 'info',
        title: '업데이트',
        message: '최신 버전을 사용 중입니다.',
        detail: `현재 버전 ${app.getVersion()}`,
      });
    }
    // 새 버전이 있으면 내려받은 뒤 update-downloaded 핸들러가 안내한다
  } catch (e) {
    dialog.showMessageBox({ type: 'error', title: '업데이트', message: '업데이트 확인에 실패했습니다.', detail: e.message });
  }
}

module.exports = { start, checkNow };
