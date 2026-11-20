import { createAudioPeakGuard, safeAudioGain } from "./audioPeakGuard";
import { decodeEditableAudio } from "./audioTrim";
import type { SoundboardClip } from "../types/cbshub";
import { useHubStore } from "../store/useHubStore";
import { storageDb } from "./storageDb";
import { mediaError } from "./mediaState";

export const BUILT_IN_SOUNDBOARD_CLIPS: SoundboardClip[] = [
  {
    id: "builtin-airhorn",
    name: "Buzina de Estádio",
    emoji: "🎺",
    isBuiltIn: true,
    synthPreset: "airhorn",
    volume: 0.9,
    isFavorite: true,
    createdAt: 1,
  },
  {
    id: "builtin-vineboom",
    name: "Vine Boom",
    emoji: "💥",
    isBuiltIn: true,
    synthPreset: "vineboom",
    volume: 1.0,
    isFavorite: true,
    createdAt: 2,
  },
  {
    id: "builtin-tada",
    name: "Ta-Da Fanfarra",
    emoji: "🎉",
    isBuiltIn: true,
    synthPreset: "tada",
    volume: 0.85,
    isFavorite: false,
    createdAt: 3,
  },
  {
    id: "builtin-cricket",
    name: "Grilo no Vácuo",
    emoji: "🦗",
    isBuiltIn: true,
    synthPreset: "cricket",
    volume: 0.85,
    isFavorite: false,
    createdAt: 4,
  },
  {
    id: "builtin-sad_trombone",
    name: "Trombone Triste",
    emoji: "🎺",
    isBuiltIn: true,
    synthPreset: "sad_trombone",
    volume: 0.85,
    isFavorite: false,
    createdAt: 5,
  },
  {
    id: "builtin-coin",
    name: "Moeda Retro",
    emoji: "🪙",
    isBuiltIn: true,
    synthPreset: "coin",
    volume: 0.8,
    isFavorite: false,
    createdAt: 6,
  },
  {
    id: "builtin-drumroll",
    name: "Rufar de Tambores",
    emoji: "🥁",
    isBuiltIn: true,
    synthPreset: "drumroll",
    volume: 0.9,
    isFavorite: false,
    createdAt: 7,
  },
  {
    id: "builtin-bruh",
    name: "Bruh Sound",
    emoji: "🗿",
    isBuiltIn: true,
    synthPreset: "bruh",
    volume: 0.9,
    isFavorite: true,
    createdAt: 8,
  },
];

interface ActiveSoundHandle {
  stop: () => void;
}

class SoundboardEngine {
  private localCtx: AudioContext | null = null;
  private playbackGeneration = 0;
  private pendingPlayback = 0;
  private pendingDecodes = 0;
  private monitorGains = new Map<AudioContext, GainNode>();
  constructor() {
    useHubStore.subscribe((state, previous) => {
      for (const [ctx, gain] of this.monitorGains) {
        if (ctx.state === "closed") {
          this.monitorGains.delete(ctx);
          continue;
        }
        if (state.isDeafened !== previous.isDeafened)
          gain.gain.setValueAtTime(state.isDeafened ? 0 : 1, ctx.currentTime);
        if (
          state.audioConfig.outputDeviceId !==
          previous.audioConfig.outputDeviceId
        )
          this.setOutput(ctx, state.audioConfig.outputDeviceId);
      }
    });
  }
  private setOutput(ctx: AudioContext, id: string) {
    if ("setSinkId" in ctx)
      (ctx as AudioContext & { setSinkId(id: string): Promise<void> })
        .setSinkId(id === "default" ? "" : id)
        .catch((error) => mediaError("Saída do Soundboard", error));
  }
  private localMonitor(ctx: AudioContext): GainNode {
    let gain = this.monitorGains.get(ctx);
    if (!gain) {
      gain = ctx.createGain();
      const peakGuard = createAudioPeakGuard(ctx);
      gain.connect(peakGuard);
      peakGuard.connect(ctx.destination);
      gain.gain.value = useHubStore.getState().isDeafened ? 0 : 1;
      this.monitorGains.set(ctx, gain);
      this.setOutput(ctx, useHubStore.getState().audioConfig.outputDeviceId);
    }
    return gain;
  }

  private bufferCache: Map<string, AudioBuffer> = new Map();
  public invalidateClip(id: string) {
    this.bufferCache.delete(id);
  }
  private activeHandles: Set<ActiveSoundHandle> = new Set();
  private pipelineInputGetter: (() => GainNode | null) | null = null;
  private pipelineContextGetter: (() => AudioContext | null) | null = null;

