import { compareMessages } from "../chat/model";
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ResolutionPreset,
  FpsPreset,
  VideoQualityConfig,
  AudioProcessingConfig,
  StreamTelemetry,
  Participant,
  ChatMessage,
  SoundboardClip,
} from '../types/cbshub';

export const RESOLUTION_PRESETS: Record<
  ResolutionPreset,
  { width: number; height: number; targetBitrateBps: number; maxBitrateBps: number }
> = {
  '720p': {
    width: 1280,
    height: 720,
    targetBitrateBps: 2_500_000,
    maxBitrateBps: 5_000_000,
  },
  '1080p': {
    width: 1920,
    height: 1080,
    targetBitrateBps: 6_000_000,
    maxBitrateBps: 12_000_000,
  },
  '1440p': {
    width: 2560,
    height: 1440,
    targetBitrateBps: 12_000_000,
    maxBitrateBps: 20_000_000,
  },
  '2160p': {
    width: 3840,
    height: 2160,
    targetBitrateBps: 22_000_000,
    maxBitrateBps: 35_000_000,
  },
};

const AVATAR_COLORS = [
  'hsl(235, 86%, 65%)', // Blurple
  'hsl(145, 65%, 42%)', // Emerald
  'hsl(358, 85%, 60%)', // Coral
  'hsl(38, 92%, 50%)',  // Amber
  'hsl(280, 75%, 60%)', // Purple
  'hsl(190, 85%, 45%)', // Cyan
  'hsl(330, 80%, 60%)', // Pink
];

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'cbs-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function getRandomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export interface HubState {
  // -------------------------------------------------------------------------
  // Configurações persistentes de usuário e sala (v2.0)
  // -------------------------------------------------------------------------
  clientId: string;
  avatarColor: string;
  roomId: string;
  recentRooms: string[];
  nickname: string;
  audioConfig: AudioProcessingConfig;
  videoQualityConfig: VideoQualityConfig;

  // -------------------------------------------------------------------------
  // Estado da Conexão P2P e Chamada (v2.0 Mesh + Separação Sala vs Voz)
  // -------------------------------------------------------------------------
  localPeerId: string;
  remotePeerId: string | null;     // Compatibilidade legada 1v1
  remoteNickname: string;         // Compatibilidade legada 1v1
  isConnected: boolean;           // Conectado à sala de texto/presença
  isHost: boolean;
  statusText: string;
  inVoiceCall: boolean;           // true = voz/vídeo ativos no palco
  callStageMode: 'hidden' | 'grid' | 'spotlight' | 'minimized';
  focusedPeerStreamKey: string | null;
  callStageHeight: number;        // Altura do painel de call em px (default 280)

  // -------------------------------------------------------------------------
  // Mesh Multi-Peer e Volumes Individuais (v2.0)
  // -------------------------------------------------------------------------
  participants: Record<string, Participant>; // chave: peerId
  peerVolumes: Record<string, number>;        // chave: clientId -> volume 0.0 a 2.0
  remoteStreams: Record<string, { voice?: MediaStream; webcam?: MediaStream; screen?: MediaStream }>; // chave: peerId

  // -------------------------------------------------------------------------
  // Chat P2P Sincronizado e Digitação (v2.0)
  // -------------------------------------------------------------------------
  messages: ChatMessage[];
  typingUsers: Record<string, { nickname: string; expiresAt: number }>; // chave: clientId
  unreadCount: number;

  // -------------------------------------------------------------------------
  // Soundboard Customizável (v2.0)
  // -------------------------------------------------------------------------
  soundboardClips: SoundboardClip[];
  soundboardVolume: number; // 0.0 a 1.5

  // -------------------------------------------------------------------------
  // Controles de Mídia Locais
  // -------------------------------------------------------------------------
  isMuted: boolean;
  isDeafened: boolean;
  isWebcamActive: boolean;
  isScreenSharing: boolean;
  isLocalSpeaking: boolean;
  isRemoteSpeaking: boolean;      // Compatibilidade legada
  micLevel: number;
  isAlwaysOnTop: boolean;

  // -------------------------------------------------------------------------
  // Modais de Controle
  // -------------------------------------------------------------------------
  isSettingsOpen: boolean;
  isScreenPickerOpen: boolean;

  // -------------------------------------------------------------------------
  // Telemetria ABR
  // -------------------------------------------------------------------------
  telemetry: StreamTelemetry;

  // -------------------------------------------------------------------------
  // Streams Legados em Tempo de Execução (Compatibilidade)
  // -------------------------------------------------------------------------
  localVoiceStream: MediaStream | null;
  localWebcamStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteVoiceStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------
  setClientId: (id: string) => void;
  setAvatarColor: (color: string) => void;
  setRoomId: (id: string) => void;
  addRecentRoom: (room: string) => void;
  setNickname: (name: string) => void;
  setRemoteNickname: (name: string) => void;
  setConnectionStatus: (connected: boolean, isHost: boolean, localId: string, remoteId: string | null, status: string) => void;
  setStatusText: (status: string) => void;
  setInVoiceCall: (inCall: boolean) => void;
  setCallStageMode: (mode: 'hidden' | 'grid' | 'spotlight' | 'minimized') => void;
  setFocusedPeerStreamKey: (key: string | null) => void;
  setCallStageHeight: (height: number) => void;

  // Gestão de participantes
  setParticipants: (participants: Record<string, Participant>) => void;
  updateParticipant: (peerId: string, partial: Partial<Participant>) => void;
  removeParticipant: (peerId: string) => void;
  setPeerVolume: (clientId: string, volume: number) => void;

  // Streams remotos Mesh
  setRemoteStream: (peerId: string, type: 'voice' | 'webcam' | 'screen', stream: MediaStream | null) => void;
  removeRemoteStreams: (peerId: string) => void;

  // Chat P2P
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  addMessageBatch: (messages: ChatMessage[]) => void;
  updateMessageReaction: (messageId: string, emoji: string, clientId: string, nickname: string) => void;
  setTypingUser: (clientId: string, nickname: string, isTyping: boolean) => void;
  clearExpiredTyping: () => void;
  setUnreadCount: (count: number | ((prev: number) => number)) => void;

  // Soundboard
  setSoundboardClips: (clips: SoundboardClip[]) => void;
  addSoundboardClip: (clip: SoundboardClip) => void;
  removeSoundboardClip: (clipId: string) => void;
  setSoundboardVolume: (volume: number) => void;

  // Mídia local
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setWebcamActive: (active: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  setIsLocalSpeaking: (speaking: boolean, level?: number) => void;
  setIsRemoteSpeaking: (speaking: boolean) => void;
  setAlwaysOnTop: (flag: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsScreenPickerOpen: (open: boolean) => void;
  updateAudioConfig: (partial: Partial<AudioProcessingConfig>) => void;
  updateVideoQuality: (resolution: ResolutionPreset, fps: FpsPreset, includeAudio?: boolean) => void;
  setTelemetry: (partial: Partial<StreamTelemetry>) => void;

  // Streams legados
  setLocalVoiceStream: (stream: MediaStream | null) => void;
  setLocalWebcamStream: (stream: MediaStream | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  setRemoteVoiceStream: (stream: MediaStream | null) => void;
  setRemoteScreenStream: (stream: MediaStream | null) => void;
  resetSession: () => void;
}

export const useHubStore = create<HubState>()(
  persist(
    (set, get) => ({
      // Configurações persistentes
      clientId: generateClientId(),
      avatarColor: getRandomAvatarColor(),
      roomId: 'cbs-irmandade',
      recentRooms: ['cbs-irmandade'],
      nickname: 'Irmão Local',
      remoteNickname: 'Aguardando irmão...',
      audioConfig: {
        inputDeviceId: 'default',
        outputDeviceId: 'default',
        videoDeviceId: 'default',
        echoCancellation: true,
        autoGainControl: true,
        highPassFilter80Hz: true,
        neuralNoiseGate: true,
        micGain: 1.0,
        remoteStreamVolume: 1.0,
      },
      videoQualityConfig: {
        resolution: '1080p',
        width: 1920,
        height: 1080,
        fps: 60,
        targetBitrateBps: 6_000_000,
        maxBitrateBps: 12_000_000,
        includeSystemAudio: true,
      },

      // Estado P2P inicial
      localPeerId: '',
      remotePeerId: null,
      isConnected: false,
      isHost: false,
      statusText: 'Pronto para conectar',
      inVoiceCall: false,
      callStageMode: 'hidden',
      focusedPeerStreamKey: null,
      callStageHeight: 280,

      // Mesh e volumes
      participants: {},
      peerVolumes: {},
      remoteStreams: {},

      // Chat
      messages: [],
      typingUsers: {},
      unreadCount: 0,

      // Soundboard
      soundboardClips: [],
      soundboardVolume: 0.85,

      // Mídia inicial
      isMuted: false,
      isDeafened: false,
      isWebcamActive: false,
      isScreenSharing: false,
      isLocalSpeaking: false,
      isRemoteSpeaking: false,
      micLevel: 0,
      isAlwaysOnTop: false,

      // Modais
      isSettingsOpen: false,
      isScreenPickerOpen: false,

      // Telemetria inicial
      telemetry: {
        active: false,
        resolution: '1080p',
        fps: 0,
        bitrateMbps: 0,
        rttMs: 0,
        packetsLostPercent: 0,
        abrStatus: 'optimal',
      },

      // Streams em tempo de execução
      localVoiceStream: null,
      localWebcamStream: null,
      localScreenStream: null,
      remoteVoiceStream: null,
      remoteScreenStream: null,

      // Ações
      setClientId: (id) => set({ clientId: id }),
      setAvatarColor: (color) => set({ avatarColor: color }),
      setRoomId: (id) => {
        set({ roomId: id });
        get().addRecentRoom(id);
      },
      addRecentRoom: (room) => {
        if (!room || !room.trim()) return;
        const normalized = room.toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!normalized) return;
        set((state) => {
          const filtered = state.recentRooms.filter((r) => r !== normalized);
          return { recentRooms: [normalized, ...filtered].slice(0, 10) };
        });
      },
      setNickname: (name) => set({ nickname: name }),
      setRemoteNickname: (name) => set({ remoteNickname: name }),

      setConnectionStatus: (connected, isHost, localId, remoteId, status) =>
        set({
          isConnected: connected,
          isHost,
          localPeerId: localId,
          remotePeerId: remoteId,
          statusText: status,
        }),

      setStatusText: (status) => set({ statusText: status }),
      setInVoiceCall: (inCall) =>
        set((state) => ({
          inVoiceCall: inCall,
          callStageMode: inCall ? (state.callStageMode === 'hidden' ? 'grid' : state.callStageMode) : 'hidden',
        })),

      setCallStageMode: (mode) => set({ callStageMode: mode }),
      setFocusedPeerStreamKey: (key) => set({ focusedPeerStreamKey: key }),
      setCallStageHeight: (height) => set({ callStageHeight: Math.min(800, Math.max(180, height)) }),

      // Gestão de participantes
      setParticipants: (participants) => set({ participants }),
      updateParticipant: (peerId, partial) =>
        set((state) => {
          const current = state.participants[peerId];
          if (!current) return state;
          return {
            participants: {
              ...state.participants,
              [peerId]: { ...current, ...partial },
            },
          };
        }),
      removeParticipant: (peerId) =>
        set((state) => {
          const next = { ...state.participants };
          delete next[peerId];
          return { participants: next };
        }),
      setPeerVolume: (clientId, volume) =>
        set((state) => ({
          peerVolumes: {
            ...state.peerVolumes,
            [clientId]: Math.min(1.0, Math.max(0.0, volume)),
          },
        })),

      // Streams remotos Mesh
      setRemoteStream: (peerId, type, stream) =>
        set((state) => {
          const current = state.remoteStreams[peerId] || {};
          if (stream === null) {
            delete current[type];
          } else {
            current[type] = stream;
          }
          return {
            remoteStreams: {
              ...state.remoteStreams,
              [peerId]: { ...current },
            },
          };
        }),
      removeRemoteStreams: (peerId) =>
        set((state) => {
          const next = { ...state.remoteStreams };
          delete next[peerId];
          return { remoteStreams: next };
        }),

      // Chat P2P
      setMessages: (messages) => set({ messages: [...messages].sort(compareMessages) }),
      addMessage: (message) =>
        set((state) => {
          if (state.messages.some((m) => m.id === message.id)) return state;
          const merged = [...state.messages, message].sort(compareMessages);
          return { messages: merged.slice(-500) };
        }),
      addMessageBatch: (batch) =>
        set((state) => {
          const map = new Map<string, ChatMessage>();
          for (const m of state.messages) map.set(m.id, m);
          for (const m of batch) map.set(m.id, m);
          const sorted = Array.from(map.values()).sort(compareMessages);
          return { messages: sorted.slice(-500) };
        }),
      updateMessageReaction: (messageId, emoji, clientId, nickname) =>
        set((state) => {
          const updated = state.messages.map((msg) => {
            if (msg.id !== messageId) return msg;
            const reactions = { ...msg.reactions };
            const current = reactions[emoji];
            if (current) {
              const idx = current.reactorClientIds.indexOf(clientId);
              if (idx !== -1) {
                current.reactorClientIds.splice(idx, 1);
                delete current.reactorNicknames[clientId];
                if (current.reactorClientIds.length === 0) delete reactions[emoji];
              } else {
                current.reactorClientIds.push(clientId);
                current.reactorNicknames[clientId] = nickname;
              }
            } else {
              reactions[emoji] = {
                emoji,
                reactorClientIds: [clientId],
                reactorNicknames: { [clientId]: nickname },
              };
            }
            return { ...msg, reactions };
          });
          return { messages: updated };
        }),
      setTypingUser: (clientId, nickname, isTyping) =>
        set((state) => {
          const next = { ...state.typingUsers };
          if (isTyping) {
            next[clientId] = { nickname, expiresAt: Date.now() + 3000 };
          } else {
            delete next[clientId];
          }
          return { typingUsers: next };
        }),
      clearExpiredTyping: () =>
        set((state) => {
          const now = Date.now();
          const next: Record<string, { nickname: string; expiresAt: number }> = {};
          let changed = false;
          for (const [id, user] of Object.entries(state.typingUsers)) {
            if (user.expiresAt > now) {
              next[id] = user;
            } else {
              changed = true;
            }
          }
          return changed ? { typingUsers: next } : state;
        }),
      setUnreadCount: (countOrUpdater) =>
        set((state) => ({
          unreadCount: typeof countOrUpdater === 'function' ? countOrUpdater(state.unreadCount) : countOrUpdater,
        })),

      // Soundboard
      setSoundboardClips: (clips) => set({ soundboardClips: clips }),
      addSoundboardClip: (clip) =>
        set((state) => ({
          soundboardClips: [...state.soundboardClips.filter((c) => c.id !== clip.id), clip],
        })),
      removeSoundboardClip: (clipId) =>
        set((state) => ({
          soundboardClips: state.soundboardClips.filter((c) => c.id !== clipId),
        })),
      setSoundboardVolume: (volume) => set({ soundboardVolume: Math.min(1.5, Math.max(0.0, volume)) }),

      // Mídia local
      setMuted: (muted) => {
        // Atenção v2.0: Não mutamos a track diretamente (track.enabled = false),
        // para que os áudios do Soundboard continuem saindo limpos pelo destinationNode!
        // O mute do microfone é tratado suavemente no grafo WebAudio via audioPipeline.setMicMuted().
        set({ isMuted: muted });
      },

      setDeafened: (deafened) => set({ isDeafened: deafened }),
      setWebcamActive: (active) => set({ isWebcamActive: active }),
      setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),

      setIsLocalSpeaking: (speaking, level) =>
        set((state) => ({
          isLocalSpeaking: speaking,
          micLevel: typeof level === 'number' ? level : state.micLevel,
        })),

      setIsRemoteSpeaking: (speaking) => set({ isRemoteSpeaking: speaking }),

      setAlwaysOnTop: (flag) => {
        if (window.cbsHubAPI) {
          window.cbsHubAPI.setAlwaysOnTop(flag);
        }
        set({ isAlwaysOnTop: flag });
      },

      setIsSettingsOpen: (open) => set({ isSettingsOpen: open }),
      setIsScreenPickerOpen: (open) => set({ isScreenPickerOpen: open }),

      updateAudioConfig: (partial) =>
        set((state) => ({
          audioConfig: { ...state.audioConfig, ...partial },
        })),

      updateVideoQuality: (resolution, fps, includeAudio) => {
        const preset = RESOLUTION_PRESETS[resolution];
        set((state) => ({
          videoQualityConfig: {
            ...state.videoQualityConfig,
            resolution,
            width: preset.width,
            height: preset.height,
            fps,
            targetBitrateBps: preset.targetBitrateBps,
            maxBitrateBps: preset.maxBitrateBps,
            includeSystemAudio: includeAudio !== undefined ? includeAudio : state.videoQualityConfig.includeSystemAudio,
          },
        }));
      },

      setTelemetry: (partial) =>
        set((state) => ({
          telemetry: { ...state.telemetry, ...partial },
        })),

      setLocalVoiceStream: (stream) => set({ localVoiceStream: stream }),
      setLocalWebcamStream: (stream) => set({ localWebcamStream: stream }),
      setLocalScreenStream: (stream) => set({ localScreenStream: stream }),
      setRemoteVoiceStream: (stream) => set({ remoteVoiceStream: stream }),
      setRemoteScreenStream: (stream) => set({ remoteScreenStream: stream }),

      resetSession: () =>
        set({
          isConnected: false,
          isHost: false,
          localPeerId: '',
          remotePeerId: null,
          remoteNickname: 'Aguardando irmão...',
          statusText: 'Desconectado',
          inVoiceCall: false,
          callStageMode: 'hidden',
          focusedPeerStreamKey: null,
          participants: {},
          remoteStreams: {},
          typingUsers: {},
          isScreenSharing: false,
          isWebcamActive: false,
          isLocalSpeaking: false,
          isRemoteSpeaking: false,
          micLevel: 0,
          localVoiceStream: null,
          localWebcamStream: null,
          localScreenStream: null,
          remoteVoiceStream: null,
          remoteScreenStream: null,
          telemetry: {
            active: false,
            resolution: '1080p',
            fps: 0,
            bitrateMbps: 0,
            rttMs: 0,
            packetsLostPercent: 0,
            abrStatus: 'optimal',
          },
        }),
    }),
    {
      name: 'cbshub-user-preferences',
      partialize: (state) => ({
        clientId: state.clientId,
        roomId: state.roomId,
        recentRooms: state.recentRooms,
        nickname: state.nickname,
        avatarColor: state.avatarColor,
        audioConfig: state.audioConfig,
        videoQualityConfig: state.videoQualityConfig,
        peerVolumes: state.peerVolumes,
        soundboardVolume: state.soundboardVolume,
        callStageHeight: state.callStageHeight,
      }),
    }
  )
);
