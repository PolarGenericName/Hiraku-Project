const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Client } = require('discord-rpc');

const DISCORD_CLIENT_ID = '1547818333141868587';

let mainWindow;
let rpc = null;
let rpcReady = false;

// ── Discord RPC ──────────────────────────────────────────────────────────────
async function initDiscord() {
  rpc = new Client({ transport: 'ipc' });

  rpc.on('ready', () => {
    rpcReady = true;
    console.log('[Discord] Rich Presence connected');
  });

  rpc.on('disconnected', () => {
    rpcReady = false;
    console.log('[Discord] Disconnected, reconnecting in 10s...');
    setTimeout(() => initDiscord(), 10000);
  });

  try {
    await rpc.login({ clientId: DISCORD_CLIENT_ID });
  } catch (err) {
    console.log('[Discord] Could not connect (Discord may not be open):', err.message);
    setTimeout(() => initDiscord(), 15000);
  }
}

ipcMain.handle('discord-set-activity', (_, activity) => {
  if (!rpc || !rpcReady) return false;
  try {
    const pid = process.pid;
    const timestamps = {};
    if (activity.startTimestamp) {
      timestamps.start = activity.startTimestamp;
    }
    if (activity.endTimestamp) {
      timestamps.end = activity.endTimestamp;
    }
    const assets = {};
    if (activity.largeImageKey) assets.large_image = activity.largeImageKey;
    if (activity.largeImageText) assets.large_text = activity.largeImageText;
    if (activity.smallImageKey) assets.small_image = activity.smallImageKey;
    if (activity.smallImageText) assets.small_text = activity.smallImageText;

    rpc.request('SET_ACTIVITY', {
      pid,
      activity: {
        type: activity.type || 0,
        state: activity.state || '',
        details: activity.details || '',
        timestamps: Object.keys(timestamps).length > 0 ? timestamps : undefined,
        assets: Object.keys(assets).length > 0 ? assets : undefined,
        instance: false,
      },
    });
    return true;
  } catch (err) {
    console.error('[Discord] setActivity error:', err.message);
    return false;
  }
});

ipcMain.handle('discord-clear-activity', () => {
  if (!rpc || !rpcReady) return false;
  try {
    rpc.clearActivity();
    return true;
  } catch (err) {
    console.error('[Discord] clearActivity error:', err.message);
    return false;
  }
});

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'client', 'public', 'logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  const devUrl = 'http://localhost:3000';
  const prodUrl = `file://${path.join(__dirname, 'dist', 'public', 'index.html')}`;
  const loadUrl = process.env.ELECTRON_DEV === '1' ? devUrl : prodUrl;

  console.log('[Electron] Loading:', loadUrl);

  mainWindow.loadURL(loadUrl);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] Page loaded successfully');
  });

  // Restrict navigation to prevent XSS-based redirects
  mainWindow.webContents.on('will-navigate', (e) => {
    e.preventDefault();
  });

  // Block new windows/popups
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', 'maximized');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', 'normal');
  });
}

// ── IPC: Window Controls ─────────────────────────────────────────────────────
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// ── App ──────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setName('Hiraku');
  createWindow();
  initDiscord();
});

app.on('window-all-closed', () => {
  if (rpc) {
    try { rpc.destroy(); } catch {}
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
