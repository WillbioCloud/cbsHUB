import { create } from "zustand";

export interface CallQuality {
  state: RTCPeerConnectionState;
  flowing?: boolean;
  rttMs: number | null;
  loss: number | null;
  jitterMs?: number | null;
}
interface MediaState {
  error: string | null;
  microphoneBusy: boolean;
  cameraBusy: boolean;
  screenBusy: boolean;
  reconnecting: boolean;
  signaling: "idle" | "connecting" | "online" | "offline" | "failed";
  recoveryAttempt: number;
  recoveryPhase: "idle" | "signaling" | "discovery" | "media" | "failed";
  recoveryMissingMedia: number;
  quality: Record<string, CallQuality>;
}
export const useMediaState = create<MediaState>(() => ({
  error: null,
  microphoneBusy: false,
  cameraBusy: false,
  screenBusy: false,
  reconnecting: false,
  signaling: "idle",
  recoveryAttempt: 0,
  recoveryPhase: "idle",
  recoveryMissingMedia: 0,
  quality: {},
}));
export function mediaError(action: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  useMediaState.setState({ error: `${action}: ${detail}` });
}
export const supportsAudioOutput = () =>
  typeof HTMLMediaElement !== "undefined" &&
  "setSinkId" in HTMLMediaElement.prototype;
