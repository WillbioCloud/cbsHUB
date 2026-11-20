/** Last-resort sample peak ceiling after mixing; unity below the ceiling.
 * This is not a loudness normalizer or a network failure detector. */
export function createAudioPeakGuard(
  context: BaseAudioContext,
): WaveShaperNode {
  const node = context.createWaveShaper();
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const sample = (i / (curve.length - 1)) * 2 - 1;
    const abs = Math.abs(sample);
    if (abs <= 0.8) {
      curve[i] = sample;
    } else {
      const sign = sample > 0 ? 1 : -1;
      const t = Math.min(1, (abs - 0.8) / 0.2);
      curve[i] = sign * (0.8 + 0.18 * Math.sin((t * Math.PI) / 2));
    }
  }
  node.curve = curve;
  node.oversample = "none";
  return node;
}
export function safeAudioGain(
  value: number,
  fallback = 1,
  maximum = 2,
): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, value))
    : fallback;
}
