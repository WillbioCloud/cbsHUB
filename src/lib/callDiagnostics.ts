import { create } from "zustand";
const EVENTS = [
  "call_started",
  "call_ended",
  "signaling_open",
  "signaling_error",
  "signaling_closed",
  "signaling_disconnected",
  "retry_scheduled",
  "retry_exhausted",
  "retry_cancelled",
  "data_open",
  "data_closed",
  "data_replaced",
  "media_state",
  "media_closed",
  "microphone_ready",
  "microphone_interrupted",
  "microphone_recovery",
  "audio_processor_error",
  "microphone_error",
  "network_online",
  "network_offline",
  "timer_gap",
] as const;
export type DiagnosticEvent = (typeof EVENTS)[number];
const STATES = [
  "new",
  "connecting",
  "connected",
  "disconnected",
  "failed",
  "closed",
  "stable",
  "have-local-offer",
  "have-remote-offer",
  "have-local-pranswer",
  "have-remote-pranswer",
  "gathering",
  "complete",
  "checking",
  "completed",
] as const;
const REASONS = [
  "manual_leave",
  "room_left",
  "microphone_ended",
  "microphone_muted",
  "audio_context_suspended",
  "peer_closed",
  "media_failed",
  "media_timeout",
  "retry_limit",
  "preserve_media",
  "remote_or_unknown",
  "network",
  "socket-error",
  "server-error",
  "unknown",
] as const;
export interface CallEvent {
  at: number;
  event: DiagnosticEvent;
  peer?: string;
  connection?: string;
  ice?: string;
  signaling?: string;
  attempt?: number;
  delayMs?: number;
  reason?: string;
  durationMs?: number;
}
export function cleanCallEvent(input: unknown): CallEvent | null {
  if (!input || typeof input !== "object") return null;
  const x = input as Record<string, unknown>;
  if (
    !EVENTS.includes(x.event as DiagnosticEvent) ||
    typeof x.at !== "number" ||
    !Number.isFinite(x.at)
  )
    return null;
  const event: CallEvent = { at: x.at, event: x.event as DiagnosticEvent };
  if (typeof x.peer === "string" && /^par-[0-9]{1,4}$/.test(x.peer))
    event.peer = x.peer;
  for (const key of ["connection", "ice", "signaling"] as const)
    if (STATES.includes(x[key] as (typeof STATES)[number]))
      event[key] = x[key] as string;
  if (REASONS.includes(x.reason as (typeof REASONS)[number]))
    event.reason = x.reason as string;
  for (const key of ["attempt", "delayMs", "durationMs"] as const)
    if (
      typeof x[key] === "number" &&
      Number.isFinite(x[key]) &&
      Number(x[key]) >= 0
    )
      event[key] = Math.min(Number(x[key]), 86400000);
  return event;
}
export const useCallDiagnostics = create<{
  events: CallEvent[];
  sessionId: string;
  startedAt: number | null;
  lastDurationMs: number;
}>(() => ({
  events: [],
  sessionId: crypto.randomUUID(),
  startedAt: null,
  lastDurationMs: 0,
}));
const aliases = new Map<string, string>();
export function callEvent(
  event: DiagnosticEvent,
  details: Omit<Partial<CallEvent>, "event" | "at" | "peer"> = {},
  peerId?: string,
) {
  let peer: string | undefined;
  if (peerId) {
    if (!aliases.has(peerId) && aliases.size < 1000)
      aliases.set(peerId, `par-${aliases.size + 1}`);
    peer = aliases.get(peerId);
  }
  const clean = cleanCallEvent({ at: Date.now(), event, ...details, peer });
  if (clean)
    useCallDiagnostics.setState((s) => ({
      events: [...s.events, clean].slice(-200),
    }));
}
export function beginCallDiagnostics() {
  useCallDiagnostics.setState({
    sessionId: crypto.randomUUID(),
    startedAt: Date.now(),
  });
  callEvent("call_started");
}
export function endCallDiagnostics(
  reason: "manual_leave" | "room_left" | "microphone_ended",
) {
  const started = useCallDiagnostics.getState().startedAt;
  if (started !== null) {
    const durationMs = Date.now() - started;
    callEvent("call_ended", { reason, durationMs });
    useCallDiagnostics.setState({
      startedAt: null,
      lastDurationMs: durationMs,
    });
  }
}
export function clearCallDiagnostics() {
  aliases.clear();
  useCallDiagnostics.setState({ events: [] });
}
export function diagnosticReport() {
  const state = useCallDiagnostics.getState();
  return JSON.stringify(
    {
      format: "cbshub-call-diagnostics",
      version: 1,
      sessionId: state.sessionId,
      durationMs:
        state.startedAt === null
          ? state.lastDurationMs
          : Date.now() - state.startedAt,
      events: state.events.map(cleanCallEvent).filter(Boolean),
    },
    null,
    2,
  );
}
