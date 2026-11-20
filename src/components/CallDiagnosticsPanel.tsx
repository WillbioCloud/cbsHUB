import { useState } from "react";
import {
  useCallDiagnostics,
  clearCallDiagnostics,
  diagnosticReport,
} from "../lib/callDiagnostics";
import { useMediaState } from "../lib/mediaState";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
import { Button } from "./ui/button";
export function CallDiagnosticsPanel() {
  const events = useCallDiagnostics((s) => s.events),
    sessionId = useCallDiagnostics((s) => s.sessionId);
  const quality = useMediaState((s) => s.quality),
    reconnecting = useMediaState((s) => s.reconnecting),
    voice = useHubStore((s) => s.inVoiceCall);
  const [status, setStatus] = useState("");
  return (
    <section className="space-y-4" aria-label="Diagnóstico de chamadas">
      <h3 className="font-semibold">Diagnóstico de chamadas</h3>
      <p className="text-xs text-muted-foreground">
        Registros locais de estados, sem conteúdo de mensagens, áudio, vídeo,
        tokens ou endereços de rede. Até 200 eventos; reiniciar o app limpa este
        histórico.
      </p>
      <p className="text-sm" role="status">
        {voice ? "Na voz" : "Fora da voz"} ·{" "}
        {reconnecting ? "Reconectando à sala" : "Sem reconexão pendente"}
      </p>
      <p className="text-xs text-muted-foreground break-all">
        Sessão local: {sessionId}
      </p>
      {Object.values(quality).map((q, index) => (
        <div
          key={index}
          className="rounded-lg border border-border p-3 text-xs space-y-1"
        >
          <p>
            Conexão {index + 1}: {q.state}
          </p>
          <p>
            RTT: {q.rttMs === null ? "indisponível" : q.rttMs + " ms"} · Perda:{" "}
            {q.loss === null ? "indisponível" : q.loss + "%"} · Jitter:{" "}
            {q.jitterMs == null ? "indisponível" : q.jitterMs + " ms"}
          </p>
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          onClick={async () => {
            try {
              const report = JSON.parse(diagnosticReport());
              report.quality = Object.values(quality).map((q) => ({
                state: q.state,
                rttMs: Number.isFinite(q.rttMs) ? q.rttMs : null,
                loss: Number.isFinite(q.loss) ? q.loss : null,
                jitterMs: Number.isFinite(q.jitterMs) ? q.jitterMs : null,
              }));
              await navigator.clipboard.writeText(
                JSON.stringify(report, null, 2),
              );
              setStatus("Relatório copiado.");
            } catch {
              setStatus("Não foi possível copiar o relatório.");
            }
          }}
        >
          Copiar relatório
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            clearCallDiagnostics();
            setStatus("Registros limpos.");
          }}
        >
          Limpar registros
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => webrtcEngine.retryConnection()}
        >
          Tentar reconectar
        </Button>
        {reconnecting && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => webrtcEngine.cancelRecovery()}
          >
            Cancelar reconexão
          </Button>
        )}
      </div>
      <p className="text-xs" role="status">
        {status}
      </p>
      <ol
        className="max-h-64 overflow-y-auto space-y-2 text-xs"
        aria-label="Histórico de conexão"
      >
        {[...events].reverse().map((e, index) => (
          <li key={index} className="border-b border-border/50 pb-2">
            <time>{new Date(e.at).toLocaleString()}</time> · {e.event}
            {e.peer ? " · " + e.peer : ""}
            {e.connection ? " · " + e.connection : ""}
            {e.ice ? " · ICE " + e.ice : ""}
            {e.signaling ? " · sinalização " + e.signaling : ""}
            {e.reason ? " · " + e.reason : ""}
            {e.attempt !== undefined ? " · tentativa " + e.attempt : ""}
            {e.durationMs !== undefined
              ? " · " + Math.round(e.durationMs / 1000) + " s"
              : ""}
          </li>
        ))}
      </ol>
      {!events.length && (
        <p className="text-sm text-muted-foreground">
          Nenhum evento registrado.
        </p>
      )}
    </section>
  );
}
