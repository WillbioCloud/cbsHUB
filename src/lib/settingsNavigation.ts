import { create } from "zustand";
import { useHubStore } from "../store/useHubStore";
export type SettingsTab = "audio" | "profile" | "appearance" | "diagnostics";
export const useSettingsNavigation = create<{ tab: SettingsTab }>(() => ({
  tab: "audio",
}));
export function openSettings(tab: SettingsTab) {
  useSettingsNavigation.setState({ tab });
  useHubStore.getState().setIsSettingsOpen(true);
}
