import { contextBridge, ipcRenderer } from "electron";
import type { DesktopSourceItem, CbsHubElectronAPI } from "../src/types/cbshub";

const api: CbsHubElectronAPI = {
  notifyNative: (notice) => ipcRenderer.invoke("cbs:notify", notice),
  onNotificationActivated: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, id: unknown) => {
      if (typeof id === "string" && id.length <= 120) listener(id);
    };
    ipcRenderer.on("cbs:notification-activated", handler);
    return () =>
      ipcRenderer.removeListener("cbs:notification-activated", handler);
  },
  updateTrayState: (state) =>
    ipcRenderer.send("cbs:tray-state", {
      inVoiceCall: state.inVoiceCall,
      reconnecting: state.reconnecting,
    }),
  getDesktopState: () => ipcRenderer.invoke("cbs:desktop-state"),
  getWindowState: () => ipcRenderer.invoke("cbs:window-state"),
  onWindowStateChanged: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: { isMaximized: boolean },
    ) => {
      if (typeof state?.isMaximized === "boolean")
        listener({ isMaximized: state.isMaximized });
    };
    ipcRenderer.on("cbs:window-state-changed", handler);
    return () => {
      ipcRenderer.removeListener("cbs:window-state-changed", handler);
    };
  },
  getDesktopSources: (): Promise<DesktopSourceItem[]> =>
    ipcRenderer.invoke("cbs:get-sources"),
  setCaptureSource: (
    sourceId: string,
    includeAudio: boolean,
  ): Promise<boolean> =>
    ipcRenderer.invoke("cbs:set-capture-source", sourceId, includeAudio),
  minimizeWindow: (): void => {
    ipcRenderer.send("cbs:minimize");
  },
  maximizeWindow: (): void => {
    ipcRenderer.send("cbs:maximize");
  },
  closeWindow: (): void => {
    ipcRenderer.send("cbs:close");
  },
  setAlwaysOnTop: (flag: boolean): void => {
    ipcRenderer.send("cbs:always-on-top", flag);
  },
};

try {
  contextBridge.exposeInMainWorld("cbsHubAPI", api);
  console.log("[cbsHUB Preload] window.cbsHubAPI exposto com sucesso!");
} catch (err) {
  console.error("[cbsHUB Preload] Erro ao expor cbsHubAPI:", err);
}
