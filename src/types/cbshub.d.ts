export type ResolutionPreset = '720p' | '1080p' | '1440p' | '2160p';
export type FpsPreset = 24 | 25 | 30 | 60;

export interface VideoQualityConfig {
  resolution: ResolutionPreset;
  width: number;
  height: number;
  fps: FpsPreset;
  targetBitrateBps: number;
  maxBitrateBps: number;
  includeSystemAudio: boolean;
}

export interface AudioProcessingConfig {
  inputDeviceId: string;
  outputDeviceId: string;
  videoDeviceId: string;
  echoCancellation: boolean;
  autoGainControl: boolean;
  highPassFilter80Hz: boolean;
  neuralNoiseGate: boolean; // Supressão de ruído Krisp-like via Worklet
  micGain: number;          // 0.0 a 2.0 (1.0 = 100%)
  remoteStreamVolume: number; // 0.0 a 1.0
}

export interface DesktopSourceItem {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  appIconDataUrl: string | null;
  isScreen: boolean;
}

export interface StreamTelemetry {
  active: boolean;
  resolution: string;
  fps: number;
  bitrateMbps: number;
  rttMs: number;
  packetsLostPercent: number;
  abrStatus: 'optimal' | 'throttled' | 'recovering';
}

export interface Participant {
  peerId: string;
  clientId: string;          // UUID persistente por instalação no localStorage (para manter avatar/volume/autoria)
  nickname: string;
  avatarColor: string;       // Cor HSL/Hex consistente gerada ou escolhida pelo usuário
  isLocal: boolean;
  inVoiceCall: boolean;      // true = está com voz ativa no CallStagePanel; false = apenas na sala de texto
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isWebcamActive: boolean;
  isScreenSharing: boolean;
  screenQualityLabel?: string; // Ex: "1080p 60FPS"
  rttMs?: number;
  activeSoundEffect?: {      // Para exibir animação flutuante no UserCallCard quando tocar Soundboard
    emoji: string;
    name: string;
    expiresAt: number;
  } | null;
}

export interface ChatReaction {
  emoji: string;
  reactorClientIds: string[]; // Lista de clientIds que reagiram com este emoji
  reactorNicknames: Record<string, string>;
}

export interface ChatMessage {
  id: string;                 // UUID v4 único para deduplicação P2P
  roomId: string;
  type: 'user' | 'system' | 'soundboard';
  authorClientId: string;
  authorNickname: string;
  authorAvatarColor: string;
  content: string;
  createdAt: number;          // Epoch ms
  reactions: Record<string, ChatReaction>; // chave = emoji
  soundMeta?: {
    emoji: string;
    soundName: string;
  };
}

export interface SoundboardClip {
  id: string;
  name: string;
  emoji: string;
  isBuiltIn: boolean;         // true = som sintetizado/embutido; false = arquivo importado pelo usuário
  audioBlob?: Blob;           // Armazenado no IndexedDB para clipes customizados (.mp3, .wav, .ogg)
  synthPreset?: 'airhorn' | 'vineboom' | 'cricket' | 'tada' | 'sad_trombone' | 'coin' | 'drumroll' | 'bruh';
  volume: number;             // 0.0 a 1.5 (padrão 0.85)
  durationSec?: number;       // Duração em segundos (para prévia ou timeout)
  isFavorite: boolean;
  createdAt: number;
}

export type SignalingPacket =
  // Descoberta & Presença Mesh
  | { type: 'directory_request'; peerInfo: Omit<Participant, 'isLocal'> }
  | { type: 'directory_response'; peers: Array<Omit<Participant, 'isLocal'>> }
  | { type: 'peer_state_sync'; state: Omit<Participant, 'isLocal'> }
  | { type: 'speaking'; peerId: string; isSpeaking: boolean }
  | { type: 'screen_stopped'; peerId: string }

  // Chat de Texto & Sincronização P2P (IndexedDB)
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'chat_reaction_toggle'; messageId: string; emoji: string; clientId: string; nickname: string }
  | { type: 'chat_typing'; clientId: string; nickname: string; isTyping: boolean }
  | { type: 'chat_sync_request'; roomId: string; sinceTimestamp: number; knownIds: string[] }
  | { type: 'chat_sync_response'; roomId: string; messages: ChatMessage[] }

  // Soundboard Visual Event
  | { type: 'soundboard_triggered'; peerId: string; clientId: string; nickname: string; emoji: string; soundName: string };

export interface CbsHubElectronAPI {
  getDesktopSources: () => Promise<DesktopSourceItem[]>;
  setCaptureSource: (sourceId: string, includeAudio: boolean) => Promise<boolean>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  setAlwaysOnTop: (flag: boolean) => void;
}

declare global {
  interface Window {
    cbsHubAPI?: CbsHubElectronAPI;
  }
}
