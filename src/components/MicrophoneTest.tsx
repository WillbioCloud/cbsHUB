import { useEffect, useRef, useState } from "react";
import { useHubStore } from "../store/useHubStore";
import { Button } from "./ui/button";
export function MicrophoneTest() {
  const inVoice = useHubStore((s) => s.inVoiceCall),
    input = useHubStore((s) => s.audioConfig.inputDeviceId);
  const [running, setRunning] = useState(false),
    [busy, setBusy] = useState(false),
    [level, setLevel] = useState(0),
    [error, setError] = useState("");
  const active = useRef<{
      stream: MediaStream;
      ctx: AudioContext;
      frame: number;
    } | null>(null),
    generation = useRef(0);
  const stop = () => {
    generation.current++;
    const current = active.current;
    active.current = null;
    if (current) {
      cancelAnimationFrame(current.frame);
      current.stream.getTracks().forEach((t) => t.stop());
      void current.ctx.close().catch(() => {});
    }
    setRunning(false);
    setBusy(false);
    setLevel(0);
  };
  useEffect(() => {
    stop();
    return stop;
  }, [inVoice, input]);
  const start = async () => {
    const attempt = ++generation.current;
    setBusy(true);
    setError("");
    let stream: MediaStream | null = null,
      ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: input === "default" ? undefined : { exact: input } },
        video: false,
      });
      if (attempt !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      ctx = new AudioContext();
      await ctx.resume();
      if (attempt !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        return;
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const capture = { stream, ctx, frame: 0 };
      active.current = capture;
      setRunning(true);
      let previous = 0;
      const tick = (time: number) => {
        if (active.current !== capture) return;
        if (time - previous > 80) {
          analyser.getFloatTimeDomainData(data);
          setLevel(
            Math.min(
              100,
              Math.round(
                Math.sqrt(
                  data.reduce((sum, x) => sum + x * x, 0) / data.length,
                ) * 350,
              ),
            ),
          );
          previous = time;
        }
        capture.frame = requestAnimationFrame(tick);
      };
      capture.frame = requestAnimationFrame(tick);
      stream.getTracks().forEach((track) => {
        track.onended = stop;
      });
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx) void ctx.close().catch(() => {});
      if (attempt === generation.current)
        setError(
          "Não foi possível testar o microfone. Verifique o dispositivo e a permissão.",
        );
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  };
  return (
    <section className="space-y-2" aria-label="Teste de microfone">
      <p className="text-xs text-muted-foreground">
        Teste local de nível, sem reprodução ou envio para a sala. Durante uma
        chamada, use o medidor existente.
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={inVoice || busy}
        onClick={() => (running ? stop() : void start())}
      >
        {busy
          ? "Abrindo microfone…"
          : running
            ? "Parar teste de microfone"
            : "Testar microfone"}
      </Button>
      {running && (
        <div
          role="meter"
          aria-label="Nível do teste de microfone"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={level}
          className="h-2 rounded-full bg-secondary overflow-hidden"
        >
          <div className="h-full bg-primary" style={{ width: `${level}%` }} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs">
          {error}
        </p>
      )}
    </section>
  );
}
