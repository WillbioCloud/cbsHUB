import { useEffect, useRef, useState } from "react";
import { AnimatedLogo } from "./AnimatedLogo";
import { Button } from "./ui/button";
import { useHubStore } from "../store/useHubStore";
import { useMediaState } from "../lib/mediaState";
import { webrtcEngine } from "../lib/webrtcEngine";
export function BootSplash() {
  return (
    <div
      className="brand-loading-screen"
      role="status"
      aria-label="Inicializando cbsHUB"
    >
      <AnimatedLogo />
      <p>Preparando seu espaço…</p>
    </div>
  );
}
export function ConnectionScreen() {
  const signaling = useMediaState((s) => s.signaling),
    reconnecting = useMediaState((s) => s.reconnecting),
    attempt = useMediaState((s) => s.recoveryAttempt),
    quality = useMediaState((s) => s.quality),
    phase = useMediaState((s) => s.recoveryPhase);
  const inVoice = useHubStore((s) => s.inVoiceCall),
    connected = useHubStore((s) => s.isConnected);
  const wasConnected = useRef(false),
    [blocked, setBlocked] = useState(false);
  if (signaling === "online" || connected) wasConnected.current = true;
  const localOutage = useRef(false);
  if (!reconnecting) localOutage.current = false;
  else if (!connected && (signaling === "offline" || signaling === "failed"))
    localOutage.current = true;
  const usableVoice = Object.values(quality).some(
    (q) => q.state === "connected" && q.flowing !== false,
  );
  const impaired =
    wasConnected.current &&
    ((!connected && signaling !== "online" && signaling !== "idle") ||
      (localOutage.current && (phase === "media" || phase === "discovery"))) &&
    reconnecting &&
    !usableVoice;
  useEffect(() => {
    if (!impaired) {
      setBlocked(false);
      return;
    }
    const timer = window.setTimeout(() => setBlocked(true), 2500);
    return () => clearTimeout(timer);
  }, [impaired]);

  // Retorno automático quando a internet volta: listener online + verificador
  // periódico a cada 3s enquanto estiver em modo de reconexão.
  useEffect(() => {
    if (!reconnecting && !impaired) return undefined;
    const onOnline = () => {
      webrtcEngine.notifyNetwork(true);
    };
    window.addEventListener("online", onOnline);
    const check = window.setInterval(() => {
      if (navigator.onLine) {
        webrtcEngine.notifyNetwork(true);
        window.clearInterval(check);
      }
    }, 3000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(check);
    };
  }, [reconnecting, impaired]);
  if (!blocked || !impaired) return null;
  return (
    <section
      className="brand-loading-screen reconnection-screen"
      aria-label="Reconectando à sala"
      role="status"
    >
      <AnimatedLogo />
      <h2>Reconectando...</h2>
      <p>
        {phase === "media"
          ? "Aguardando confirmação de mídia"
          : phase === "discovery"
            ? "Redescobrindo participantes"
            : "Recuperando sinalização"}{" "}
        · tentativa {attempt} de 8
      </p>
      <p className="text-xs text-muted-foreground">
        Os estados de microfone e áudio foram preservados.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => webrtcEngine.cancelRecovery()}>
          Continuar no histórico local
        </Button>
        {inVoice && (
          <Button
            variant="destructive"
            onClick={() => webrtcEngine.leaveVoiceCall()}
          >
            Encerrar chamada
          </Button>
        )}
      </div>
    </section>
  );
}
