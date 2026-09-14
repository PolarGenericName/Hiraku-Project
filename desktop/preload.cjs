const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onStateChanged: (callback) => {
    ipcRenderer.on('window-state-changed', (_, state) => callback(state));
  },

  // Discord Rich Presence
  setActivity: (activity) => ipcRenderer.invoke('discord-set-activity', activity),
  clearActivity: () => ipcRenderer.invoke('discord-clear-activity'),
});
