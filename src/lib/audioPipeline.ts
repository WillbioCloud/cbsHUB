import type { AudioProcessingConfig } from '../types/cbshub';

/**
 * Gate de ruído "Krisp-like" via AudioWorklet.
 *
 * IMPORTANTE (calibração): os limiares antigos (-36 dB para abrir / -42 dB para fechar)
 * eram altos demais para microfones reais. Um usuário falando a 40 cm do microfone
 * fica facilmente entre -45 dB e -38 dB de RMS, então o gate fechava e a voz do irmão
 * simplesmente não saía no WebRTC (o outro lado não escutava nada). Além disso o ganho
 * de "fechado" ficava em 0.002, mascarando o medidor de fala.
 *
 * Agora os limiares são mais baixos, com hold proporcional e sem cortar a fala.
 */
const NOISE_GATE_WORKLET_CODE = `
class KrispLikeNoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.currentGain = 1.0;
    this.sampleRate = sampleRate || 48000;
    this.openThresholdDb = -48.0;
    this.closeThresholdDb = -54.0;
    this.isOpen = true;
    this.holdSamples = 0;
    this.maxHoldSamples = Math.floor(0.12 * this.sampleRate); // 120ms hold
    this.attackCoef = Math.exp(-1.0 / (0.004 * this.sampleRate));
    this.releaseCoef = Math.exp(-1.0 / (0.090 * this.sampleRate));

    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.enabled === 'boolean') {
        this.enabled = event.data.enabled;
        if (!this.enabled) {
          this.isOpen = true;
          this.currentGain = 1.0;
        }
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const channelCount = input.length;
    const frameLength = input[0].length;

    if (!this.enabled) {
      for (let ch = 0; ch < channelCount; ch++) {
        output[ch].set(input[ch]);
      }
      return true;
    }

    let sumSquares = 0;
    const primaryChannel = input[0];
    for (let i = 0; i < frameLength; i++) {
      const sample = primaryChannel[i];
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / frameLength);
    const rmsDb = rms > 0.000001 ? 20 * Math.log10(rms) : -120;

    if (rmsDb > this.openThresholdDb) {
      this.isOpen = true;
      this.holdSamples = this.maxHoldSamples;
    } else if (this.isOpen) {
      if (this.holdSamples > 0) {
        this.holdSamples = Math.max(0, this.holdSamples - frameLength);
      } else if (rmsDb < this.closeThresholdDb) {
        this.isOpen = false;
      }
    }

    const targetGain = this.isOpen ? 1.0 : 0.0;

    for (let i = 0; i < frameLength; i++) {
      const coef = targetGain > this.currentGain ? this.attackCoef : this.releaseCoef;
      this.currentGain = targetGain + coef * (this.currentGain - targetGain);

      for (let ch = 0; ch < channelCount; ch++) {
        output[ch][i] = input[ch][i] * this.currentGain;
      }
    }

    return true;
  }
}

registerProcessor('krisp-like-noise-gate', KrispLikeNoiseGateProcessor);
`;

export type SpeakingCallback = (isSpeaking: boolean, level: number) => void;

export class VoiceAudioPipeline {
  private rawStream: MediaStream;
  private config: AudioProcessingConfig;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highPassFilter: BiquadFilterNode | null = null;
  private lowPassFilter: BiquadFilterNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private analyserSinkNode: GainNode | null = null;
  private micMuteNode: GainNode | null = null;
  private soundboardInputNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private processedStream: MediaStream | null = null;
  private meterInterval: number | null = null;
  private onSpeakingChange: SpeakingCallback | null = null;
  private isDestroyed = false;
  private isMicMuted = false;
  private lastIsSpeaking = false;
  private lastLevel = -1;

  constructor(stream: MediaStream, config: AudioProcessingConfig, onSpeakingChange?: SpeakingCallback) {
    this.rawStream = stream;
    this.config = { ...config };
    if (onSpeakingChange) {
      this.onSpeakingChange = onSpeakingChange;
    }
  }

