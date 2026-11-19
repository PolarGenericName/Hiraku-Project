const { app, BrowserWindow, ipcMain, session, dialog, safeStorage } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
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
let discordReconnectTimer = null;
let discordStopped = false;

const APP_ORIGINS = [
  `http://127.0.0.1:${SERVER_PORT}`,
  `http://localhost:${SERVER_PORT}`,
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];

function isAppUrl(url) {
  return APP_ORIGINS.some((origin) => url === origin || url.startsWith(origin + '/') || url.startsWith(origin + '?'));
}

// ── IPC sender validation ────────────────────────────────────────────────────
function isTrustedSender(event) {
  if (!mainWindow) return false;
  if (event.sender !== mainWindow.webContents) return false;
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;
  return isAppUrl(frame.url || '');
}

// ── Wait until the Express server accepts connections ────────────────────────
function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.setTimeout(2000, () => req.destroy());
      req.on('error', () => {
        if (Date.now() >= deadline) resolve(false);
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

// ── Start Express server in production ────────────────────────────────────────
function startServer() {
  if (process.env.ELECTRON_DEV === '1') return Promise.resolve();

  const serverPath = path.join(__dirname, '..', 'dist', 'index.cjs');
  console.log('[Electron] Starting server from:', serverPath);

  try {
    require(serverPath);
    console.log('[Electron] Server starting on port', SERVER_PORT);
  } catch (err) {
    console.error('[Electron] Server start error:', err.message);
    return Promise.resolve(false);
  }

  return waitForServer(`http://127.0.0.1:${SERVER_PORT}/`, 15000).then((ready) => {
    if (ready) console.log('[Electron] Server ready on port', SERVER_PORT);
    else console.error('[Electron] Server did not become ready within 15s');
    return ready;
  });
}

// ── Discord RPC ──────────────────────────────────────────────────────────────
function scheduleDiscordReconnect(ms) {
  if (discordStopped) return;
  if (discordReconnectTimer) clearTimeout(discordReconnectTimer);
  discordReconnectTimer = setTimeout(() => {
    discordReconnectTimer = null;
    initDiscord();
  }, ms);
}

async function initDiscord() {
  if (!Client || discordStopped) return;

  if (rpc) {
    const old = rpc;
    rpc = null;
    rpcReady = false;
    old.removeAllListeners();
    try {
      const destroyed = old.destroy();
      if (destroyed && typeof destroyed.catch === 'function') destroyed.catch(() => {});
    } catch {}
  }

  const client = new Client({ transport: 'ipc' });
  rpc = client;

  client.on('ready', () => {
    if (client !== rpc) return;
    rpcReady = true;
    console.log('[Discord] Rich Presence connected');
  });

  client.on('disconnected', () => {
    if (client !== rpc) return;
    rpcReady = false;
    console.log('[Discord] Disconnected, reconnecting in 10s...');
    scheduleDiscordReconnect(10000);
  });

  try {
    await client.login({ clientId: DISCORD_CLIENT_ID });
  } catch (err) {
    if (client === rpc) {
      console.log('[Discord] Could not connect (Discord may not be open):', err.message);
      scheduleDiscordReconnect(15000);
    }
  }
}

ipcMain.handle('discord-set-activity', (event, activity) => {
  if (!isTrustedSender(event)) return false;
  // Presença desligada em Configurações: ignora qualquer setActivity
  // (player de anime / leitor de mangá continuam chamando durante o uso)
  if (discordStopped) return false;
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
    }).catch((err) => {
      console.error('[Discord] SET_ACTIVITY failed:', err.message);
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
    const cleared = rpc.clearActivity();
    if (cleared && typeof cleared.catch === 'function') {
      cleared.catch((err) => console.error('[Discord] clearActivity failed:', err.message));
    }
    return true;
  } catch (err) {
    console.error('[Discord] clearActivity error:', err.message);
    return false;
  }
});

// Liga/desliga a presença (toggle em Configurações → Presença do Discord)
ipcMain.handle('discord-set-enabled', async (event, enabled) => {
  if (!isTrustedSender(event)) return false;
  if (enabled) {
    if (discordStopped) {
      discordStopped = false;
      initDiscord();
    }
  } else {
    discordStopped = true;
    if (discordReconnectTimer) {
      clearTimeout(discordReconnectTimer);
      discordReconnectTimer = null;
    }
    // Derruba a conexão inteira: sem conexão não há presença nenhuma
    // (e o gate em discord-set-activity impede reativar durante o uso)
    if (rpc) {
      const old = rpc;
      const wasReady = rpcReady;
      rpc = null;
      rpcReady = false;
      old.removeAllListeners();
      if (wasReady) {
        try {
          // espera o clear chegar ao Discord antes de fechar o socket
          await old.clearActivity();
        } catch {
          /* ignora */
        }
      }
      try {
        const destroyed = old.destroy();
        if (destroyed && typeof destroyed.catch === 'function') destroyed.catch(() => {});
      } catch {
        /* ignora */
      }
    }
  }
  return true;
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
  const prodUrl = `http://127.0.0.1:${SERVER_PORT}`;
  const loadUrl = process.env.ELECTRON_DEV === '1' ? devUrl : prodUrl;

  console.log('[Electron] Loading:', loadUrl);

  let shown = false;
  let loadRetried = false;
  let hideFallbackTimer = null;
  const showWindow = () => {
    if (shown || !mainWindow) return;
    shown = true;
    if (hideFallbackTimer) {
      clearTimeout(hideFallbackTimer);
      hideFallbackTimer = null;
    }
    mainWindow.show();
  };

  mainWindow.loadURL(loadUrl);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, _url, isMainFrame) => {
    // Ignore subframe failures (e.g. the YouTube embed being offline)
    if (isMainFrame === false) return;
    console.error('[Electron] Failed to load:', errorCode, errorDescription);
    showWindow();
    // ERR_ABORTED (-3) fires on normal SPA redirects — not a real failure
    if (errorCode !== -3 && !loadRetried && mainWindow) {
      loadRetried = true;
      const win = mainWindow;
      setTimeout(() => {
        if (!win.isDestroyed() && win === mainWindow) win.reload();
      }, 1500);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron] Page loaded successfully');
    showWindow();
  });

  // Restrict navigation to prevent XSS-based redirects
  // Allow the app's own origins only (dev server + packaged server)
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
    }
  });

  // Block redirects (SSRF / open redirect protection)
  mainWindow.webContents.on('will-redirect', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault();
    }
  });

  // Block new windows/popups
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.once('ready-to-show', showWindow);

  // Fallback: never leave the user with an invisible window
  hideFallbackTimer = setTimeout(showWindow, 8000);

  mainWindow.on('closed', () => {
    if (hideFallbackTimer) {
      clearTimeout(hideFallbackTimer);
      hideFallbackTimer = null;
    }
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

// ── IPC: Backup ──────────────────────────────────────────────────────────────
/** Pasta padrão dos backups: Documentos/Hiraku/Backups (criada sob demanda). */
function defaultBackupDir() {
  return path.join(app.getPath('documents'), 'Hiraku', 'Backups');
}

ipcMain.handle('backup-default-dir', (event) => {
  if (!isTrustedSender(event)) return null;
  return defaultBackupDir();
});

ipcMain.handle('backup-select-folder', async (event) => {
  if (!isTrustedSender(event)) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar pasta de backup',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle('backup-write', async (event, dir, fileName, content) => {
  if (!isTrustedSender(event)) return false;
  if (typeof dir !== 'string' || typeof content !== 'string') return false;
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) return false;
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, fileName), content, 'utf8');
    return true;
  } catch (err) {
    console.error('[Backup] falha ao gravar:', err.message);
    return false;
  }
});

