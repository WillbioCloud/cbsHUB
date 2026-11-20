export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 120;
export async function decodeEditableAudio(blob: Blob): Promise<AudioBuffer> {
  if (!blob.size || blob.size > MAX_AUDIO_BYTES)
    throw Error("Use áudio de até 5 MB.");
  const url = URL.createObjectURL(blob),
    audio = new Audio();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => finish(Error("Não foi possível ler a duração do áudio.")),
        10000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timer);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        error ? reject(error) : resolve();
      };
      audio.onloadedmetadata = () => {
        if (
          !Number.isFinite(audio.duration) ||
          audio.duration <= 0 ||
          audio.duration > MAX_AUDIO_SECONDS
        )
          finish(Error("Use áudio de até 120 segundos com duração válida."));
        else finish();
      };
      audio.onerror = () =>
        finish(Error("Formato de áudio inválido ou não suportado."));
      audio.preload = "metadata";
      audio.src = url;
    });
  } finally {
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
  const ctx = new AudioContext();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (
      buffer.duration > MAX_AUDIO_SECONDS ||
      buffer.numberOfChannels > 2 ||
      buffer.sampleRate > 96000
    )
      throw Error("Limite: 120 segundos, dois canais e 96 kHz.");
    return buffer;
  } finally {
    await ctx.close();
  }
}
export function trimWav(buffer: AudioBuffer, start: number, end: number): Blob {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > buffer.duration + 0.0001 ||
    end - start < 0.05
  )
    throw Error("Selecione um intervalo válido de pelo menos 0,05 segundo.");
  const channels = Math.min(2, buffer.numberOfChannels),
    first = Math.floor(start * buffer.sampleRate),
    frames = Math.min(
      buffer.length - first,
      Math.round((end - start) * buffer.sampleRate),
    ),
    bytes = frames * channels * 2;
  if (bytes + 44 > MAX_AUDIO_BYTES)
    throw Error("O corte em WAV excede 5 MB. Reduza a duração.");
  const data = new ArrayBuffer(44 + bytes),
    view = new DataView(data);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, bytes, true);
  const samples = Array.from({ length: channels }, (_, i) =>
    buffer.getChannelData(i),
  );
  for (let i = 0; i < frames; i++)
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, samples[channel][first + i]));
      view.setInt16(
        44 + (i * channels + channel) * 2,
        sample < 0 ? sample * 32768 : sample * 32767,
        true,
      );
    }
  return new Blob([data], { type: "audio/wav" });
}
export function waveform(buffer: AudioBuffer, bars = 160) {
  const samples = buffer.getChannelData(0),
    step = Math.max(1, Math.floor(samples.length / bars));
  return Array.from({ length: bars }, (_, bar) => {
    let peak = 0;
    const end = Math.min(samples.length, (bar + 1) * step);
    for (let i = bar * step; i < end; i += Math.max(1, Math.floor(step / 64)))
      peak = Math.max(peak, Math.abs(samples[i]));
    return peak;
  });
}
