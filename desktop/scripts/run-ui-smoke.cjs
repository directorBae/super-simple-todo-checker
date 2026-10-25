const { spawn } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const script = ['focus-smoke.cjs', 'web-smoke.cjs'].includes(process.argv[2]) ? process.argv[2] : 'ui-smoke.cjs';
const child = spawn(require('electron'), [path.join(__dirname, script)], { env, stdio: 'inherit', windowsHide: true });
child.on('exit', code => process.exit(code ?? 1));
