const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { initUpdater } = require('./updater.cjs');
let Client;
try {
  Client = require('discord-rpc').Client;
} catch {
  console.log('[Discord] discord-rpc not available, Discord integration disabled');
}

const DISCORD_CLIENT_ID = '1547818333141868587';
const SERVER_PORT = 3001;

let mainWindow;
let rpc = null;
let rpcReady = false;
let serverProcess = null;

// ── IPC sender validation ────────────────────────────────────────────────────
function isTrustedSender(event) {
  if (!mainWindow) return false;
  return event.sender === mainWindow.webContents;
}

// ── Start Express server in production ────────────────────────────────────────
function startServer() {
  if (process.env.ELECTRON_DEV === '1') return Promise.resolve();

  return new Promise((resolve) => {
    const serverPath = path.join(__dirname, '..', 'dist', 'index.cjs');
    console.log('[Electron] Starting server from:', serverPath);

    try {
      require(serverPath);
      console.log('[Electron] Server started on port', SERVER_PORT);
      setTimeout(resolve, 1000);
    } catch (err) {
      console.error('[Electron] Server start error:', err.message);
      resolve();
    }
  });
}

// ── Discord RPC ──────────────────────────────────────────────────────────────
async function initDiscord() {
  if (!Client) return;

  if (rpc) {
    try { rpc.destroy(); } catch {}
    rpc = null;
    rpcReady = false;
  }

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

ipcMain.handle('discord-set-activity', (event, activity) => {
  if (!isTrustedSender(event)) return false;
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

ipcMain.handle('discord-clear-activity', (event) => {
  if (!isTrustedSender(event)) return false;
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
    icon: path.join(__dirname, '..', 'assets', 'logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  const devUrl = 'http://localhost:3000';
  const prodUrl = `http://localhost:${SERVER_PORT}`;
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
  // Allow same-origin reloads (ErrorBoundary recovery), block everything else
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:') || url.startsWith('file://');
    if (!allowed) {
      e.preventDefault();
    }
  });

  // Block redirects (SSRF / open redirect protection)
  mainWindow.webContents.on('will-redirect', (e, url) => {
    const allowed = url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:') || url.startsWith('file://');
    if (!allowed) {
      e.preventDefault();
    }
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
ipcMain.handle('window-minimize', (event) => {
  if (!isTrustedSender(event)) return;
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', (event) => {
  if (!isTrustedSender(event)) return;
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', (event) => {
  if (!isTrustedSender(event)) return;
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', (event) => {
  if (!isTrustedSender(event)) return false;
  return mainWindow?.isMaximized() ?? false;
});

// ── App ──────────────────────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setName('Hiraku');
    await startServer();
    createWindow();
    initDiscord();
    if (mainWindow) initUpdater(mainWindow);
  });
}

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
