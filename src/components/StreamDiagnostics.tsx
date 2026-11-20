import { Activity, Cpu, Gauge, Monitor, Signal } from "lucide-react";
import { useHubStore } from "../store/useHubStore";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
export function StreamDiagnostics() {
  const telemetry = useHubStore((state) => state.telemetry);
  const participants = useHubStore((s) => s.participants);
  const active = telemetry.active && !!telemetry.sourcePeerId;
  const source = telemetry.sourcePeerId
    ? participants[telemetry.sourcePeerId]
    : undefined;
  const link = telemetry.observedLinkPeerId
    ? participants[telemetry.observedLinkPeerId]
    : undefined;
  const metrics = [
    {
      label: "Quadros",
      value: active && telemetry.fps > 0 ? `${telemetry.fps} FPS` : "—",
      Icon: Gauge,
    },
    {
      label: "Latência da transmissão",
      value: active && telemetry.rttMs > 0 ? `${telemetry.rttMs} ms` : "—",
      Icon: Signal,
    },
    { label: "CPU", value: "Não disponível", Icon: Cpu },
    { label: "GPU", value: "Não disponível", Icon: Monitor },
  ];
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="native-window-button no-drag"
              aria-label="Diagnóstico da transmissão"
            >
              <Activity className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Diagnóstico da transmissão</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="diagnostics-panel">
        <div>
          <p className="section-eyebrow">Diagnóstico</p>
          <h3 className="text-sm font-semibold mt-1">
            {active ? "Transmissão em andamento" : "Sem transmissão ativa"}
          </h3>
        </div>
        <dl className="grid grid-cols-2 gap-2 my-4">
          {metrics.map(({ label, value, Icon }) => (
            <div key={label} className="metric-tile">
              <dt className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <Icon className="size-3.5" />
                {label}
              </dt>
              <dd className="mt-2 text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {active && (
          <div className="flex justify-between gap-3 text-caption text-muted-foreground pb-3">
            <span>
              {telemetry.bitrateMeasured
                ? telemetry.bitrateMbps + " Mbps"
                : "Bitrate indisponível"}
            </span>
            <span>
              Perda{" "}
              {telemetry.lossMeasured
                ? telemetry.packetsLostPercent + "%"
                : "indisponível"}
            </span>
          </div>
        )}
        {active && (
          <p className="text-xs text-muted-foreground">
            {telemetry.direction === "outgoing"
              ? "Saída local"
              : "Recepção de " + (source?.nickname || "participante")}
            {link ? " · enlace com " + link.nickname : ""}. RTT mede este
            enlace, não a internet do participante.
          </p>
        )}
        <p className="text-caption text-muted-foreground leading-relaxed">
          {active
            ? "Métricas da transmissão monitorada. "
            : "FPS e latência aparecem durante uma transmissão. "}
          Medições de CPU e GPU ainda não estão disponíveis.
        </p>
      </PopoverContent>
    </Popover>
  );
}