// ── IPC: Criptografia local (safeStorage = chaveiro do SO) ───────────────────
// Síncrono de propósito: a camada de storage do app é síncrona e só troca
// credenciais pequenas (tokens de tracker). Sem safeStorage disponível o
// resultado é null e o app segue sem criptografia.
ipcMain.on('data-encrypt', (event, text) => {
  if (!isTrustedSender(event) || typeof text !== 'string' || !safeStorage.isEncryptionAvailable()) {
    event.returnValue = null;
    return;
  }
  try {
    event.returnValue = safeStorage.encryptString(text).toString('base64');
  } catch {
    event.returnValue = null;
  }
});

ipcMain.on('data-decrypt', (event, text) => {
  if (!isTrustedSender(event) || typeof text !== 'string') {
    event.returnValue = null;
    return;
  }
  try {
    event.returnValue = safeStorage.decryptString(Buffer.from(text, 'base64'));
  } catch {
    event.returnValue = null;
  }
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

    // The app never uses camera/mic/geo/notifications — deny everything
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });

    await startServer();
    createWindow();
    initDiscord();
    if (mainWindow && (app.isPackaged || process.env.ELECTRON_DEV === '1')) {
      initUpdater(mainWindow);
    }
  });
}

app.on('window-all-closed', () => {
  discordStopped = true;
  if (discordReconnectTimer) {
    clearTimeout(discordReconnectTimer);
    discordReconnectTimer = null;
  }
  if (rpc) {
    const old = rpc;
    rpc = null;
    rpcReady = false;
    try {
      const destroyed = old.destroy();
      if (destroyed && typeof destroyed.catch === 'function') destroyed.catch(() => {});
    } catch {}
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    discordStopped = false;
    createWindow();
    initDiscord();
    if (mainWindow && (app.isPackaged || process.env.ELECTRON_DEV === '1')) {
      initUpdater(mainWindow);
    }
  }
});
