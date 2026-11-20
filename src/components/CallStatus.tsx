import { useHubStore } from "../store/useHubStore";
import { useMediaState } from "../lib/mediaState";
import { webrtcEngine } from "../lib/webrtcEngine";
import { Button } from "./ui/button";

export function MediaNotice() {
  const error = useMediaState((s) => s.error),
    reconnecting = useMediaState((s) => s.reconnecting);
  if (!error && !reconnecting) return null;
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 text-xs"
      role={error ? "alert" : "status"}
    >
      <span>
        {error ||
          "Reconectando à sala. As chamadas existentes serão preservadas enquanto possível."}
      </span>
      {error && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => webrtcEngine.retryConnection()}
        >
          Tentar novamente
        </Button>
      )}
      {reconnecting && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => webrtcEngine.cancelRecovery()}
        >
          Cancelar reconexão
        </Button>
      )}
      {error ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => useMediaState.setState({ error: null })}
        >
          Dispensar
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => webrtcEngine.retryConnection()}
        >
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
export function CallQualityBadge({ peerId }: { peerId: string }) {
  const quality = useMediaState((s) => s.quality[peerId]);
  const unstable =
    quality?.state === "connected" &&
    ((quality.loss ?? 0) > 5 || (quality.rttMs ?? 0) > 300);
  const status = !quality
    ? "Aguardando enlace"
    : quality.state === "closed"
      ? "Desconectado"
      : quality.state === "failed"
        ? "Desconectado"
        : quality.state === "disconnected"
          ? "Reconectando"
          : quality.state !== "connected" || quality.flowing === false
            ? "Conectando mídia"
            : unstable
              ? "Instável"
              : "Conectado";
  const metrics =
    quality?.state === "connected" && quality.flowing !== false
      ? ` · ${quality.rttMs === null ? "RTT indisponível" : quality.rttMs + " ms"} · ${quality.loss === null ? "perda indisponível" : quality.loss + "% perda"}`
      : "";
  return (
    <span
      className={`call-quality-badge rounded-md bg-overlay px-2 py-1 text-micro ${unstable || quality?.state !== "connected" ? "text-warning" : "text-white"}`}
      title={`${status}${metrics}. Medição observada deste enlace WebRTC, não da internet do participante.`}
      aria-label={`${status}${metrics}`}
    >
      <span className="quality-text">
        {status}
        {metrics}
      </span>
      <span className="quality-dot" aria-hidden="true">
        ●
      </span>
    </span>
  );
}

export function LocalConnectionBadge() {
  const signaling = useMediaState((s) => s.signaling);
  const reconnecting = useMediaState((s) => s.reconnecting);
  const connected = useHubStore((s) => s.isConnected);
  const lost = signaling === "offline" || signaling === "failed";
  const status = lost
    ? reconnecting
      ? "Reconectando sinalização"
      : "Sinalização indisponível"
    : signaling === "connecting"
      ? "Conectando sinalização"
      : connected
        ? "Conectado à sala"
        : signaling === "online"
          ? "Redescobrindo sala"
          : "Modo local";
  return (
    <span
      data-local-connection
      className={`call-quality-badge rounded-md bg-overlay px-2 py-1 text-micro ${connected && !lost ? "text-success" : "text-warning"}`}
      aria-label={`Sua conexão: ${status}`}
      title="Estado local da sinalização e presença. Sem ping local independente medido; RTT nos demais cards é a medição do enlace WebRTC."
    >
      <span className="quality-text">{status}</span>
      <span className="quality-dot" aria-hidden="true">
        ●
      </span>
    </span>
  );
}
