import { Activity } from "lucide-react";
import { useHubStore } from "../store/useHubStore";
export function MicrophoneLevelMeter() {
  const micLevel = useHubStore((s) => s.micLevel),
    isLocalSpeaking = useHubStore((s) => s.isLocalSpeaking);
  return (
    <>
      {" "}
      {/* VU Meter ao Vivo */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Activity
              className={`w-4 h-4 ${isLocalSpeaking ? "text-success animate-pulse" : "text-muted-foreground"}`}
            />
            <span>Nível do Microfone (VU Meter)</span>
          </span>
          <span className="text-caption font-mono text-muted-foreground">
            {isLocalSpeaking ? "Falando" : "Silêncio"}
          </span>
        </div>

        <div className="w-full h-2.5 bg-card rounded-full overflow-hidden p-0.5 border border-border/40">
          <div
            className={`h-full rounded-full transition-all duration-75 ${
              micLevel > 70
                ? "bg-destructive"
                : micLevel > 20
                  ? "bg-success"
                  : "bg-primary"
            }`}
            style={{
              width: `${Math.min(100, Math.max(0, micLevel))}%`,
            }}
          />
        </div>
      </div>
    </>
  );
}
