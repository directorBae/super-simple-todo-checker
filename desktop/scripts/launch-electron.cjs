// VSCode 등에서 상속되는 ELECTRON_RUN_AS_NODE 때문에 Electron이 일반 Node로
// 실행되는 것을 막기 위해, 변수를 완전히 삭제한 뒤 electron.exe를 직접 실행한다.
delete process.env.ELECTRON_RUN_AS_NODE;

const path = require('path');
const { spawn } = require('child_process');
const electron = require('electron'); // 일반 Node에서 require하면 electron 실행 파일 경로 문자열

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});
child.on('exit', (code) => process.exit(code == null ? 0 : code));
