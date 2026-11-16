/* 自动更新（Windows NSIS / Linux AppImage）。
 *
 * macOS 不做就地更新：Squirrel.Mac 要求应用有代码签名，而安装包目前是未签名的，
 * 硬接只会得到一个必然失败的更新流程。那边继续走「检查到新版本 → 打开下载页」。
 * Linux 的 deb / rpm 也没有就地更新通道，只有 AppImage（运行时带 APPIMAGE 环境变量）可以。
 *
 * 设计上仍然保持「不主动上传任何东西」：只在用户开启「启动时检查更新」时向 GitHub
 * 拉一次 latest*.yml，下载动作必须由用户点击触发。
 */
const { app, dialog } = require('electron');

let au = null;
let api = null;
let status = 'idle';           // idle | downloading | ready
let pendingVersion = '';

function supported() {
  if (!app.isPackaged) return false;
  /* 只给 x64 开自动更新：Windows 三个架构是分开打包的，latest.yml 只会留下最后一次
   * 构建的产物（所以 dist:win 特意把 x64 放在最后）。arm64 / ia32 仍然走下载页。 */
  if (process.platform === 'win32') return process.arch === 'x64';
  if (process.platform === 'linux') return process.arch === 'x64' && !!process.env.APPIMAGE;
  return false;
}

function cmpVer(a, b) {
  const pa = String(a).replace(/^v/, '').split('-')[0].split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

function init(o) {
  api = o;
  if (!supported()) return false;
  try { au = require('electron-updater').autoUpdater; } catch (e) { console.error('[updater] 载入失败', e); return false; }
  au.autoDownload = false;
  au.autoInstallOnAppQuit = true;
  /* electron-updater 默认往控制台打一堆日志，这里只留错误 */
  au.logger = { info() {}, warn() {}, debug() {}, error: (...a) => console.error('[updater]', ...a) };

  au.on('download-progress', (p) => api.toRenderer('upd:progress', { percent: Math.round(p.percent || 0) }));
  au.on('error', (e) => {
    status = 'idle';
    const raw = String((e && e.message) || e);
    api.toRenderer('upd:error', { msg: raw.split('\n')[0].slice(0, 160) });
  });
  au.on('update-downloaded', async (info) => {
    status = 'ready';
    pendingVersion = String(info && info.version || '');
    api.toRenderer('upd:ready', { version: pendingVersion });
    try {
      const r = await dialog.showMessageBox({
        type: 'info', buttons: [api.T('restartNow'), api.T('later')], defaultId: 0, cancelId: 1,
        title: api.APP.name, message: api.T('updReadyT', { v: pendingVersion }),
        detail: api.T('updReadyD')
      });
      if (r.response === 0) quitAndInstall();
    } catch (e) { /* 用户直接关掉对话框也算「稍后」 */ }
  });
  return true;
}

async function download() {
  if (!au) return { ok: false, code: 'unsupported' };
  if (status === 'downloading') return { ok: true, status };
  if (status === 'ready') return { ok: true, status };
  status = 'downloading';
  try {
    const r = await au.checkForUpdates();
    const latest = r && r.updateInfo && r.updateInfo.version;
    if (!latest) { status = 'idle'; return { ok: false, code: 'noupdate' }; }
    if (cmpVer(latest, app.getVersion()) <= 0) { status = 'idle'; return { ok: false, code: 'latest', latest }; }
    await au.downloadUpdate();
    return { ok: true, status: 'downloading', latest };
  } catch (e) {
    status = 'idle';
    const raw = String((e && e.message) || e);
    return { ok: false, code: 'err', msg: raw.split('\n')[0].slice(0, 160) };
  }
}

function quitAndInstall() {
  if (!au || status !== 'ready') return false;
  /* isSilent=false：让 NSIS 显示安装进度；isForceRunAfter=true：装完直接拉起新版本 */
  setImmediate(() => au.quitAndInstall(false, true));
  return true;
}

module.exports = { init, download, install: quitAndInstall, supported, state: () => ({ status, version: pendingVersion }) };
