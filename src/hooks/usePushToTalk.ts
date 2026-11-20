import { useEffect } from "react";
import { useVoicePreferences } from "../lib/voicePreferences";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
export function usePushToTalk() {
  const enabled = useVoicePreferences((s) => s.pushToTalk),
    key = useVoicePreferences((s) => s.talkKey),
    inVoice = useHubStore((s) => s.inVoiceCall);
  useEffect(() => {
    const release = () => webrtcEngine.setPushToTalkHeld(false);
    release();
    if (!enabled || !inVoice) return;
    const down = (event: KeyboardEvent) => {
      if (
        event.code !== key ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input,textarea,select,[contenteditable="true"],[role="textbox"]',
        )
      )
        return;
      event.preventDefault();
      webrtcEngine.setPushToTalkHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === key) {
        event.preventDefault();
        release();
      }
    };
    const visibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", visibility);
      release();
    };
  }, [enabled, key, inVoice]);
}
