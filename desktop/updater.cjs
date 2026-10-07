const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

const APP_ORIGINS = ['http://127.0.0.1:3001', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://localhost:3000'];

let mainWindow = null;
let updateAvailable = false;
let updateInfo = null;
let updateDownloaded = false;
let handlersRegistered = false;

function normalizeReleaseNotes(notes) {
  if (!notes) return null;
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) {
    const text = notes
      .map((n) => (typeof n === 'string' ? n : n && typeof n.note === 'string' ? n.note : ''))
      .filter(Boolean)
      .join('\n');
    return text || null;
  }
  return null;
}

function isTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (event.sender !== mainWindow.webContents) return false;
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;
  const url = frame.url || '';
  return APP_ORIGINS.some((origin) => url === origin || url.startsWith(origin + '/') || url.startsWith(origin + '?'));
}

function safeSend(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function registerHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle('update-check', (event) => {
    if (!isTrustedSender(event)) return;
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] Check failed:', err.message);
    });
  });

  ipcMain.handle('update-download', (event) => {
    if (!isTrustedSender(event)) return;
    if (updateAvailable) {
      autoUpdater.downloadUpdate().catch((err) => {
        console.error('[Updater] Download failed:', err.message);
        safeSend('update-error', err.message);
      });
    } else {
      // Tell the UI so it does not wait forever on the spinner
      safeSend('update-error', 'Update is no longer available');
    }
  });

  ipcMain.handle('update-install', (event) => {
    if (!isTrustedSender(event)) return;
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('update-get-info', (event) => {
    if (!isTrustedSender(event)) return null;
    if (!updateInfo) return null;
    return { ...updateInfo, downloaded: updateDownloaded };
  });
}

function initUpdater(win) {
  mainWindow = win;

  win.on('closed', () => {
    mainWindow = null;
  });

  registerHandlers();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.forceDevUpdateConfig = process.env.ELECTRON_DEV === '1';

  autoUpdater.removeAllListeners();

  autoUpdater.on('checking-for-update', () => {
    safeSend('update-checking');
  });

  autoUpdater.on('update-available', (info) => {
    updateAvailable = true;
    updateDownloaded = false;
    updateInfo = {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName || null,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    };
    safeSend('update-available', updateInfo);
  });

  autoUpdater.on('update-not-available', () => {
    updateAvailable = false;
    updateDownloaded = false;
    updateInfo = null;
    safeSend('update-not-available');
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    safeSend('update-error', err.message);
  });

  autoUpdater.on('download-progress', (progress) => {
    safeSend('update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    updateDownloaded = true;
    safeSend('update-downloaded');
  });
}

module.exports = { initUpdater };
