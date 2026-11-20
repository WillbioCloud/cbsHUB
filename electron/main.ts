import { validateNotice, callToastXml } from "./notifications";
import { BackgroundNotice } from "./background";
import {
  trustedRenderer,
  externalLink,
  validCaptureSource,
  permittedCapability,
} from "./security";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  shell,
  Tray,
  Menu,
  nativeImage,
  dialog,
  Notification,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Flags de Aceleração de Hardware no Chromium (Seção 4.2 do SDD.md)
app.commandLine.appendSwitch(
  "enable-features",
  "WebRTCPipeWireCapturer,VaapiVideoDecoder,VaapiVideoEncoder",
);
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");

const rendererUrl =
  process.env.VITE_DEV_SERVER_URL ||
  pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let trayCallState = { inVoiceCall: false, reconnecting: false };
const noticePath = () =>
  path.join(app.getPath("userData"), "desktop-notice.json");
let noticeAcknowledged = false;
try {
  noticeAcknowledged =
    JSON.parse(fs.readFileSync(noticePath(), "utf8")).acknowledged === true;
} catch {}
const backgroundNotice = new BackgroundNotice(noticeAcknowledged);
function hideToBackground() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!tray || tray.isDestroyed()) {
    mainWindow.minimize();
    return;
  }
  const win = mainWindow;
  void backgroundNotice.request(
    () =>
      dialog.showMessageBox(win, {
        type: "info",
        title: "cbsHUB em segundo plano",
        message: "O cbsHUB continuará na bandeja.",
        detail:
          "Chamadas, microfone e mensagens continuam ativos. Use Abrir para voltar ou Encerrar cbsHUB no menu da bandeja para sair.",
        buttons: ["Entendi"],
        noLink: true,
      }),
    () => {
      if (!win.isDestroyed()) win.hide();
    },
    () => quitting,
    () => {
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
      const temporary = noticePath() + ".tmp";
      fs.writeFileSync(temporary, JSON.stringify({ acknowledged: true }));
      fs.renameSync(temporary, noticePath());
    },
  );
}
function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const status = trayCallState.reconnecting
    ? "Reconectando à sala"
    : trayCallState.inVoiceCall
      ? "Em chamada"
      : "Disponível";
  tray.setToolTip("cbsHUB — " + status);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir cbsHUB", click: restoreWindow },
      {
        label: mainWindow?.isVisible() ? "Ocultar janela" : "Mostrar janela",
        click: () =>
          mainWindow?.isVisible() ? hideToBackground() : restoreWindow(),
      },
      { label: status, enabled: false },
      { type: "separator" },
      {
        label: "Encerrar cbsHUB",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}
app.setAppUserModelId("com.will.cbshub");
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
function restoreWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function createTray() {
  if (tray && !tray.isDestroyed()) return;
  if (app.commandLine.getSwitchValue("ozone-platform") === "headless") {
    console.warn(
      "[Desktop] Sem display para bandeja; fechar minimizará a janela.",
    );
    return;
  }
  try {
    const iconPath = path.join(
      app.getAppPath(),
      process.env.VITE_DEV_SERVER_URL ? "public/brand" : "dist/brand",
      process.platform === "win32" ? "app.ico" : "logo-32.png",
    );
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw Error("Ícone de bandeja indisponível");
    tray = new Tray(icon);
    refreshTrayMenu();
    tray.on("click", restoreWindow);
    tray.on("double-click", restoreWindow);
  } catch (error) {
    console.warn("[Desktop] Bandeja indisponível; fechar minimizará a janela.");
    tray = null;
  }
}
app.on("second-instance", () => {
  if (app.isReady()) restoreWindow();
});
app.on("before-quit", () => {
  quitting = true;
  tray?.destroy();
  tray = null;
});
function allowedSender(
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
): boolean {
  return (
    !!mainWindow &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    trustedRenderer(event.senderFrame.url, rendererUrl)
  );
}
let pendingSourceId: string | null = null;
let pendingSystemAudio = true;

function getPreloadPath(): string {
  const candidates = [
    path.join(__dirname, "preload.cjs"),
    path.join(__dirname, "preload.js"),
    path.join(app.getAppPath(), "dist-electron", "preload.cjs"),
    path.join(app.getAppPath(), "dist-electron", "preload.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log("[cbsHUB Main] Preload script encontrado:", candidate);
      return candidate;
    }
  }

  const fallback = path.join(__dirname, "preload.cjs");
  console.warn(
    "[cbsHUB Main] Preload não encontrado nos caminhos padrão, usando fallback:",
    fallback,
  );
  return fallback;
}

function createWindow(): void {
  const preloadPath = getPreloadPath();

  mainWindow = new BrowserWindow({
    icon: path.join(
      app.getAppPath(),
      process.env.VITE_DEV_SERVER_URL
        ? "public/brand/logo-256.png"
        : "dist/brand/logo-256.png",
    ),
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: "#09090b",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (externalLink(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!trustedRenderer(url, rendererUrl)) event.preventDefault();
  });
  mainWindow.webContents.on("preload-error", (_event, failedPath, error) => {
    console.error(
      "[cbsHUB Main] Falha no script de Preload:",
      failedPath,
      error,
    );
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Notifica o frontend quando a janela for maximizada/restaurada via SO
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("cbs:window-state-changed", {
      isMaximized: true,
    });
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("cbs:window-state-changed", {
      isMaximized: false,
    });
  });

  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    hideToBackground();
  });
  mainWindow.on("show", refreshTrayMenu);
  mainWindow.on("hide", refreshTrayMenu);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const notices = new Map<string, Notification>();