  /**
   * Registra referências do pipeline de áudio de voz para injeção WebRTC
   */
  public registerPipelineHooks(
    getContext: () => AudioContext | null,
    getInputNode: () => GainNode | null,
  ): void {
    this.pipelineContextGetter = getContext;
    this.pipelineInputGetter = getInputNode;
  }

  private getAudioContext(): AudioContext {
    const pipelineCtx = this.pipelineContextGetter
      ? this.pipelineContextGetter()
      : null;
    if (pipelineCtx && pipelineCtx.state !== "closed") {
      if (pipelineCtx.state === "suspended") {
        pipelineCtx.resume().catch(() => {});
      }
      return pipelineCtx;
    }

    if (!this.localCtx || this.localCtx.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.localCtx = new AudioCtx({ sampleRate: 48000 });
    }
    if (this.localCtx.state === "suspended") {
      this.localCtx.resume().catch(() => {});
    }
    return this.localCtx;
  }

  /**
   * Para todos os sons em reprodução instantaneamente
   */
  public stopAll(): void {
    this.playbackGeneration++;
    for (const handle of Array.from(this.activeHandles)) {
      try {
        handle.stop();
      } catch {
        /* ignore */
      }
    }
    this.activeHandles.clear();
  }

  /**
   * Carrega clipes embutidos + clipes salvos no IndexedDB e atualiza a store
   */
  public async loadAllClips(): Promise<SoundboardClip[]> {
    try {
      const customClips = await storageDb.getSoundboardClips();
      const customMap = new Map(customClips.map((c) => [c.id, c]));

      // Mescla embutidos com customizados
      const all: SoundboardClip[] = [
        ...BUILT_IN_SOUNDBOARD_CLIPS.map((builtIn) => {
          const override = customMap.get(builtIn.id);
          return override
            ? {
                ...builtIn,
                name: override.name,
                emoji: override.emoji,
                category: override.category,
                order: override.order,
                isFavorite: override.isFavorite,
                volume: override.volume,
              }
            : builtIn;
        }),
        ...customClips.filter((c) => !c.isBuiltIn),
      ];

      // Persist native defaults once so favorites/editing use the same durable path.
      for (const clip of BUILT_IN_SOUNDBOARD_CLIPS)
        if (!customMap.has(clip.id)) await storageDb.saveSoundboardClip(clip);
      all.sort(
        (a, b) =>
          (a.order ?? a.createdAt) - (b.order ?? b.createdAt) ||
          a.id.localeCompare(b.id),
      );
      useHubStore.getState().setSoundboardClips(all);
      return all;
    } catch (err) {
      console.warn("[SoundboardEngine] Falha ao carregar clipes:", err);
      useHubStore.getState().setSoundboardClips(BUILT_IN_SOUNDBOARD_CLIPS);
      return BUILT_IN_SOUNDBOARD_CLIPS;
    }
  }

  /**
   * Toca um clipe do Soundboard:
   * - Retorno local nos fones (respeitando isDeafened)
   * - Injeção direta no WebRTC pós-NoiseGate se estiver em chamada de voz
   */
  public async playClip(
    clip: SoundboardClip,
    previewOnly = false,
  ): Promise<void> {
    if (this.pendingPlayback >= 2 || this.activeHandles.size >= 8)
      throw new Error("Aguarde os efeitos atuais terminarem.");
    this.pendingPlayback++;
    try {
      const ctx = this.getAudioContext();
      const state = useHubStore.getState();
      const soundboardMasterVolume = safeAudioGain(
        state.soundboardVolume ?? 0.85,
        0.85,
      );
      const clipVolume = Number.isFinite(clip.volume) ? clip.volume! : 0.85;
      const finalVolume = Math.max(
        0,
        Math.min(1.4, clipVolume * soundboardMasterVolume),
      );

      // Nó de ganho mestre para esta instância do clipe
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(finalVolume, ctx.currentTime);

      // 1. Roteamento Local (respeitando isDeafened)
      masterGain.connect(this.localMonitor(ctx));

      // 2. Roteamento WebRTC (caso esteja em call de voz e o nó de soundboard exista)
      const pipelineNode = this.pipelineInputGetter
        ? this.pipelineInputGetter()
        : null;
      if (!previewOnly && state.inVoiceCall && pipelineNode) {
        try {
          masterGain.connect(pipelineNode);
        } catch (err) {
          console.warn(
            "[SoundboardEngine] Não foi possível conectar ao pipeline WebRTC:",
            err,
          );
        }
      }

      if (clip.audioBlob) {
        await this.playAudioBlobOnNode(
          clip.audioBlob,
          clip.id,
          ctx,
          masterGain,
        );
      } else if (clip.synthPreset) {
        this.playSynthPresetOnNode(clip.synthPreset, ctx, masterGain);
      }
    } finally {
      this.pendingPlayback--;
    }
  }

