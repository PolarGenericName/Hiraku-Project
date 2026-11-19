const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  const handler = (_, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onStateChanged: (callback) => on('window-state-changed', callback),

  // Discord Rich Presence
  setActivity: (activity) => ipcRenderer.invoke('discord-set-activity', activity),
  clearActivity: () => ipcRenderer.invoke('discord-clear-activity'),
  setDiscordEnabled: (enabled) => ipcRenderer.invoke('discord-set-enabled', enabled),

  // Auto Updater
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateDownload: () => ipcRenderer.invoke('update-download'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  updateGetInfo: () => ipcRenderer.invoke('update-get-info'),
  onUpdateChecking: (callback) => on('update-checking', callback),
  onUpdateAvailable: (callback) => on('update-available', callback),
  onUpdateNotAvailable: (callback) => on('update-not-available', callback),
  onUpdateError: (callback) => on('update-error', callback),
  onUpdateDownloadProgress: (callback) => on('update-download-progress', callback),
  onUpdateDownloaded: (callback) => on('update-downloaded', callback),

  // Backup
  backupDefaultDir: () => ipcRenderer.invoke('backup-default-dir'),
  backupSelectFolder: () => ipcRenderer.invoke('backup-select-folder'),
  backupWrite: (dir, fileName, content) => ipcRenderer.invoke('backup-write', dir, fileName, content),

  // Criptografia local (safeStorage do SO) — usado pelo tracker store
  secureEncrypt: (text) => ipcRenderer.sendSync('data-encrypt', text),
  secureDecrypt: (text) => ipcRenderer.sendSync('data-decrypt', text),
});