  public async initialize(): Promise<MediaStream> {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    // Alguns drivers não aceitam 48kHz fixos; tenta e faz fallback para o padrão do sistema.
    try {
      this.audioCtx = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
    } catch {
      this.audioCtx = new AudioCtx({ latencyHint: 'interactive' });
    }

    if (this.audioCtx.state === 'suspended') {
      // Pode falhar antes de um gesto do usuário (política de autoplay); o resume()
      // é chamado novamente no clique de "Entrar na Voz" / primeiro pointerdown.
      await this.audioCtx.resume().catch(() => {});
    }

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.rawStream);

    // Biquad High-Pass Filter @ 80Hz (corta ruído de mesa / coolers)
    this.highPassFilter = this.audioCtx.createBiquadFilter();
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.setValueAtTime(
      this.config.highPassFilter80Hz ? 80 : 10,
      this.audioCtx.currentTime
    );
    this.highPassFilter.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

    // Biquad Low-Pass Filter @ 14kHz (corta chiado agudo elétrico)
    this.lowPassFilter = this.audioCtx.createBiquadFilter();
    this.lowPassFilter.type = 'lowpass';
    this.lowPassFilter.frequency.setValueAtTime(14000, this.audioCtx.currentTime);

    // Injeção do AudioWorkletProcessor KrispLikeNoiseGate via Blob URL
    try {
      const blob = new Blob([NOISE_GATE_WORKLET_CODE], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await this.audioCtx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      this.workletNode = new AudioWorkletNode(this.audioCtx, 'krisp-like-noise-gate');
      this.workletNode.port.postMessage({ enabled: this.config.neuralNoiseGate });
    } catch {
      // Fallback sem falhar o stream caso Worklet não seja suportado
      this.workletNode = null;
    }

    // Compressor vocal dinâmico
    this.compressorNode = this.audioCtx.createDynamicsCompressor();
    this.compressorNode.threshold.setValueAtTime(-18, this.audioCtx.currentTime);
    this.compressorNode.knee.setValueAtTime(12, this.audioCtx.currentTime);
    this.compressorNode.ratio.setValueAtTime(4, this.audioCtx.currentTime);
    this.compressorNode.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
    this.compressorNode.release.setValueAtTime(0.25, this.audioCtx.currentTime);

    // Ganho do microfone (micGain)
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.setValueAtTime(this.config.micGain, this.audioCtx.currentTime);

    // Analisador para VU meter e detecção de fala Discord-style.
    // Fica em PARALELO (tap) no início do caminho, ANTES do gate: assim o anel verde
    // e o VU meter refletem o microfone real, mesmo quando o gate está fechado.
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.4;
    this.analyserSinkNode = this.audioCtx.createGain();
    this.analyserSinkNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
    this.analyserNode.connect(this.analyserSinkNode);
    this.analyserSinkNode.connect(this.audioCtx.destination);

    // Nó de mute suave exclusivo do Microfone (corta voz sem cortar o Soundboard!)
    this.micMuteNode = this.audioCtx.createGain();
    this.micMuteNode.gain.setValueAtTime(this.isMicMuted ? 0 : 1, this.audioCtx.currentTime);

    // Destino final para envio WebRTC
    this.destinationNode = this.audioCtx.createMediaStreamDestination();

    // Nó de entrada do Soundboard (conectado direto ao destino WebRTC, pós-filtros e pós-gate)
    this.soundboardInputNode = this.audioCtx.createGain();
    this.soundboardInputNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
    this.soundboardInputNode.connect(this.destinationNode);

    // Encadeamento principal:
    // source -> highPass -> lowPass -> [worklet gate] -> compressor -> gain -> micMute -> destination
    //                          \-> analyser (tap paralelo para VU meter / fala)
    let lastNode: AudioNode = this.sourceNode;
    lastNode.connect(this.highPassFilter);
    lastNode = this.highPassFilter;

    lastNode.connect(this.lowPassFilter);
    lastNode = this.lowPassFilter;

    // Tap de medição (paralelo, não altera o áudio enviado)
    lastNode.connect(this.analyserNode);

    if (this.workletNode) {
      lastNode.connect(this.workletNode);
      lastNode = this.workletNode;
    }

    lastNode.connect(this.compressorNode);
    lastNode = this.compressorNode;

    lastNode.connect(this.gainNode);
    lastNode = this.gainNode;

    lastNode.connect(this.micMuteNode);
    this.micMuteNode.connect(this.destinationNode);

    this.processedStream = this.destinationNode.stream;

    this.startVoiceActivityDetection();

    return this.processedStream;
  }

