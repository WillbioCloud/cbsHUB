/**
 * SDP Munger para cbsHUB
 * Modifica descrições SDP WebRTC para Opus Stereo 256kbps em transmissões de tela
 * e Opus 64kbps com FEC e DTX para canais de voz pura.
 */

export function enhanceOpusSdp(sdp: string, isStereo: boolean): string {
  const lines = sdp.split('\r\n');
  let opusPayload: string | null = null;

  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000\/2/i);
    if (match) {
      opusPayload = match[1];
      break;
    }
  }

  if (!opusPayload) {
    return sdp;
  }

  // Seção 5.2 do SDD.md:
  // Canal 1 (voz): maxaveragebitrate=64000;useinbandfec=1;usedtx=1
  // Canal 2 (tela): stereo=1;sprop-stereo=1;maxaveragebitrate=256000;cbr=1;useinbandfec=1
  const opusParams = isStereo
    ? 'stereo=1;sprop-stereo=1;maxaveragebitrate=256000;cbr=1;useinbandfec=1'
    : 'maxaveragebitrate=64000;useinbandfec=1;usedtx=1';

  let fmtpFound = false;
  const newLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(`a=fmtp:${opusPayload}`)) {
      fmtpFound = true;
      const existingParams = line.substring(`a=fmtp:${opusPayload}`.length).trim();
      const paramMap = new Map<string, string>();

      if (existingParams.length > 0) {
        existingParams.split(';').forEach((p) => {
          const parts = p.trim().split('=');
          const k = parts[0]?.trim();
          const v = parts[1]?.trim();
          if (k) paramMap.set(k, v ?? '');
        });
      }

      opusParams.split(';').forEach((p) => {
        const parts = p.trim().split('=');
        const k = parts[0]?.trim();
        const v = parts[1]?.trim();
        if (k) paramMap.set(k, v ?? '');
      });

      const merged = Array.from(paramMap.entries())
        .map(([k, v]) => (v ? `${k}=${v}` : k))
        .join(';');

      newLines.push(`a=fmtp:${opusPayload} ${merged}`);
    } else {
      newLines.push(line);
    }
  }

  if (!fmtpFound) {
    const rtpIndex = newLines.findIndex((l) => l.startsWith(`a=rtpmap:${opusPayload}`));
    if (rtpIndex !== -1) {
      newLines.splice(rtpIndex + 1, 0, `a=fmtp:${opusPayload} ${opusParams}`);
    }
  }

  return newLines.join('\r\n');
}

/**
 * Aplica parâmetros de taxa de bits e degradação no RTCRtpSender de vídeo
 */
export async function configureVideoSender(sender: RTCRtpSender, maxBitrateBps: number): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    params.encodings[0].maxBitrate = maxBitrateBps;
    params.encodings[0].networkPriority = 'high';

    // Seção 5.4: Manter degradationPreference = 'maintain-framerate' para preservar os 60 FPS
    (params as unknown as { degradationPreference: string }).degradationPreference = 'maintain-framerate';

    await sender.setParameters(params);
  } catch (err) {
    console.warn('[SDP Munger] Não foi possível atualizar parâmetros do sender:', err);
  }
}

