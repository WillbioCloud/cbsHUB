/**
 * Sintetizador harmônico puro via Web Audio API para cbsHUB
 * Sem arquivos de áudio externos, zero latência e 100% autônomo.
 */
class SoundSynthesizer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, type: OscillatorType, startTime: number, duration: number, gainVal: number): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(gainVal, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.00001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch {
      // Audio context might be restricted before interaction
    }
  }

  public playJoin(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(440.00, 'sine', now, 0.12, 0.18);       // A4
    this.playTone(554.37, 'sine', now + 0.08, 0.12, 0.18); // C#5
    this.playTone(659.25, 'sine', now + 0.16, 0.28, 0.18); // E5
  }

  public playLeave(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(659.25, 'sine', now, 0.12, 0.18);       // E5
    this.playTone(554.37, 'sine', now + 0.08, 0.12, 0.18); // C#5
    this.playTone(440.00, 'sine', now + 0.16, 0.25, 0.18); // A4
  }

  public playMute(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(520, 'triangle', now, 0.06, 0.20);
    this.playTone(330, 'triangle', now + 0.05, 0.09, 0.20);
  }

  public playUnmute(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(330, 'triangle', now, 0.06, 0.20);
    this.playTone(520, 'triangle', now + 0.05, 0.11, 0.20);
  }

  public playStreamStart(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(392.00, 'sine', now, 0.09, 0.14);        // G4
    this.playTone(523.25, 'sine', now + 0.07, 0.09, 0.14); // C5
    this.playTone(659.25, 'sine', now + 0.14, 0.09, 0.14); // E5
    this.playTone(783.99, 'sine', now + 0.21, 0.22, 0.18); // G5
  }

  public playStreamStop(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    this.playTone(783.99, 'sine', now, 0.08, 0.14);
    this.playTone(523.25, 'sine', now + 0.07, 0.18, 0.14);
  }
}

export const sounds = new SoundSynthesizer();

