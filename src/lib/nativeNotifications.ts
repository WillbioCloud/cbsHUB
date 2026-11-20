import type { NativeNotice } from "../types/cbshub";
const callbacks = new Map<string, () => void>();
let listening = false;
export function notifyNative(notice: NativeNotice, activate?: () => void) {
  const api = window.cbsHubAPI;
  if (!api?.notifyNative) return;
  if (!listening) {
    api.onNotificationActivated((id) => {
      const fn = callbacks.get(id);
      callbacks.delete(id);
      fn?.();
    });
    listening = true;
  }
  if (activate) {
    if (callbacks.size >= 20) callbacks.delete(callbacks.keys().next().value!);
    callbacks.set(notice.id, activate);
    setTimeout(() => callbacks.delete(notice.id), 30000);
  }
  void api.notifyNative(notice).catch(() => {
    callbacks.delete(notice.id);
  });
}
