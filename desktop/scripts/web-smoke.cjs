const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1080, height: 800, webPreferences: { offscreen: true, backgroundThrottling:false } });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action:'allow', overrideBrowserWindowOptions:{ show:false, webPreferences:{ offscreen:true, backgroundThrottling:false } } }));
  const errors = [];
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message); });
  try {
    await win.loadURL('http://127.0.0.1:5173/');
    const ui = await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{let count=0;const timer=setInterval(()=>{if(document.querySelector('.notebook-content')){clearInterval(timer);resolve({web:window.api.platform,clock:!!document.querySelector('.clock-dock.is-open'),sidebar:!!document.querySelector('.focus-pane'),game:!!document.querySelector('.arcade-card')});}else if(++count>40){clearInterval(timer);reject(Error('Web screen did not load'));}},100);})`);
    const integrations = await win.webContents.executeJavaScript('window.api.integrations().then(r=>({ok:r.ok,llm:!!r.configured?.openai}))');
    const dir = path.resolve(__dirname, '../../artifacts/web-service'); fs.mkdirSync(dir, { recursive: true });
    await new Promise(resolve=>setTimeout(resolve,500));
    fs.writeFileSync(path.join(dir, 'browser.png'), (await win.webContents.capturePage()).toPNG());
    const title = await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.memo-toolbar')).backgroundColor`);
    if(title!=='rgba(0, 0, 0, 0)')throw Error('Title container must be transparent');
    await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',ctrlKey:true,cancelable:true}))`);
    await new Promise(resolve=>setTimeout(resolve,280));
    if(!await win.webContents.executeJavaScript(`!!document.querySelector('.clock-dock.is-open .clock-dial')&&!document.documentElement.dataset.clock`))throw Error('Expected independent slide-out clock');
    fs.writeFileSync(path.join(dir,'clock-dock.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    await win.webContents.executeJavaScript(`window.dispatchEvent(new Event('offline'))`);
    await new Promise(resolve=>setTimeout(resolve,80));
    if(!await win.webContents.executeJavaScript(`!!document.querySelector('.offline-egg')&&!document.querySelector('.arcade-card')`))throw Error('Offline Easter egg missing');
    await win.webContents.executeJavaScript(`window.dispatchEvent(new Event('online'))`);
    if (ui.clock || ui.sidebar || ui.game || ui.web !== 'web' || !integrations.ok || errors.length) throw new Error(JSON.stringify({ ui, integrations, errors }));
    console.log(JSON.stringify({ ui, integrations, errors })); app.exit(0);
  } catch (e) { console.error(e.message); app.exit(1); }
});
setTimeout(() => app.exit(1), 15000).unref();