  private startVoiceActivityDetection(): void {
    if (!this.analyserNode) return;

    const dataArray = new Float32Array(this.analyserNode.fftSize);

    // 80ms (~12 fps): suficiente para feedback visual fluido sem re-renderizar
    // a árvore React inteira 22 vezes por segundo (o app travava na call).
    this.meterInterval = window.setInterval(() => {
      if (this.isDestroyed || !this.analyserNode) return;

      // Se estiver mutado no microfone, reporta sempre fala inativa e nível 0
      if (this.isMicMuted) {
        if (this.onSpeakingChange && (this.lastIsSpeaking || this.lastLevel !== 0)) {
          this.lastIsSpeaking = false;
          this.lastLevel = 0;
          this.onSpeakingChange(false, 0);
        }
        return;
      }

      this.analyserNode.getFloatTimeDomainData(dataArray);

      let sum = 0;
      let peak = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i];
        sum += val * val;
        const abs = Math.abs(val);
        if (abs > peak) peak = abs;
      }

      const rms = Math.sqrt(sum / dataArray.length);
      const db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;

      // Anel verde ativo quando o volume passar de -50 dB (mais sensível que antes)
      const isSpeaking = db > -50;
      const peakDb = peak > 0.00001 ? 20 * Math.log10(peak) : -100;
      const normalizedLevel = Math.min(
        100,
        Math.max(0, Math.round(((Math.max(db, peakDb - 12) + 60) / 60) * 100))
      );

      const levelChanged = Math.abs(normalizedLevel - this.lastLevel) >= 2;
      const speakingChanged = isSpeaking !== this.lastIsSpeaking;

      if (speakingChanged || levelChanged) {
        this.lastIsSpeaking = isSpeaking;
        this.lastLevel = normalizedLevel;
        if (this.onSpeakingChange) {
          this.onSpeakingChange(isSpeaking, normalizedLevel);
        }
      }
    }, 80);
  }

  public resume(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public setMicMuted(muted: boolean): void {
    this.isMicMuted = muted;
    if (this.micMuteNode && this.audioCtx) {
      this.micMuteNode.gain.setTargetAtTime(muted ? 0 : 1, this.audioCtx.currentTime, 0.015);
    }
    if (muted && this.onSpeakingChange) {
      this.lastIsSpeaking = false;
      this.lastLevel = 0;
      this.onSpeakingChange(false, 0);
    }
  }

  public getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  public getSoundboardInputNode(): GainNode | null {
    return this.soundboardInputNode;
  }

  public updateConfig(newConfig: Partial<AudioProcessingConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (this.highPassFilter && this.audioCtx) {
      const targetFreq = this.config.highPassFilter80Hz ? 80 : 10;
      this.highPassFilter.frequency.setTargetAtTime(targetFreq, this.audioCtx.currentTime, 0.05);
    }

    if (this.workletNode) {
      this.workletNode.port.postMessage({ enabled: this.config.neuralNoiseGate });
    }

    if (this.gainNode && this.audioCtx && typeof newConfig.micGain === 'number') {
      this.gainNode.gain.setTargetAtTime(newConfig.micGain, this.audioCtx.currentTime, 0.05);
    }
  }

  public getProcessedStream(): MediaStream | null {
    return this.processedStream;
  }

  public destroy(): void {
    this.isDestroyed = true;

    if (this.meterInterval !== null) {
      clearInterval(this.meterInterval);
      this.meterInterval = null;
    }

    const nodes: Array<AudioNode | null> = [
      this.sourceNode,
      this.highPassFilter,
      this.lowPassFilter,
      this.workletNode,
      this.compressorNode,
      this.gainNode,
      this.analyserNode,
      this.analyserSinkNode,
      this.micMuteNode,
      this.soundboardInputNode,
    ];

    for (const node of nodes) {
      if (node) {
        try {
          node.disconnect();
        } catch {
          /* ignore */
        }
      }
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }

    this.audioCtx = null;
    this.processedStream = null;
    this.onSpeakingChange = null;
  }
}
