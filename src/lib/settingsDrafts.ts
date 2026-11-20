import { create } from "zustand";
export const useSettingsDrafts = create<{ profile: boolean; theme: boolean }>(
  () => ({ profile: false, theme: false }),
);
export function settingsDirty() {
  const s = useSettingsDrafts.getState();
  return s.profile || s.theme;
}
