import { create } from "zustand";
export const TALK_KEYS = ["F8", "F9", "F10"] as const;
interface VoicePreferences {
  pushToTalk: boolean;
  talkKey: (typeof TALK_KEYS)[number];
}
function read(): VoicePreferences {
  try {
    const x = JSON.parse(
      localStorage.getItem("cbshub-voice-preferences") || "{}",
    );
    return {
      pushToTalk: x.pushToTalk === true,
      talkKey: TALK_KEYS.includes(x.talkKey) ? x.talkKey : "F8",
    };
  } catch {
    return { pushToTalk: false, talkKey: "F8" };
  }
}
export const useVoicePreferences = create<VoicePreferences>(() => read());
export function saveVoicePreferences(patch: Partial<VoicePreferences>) {
  const next = { ...useVoicePreferences.getState(), ...patch };
  localStorage.setItem("cbshub-voice-preferences", JSON.stringify(next));
  useVoicePreferences.setState(next);
}