const seenNotices = new Set<string>();
let lastNotice = 0;
ipcMain.handle("cbs:notify", (event, input: unknown) => {
  if (!allowedSender(event)) return false;
  const request = validateNotice(input);
  if (!request || !Notification.isSupported() || seenNotices.has(request.id))
    return false;
  seenNotices.add(request.id);
  if (seenNotices.size > 200)
    seenNotices.delete(seenNotices.values().next().value!);
  if (
    request.kind === "message" &&
    mainWindow?.isFocused() &&
    mainWindow.isVisible()
  )
    return false;
  if (Date.now() - lastNotice < 1000) return false;
  lastNotice = Date.now();
  while (notices.size >= 10) {
    const key = notices.keys().next().value!;
    notices.get(key)?.close();
    notices.delete(key);
  }
  const notice = new Notification({
    title: request.title,
    body: request.body,
    ...(request.kind === "call" && process.platform === "win32"
      ? { toastXml: callToastXml(request.title, request.body) }
      : {}),
    ...(request.kind === "call" && process.platform === "darwin"
      ? { actions: [{ type: "button" as const, text: "Atender" }] }
      : {}),
  });
  notices.set(request.id, notice);
  let activated = false;
  const accept = () => {
    if (activated || !notices.has(request.id)) return;
    activated = true;
    restoreWindow();
    mainWindow?.webContents.send("cbs:notification-activated", request.id);
    notice.close();
    notices.delete(request.id);
  };
  notice.on("click", accept);
  notice.on("action", accept);
  notice.on("close", () => notices.delete(request.id));
  notice.on("failed", () => notices.delete(request.id));
  setTimeout(() => {
    notice.close();
    notices.delete(request.id);
  }, 30000).unref();
  notice.show();
  return true;
});

ipcMain.on("cbs:tray-state", (event, state: unknown) => {
  if (!allowedSender(event) || !state || typeof state !== "object") return;
  const x = state as Record<string, unknown>;
  if (
    Object.keys(x).some((k) => !["inVoiceCall", "reconnecting"].includes(k)) ||
    typeof x.inVoiceCall !== "boolean" ||
    typeof x.reconnecting !== "boolean"
  )
    return;
  trayCallState = { inVoiceCall: x.inVoiceCall, reconnecting: x.reconnecting };
  refreshTrayMenu();
});

ipcMain.handle("cbs:desktop-state", (event) => {
  if (!allowedSender(event)) throw Error("Origem IPC não autorizada.");
  return {
    trayAvailable: !!tray && !tray.isDestroyed(),
    hidden: !!mainWindow && !mainWindow.isVisible(),
  };
});

ipcMain.handle("cbs:window-state", (event) => {
  if (!allowedSender(event)) throw new Error("Origem IPC não autorizada.");
  return { isMaximized: mainWindow!.isMaximized() };
});

// Interceptador IPC de busca de fontes de desktop
ipcMain.handle("cbs:get-sources", async (event) => {
  if (!allowedSender(event)) throw new Error("Origem IPC não autorizada.");
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true,
  });

  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnailDataUrl: s.thumbnail.toDataURL(),
    appIconDataUrl: s.appIcon ? s.appIcon.toDataURL() : null,
    isScreen: s.id.startsWith("screen:"),
  }));
});

// Interceptador IPC para configurar a fonte escolhida pelo usuário
ipcMain.handle(
  "cbs:set-capture-source",
  (event, sourceId: string, includeAudio: boolean) => {
    if (!allowedSender(event) || !validCaptureSource(sourceId, includeAudio)) {
      pendingSourceId = null;
      return false;
    }
    pendingSourceId = sourceId;
    pendingSystemAudio = includeAudio;
    return true;
  },
);

// Handlers de controle de janela nativa blindados contra perda de referência
ipcMain.on("cbs:minimize", (event) => {
  if (!allowedSender(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
});

ipcMain.on("cbs:maximize", (event) => {
  if (!allowedSender(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on("cbs:close", (event) => {
  if (!allowedSender(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.close();
  }
});

ipcMain.on("cbs:always-on-top", (event, flag: boolean) => {
  if (!allowedSender(event) || typeof flag !== "boolean") return;
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    win.setAlwaysOnTop(flag);
  }
});

if (primaryInstance)
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler(
      (contents, permission, callback, details) => {
        callback(
          contents === mainWindow?.webContents &&
            permittedCapability(
              permission,
              details.requestingUrl || contents.getURL(),
              rendererUrl,
              details.isMainFrame !== false,
            ),
        );
      },
    );
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission, _origin, details) => {
        return (
          contents === mainWindow?.webContents &&
          permittedCapability(
            permission,
            details.requestingUrl || contents?.getURL() || "",
            rendererUrl,
            details.isMainFrame !== false,
          )
        );
      },
    );
    // Interceptador oficial do Electron para getDisplayMedia (Seção 4.1 do SDD.md)
    session.defaultSession.setDisplayMediaRequestHandler(
      async (request, callback) => {
        const sourceId = pendingSourceId;
        pendingSourceId = null;
        if (
          !request.frame ||
          request.frame !== mainWindow?.webContents.mainFrame ||
          !trustedRenderer(request.frame.url, rendererUrl) ||
          !sourceId
        ) {
          callback({});
          return;
        }
        let sources: Electron.DesktopCapturerSource[];
        try {
          sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
          });
        } catch {
          callback({});
          return;
        }
        const chosen = sources.find((s) => s.id === sourceId);

        if (!chosen) {
          callback({});
          return;
        }

        callback({
          video: chosen,
          audio: pendingSystemAudio ? "loopback" : undefined,
        });
      },
    );

    createWindow();
    createTray();
    app.on("activate", restoreWindow);
  });

app.on("window-all-closed", () => {
  if (quitting) {
    app.quit();
  }
});