  /**
   * Pré-visualiza um Blob localmente no modal de adicionar som
   */
  public async previewAudioBlob(blob: Blob, volume = 0.85): Promise<void> {
    const ctx = this.getAudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(
      safeAudioGain(volume, 0.85, 1.5),
      ctx.currentTime,
    );
    masterGain.connect(this.localMonitor(ctx));

    await this.playAudioBlobOnNode(
      blob,
      "preview-" + Date.now(),
      ctx,
      masterGain,
    );
  }

  /**
   * Decodifica e toca um AudioBlob com cache em memória
   */
  private async playAudioBlobOnNode(
    blob: Blob,
    cacheKey: string,
    ctx: AudioContext,
    destinationNode: AudioNode,
  ): Promise<void> {
    const generation = this.playbackGeneration;
    try {
      let buffer = this.bufferCache.get(cacheKey);

      if (!buffer) {
        // Decode in an isolated context with metadata/size limits, never in the live voice context.
        if (this.pendingDecodes >= 2)
          throw new Error("Aguarde a preparação dos efeitos.");
        this.pendingDecodes++;
        try {
          buffer = await decodeEditableAudio(blob);
        } finally {
          this.pendingDecodes--;
        }
        const bytes = buffer.length * buffer.numberOfChannels * 4;
        if (bytes > 48 * 1024 * 1024)
          throw new Error("Áudio decodificado excede 48 MB.");
        let cachedBytes = [...this.bufferCache.values()].reduce(
          (sum, b) => sum + b.length * b.numberOfChannels * 4,
          0,
        );
        while (
          this.bufferCache.size &&
          cachedBytes + bytes > 64 * 1024 * 1024
        ) {
          const key = this.bufferCache.keys().next().value!;
          const old = this.bufferCache.get(key)!;
          cachedBytes -= old.length * old.numberOfChannels * 4;
          this.bufferCache.delete(key);
        }
        // Guarda no cache em memória
        if (cacheKey && !cacheKey.startsWith("preview-")) {
          if (this.bufferCache.size >= 24)
            this.bufferCache.delete(this.bufferCache.keys().next().value!);
          this.bufferCache.set(cacheKey, buffer);
        }
      }

      if (generation !== this.playbackGeneration || ctx.state === "closed") {
        destinationNode.disconnect();
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(destinationNode);

      const handle: ActiveSoundHandle = {
        stop: () => {
          try {
            source.stop();
            source.disconnect();
            destinationNode.disconnect();
          } catch {
            /* ignore */
          }
        },
      };

      this.activeHandles.add(handle);

      source.onended = () => {
        this.activeHandles.delete(handle);
        try {
          source.disconnect();
          destinationNode.disconnect();
        } catch {
          /* ignore */
        }
      };

      source.start();
    } catch (err) {
      destinationNode.disconnect();
      throw err;
    }
  }

  /**
   * Síntese harmônica e percussiva rica dos 8 efeitos embutidos
   */
  private playSynthPresetOnNode(
    preset: NonNullable<SoundboardClip["synthPreset"]>,
    ctx: AudioContext,
    destinationNode: AudioNode,
  ): void {
    const now = ctx.currentTime;
    const nodesToStop: Array<AudioNode & { stop?: (when?: number) => void }> =
      [];

    const registerHandle = (durationMs: number) => {
      const handle: ActiveSoundHandle = {
        stop: () => {
          destinationNode.disconnect();
          nodesToStop.forEach((n) => {
            try {
              if (typeof n.stop === "function") n.stop();
              n.disconnect();
            } catch {
              /* ignore */
            }
          });
        },
      };

      this.activeHandles.add(handle);
      window.setTimeout(() => {
        handle.stop();
        destinationNode.disconnect();
        this.activeHandles.delete(handle);
      }, durationMs + 200);
    };

    switch (preset) {
      case "airhorn": {
        // Padrão de Buzina de Estádio: [Bip-Bip-Biiiiip]
        // Acordes Bb4 (466Hz), Eb5 (622Hz), F5 (698Hz), Bb5 (932Hz) em dente-de-serra
        const bursts = [
          { start: 0.0, dur: 0.12 },
          { start: 0.16, dur: 0.12 },
          { start: 0.32, dur: 0.65 },
        ];
        const freqs = [466.16, 622.25, 698.46, 932.33];

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(3600, now);
        filter.connect(destinationNode);

        bursts.forEach(({ start, dur }) => {
          freqs.forEach((f) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(f, now + start);
            // Pequeno vibrato rápido
            osc.frequency.exponentialRampToValueAtTime(
              f * 1.02,
              now + start + dur * 0.5,
            );

            g.gain.setValueAtTime(0.0001, now + start);
            g.gain.linearRampToValueAtTime(0.18, now + start + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

            osc.connect(g);
            g.connect(filter);

            osc.start(now + start);
            osc.stop(now + start + dur);
            nodesToStop.push(osc);
          });
        });

        registerHandle(1100);
        break;
      }

      case "vineboom": {
        // Impacto Cinematográfico Pesado: Sub-bass saturado + Ruído de choque
        const dur = 1.6;

        // Sub-bass descendente
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(28, now + dur);

        oscGain.gain.setValueAtTime(0.0001, now);
        oscGain.gain.linearRampToValueAtTime(0.85, now + 0.02);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        // Ruído filtrado inicial de impacto
        const bufferSize = ctx.sampleRate * 0.4;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = "bandpass";
        noiseFilter.frequency.setValueAtTime(180, now);
        noiseFilter.Q.setValueAtTime(2.0, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.6, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(destinationNode);

        osc.connect(oscGain);
        oscGain.connect(destinationNode);

        osc.start(now);
        osc.stop(now + dur);
        noiseSource.start(now);
        noiseSource.stop(now + 0.4);

        nodesToStop.push(osc, noiseSource);
        registerHandle(dur * 1000);
        break;
      }

      case "tada": {
        // Fanfarra alegre: C5, E5, G5 e acorde C6 sustentado
        const notes = [
          { f: 523.25, time: 0.0, dur: 0.12 },
          { f: 659.25, time: 0.12, dur: 0.12 },
          { f: 783.99, time: 0.24, dur: 0.15 },
          { f: 1046.5, time: 0.4, dur: 0.85 }, // C6
          { f: 1318.51, time: 0.4, dur: 0.85 }, // E6
          { f: 1567.98, time: 0.4, dur: 0.85 }, // G6
        ];

        notes.forEach((n) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(n.f, now + n.time);

          g.gain.setValueAtTime(0.0001, now + n.time);
          g.gain.linearRampToValueAtTime(0.22, now + n.time + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);

          osc.connect(g);
          g.connect(destinationNode);

          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur);
          nodesToStop.push(osc);
        });

        registerHandle(1400);
        break;
      }

      case "cricket": {
        // Grilos no vácuo: 3 grupos de chirps agudos ~4500Hz
        const chirps = [0.0, 0.35, 0.7];
        chirps.forEach((groupStart) => {
          for (let i = 0; i < 4; i++) {
            const start = groupStart + i * 0.045;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(
              4600 + Math.random() * 200,
              now + start,
            );

            g.gain.setValueAtTime(0.0001, now + start);
            g.gain.linearRampToValueAtTime(0.18, now + start + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.035);

            osc.connect(g);
            g.connect(destinationNode);

            osc.start(now + start);
            osc.stop(now + start + 0.04);
            nodesToStop.push(osc);
          }
        });

        registerHandle(1200);
        break;
      }

      case "sad_trombone": {
        // Trombone triste: D4 -> C#4 -> C4 -> B3 (com pitch bend descendente e vibrato wah-wah)
        const notes = [
          { f: 293.66, dur: 0.35, bend: 290 },
          { f: 277.18, dur: 0.35, bend: 274 },
          { f: 261.63, dur: 0.35, bend: 258 },
          { f: 246.94, dur: 0.85, bend: 180 }, // Desce melancolicamente
        ];

        let offset = 0;
        notes.forEach((n) => {
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const g = ctx.createGain();

          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(n.f, now + offset);
          osc.frequency.exponentialRampToValueAtTime(
            n.bend,
            now + offset + n.dur,
          );

          filter.type = "lowpass";
          filter.frequency.setValueAtTime(800, now + offset);
          filter.frequency.linearRampToValueAtTime(
            1400,
            now + offset + n.dur * 0.5,
          );
          filter.frequency.linearRampToValueAtTime(600, now + offset + n.dur);

          g.gain.setValueAtTime(0.0001, now + offset);
          g.gain.linearRampToValueAtTime(0.25, now + offset + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, now + offset + n.dur);

          osc.connect(filter);
          filter.connect(g);
          g.connect(destinationNode);

          osc.start(now + offset);
          osc.stop(now + offset + n.dur);
          nodesToStop.push(osc);

          offset += n.dur + 0.04;
        });

        registerHandle(2200);
        break;
      }

      case "coin": {
        // Moeda estilo arcade clássico: B5 (987Hz) por 70ms e depois E6 (1318Hz)
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(987.77, now);
        osc.frequency.setValueAtTime(1318.51, now + 0.075);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.2, now + 0.01);
        g.gain.setValueAtTime(0.2, now + 0.075);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

        osc.connect(g);
        g.connect(destinationNode);

        osc.start(now);
        osc.stop(now + 0.55);
        nodesToStop.push(osc);

        registerHandle(600);
        break;
      }

      case "drumroll": {
        // Rufar de tambores: Caixa rápida + Crash de prato final
        const rollDur = 1.2;
        const totalHits = 26;

        for (let i = 0; i < totalHits; i++) {
          const t = now + (i / totalHits) * rollDur;
          const noiseBuffer = ctx.createBuffer(
            1,
            ctx.sampleRate * 0.04,
            ctx.sampleRate,
          );
          const data = noiseBuffer.getChannelData(0);
          for (let j = 0; j < data.length; j++) data[j] = Math.random() * 2 - 1;

          const src = ctx.createBufferSource();
          src.buffer = noiseBuffer;

          const filter = ctx.createBiquadFilter();
          filter.type = "highpass";
          filter.frequency.setValueAtTime(800 + i * 20, t);

          const g = ctx.createGain();
          const amp = 0.08 + (i / totalHits) * 0.22;
          g.gain.setValueAtTime(amp, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);

          src.connect(filter);
          filter.connect(g);
          g.connect(destinationNode);

          src.start(t);
          src.stop(t + 0.04);
          nodesToStop.push(src);
        }

        // Batida de Prato Final (Crash)
        const crashTime = now + rollDur + 0.02;
        const crashBuffer = ctx.createBuffer(
          1,
          ctx.sampleRate * 0.8,
          ctx.sampleRate,
        );
        const cData = crashBuffer.getChannelData(0);
        for (let j = 0; j < cData.length; j++) cData[j] = Math.random() * 2 - 1;

        const crashSrc = ctx.createBufferSource();
        crashSrc.buffer = crashBuffer;

        const crashFilter = ctx.createBiquadFilter();
        crashFilter.type = "bandpass";
        crashFilter.frequency.setValueAtTime(4500, crashTime);
        crashFilter.Q.setValueAtTime(1.0, crashTime);

        const crashGain = ctx.createGain();
        crashGain.gain.setValueAtTime(0.35, crashTime);
        crashGain.gain.exponentialRampToValueAtTime(0.0001, crashTime + 0.8);

        crashSrc.connect(crashFilter);
        crashFilter.connect(crashGain);
        crashGain.connect(destinationNode);

        crashSrc.start(crashTime);
        crashSrc.stop(crashTime + 0.8);
        nodesToStop.push(crashSrc);

        registerHandle(2200);
        break;
      }

      case "bruh": {
        // Efeito percussivo ressonante grave "Bruh"
        const dur = 0.55;
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(190, now);
        osc.frequency.exponentialRampToValueAtTime(68, now + dur);

        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(194, now);
        osc2.frequency.exponentialRampToValueAtTime(70, now + dur);

        filter.type = "bandpass";
        filter.frequency.setValueAtTime(550, now);
        filter.frequency.exponentialRampToValueAtTime(220, now + dur);
        filter.Q.setValueAtTime(3.5, now);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.65, now + 0.025);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(g);
        g.connect(destinationNode);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + dur);
        osc2.stop(now + dur);
        nodesToStop.push(osc, osc2);

        registerHandle(700);
        break;
      }
    }
  }
}

export const soundboardEngine = new SoundboardEngine();
