import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopSourceItem, CbsHubElectronAPI } from '../src/types/cbshub';

const api: CbsHubElectronAPI = {
  getDesktopSources: (): Promise<DesktopSourceItem[]> => ipcRenderer.invoke('cbs:get-sources'),
  setCaptureSource: (sourceId: string, includeAudio: boolean): Promise<boolean> =>
    ipcRenderer.invoke('cbs:set-capture-source', sourceId, includeAudio),
  minimizeWindow: (): void => {
    ipcRenderer.send('cbs:minimize');
  },
  maximizeWindow: (): void => {
    ipcRenderer.send('cbs:maximize');
  },
  closeWindow: (): void => {
    ipcRenderer.send('cbs:close');
  },
  setAlwaysOnTop: (flag: boolean): void => {
    ipcRenderer.send('cbs:always-on-top', flag);
  },
};

try {
  contextBridge.exposeInMainWorld('cbsHubAPI', api);
  console.log('[cbsHUB Preload] window.cbsHubAPI exposto com sucesso!');
} catch (err) {
  console.error('[cbsHUB Preload] Erro ao expor cbsHubAPI:', err);
}
