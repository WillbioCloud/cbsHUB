import { useHubStore } from "../store/useHubStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEditableAudio, trimWav, waveform } from "../lib/audioTrim";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function AudioTrimEditor({
  source,
  onApply,
  initialStart = 0,
  initialEnd,
  onPendingChange,
}: {
  source: Blob;
  initialStart?: number;
  initialEnd?: number;
  onPendingChange?: () => void;
  onApply: (blob: Blob, duration: number, start: number, end: number) => void;
}) {
  const deafened = useHubStore((s) => s.isDeafened);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [error, setError] = useState(""),
    [preview, setPreview] = useState("");
  const player = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let active = true;
    setBuffer(null);
    setError("");
    void decodeEditableAudio(source)
      .then((data) => {
        if (active) {
          setBuffer(data);
          setStart(
            Number.isFinite(initialStart)
              ? Math.max(0, Math.min(initialStart, data.duration - 0.05))
              : 0,
          );
          setEnd(
            Number.isFinite(initialEnd)
              ? Math.min(data.duration, Math.max(0.05, initialEnd!))
              : data.duration,
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [source]);
  useEffect(() => {
    const audio = player.current;
    return () => {
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  useEffect(() => {
    if (deafened) player.current?.pause();
  }, [deafened]);
  useEffect(() => {
    player.current?.pause();
    setPreview("");
  }, [start, end, source]);
  const peaks = useMemo(() => (buffer ? waveform(buffer) : []), [buffer]);
  const produce = (apply: boolean) => {
    try {
      if (!buffer || (!apply && deafened)) return;
      const blob = trimWav(buffer, start, end);
      setError("");
      if (apply) {
        onApply(blob, end - start, start, end);
      } else {
        player.current?.pause();
        setPreview(URL.createObjectURL(blob));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section
      aria-label="Editor de corte de áudio"
      className="space-y-3 border border-border rounded-lg p-3"
    >
      <h3 className="text-sm font-semibold">Cortar áudio</h3>
      <p className="text-xs text-muted-foreground">
        O original é preservado. A prévia toca somente neste dispositivo.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {!buffer && !error && <p role="status">Analisando áudio…</p>}
      {buffer && (
        <>
          <svg
            viewBox="0 0 320 60"
            className="w-full h-16 bg-secondary rounded-md"
            role="img"
            aria-label="Forma de onda do áudio"
          >
            {peaks.map((peak, i) => (
              <line
                key={i}
                x1={i * 2}
                x2={i * 2}
                y1={30 - peak * 27}
                y2={30 + peak * 27}
                stroke="currentColor"
                strokeWidth="1"
                opacity={
                  i / peaks.length >= start / buffer.duration &&
                  i / peaks.length <= end / buffer.duration
                    ? 1
                    : 0.25
                }
              />
            ))}
          </svg>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              Início (s)
              <Input
                aria-label="Início do corte"
                type="number"
                min={0}
                max={buffer.duration}
                step={0.05}
                value={start}
                onChange={(e) => {
                  setStart(Number(e.target.value));
                  onPendingChange?.();
                }}
              />
            </label>
            <label className="text-xs">
              Fim (s)
              <Input
                aria-label="Fim do corte"
                type="number"
                min={0}
                max={buffer.duration}
                step={0.05}
                value={end}
                onChange={(e) => {
                  setEnd(Number(e.target.value));
                  onPendingChange?.();
                }}
              />
            </label>
          </div>
          <p className="text-xs">
            Duração selecionada: {Math.max(0, end - start).toFixed(2)} s
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              disabled={deafened}
              onClick={() => produce(false)}
            >
              Prévia do corte
            </Button>
            <Button size="sm" onClick={() => produce(true)}>
              Aplicar corte
            </Button>
          </div>
          {preview && (
            <audio
              ref={player}
              controls
              muted={deafened}
              autoPlay
              src={preview}
              className="w-full"
              aria-label="Prévia local do corte"
            />
          )}
        </>
      )}
    </section>
  );
}
