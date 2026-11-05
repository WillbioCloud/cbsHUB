import type { AudioProcessingConfig } from '../types/cbshub';

const NOISE_GATE_WORKLET_CODE = `
class KrispLikeNoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.currentGain = 1.0;
    this.sampleRate = 48000;
    this.thresholdDb = -48.0;
    // Coeficientes de ataque (2ms) e release (120ms)
    this.attackCoef = Math.exp(-1.0 / (0.002 * this.sampleRate));
    this.releaseCoef = Math.exp(-1.0 / (0.120 * this.sampleRate));

    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.enabled === 'boolean') {
        this.enabled = event.data.enabled;
      }
      if (event.data && typeof event.data.thresholdDb === 'number') {
        this.thresholdDb = event.data.thresholdDb;
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

    // Calcula RMS do bloco de 128 amostras
    let sumSquares = 0;
    const primaryChannel = input[0];
    for (let i = 0; i < frameLength; i++) {
      const sample = primaryChannel[i];
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / frameLength);
    const rmsDb = rms > 0.000001 ? 20 * Math.log10(rms) : -120;

    const targetGain = rmsDb > this.thresholdDb ? 1.0 : 0.005;

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
  private micMuteNode: GainNode | null = null;
  private soundboardInputNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private processedStream: MediaStream | null = null;
  private meterInterval: number | null = null;
  private onSpeakingChange: SpeakingCallback | null = null;
  private isDestroyed = false;
  private isMicMuted = false;

  constructor(stream: MediaStream, config: AudioProcessingConfig, onSpeakingChange?: SpeakingCallback) {
    this.rawStream = stream;
    this.config = { ...config };
    if (onSpeakingChange) {
      this.onSpeakingChange = onSpeakingChange;
    }
  }

  public async initialize(): Promise<MediaStream> {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtx({ sampleRate: 48000 });

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.rawStream);

    // Biquad High-Pass Filter @ 80Hz, Q=0.707 (Corta ruído de mesa / coolers)
    this.highPassFilter = this.audioCtx.createBiquadFilter();
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.setValueAtTime(this.config.highPassFilter80Hz ? 80 : 10, this.audioCtx.currentTime);
    this.highPassFilter.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

    // Biquad Low-Pass Filter @ 14000Hz (Corta chiado agudo elétrico)
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

    // Analisador para VU meter e detecção de fala Discord-style
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.4;

    // Nó de mute suave exclusivo do Microfone (corta voz sem cortar o Soundboard!)
    this.micMuteNode = this.audioCtx.createGain();
    this.micMuteNode.gain.setValueAtTime(this.isMicMuted ? 0 : 1, this.audioCtx.currentTime);

    // Destino final para envio WebRTC
    this.destinationNode = this.audioCtx.createMediaStreamDestination();

    // Nó de entrada do Soundboard (conectado direto ao destino WebRTC, pós-filtros e pós-gate)
    this.soundboardInputNode = this.audioCtx.createGain();
    this.soundboardInputNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
    this.soundboardInputNode.connect(this.destinationNode);

    // Encadeamento do Pipeline de Áudio:
    // source -> highPass -> lowPass -> [worklet] -> compressor -> gain -> analyser -> micMuteNode -> destination
    let lastNode: AudioNode = this.sourceNode;
    lastNode.connect(this.highPassFilter);
    lastNode = this.highPassFilter;

    lastNode.connect(this.lowPassFilter);
    lastNode = this.lowPassFilter;

    if (this.workletNode) {
      lastNode.connect(this.workletNode);
      lastNode = this.workletNode;
    }

    lastNode.connect(this.compressorNode);
    lastNode = this.compressorNode;

    lastNode.connect(this.gainNode);
    lastNode = this.gainNode;

    lastNode.connect(this.analyserNode);

    this.analyserNode.connect(this.micMuteNode);
    this.micMuteNode.connect(this.destinationNode);

    this.processedStream = this.destinationNode.stream;

    this.startVoiceActivityDetection();

    return this.processedStream;
  }

  private startVoiceActivityDetection(): void {
    if (!this.analyserNode) return;

    const dataArray = new Float32Array(this.analyserNode.fftSize);

    this.meterInterval = window.setInterval(() => {
      if (this.isDestroyed || !this.analyserNode) return;

      // Se estiver mutado no microfone, reporta sempre fala inativa e nível 0
      if (this.isMicMuted) {
        if (this.onSpeakingChange) {
          this.onSpeakingChange(false, 0);
        }
        return;
      }

      this.analyserNode.getFloatTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i];
        sum += val * val;
      }

      const rms = Math.sqrt(sum / dataArray.length);
      const db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;

      // Anel verde ativo quando o volume passar de -42 dB
      const isSpeaking = db > -42;
      const normalizedLevel = Math.min(100, Math.max(0, Math.round(((db + 60) / 60) * 100)));

      if (this.onSpeakingChange) {
        this.onSpeakingChange(isSpeaking, normalizedLevel);
      }
    }, 45);
  }

  public setMicMuted(muted: boolean): void {
    this.isMicMuted = muted;
    if (this.micMuteNode && this.audioCtx) {
      this.micMuteNode.gain.setTargetAtTime(muted ? 0 : 1, this.audioCtx.currentTime, 0.015);
    }
    if (muted && this.onSpeakingChange) {
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

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch { /* ignore */ }
    }
    if (this.highPassFilter) {
      try { this.highPassFilter.disconnect(); } catch { /* ignore */ }
    }
    if (this.lowPassFilter) {
      try { this.lowPassFilter.disconnect(); } catch { /* ignore */ }
    }
    if (this.workletNode) {
      try { this.workletNode.disconnect(); } catch { /* ignore */ }
    }
    if (this.compressorNode) {
      try { this.compressorNode.disconnect(); } catch { /* ignore */ }
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch { /* ignore */ }
    }
    if (this.analyserNode) {
      try { this.analyserNode.disconnect(); } catch { /* ignore */ }
    }
    if (this.micMuteNode) {
      try { this.micMuteNode.disconnect(); } catch { /* ignore */ }
    }
    if (this.soundboardInputNode) {
      try { this.soundboardInputNode.disconnect(); } catch { /* ignore */ }
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }

    this.audioCtx = null;
    this.processedStream = null;
  }
}
