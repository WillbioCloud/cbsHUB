import { app, BrowserWindow, ipcMain, desktopCapturer, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Flags de Aceleração de Hardware no Chromium (Seção 4.2 do SDD.md)
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer,VaapiVideoDecoder,VaapiVideoEncoder');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow: BrowserWindow | null = null;
let pendingSourceId: string | null = null;
let pendingSystemAudio = true;

function getPreloadPath(): string {
  const candidates = [
    path.join(__dirname, 'preload.cjs'),
    path.join(__dirname, 'preload.js'),
    path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
    path.join(app.getAppPath(), 'dist-electron', 'preload.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log('[cbsHUB Main] Preload script encontrado:', candidate);
      return candidate;
    }
  }

  const fallback = path.join(__dirname, 'preload.cjs');
  console.warn('[cbsHUB Main] Preload não encontrado nos caminhos padrão, usando fallback:', fallback);
  return fallback;
}

function createWindow(): void {
  const preloadPath = getPreloadPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: '#09090b',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.on('preload-error', (_event, failedPath, error) => {
    console.error('[cbsHUB Main] Falha no script de Preload:', failedPath, error);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Notifica o frontend quando a janela for maximizada/restaurada via SO
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('cbs:window-state-changed', { isMaximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('cbs:window-state-changed', { isMaximized: false });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Interceptador IPC de busca de fontes de desktop
ipcMain.handle('cbs:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true,
  });

  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnailDataUrl: s.thumbnail.toDataURL(),
    appIconDataUrl: s.appIcon ? s.appIcon.toDataURL() : null,
    isScreen: s.id.startsWith('screen:'),
  }));
});

// Interceptador IPC para configurar a fonte escolhida pelo usuário
ipcMain.handle('cbs:set-capture-source', (_event, sourceId: string, includeAudio: boolean) => {
  pendingSourceId = sourceId;
  pendingSystemAudio = includeAudio;
  return true;
});

// Handlers de controle de janela nativa blindados contra perda de referência
ipcMain.on('cbs:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
});

ipcMain.on('cbs:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('cbs:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.close();
  }
});

ipcMain.on('cbs:always-on-top', (event, flag: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(flag);
  }
});

app.whenReady().then(() => {
  // Interceptador oficial do Electron para getDisplayMedia (Seção 4.1 do SDD.md)
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const chosen = sources.find((s) => s.id === pendingSourceId) || sources[0];

    if (!chosen) {
      callback({});
      return;
    }

    callback({
      video: chosen,
      audio: pendingSystemAudio ? 'loopback' : undefined,
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
