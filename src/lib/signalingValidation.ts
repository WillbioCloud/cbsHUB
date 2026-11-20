import type {Participant} from '../types/cbshub';
const flags = ['inVoiceCall','isMuted','isDeafened','isSpeaking','isWebcamActive','isScreenSharing'] as const;
export function peerState(value: unknown, peerId: string, clientId: string): Omit<Participant,'isLocal'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string,unknown>;
  if (input.peerId !== peerId || typeof input.clientId !== 'string' || !input.clientId || input.clientId.length > 100 || (clientId && input.clientId !== clientId)) return null;
  if (typeof input.nickname !== 'string' || !input.nickname.trim() || input.nickname.length > 80 || typeof input.avatarColor !== 'string' || input.avatarColor.length > 80) return null;
  for (const key of flags) if (typeof input[key] !== 'boolean') return null;
  return { peerId, clientId: input.clientId, nickname: input.nickname, avatarColor: input.avatarColor,
    inVoiceCall: input.inVoiceCall as boolean, isMuted: input.isMuted as boolean, isDeafened: input.isDeafened as boolean,
    isSpeaking: input.isSpeaking as boolean, isWebcamActive: input.isWebcamActive as boolean, isScreenSharing: input.isScreenSharing as boolean,
    ...(typeof input.screenQualityLabel === 'string' && input.screenQualityLabel.length <= 40 ? {screenQualityLabel: input.screenQualityLabel} : {}) };
}
