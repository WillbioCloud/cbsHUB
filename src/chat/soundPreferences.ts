import { create } from "zustand";
export type SoundMode = "normal" | "compact" | "hidden";
function read(): SoundMode {
  try {
    const value = localStorage.getItem("cbshub-chat-sounds");
    return value === "compact" || value === "hidden" ? value : "normal";
  } catch {
    return "normal";
  }
}
export const useSoundPreferences = create<{ mode: SoundMode }>(() => ({
  mode: read(),
}));
export function setSoundMode(mode: SoundMode) {
  localStorage.setItem("cbshub-chat-sounds", mode);
  useSoundPreferences.setState({ mode });
}
