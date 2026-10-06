const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

let mainWindow = null;
let updateAvailable = false;
let updateInfo = null;
let handlersRegistered = false;

function isTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return event.sender === mainWindow.webContents;
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
      });
    }
  });

  ipcMain.handle('update-install', (event) => {
    if (!isTrustedSender(event)) return;
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('update-get-info', (event) => {
    if (!isTrustedSender(event)) return null;
    return updateInfo;
  });
}

function initUpdater(win) {
  mainWindow = win;

  win.on('closed', () => {
    mainWindow = null;
  });

  registerHandlers();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.forceDevUpdateConfig = process.env.ELECTRON_DEV === '1';

  autoUpdater.removeAllListeners();

  autoUpdater.on('checking-for-update', () => {
    safeSend('update-checking');
  });

  autoUpdater.on('update-available', (info) => {
    updateAvailable = true;
    updateInfo = {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseName: info.releaseName || null,
      releaseNotes: info.releaseNotes || null,
    };
    safeSend('update-available', updateInfo);
  });

  autoUpdater.on('update-not-available', () => {
    updateAvailable = false;
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
    safeSend('update-downloaded');
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.log('[Updater] Initial check skipped:', err.message);
    });
  }, 5000);
}

module.exports = { initUpdater };
