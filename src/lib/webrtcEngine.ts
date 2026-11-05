import Peer, { type MediaConnection, type DataConnection } from 'peerjs';
import { useHubStore } from '../store/useHubStore';
import { sounds } from './sounds';
import { VoiceAudioPipeline } from './audioPipeline';
import { soundboardEngine } from './soundboardEngine';
import { storageDb } from './storageDb';
import { enhanceOpusSdp, configureVideoSender } from './sdpMunger';
import type {
  VideoQualityConfig,
  AudioProcessingConfig,
  Participant,
  ChatMessage,
  SoundboardClip,
  SignalingPacket,
} from '../types/cbshub';

const MAX_ROOM_PEERS = 6;
const PRESENCE_HEARTBEAT_MS = 8000;
const BEACON_RETRY_MS = 20000;
const BEACON_CLAIM_COOLDOWN_MS = 2500;
const DIAL_TIMEOUT_MS = 12000;
const GHOST_PARTICIPANT_TTL_MS = 60000;
const RECENT_PEER_TTL_MS = 45000;

function buildPeerIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ];

  const username = import.meta.env.VITE_METERED_USERNAME;
  const credential = import.meta.env.VITE_METERED_CREDENTIAL;
  const turnUrl = import.meta.env.VITE_METERED_TURN_URL || 'turn:standard.relay.metered.ca:80';
  const turnsUrl = import.meta.env.VITE_METERED_TURNS_URL || 'turns:standard.relay.metered.ca:443?transport=tcp';

  // Ignora placeholders do .env.example (senão o relay público nunca entraria)
  const hasRealMeteredCredentials =
    Boolean(username && credential) &&
    !String(username).includes('seu_username') &&
    !String(credential).includes('sua_credential');

  if (hasRealMeteredCredentials) {
    servers.push(
      { urls: turnUrl, username, credential },
      { urls: turnsUrl, username, credential }
    );
  } else {
    // TURN público de fallback (Open Relay). Sem um relay, dois irmãos atrás de NAT
    // simétrico / CGNAT (muito comum em operadoras móveis e no Brasil) conectam o
    // chat mas NÃO conseguem áudio/tela — sintoma clássico de "entro sozinho".
    const relayUser = 'openrelayproject';
    const relayCred = 'openrelayproject';
    servers.push(
      { urls: 'turn:openrelay.metered.ca:80', username: relayUser, credential: relayCred },
      { urls: 'turn:openrelay.metered.ca:443', username: relayUser, credential: relayCred },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: relayUser, credential: relayCred }
    );
  }

  return servers;
}

const ICE_SERVERS = buildPeerIceServers();

const PEER_CONFIG = {
  config: {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  },
  debug: 1,
};

// O Beacon só troca datachannels de sinalização: sem pool de ICE extra
const BEACON_PEER_CONFIG = {
  config: {
    iceServers: ICE_SERVERS,
    iceCandidatePoolSize: 0,
  },
  debug: 1,
};

interface PeerMediaSession {
  peerId: string;
  clientId: string;
  nickname: string;
  dataConn: DataConnection | null;
  voiceCall: MediaConnection | null;
  /** true quando a call de voz atual está enviando o nosso microfone */
  voiceSendingMic: boolean;
  voiceRetryTimeout: number | null;
  webcamCall: MediaConnection | null;
  screenCall: MediaConnection | null;

  // Roteamento WebAudio individual: 0% a 200% de volume + setSinkId
  voiceAudioCtx: AudioContext | null;
  voiceSourceNode: MediaStreamAudioSourceNode | null;
  voiceGainNode: GainNode | null;
  voiceDestNode: MediaStreamAudioDestinationNode | null;
  voiceAnalyserNode: AnalyserNode | null;
  voiceSinkNode: GainNode | null;
  voiceAudioEl: HTMLAudioElement | null;
  remoteSpeakingInterval: number | null;
  lastRemoteSpeaking: boolean;
}

class WebRTCEngine {
  private localPeer: Peer | null = null;
  private beaconPeer: Peer | null = null;
  private isBeaconOwner = false;
  private beaconHealTimeout: number | null = null;
  private beaconLastAttempt = 0;
  private beaconAttemptStreak = 0;
  private currentRoomSlug = '';

  // Malha de sessões ativas (chave: peerId)
  private sessions: Map<string, PeerMediaSession> = new Map();
  // Diales em voo: evita abrir 2 dataConn para o mesmo irmão no mesmo instante
  private pendingDials: Map<string, number> = new Map();
  // Última vez que ouvimos falar de cada irmão (para expirar cards fantasmas)
  private participantSeen: Map<string, number> = new Map();
  // Irmãos que caíram recentemente: continuamos tentando reconectar por 45s
  private recentPeers: Map<string, { clientId: string; ts: number }> = new Map();

  // Serializa joinRoom (evita duas malhas simultâneas)
  private joinChain: Promise<void> = Promise.resolve();

  // Pipeline e mídia local
  private audioPipeline: VoiceAudioPipeline | null = null;
  private rawMicStream: MediaStream | null = null;
  private micSetupPromise: Promise<boolean> | null = null;
  private localScreenStream: MediaStream | null = null;
  private localWebcamStream: MediaStream | null = null;

  // Contexto único para detectar fala remota (antes era 1 AudioContext por irmão,
  // todos criados suspensos => nenhum anel verde de fala aparecia)
  private detectionCtx: AudioContext | null = null;
  private audioUnlockInstalled = false;
  private lastBroadcastSpeaking = false;

  // Presença / auto-heal
  private presenceIntervalId: number | null = null;
  private voiceJoinPromise: Promise<void> | null = null;

  // ABR & Telemetria
  private abrIntervalId: number | null = null;
  private receiverStatsIntervalId: number | null = null;
  private currentMaxBitrate = 6_000_000;
  private targetMaxBitrate = 6_000_000;
  private consecutiveBadCycles = 0;
  private consecutiveGoodCycles = 0;
  private prevSenderBytes = 0;
  private prevSenderTimestamp = 0;
  private prevReceiverBytes = 0;
  private prevReceiverTimestamp = 0;

  // Sanitizador de slug de sala (Seção 5.1 SDD.md)
  public sanitizeSlug(input: string): string {
    const slug = input.toLowerCase().replace(/[^a-z0-9-]/g, '');
    return slug || 'cbs-irmandade';
  }

  private generateShortId(clientId: string): string {
    const clean = clientId.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return (clean.substring(0, 6) || Math.random().toString(36).substring(2, 8));
  }

  /* ========================================================================= */
  /* CONEXÃO NA SALA (TEXTO + PRESENÇA + BEACON MESH)                          */
  /* ========================================================================= */

  public joinRoom(roomInput: string, autoJoinVoice = false): Promise<void> {
    // Encadeia as entradas na sala: nunca deixar duas malhas vivas ao mesmo tempo
    this.joinChain = this.joinChain
      .catch(() => {})
      .then(() => this.doJoinRoom(roomInput, autoJoinVoice));
    return this.joinChain;
  }

  private async doJoinRoom(roomInput: string, autoJoinVoice: boolean): Promise<void> {
    this.leaveRoom();

    const slug = this.sanitizeSlug(roomInput);
    this.currentRoomSlug = slug;
    useHubStore.getState().setRoomId(slug);
    useHubStore.getState().setStatusText('Conectando à sala...');

    // Carrega mensagens salvas localmente no IndexedDB
    try {
      const savedMessages = await storageDb.getMessagesByRoom(slug);
      useHubStore.getState().setMessages(savedMessages);
    } catch (err) {
      console.warn('[WebRTC Engine] Erro ao carregar histórico local:', err);
    }

    // Carrega efeitos do Soundboard
    try {
      await soundboardEngine.loadAllClips();
    } catch {
      /* ignore */
    }

    const state = useHubStore.getState();
    const shortId = this.generateShortId(state.clientId);
    // Sufixo efêmero único garante que recarregamentos rápidos nunca recebam unavailable-id
    const instanceNonce = Math.random().toString(36).substring(2, 6);
    const localPeerId = `cbshub-v2-${slug}-p-${shortId}-${instanceNonce}`;

    // Registra participante local na store
    const localParticipant: Participant = {
      peerId: localPeerId,
      clientId: state.clientId,
      nickname: state.nickname,
      avatarColor: state.avatarColor,
      isLocal: true,
      inVoiceCall: false,
      isMuted: state.isMuted,
      isDeafened: state.isDeafened,
      isSpeaking: false,
      isWebcamActive: false,
      isScreenSharing: false,
      activeSoundEffect: null,
    };

    useHubStore.getState().setParticipants({ [localPeerId]: localParticipant });

    const peer = new Peer(localPeerId, PEER_CONFIG);
    this.localPeer = peer;

    peer.on('open', (id) => {
      if (this.localPeer !== peer) return; // peer obsoleto de uma entrada anterior
      useHubStore.getState().setConnectionStatus(true, false, id, null, 'Conectado à sala de texto e presença!');
      sounds.playJoin();

      // Configura escuta de conexões de dados e chamadas de mídia entrantes
      this.setupLocalPeerListeners(peer);

      // Tenta assumir ou consultar o Beacon da sala
      this.attemptClaimBeacon(slug);

      // Auto-heal / descoberta contínua de irmãos
      this.startPresenceHeartbeat();
      this.installAudioUnlock();

      if (autoJoinVoice) {
        this.joinVoiceCall().catch((e) => console.warn('[WebRTC Engine] Auto-join voice falhou:', e));
      }
    });

    peer.on('error', (err: { type?: string }) => {
      if (this.localPeer !== peer) return;
      console.error('[WebRTC Engine] Erro no localPeer:', err);
      useHubStore.getState().setStatusText(`Aviso de rede: ${err.type || 'desconhecido'}`);
    });

    peer.on('disconnected', () => {
      if (this.localPeer !== peer) return;
      if (!peer.destroyed) {
        useHubStore.getState().setStatusText('Reconectando sinalização...');
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
      }
    });

    peer.on('close', () => {
      if (this.localPeer !== peer) return;
      if (useHubStore.getState().isConnected) {
        this.leaveRoom();
      }
    });
  }

  private setupLocalPeerListeners(peer: Peer): void {
    // Conexões de dados entrantes (Chat, Presença, Sincronização)
    peer.on('connection', (conn) => {
      this.handleIncomingDataConnection(conn);
    });

    // Chamadas de mídia entrantes (Voz, Webcam, Compartilhamento de Tela)
    peer.on('call', (call) => {
      this.handleIncomingMediaCall(call);
    });
  }

  /* ========================================================================= */
  /* BEACON DE DESCOBERTA E AUTO-HEAL ANTI-QUEDA                               */
  /* ========================================================================= */

  private attemptClaimBeacon(slug: string): void {
    if (this.beaconPeer) return;

    // Cooldown anti-loop com backoff exponencial: sem isso, um beacon zumbi (id ainda
    // preso no servidor de sinalização) fazia claim -> unavailable-id -> query -> error
    // -> claim a cada ~150ms, martelando a rede e travando a interface.
    const cooldown = Math.min(
      30000,
      BEACON_CLAIM_COOLDOWN_MS * Math.pow(1.6, this.beaconAttemptStreak)
    );
    if (Date.now() - this.beaconLastAttempt < cooldown) return;
    this.beaconAttemptStreak = Math.min(this.beaconAttemptStreak + 1, 8);

    const beaconId = `cbshub-v2-${slug}-beacon`;
    this.beaconLastAttempt = Date.now();

    try {
      const beacon = new Peer(beaconId, BEACON_PEER_CONFIG);
      this.beaconPeer = beacon;

      beacon.on('open', () => {
        if (this.beaconPeer !== beacon) return;
        // Cenário A: Este cliente assumiu com sucesso o papel de Beacon (Diretório)
        this.isBeaconOwner = true;
        this.beaconAttemptStreak = 0;
        useHubStore.getState().setStatusText('Conectado como Diretório da sala.');

        beacon.on('connection', (conn) => {
          this.handleBeaconDirectoryConnection(conn);
        });
      });

      beacon.on('error', (err: { type?: string }) => {
        if (this.beaconPeer !== beacon) return;
        if (err.type === 'unavailable-id') {
          // Cenário B: Já existe um Beacon ativo na sala! Conectar a ele para descobrir os irmãos
          this.isBeaconOwner = false;
          try {
            beacon.destroy();
          } catch {
            /* ignore */
          }
          this.beaconPeer = null;
          this.queryBeaconDirectory(beaconId);
        } else {
          console.warn('[WebRTC Beacon] Erro no beacon peer:', err);
        }
      });
    } catch (err) {
      console.warn('[WebRTC Beacon] Falha ao instanciar beacon:', err);
    }
  }

  /**
   * Responde a novos membros que conectam ao Beacon para pedir a lista de participantes
   */
  private handleBeaconDirectoryConnection(conn: DataConnection): void {
    conn.on('data', (data) => {
      const packet = data as SignalingPacket;
      if (packet && packet.type === 'directory_request') {
        // Registra o recém-chegado imediatamente (ele é real: chegou pela sinalização)
        if (packet.peerInfo) {
          this.upsertRemoteParticipant(packet.peerInfo);
        }

        const state = useHubStore.getState();
        // Coleta participantes conhecidos (limite de 6)
        const knownPeers: Array<Omit<Participant, 'isLocal'>> = Object.values(state.participants)
          .map((p) => {
            const { isLocal, ...rest } = p;
            return rest;
          })
          .slice(0, MAX_ROOM_PEERS);

        // Responde com o diretório completo
        try {
          conn.send({
            type: 'directory_response',
            peers: knownPeers,
          } as SignalingPacket);
        } catch (err) {
          console.warn('[WebRTC Beacon] Falha ao enviar directory_response:', err);
        }

        // O visitante já discará para os membros recebidos na lista; não discamos de volta para evitar
        // colisão (Glare) no DataChannel
      }
    });
  }

  /**
   * Consulta o Beacon para obter a lista de irmãos e abrir malha direta (Full Mesh)
   */
  private queryBeaconDirectory(beaconId: string): void {
    if (!this.localPeer || this.localPeer.destroyed) return;

    const conn = this.localPeer.connect(beaconId, { reliable: true });

    conn.on('open', () => {
      const state = useHubStore.getState();
      const localParticipant = state.participants[this.localPeer?.id || ''];
      const myInfo: Omit<Participant, 'isLocal'> = localParticipant
        ? {
            peerId: localParticipant.peerId,
            clientId: localParticipant.clientId,
            nickname: localParticipant.nickname,
            avatarColor: localParticipant.avatarColor,
            inVoiceCall: localParticipant.inVoiceCall,
            isMuted: localParticipant.isMuted,
            isDeafened: localParticipant.isDeafened,
            isSpeaking: localParticipant.isSpeaking,
            isWebcamActive: localParticipant.isWebcamActive,
            isScreenSharing: localParticipant.isScreenSharing,
          }
        : {
            peerId: this.localPeer!.id,
            clientId: state.clientId,
            nickname: state.nickname,
            avatarColor: state.avatarColor,
            inVoiceCall: state.inVoiceCall,
            isMuted: state.isMuted,
            isDeafened: state.isDeafened,
            isSpeaking: false,
            isWebcamActive: false,
            isScreenSharing: false,
          };

      try {
        conn.send({
          type: 'directory_request',
          peerInfo: myInfo,
        } as SignalingPacket);
      } catch (err) {
        console.warn('[WebRTC Beacon] Falha ao enviar directory_request:', err);
      }
    });

    conn.on('data', (data) => {
      const packet = data as SignalingPacket;
      if (packet && packet.type === 'directory_response' && Array.isArray(packet.peers)) {
        this.beaconAttemptStreak = 0;
        // Conecta a todos os irmãos retornados pelo diretório
        packet.peers.forEach((peer) => {
          if (peer.peerId && peer.peerId !== this.localPeer?.id) {
            this.connectToPeer(peer.peerId, peer.clientId);
          }
        });
        // Fecha conexão temporária com o Beacon após receber o diretório
        window.setTimeout(() => {
          try {
            conn.close();
          } catch {
            /* ignore */
          }
        }, 800);
      }
    });

    conn.on('error', () => {
      // Beacon pode ter caído, agenda auto-heal
      this.scheduleBeaconElection();
    });
  }

  /**
   * Eleição determinística de novo Beacon baseada em ordem alfabética dos clientIds
   */
  private scheduleBeaconElection(): void {
    if (this.isBeaconOwner || this.beaconHealTimeout !== null) return;

    const state = useHubStore.getState();
    const allParticipants = Object.values(state.participants);
    const sortedClientIds = allParticipants.map((p) => p.clientId).sort();
    const myIndex = sortedClientIds.indexOf(state.clientId);

    if (myIndex === -1) return;

    // Backoff ordenado: 0 * 400ms, 1 * 400ms, etc.
    const delay = myIndex * 400 + 150 + Math.floor(Math.random() * 250);

    this.beaconHealTimeout = window.setTimeout(() => {
      this.beaconHealTimeout = null;
      if (!this.isBeaconOwner && this.currentRoomSlug) {
        this.attemptClaimBeacon(this.currentRoomSlug);
      }
    }, delay);
  }

  /* ========================================================================= */
  /* PRESENÇA & AUTO-HEAL DA MALHA                                             */
  /* ========================================================================= */

  private startPresenceHeartbeat(): void {
    this.stopPresenceHeartbeat();
    this.presenceIntervalId = window.setInterval(() => this.repairMesh(), PRESENCE_HEARTBEAT_MS);
  }

  private stopPresenceHeartbeat(): void {
    if (this.presenceIntervalId !== null) {
      clearInterval(this.presenceIntervalId);
      this.presenceIntervalId = null;
    }
  }

  /**
   * Reenvia o estado local e reconecta qualquer irmão que tenha ficado sem sessão.
   * Isso conserta o caso "entro na ligação sozinho" sem precisar recarregar o app.
   */
  private repairMesh(): void {
    if (!this.localPeer || this.localPeer.destroyed) return;

    this.broadcastLocalState();

    const now = Date.now();
    const state = useHubStore.getState();

    for (const participant of Object.values(state.participants)) {
      if (participant.isLocal) continue;

      const session = this.sessions.get(participant.peerId);
      const connected = Boolean(session?.dataConn?.open);

      if (!connected) {
        const seenAt = this.participantSeen.get(participant.peerId) || 0;
        // Card fantasma (nunca conseguimos falar com esse irmão): remove
        if (!session && now - seenAt > GHOST_PARTICIPANT_TTL_MS) {
          this.participantSeen.delete(participant.peerId);
          useHubStore.getState().removeParticipant(participant.peerId);
          useHubStore.getState().removeRemoteStreams(participant.peerId);
          continue;
        }
        this.connectToPeer(participant.peerId, participant.clientId);
      }
    }

    // Reconecta irmãos que caíram há pouco (rede instável / troca de rede)
    for (const [peerId, info] of Array.from(this.recentPeers.entries())) {
      if (Date.now() - info.ts > RECENT_PEER_TTL_MS) {
        this.recentPeers.delete(peerId);
        continue;
      }
      if (!this.sessions.get(peerId)?.dataConn?.open) {
        this.connectToPeer(peerId, info.clientId);
      }
    }

    // Sem sessões e sem beacon? Tenta reencontrar a sala novamente (com backoff)
    if (!this.isBeaconOwner && !this.beaconPeer && this.sessions.size === 0 &&
        this.currentRoomSlug && Date.now() - this.beaconLastAttempt > BEACON_RETRY_MS) {
      this.attemptClaimBeacon(this.currentRoomSlug);
    }
  }

  /* ========================================================================= */
  /* GESTÃO DE SESSÕES MESH (DATACONNECTION & MEDIACONNECTION)                  */
  /* ========================================================================= */

  private ensureSession(peerId: string, clientId?: string): PeerMediaSession {
    let session = this.sessions.get(peerId);
    if (!session) {
      session = {
        peerId,
        clientId: clientId || '',
        nickname: 'Irmão Conectando...',
        dataConn: null,
        voiceCall: null,
        voiceSendingMic: false,
        voiceRetryTimeout: null,
        webcamCall: null,
        screenCall: null,
        voiceAudioCtx: null,
        voiceSourceNode: null,
        voiceGainNode: null,
        voiceDestNode: null,
        voiceAnalyserNode: null,
        voiceSinkNode: null,
        voiceAudioEl: null,
        remoteSpeakingInterval: null,
        lastRemoteSpeaking: false,
      };
      this.sessions.set(peerId, session);
    } else if (clientId && !session.clientId) {
      session.clientId = clientId;
    }
    return session;
  }

  private connectToPeer(remotePeerId: string, clientId?: string): void {
    if (!this.localPeer || this.localPeer.destroyed || remotePeerId === this.localPeer.id) return;
    // Sem socket de sinalização aberto, connect() só gera erro no console
    if (!this.localPeer.open) return;

    const existing = this.sessions.get(remotePeerId);
    if (existing?.dataConn?.open) return;

    const dialStartedAt = this.pendingDials.get(remotePeerId);
    if (dialStartedAt !== undefined && Date.now() - dialStartedAt < DIAL_TIMEOUT_MS) return;
    this.pendingDials.set(remotePeerId, Date.now());

    const session = this.ensureSession(remotePeerId, clientId);
    const conn = this.localPeer.connect(remotePeerId, { reliable: true });
    this.attachDataConnection(session, conn, clientId);
  }

  private handleIncomingDataConnection(conn: DataConnection): void {
    const existing = this.sessions.get(conn.peer);

    if (existing) {
      if (existing.dataConn && existing.dataConn.open) {
        // Já existe sessão ativa; fecha a duplicada
        try {
          conn.close();
        } catch {
          /* ignore */
        }
        return;
      }
      // Sessão existe (talvez com mídia já ativa) mas o dataConn morreu:
      // reconecta mantendo o áudio/vídeo em andamento.
      this.attachDataConnection(existing, conn);
      return;
    }

    const session = this.ensureSession(conn.peer);
    this.attachDataConnection(session, conn);
  }

  private attachDataConnection(
    session: PeerMediaSession,
    conn: DataConnection,
    initialClientId?: string
  ): void {
    const remotePeerId = conn.peer;
    session.dataConn = conn;
    if (initialClientId && !session.clientId) {
      session.clientId = initialClientId;
    }

    conn.on('open', () => {
      this.pendingDials.delete(remotePeerId);
      this.recentPeers.delete(remotePeerId);
      this.beaconAttemptStreak = 0;
      if (session.dataConn !== conn) return;

      // Envia nosso estado completo para o irmão
      this.sendPeerState(session);

      // Sincroniza chat recente (IndexedDB)
      this.requestChatSync(conn);

      // Compatibilidade legada com 1v1
      if (!useHubStore.getState().remotePeerId) {
        useHubStore.getState().setRemoteNickname(session.nickname);
      }

      // Se já estamos na voz / transmitindo, sincroniza a mídia com o recém-chegado
      this.syncMediaWithSession(session);
    });

    conn.on('data', (data) => {
      this.handleIncomingSignalingPacket(session, data as SignalingPacket);
    });

    conn.on('close', () => {
      this.pendingDials.delete(remotePeerId);
      if (session.dataConn !== conn) return;
      this.handlePeerDisconnected(session);
    });

    conn.on('error', (err) => {
      this.pendingDials.delete(remotePeerId);
      console.warn(`[WebRTC Engine] Erro no dataConn com ${remotePeerId}:`, err);
    });
  }

  private sendPeerState(session: PeerMediaSession): void {
    const state = useHubStore.getState();
    const localParticipant = state.participants[this.localPeer?.id || ''];
    if (!localParticipant || !session.dataConn?.open) return;

    const { isLocal, ...myState } = localParticipant;
    try {
      session.dataConn.send({
        type: 'peer_state_sync',
        state: myState,
      } as SignalingPacket);
    } catch (err) {
      console.warn('[WebRTC Engine] Falha ao enviar peer_state_sync:', err);
    }
  }

  private handlePeerDisconnected(session: PeerMediaSession): void {
    sounds.playLeave();
    this.teardownPeerVoiceAudio(session);

    // Guarda o irmão para tentativa de reconexão automática (rede instável)
    if (session.clientId) {
      this.recentPeers.set(session.peerId, { clientId: session.clientId, ts: Date.now() });
    }

    if (session.voiceRetryTimeout !== null) {
      clearTimeout(session.voiceRetryTimeout);
      session.voiceRetryTimeout = null;
    }
    if (session.voiceCall) {
      try { session.voiceCall.close(); } catch { /* ignore */ }
      session.voiceCall = null;
    }
    if (session.webcamCall) {
      try { session.webcamCall.close(); } catch { /* ignore */ }
      session.webcamCall = null;
    }
    if (session.screenCall) {
      try { session.screenCall.close(); } catch { /* ignore */ }
      session.screenCall = null;
    }

    this.sessions.delete(session.peerId);
    useHubStore.getState().removeParticipant(session.peerId);
    useHubStore.getState().removeRemoteStreams(session.peerId);

    // Compatibilidade legada
    if (useHubStore.getState().remotePeerId === session.peerId) {
      const remainingSessions = Array.from(this.sessions.values());
      if (remainingSessions.length > 0) {
        useHubStore.getState().setRemoteNickname(remainingSessions[0].nickname);
      } else {
        useHubStore.getState().setRemoteNickname('Aguardando irmão...');
        useHubStore.getState().setRemoteVoiceStream(null);
        useHubStore.getState().setRemoteScreenStream(null);
        this.stopReceiverStats();
      }
    }

    // Se o dono do beacon saiu, agenda eleição de novo beacon
    this.scheduleBeaconElection();
  }

  private upsertRemoteParticipant(remote: Omit<Participant, 'isLocal'> | Participant): void {
    if (!remote || !remote.peerId) return;
    if (this.localPeer && remote.peerId === this.localPeer.id) return;

    this.participantSeen.set(remote.peerId, Date.now());

    const state = useHubStore.getState();
    const { isLocal, ...rest } = remote as Participant;
    void isLocal;
    const existing = state.participants[remote.peerId];

    const merged: Participant = {
      ...(existing || ({} as Participant)),
      ...rest,
      peerId: remote.peerId,
      isLocal: false,
    } as Participant;

    if (!existing) {
      useHubStore.getState().setParticipants({
        ...state.participants,
        [remote.peerId]: merged,
      });
    } else {
      useHubStore.getState().updateParticipant(remote.peerId, merged);
    }
  }

  /* ========================================================================= */
  /* TRATAMENTO DE PACOTES DE SINALIZAÇÃO P2P                                  */
  /* ========================================================================= */

  private handleIncomingSignalingPacket(session: PeerMediaSession, packet: SignalingPacket): void {
    if (!packet || !packet.type) return;

    switch (packet.type) {
      case 'peer_state_sync': {
        const remote = packet.state;
        if (!remote) return;
        session.clientId = remote.clientId || session.clientId;
        session.nickname = remote.nickname || session.nickname;

        this.upsertRemoteParticipant(remote);

        // Compatibilidade legada
        useHubStore.getState().setRemoteNickname(remote.nickname);

        // Se ambos estão na voz (ou estamos transmitindo), garante a negociação de mídia
        this.syncMediaWithSession(session);
        break;
      }

      case 'speaking': {
        useHubStore.getState().updateParticipant(packet.peerId, { isSpeaking: packet.isSpeaking });
        useHubStore.getState().setIsRemoteSpeaking(packet.isSpeaking);
        break;
      }

      case 'screen_stopped': {
        useHubStore.getState().updateParticipant(packet.peerId, { isScreenSharing: false, screenQualityLabel: undefined });
        useHubStore.getState().setRemoteStream(packet.peerId, 'screen', null);
        useHubStore.getState().setRemoteScreenStream(null);
        useHubStore.getState().setTelemetry({ active: false });
        this.stopReceiverStats();
        sounds.playStreamStop();
        break;
      }

      case 'chat_message': {
        if (packet.message) {
          storageDb.saveMessage(packet.message).catch(() => {});
          useHubStore.getState().addMessage(packet.message);
          useHubStore.getState().setUnreadCount((prev) => prev + 1);
        }
        break;
      }

      case 'chat_reaction_toggle': {
        storageDb.toggleReaction(packet.messageId, packet.emoji, packet.clientId, packet.nickname).catch(() => {});
        useHubStore.getState().updateMessageReaction(packet.messageId, packet.emoji, packet.clientId, packet.nickname);
        break;
      }

      case 'chat_typing': {
        useHubStore.getState().setTypingUser(packet.clientId, packet.nickname, packet.isTyping);
        break;
      }

      case 'chat_sync_request': {
        storageDb.getMessagesByRoom(packet.roomId).then((allMsgs) => {
          const knownSet = new Set(packet.knownIds || []);
          const missing = allMsgs.filter((m) => !knownSet.has(m.id) && m.createdAt >= (packet.sinceTimestamp || 0));
          if (missing.length > 0 && session.dataConn?.open) {
            session.dataConn.send({
              type: 'chat_sync_response',
              roomId: packet.roomId,
              messages: missing,
            } as SignalingPacket);
          }
        });
        break;
      }

      case 'chat_sync_response': {
        if (packet.messages && packet.messages.length > 0) {
          storageDb.saveMessageBatch(packet.roomId, packet.messages).then((merged) => {
            useHubStore.getState().setMessages(merged);
          });
        }
        break;
      }

      case 'soundboard_triggered': {
        // Exibe animação flutuante no card do participante que tocou o som
        useHubStore.getState().updateParticipant(packet.peerId, {
          activeSoundEffect: {
            emoji: packet.emoji,
            name: packet.soundName,
            expiresAt: Date.now() + 3500,
          },
        });

        // Limpa animação após 3.5 segundos
        window.setTimeout(() => {
          const current = useHubStore.getState().participants[packet.peerId];
          if (current?.activeSoundEffect?.name === packet.soundName) {
            useHubStore.getState().updateParticipant(packet.peerId, { activeSoundEffect: null });
          }
        }, 3600);
        break;
      }
    }
  }

  /* ========================================================================= */
  /* SINCRONIZAÇÃO DE CHAT P2P (INDEXEDDB)                                     */
  /* ========================================================================= */

  private requestChatSync(conn: DataConnection): void {
    const slug = this.currentRoomSlug;
    if (!slug) return;

    storageDb.getMessagesByRoom(slug, 100).then((localMsgs) => {
      if (!conn.open) return;
      const knownIds = localMsgs.map((m) => m.id);
      const oldest = localMsgs.length > 0 ? localMsgs[0].createdAt : 0;

      conn.send({
        type: 'chat_sync_request',
        roomId: slug,
        sinceTimestamp: oldest,
        knownIds,
      } as SignalingPacket);
    });
  }

  /* ========================================================================= */
  /* CHAMADAS DE MÍDIA ENTRANTES & SAÍDAS (FULL MESH)                          */
  /* ========================================================================= */

  private getVoiceStream(): MediaStream | null {
    return this.audioPipeline?.getProcessedStream() || this.rawMicStream || null;
  }

  /**
   * Regra determinística anti-glare: o peer com menor peerId inicia a negociação.
   * Assim os dois lados NUNCA abrem call simultânea (o que gerava áudio duplicado
   * e deixava a sessão apontando para a call errada).
   */
  private shouldInitiateVoice(remotePeerId: string): boolean {
    const myId = this.localPeer?.id || '';
    if (!myId) return false;
    return myId < remotePeerId;
  }

  private syncMediaWithSession(session: PeerMediaSession): void {
    const state = useHubStore.getState();
    if (!state.inVoiceCall) return;

    const remote = state.participants[session.peerId];
    if (remote && !remote.inVoiceCall) return;

    this.syncVoiceWithSession(session);

    if (remote?.inVoiceCall && state.isScreenSharing && this.localScreenStream && !session.screenCall) {
      this.initiateScreenCallWithPeer(session);
    }

    if (remote?.inVoiceCall && state.isWebcamActive && this.localWebcamStream && !session.webcamCall) {
      this.initiateWebcamCallWithPeer(session);
    }
  }

  private syncVoiceWithSession(session: PeerMediaSession): void {
    const state = useHubStore.getState();
    if (!state.inVoiceCall) return;

    const remote = state.participants[session.peerId];
    if (remote && !remote.inVoiceCall) return;

    // Já existe call de voz nossa enviando microfone: nada a fazer
    if (session.voiceCall && session.voiceSendingMic) return;

    // Call "velha" (recebida enquanto estávamos fora da voz, sem o nosso microfone):
    // é exatamente isso que fazia o irmão dizer "te vejo mas não te escuto".
    if (session.voiceCall) {
      const stale = session.voiceCall;
      session.voiceCall = null;
      session.voiceSendingMic = false;
      try {
        stale.close();
      } catch {
        /* ignore */
      }
    }

    if (this.shouldInitiateVoice(session.peerId)) {
      this.initiateVoiceCallWithPeer(session);
      return;
    }

    // Não somos o iniciador: aguarda a call do outro lado. Se em 3.5s ela não
    // chegar (rede hostil, pacote perdido), assumimos a iniciativa.
    if (session.voiceRetryTimeout !== null) {
      clearTimeout(session.voiceRetryTimeout);
    }
    session.voiceRetryTimeout = window.setTimeout(() => {
      session.voiceRetryTimeout = null;
      const current = this.sessions.get(session.peerId);
      const currentState = useHubStore.getState();
      if (!current || !currentState.inVoiceCall || current.voiceCall) return;
      const currentRemote = currentState.participants[session.peerId];
      if (currentRemote && !currentRemote.inVoiceCall) return;
      this.initiateVoiceCallWithPeer(current);
    }, 3500);
  }

  private handleIncomingMediaCall(call: MediaConnection): void {
    const channel = (call.metadata as { channel?: string } | undefined)?.channel || 'voice';
    const session = this.ensureSession(call.peer);

    if (channel === 'voice') {
      void this.acceptVoiceCall(session, call);
    } else if (channel === 'screen') {
      this.acceptScreenCall(session, call);
    } else if (channel === 'webcam') {
      this.acceptWebcamCall(session, call);
    } else {
      try {
        call.close();
      } catch {
        /* ignore */
      }
    }
  }

  private async acceptVoiceCall(session: PeerMediaSession, call: MediaConnection): Promise<void> {
    // Se estamos no meio do joinVoiceCall, espera ele concluir (evita recusar
    // a call por alguns milissegundos de diferença)
    if (!useHubStore.getState().inVoiceCall && this.voiceJoinPromise) {
      await this.voiceJoinPromise.catch(() => {});
    }

    if (!useHubStore.getState().inVoiceCall) {
      // Fora da chamada de voz: recusa de forma explícita para o outro lado
      // saber que precisa renegociar quando entrarmos.
      try {
        call.close();
      } catch {
        /* ignore */
      }
      return;
    }

    // Glare: se somos o iniciador determinístico e já temos call enviando mic,
    // mantemos a nossa e descartamos a dele.
    if (session.voiceCall && session.voiceSendingMic && this.shouldInitiateVoice(session.peerId)) {
      try {
        call.close();
      } catch {
        /* ignore */
      }
      return;
    }

    let voiceStream = this.getVoiceStream();
    if (!voiceStream) {
      const ok = await this.setupLocalMicrophone();
      voiceStream = ok ? this.getVoiceStream() : null;
    }

    if (session.voiceCall && session.voiceCall !== call) {
      const stale = session.voiceCall;
      session.voiceCall = null;
      session.voiceSendingMic = false;
      try {
        stale.close();
      } catch {
        /* ignore */
      }
    }

    try {
      call.answer(voiceStream || undefined);
    } catch (err) {
      console.warn('[WebRTC Engine] Falha ao atender call de voz:', err);
      return;
    }

    session.voiceCall = call;
    session.voiceSendingMic = Boolean(voiceStream);
    this.patchCallSdp(call, false);

    call.on('stream', (stream) => this.attachRemoteVoice(session, call, stream));
    call.on('close', () => this.detachVoiceCall(session, call));
    call.on('error', (err) => {
      console.warn('[WebRTC Engine] Erro na call de voz entrante:', err);
      this.detachVoiceCall(session, call);
    });
  }

  private acceptScreenCall(session: PeerMediaSession, call: MediaConnection): void {
    try {
      call.answer(); // Atende tela sem enviar vídeo de volta
    } catch (err) {
      console.warn('[WebRTC Engine] Falha ao atender call de tela:', err);
      return;
    }

    if (session.screenCall && session.screenCall !== call) {
      try { session.screenCall.close(); } catch { /* ignore */ }
    }
    session.screenCall = call;
    this.patchCallSdp(call, true);

    call.on('stream', (stream) => {
      sounds.playStreamStart();
      const state = useHubStore.getState();
      state.setRemoteStream(session.peerId, 'screen', stream);
      state.setRemoteScreenStream(stream);
      state.updateParticipant(session.peerId, { isScreenSharing: true });
      state.setTelemetry({ active: true, abrStatus: 'optimal' });

      this.startReceiverStats(call.peerConnection, stream);
    });

    call.on('close', () => {
      if (session.screenCall !== call) return;
      session.screenCall = null;
      const state = useHubStore.getState();
      state.setRemoteStream(session.peerId, 'screen', null);
      state.setRemoteScreenStream(null);
      state.updateParticipant(session.peerId, { isScreenSharing: false });
      state.setTelemetry({ active: false });
      this.stopReceiverStats();
      sounds.playStreamStop();
    });

    call.on('error', (err) => {
      console.warn('[WebRTC Engine] Erro na call de tela:', err);
    });
  }

  private acceptWebcamCall(session: PeerMediaSession, call: MediaConnection): void {
    try {
      call.answer();
    } catch (err) {
      console.warn('[WebRTC Engine] Falha ao atender call de webcam:', err);
      return;
    }

    if (session.webcamCall && session.webcamCall !== call) {
      try { session.webcamCall.close(); } catch { /* ignore */ }
    }
    session.webcamCall = call;

    call.on('stream', (stream) => {
      const state = useHubStore.getState();
      state.setRemoteStream(session.peerId, 'webcam', stream);
      state.updateParticipant(session.peerId, { isWebcamActive: true });
    });

    call.on('close', () => {
      if (session.webcamCall !== call) return;
      session.webcamCall = null;
      const state = useHubStore.getState();
      state.setRemoteStream(session.peerId, 'webcam', null);
      state.updateParticipant(session.peerId, { isWebcamActive: false });
    });

    call.on('error', (err) => {
      console.warn('[WebRTC Engine] Erro na call de webcam:', err);
    });
  }

  private attachRemoteVoice(session: PeerMediaSession, call: MediaConnection, stream: MediaStream): void {
    // Ignora streams de calls duplicadas/antigas
    if (session.voiceCall && session.voiceCall !== call && session.voiceSendingMic) return;

    this.teardownPeerVoiceAudio(session);
    this.setupPeerVoiceAudio(session, stream);
    useHubStore.getState().setRemoteStream(session.peerId, 'voice', stream);
    useHubStore.getState().setRemoteVoiceStream(stream);
  }

  private detachVoiceCall(session: PeerMediaSession, call: MediaConnection): void {
    if (session.voiceCall !== call) return; // call antiga, não mexe no estado atual
    session.voiceCall = null;
    session.voiceSendingMic = false;
    this.teardownPeerVoiceAudio(session);
    useHubStore.getState().setRemoteStream(session.peerId, 'voice', null);
  }

  private initiateVoiceCallWithPeer(session: PeerMediaSession): void {
    if (!this.localPeer || this.localPeer.destroyed) return;
    if (session.voiceCall && session.voiceSendingMic) return;

    const voiceStream = this.getVoiceStream();
    if (!voiceStream) {
      console.warn('[WebRTC Engine] Sem stream de microfone para iniciar a call de voz.');
      return;
    }

    const call = this.localPeer.call(session.peerId, voiceStream, {
      metadata: { channel: 'voice' },
    });
    if (!call) return;

    session.voiceCall = call;
    session.voiceSendingMic = true;
    this.patchCallSdp(call, false);

    call.on('stream', (stream) => this.attachRemoteVoice(session, call, stream));
    call.on('close', () => this.detachVoiceCall(session, call));
    call.on('error', (err) => {
      console.warn('[WebRTC Engine] Erro na call de voz:', err);
      this.detachVoiceCall(session, call);
    });
  }

  private initiateScreenCallWithPeer(session: PeerMediaSession): void {
    if (!this.localPeer || this.localPeer.destroyed) return;
    if (!this.localScreenStream || session.screenCall) return;

    const call = this.localPeer.call(session.peerId, this.localScreenStream, {
      metadata: { channel: 'screen' },
    });
    if (!call) return;

    session.screenCall = call;
    this.patchCallSdp(call, true);

    try {
      const senders = call.peerConnection.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      if (videoSender) {
        void configureVideoSender(videoSender, useHubStore.getState().videoQualityConfig.maxBitrateBps);
        this.startAbrLoop(call.peerConnection, videoSender, useHubStore.getState().videoQualityConfig);
      }
    } catch (err) {
      console.warn('[WebRTC Engine] Falha ao configurar sender de tela:', err);
    }

    call.on('close', () => {
      if (session.screenCall !== call) return;
      session.screenCall = null;
    });

    call.on('error', (err) => {
      console.warn('[WebRTC Engine] Erro na call de tela:', err);
      if (session.screenCall === call) session.screenCall = null;
    });
  }

  private initiateWebcamCallWithPeer(session: PeerMediaSession): void {
    if (!this.localPeer || this.localPeer.destroyed) return;
    if (!this.localWebcamStream || session.webcamCall) return;

    const call = this.localPeer.call(session.peerId, this.localWebcamStream, {
      metadata: { channel: 'webcam' },
    });
    if (!call) return;

    session.webcamCall = call;
    call.on('close', () => {
      if (session.webcamCall === call) session.webcamCall = null;
    });
  }

  /* ========================================================================= */
  /* ÁUDIO INDIVIDUAL POR IRMÃO (0% A 200%) & SINK ID                          */
  /* ========================================================================= */

  private setupPeerVoiceAudio(session: PeerMediaSession, stream: MediaStream): void {
    try {
      // Reprodução direta na tag <audio> (baixa latência, sem reamostragem extra)
      let audioEl = document.getElementById(`audio-peer-${session.peerId}`) as HTMLAudioElement | null;
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-peer-${session.peerId}`;
        audioEl.style.display = 'none';
        audioEl.setAttribute('playsinline', 'true');
        document.body.appendChild(audioEl);
      }

      const state = useHubStore.getState();
      const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
      const effVol = state.isDeafened
        ? 0
        : Math.max(0, Math.min(1.0, peerVol * state.audioConfig.remoteStreamVolume));

      audioEl.autoplay = true;
      audioEl.muted = state.isDeafened;
      audioEl.volume = effVol;
      audioEl.srcObject = stream;

      const outputId = state.audioConfig.outputDeviceId;
      if (outputId && outputId !== 'default' && 'setSinkId' in audioEl) {
        (audioEl as unknown as { setSinkId: (id: string) => Promise<void> })
          .setSinkId(outputId)
          .catch((e) => console.warn('[WebRTC Audio] setSinkId falhou:', e));
      }

      audioEl.play().catch((e) => console.warn('[WebRTC Audio] Falha ao iniciar play:', e));

      session.voiceAudioEl = audioEl;
      this.startRemoteVoiceDetection(session, stream);
    } catch (err) {
      console.warn(`[WebRTC Audio] Falha ao configurar áudio para ${session.peerId}:`, err);
    }
  }

  private teardownPeerVoiceAudio(session: PeerMediaSession): void {
    if (session.remoteSpeakingInterval !== null) {
      clearInterval(session.remoteSpeakingInterval);
      session.remoteSpeakingInterval = null;
    }
    if (session.voiceSourceNode) {
      try { session.voiceSourceNode.disconnect(); } catch { /* ignore */ }
      session.voiceSourceNode = null;
    }
    if (session.voiceAnalyserNode) {
      try { session.voiceAnalyserNode.disconnect(); } catch { /* ignore */ }
      session.voiceAnalyserNode = null;
    }
    if (session.voiceSinkNode) {
      try { session.voiceSinkNode.disconnect(); } catch { /* ignore */ }
      session.voiceSinkNode = null;
    }
    if (session.voiceGainNode) {
      try { session.voiceGainNode.disconnect(); } catch { /* ignore */ }
      session.voiceGainNode = null;
    }
    if (session.voiceDestNode) {
      try { session.voiceDestNode.disconnect(); } catch { /* ignore */ }
      session.voiceDestNode = null;
    }
    if (session.voiceAudioEl) {
      try {
        session.voiceAudioEl.pause();
      } catch {
        /* ignore */
      }
      session.voiceAudioEl.srcObject = null;
      session.voiceAudioEl.remove();
      session.voiceAudioEl = null;
    }
    if (session.voiceAudioCtx && session.voiceAudioCtx.state !== 'closed') {
      session.voiceAudioCtx.close().catch(() => {});
      session.voiceAudioCtx = null;
    }
    session.lastRemoteSpeaking = false;
  }

  /**
   * Contexto único (compartilhado) para análise de fala remota.
   * Antes era criado um AudioContext por irmão, todos suspensos (política de
   * autoplay) => o anel verde de fala nunca acendia.
   */
  private getDetectionContext(): AudioContext | null {
    if (this.detectionCtx && this.detectionCtx.state === 'closed') {
      this.detectionCtx = null;
    }

    if (!this.detectionCtx) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.detectionCtx = new AudioCtx();
      } catch (err) {
        console.warn('[WebRTC Audio] Não foi possível criar AudioContext de análise:', err);
        return null;
      }
    }

    if (this.detectionCtx.state === 'suspended') {
      this.detectionCtx.resume().catch(() => {});
    }

    return this.detectionCtx;
  }

  private installAudioUnlock(): void {
    if (this.audioUnlockInstalled) return;
    this.audioUnlockInstalled = true;

    const unlock = () => {
      this.audioPipeline?.resume();
      const ctx = this.getDetectionContext();
      if (ctx && ctx.state === 'running') {
        document.removeEventListener('pointerdown', unlock);
        this.audioUnlockInstalled = false;
      }
    };

    document.addEventListener('pointerdown', unlock);
  }

  public setPeerVolume(clientId: string, volume: number): void {
    useHubStore.getState().setPeerVolume(clientId, volume);
    const clamped = Math.max(0, Math.min(2.0, volume));
    const state = useHubStore.getState();

    for (const session of this.sessions.values()) {
      if (session.clientId === clientId && session.voiceAudioEl) {
        const effVol = state.isDeafened
          ? 0
          : Math.max(0, Math.min(1.0, clamped * state.audioConfig.remoteStreamVolume));
        session.voiceAudioEl.volume = effVol;
      }
    }
  }

  private startRemoteVoiceDetection(session: PeerMediaSession, stream: MediaStream): void {
    const ctx = this.getDetectionContext();
    if (!ctx) return;

    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;

      // Sink silencioso garante que o grafo seja realmente processado
      const sink = ctx.createGain();
      sink.gain.setValueAtTime(0, ctx.currentTime);

      source.connect(analyser);
      analyser.connect(sink);
      sink.connect(ctx.destination);

      session.voiceSourceNode = source;
      session.voiceAnalyserNode = analyser;
      session.voiceSinkNode = sink;

      const buffer = new Float32Array(analyser.fftSize);
      session.remoteSpeakingInterval = window.setInterval(() => {
        const audioTracks = stream.getAudioTracks();
        if (!stream.active || audioTracks.length === 0) {
          if (session.remoteSpeakingInterval !== null) {
            clearInterval(session.remoteSpeakingInterval);
            session.remoteSpeakingInterval = null;
          }
          try { source.disconnect(); } catch { /* ignore */ }
          try { analyser.disconnect(); } catch { /* ignore */ }
          try { sink.disconnect(); } catch { /* ignore */ }
          return;
        }

        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length);
        const db = rms > 0.0001 ? 20 * Math.log10(rms) : -100;
        const isSpeaking = db > -50;

        // Só escreve na store quando o estado realmente muda (evitava re-render
        // contínuo de toda a árvore React)
        if (isSpeaking !== session.lastRemoteSpeaking) {
          session.lastRemoteSpeaking = isSpeaking;
          useHubStore.getState().updateParticipant(session.peerId, { isSpeaking });
        }
      }, 120);
    } catch (err) {
      console.warn('[WebRTC Audio] Falha na detecção de fala remota:', err);
    }
  }

  /* ========================================================================= */
  /* ENTRAR E SAIR DA CHAMADA DE VOZ (INDEPENDENTE DO CHAT)                    */
  /* ========================================================================= */

  public joinVoiceCall(): Promise<void> {
    if (this.voiceJoinPromise) return this.voiceJoinPromise;
    this.voiceJoinPromise = this.doJoinVoiceCall()
      .catch((err) => {
        // Nunca deixar promise rejeitada vazar para os onClick dos botões
        console.error('[WebRTC Engine] Falha ao entrar na chamada de voz:', err);
        useHubStore.getState().setStatusText('Falha ao entrar na chamada de voz. Tente novamente.');
      })
      .finally(() => {
        this.voiceJoinPromise = null;
      });
    return this.voiceJoinPromise;
  }

  private async doJoinVoiceCall(): Promise<void> {
    if (useHubStore.getState().inVoiceCall) return;

    const micOk = await this.setupLocalMicrophone();
    if (!micOk || !this.getVoiceStream()) {
      useHubStore.getState().setStatusText(
        'Não foi possível acessar o microfone. Libere a permissão para entrar na voz.'
      );
      return;
    }

    this.audioPipeline?.resume();
    sounds.playJoin();

    useHubStore.getState().setInVoiceCall(true);
    if (this.localPeer) {
      useHubStore.getState().updateParticipant(this.localPeer.id, { inVoiceCall: true });
    }

    // Notifica todos os irmãos da sala via peer_state_sync
    this.broadcastLocalState();

    // Garante malha com todos os irmãos que já estão em chamada (mesmo os que
    // ainda não têm sessão aberta — causa clássica do "entro sozinho")
    const state = useHubStore.getState();
    for (const participant of Object.values(state.participants)) {
      if (participant.isLocal || !participant.inVoiceCall) continue;
      const session = this.sessions.get(participant.peerId);
      if (!session || !session.dataConn?.open) {
        this.connectToPeer(participant.peerId, participant.clientId);
        continue;
      }
      this.syncVoiceWithSession(session);
    }

    // Sincroniza com todas as sessões já ativas
    for (const session of this.sessions.values()) {
      this.syncMediaWithSession(session);
    }
  }

  public leaveVoiceCall(): void {
    const state = useHubStore.getState();
    if (!state.inVoiceCall) return;

    sounds.playLeave();

    if (state.isScreenSharing) {
      this.stopScreenShare();
    }

    if (state.isWebcamActive) {
      this.toggleWebcam().catch(() => {});
    }

    // Encerra todas as chamadas de voz com os irmãos
    for (const session of this.sessions.values()) {
      if (session.voiceRetryTimeout !== null) {
        clearTimeout(session.voiceRetryTimeout);
        session.voiceRetryTimeout = null;
      }
      if (session.voiceCall) {
        const call = session.voiceCall;
        session.voiceCall = null;
        session.voiceSendingMic = false;
        try { call.close(); } catch { /* ignore */ }
      }
      this.teardownPeerVoiceAudio(session);
      useHubStore.getState().setRemoteStream(session.peerId, 'voice', null);
    }

    useHubStore.getState().setInVoiceCall(false);
    useHubStore.getState().setRemoteVoiceStream(null);

    if (this.localPeer) {
      useHubStore.getState().updateParticipant(this.localPeer.id, { inVoiceCall: false });
    }

    // Notifica todos os irmãos mantendo o chat ativo!
    this.broadcastLocalState();
  }

  private broadcastLocalState(): void {
    if (!this.localPeer) return;
    const state = useHubStore.getState();
    const local = state.participants[this.localPeer.id];
    if (!local) return;

    const { isLocal, ...rest } = local;
    this.broadcast({
      type: 'peer_state_sync',
      state: rest,
    });
  }

  public broadcast(packet: SignalingPacket): void {
    for (const session of this.sessions.values()) {
      if (session.dataConn && session.dataConn.open) {
        try {
          session.dataConn.send(packet);
        } catch (err) {
          console.warn(`[WebRTC Broadcast] Falha ao enviar para ${session.peerId}:`, err);
        }
      }
    }
  }

  // Compatibilidade legada
  public sendData(msg: { type: string; [key: string]: unknown }): void {
    if (msg.type === 'nickname' && typeof msg.name === 'string') {
      useHubStore.getState().setNickname(msg.name);
      if (this.localPeer) {
        useHubStore.getState().updateParticipant(this.localPeer.id, { nickname: msg.name });
      }
      this.broadcastLocalState();
    } else if (msg.type === 'speaking') {
      this.broadcast({
        type: 'speaking',
        peerId: this.localPeer?.id || '',
        isSpeaking: Boolean(msg.isSpeaking),
      });
    }
  }

  /* ========================================================================= */
  /* CONTROLES DE MÍDIA LOCAL (MUTE, DEAFEN, WEBCAM, SCREEN SHARE)             */
  /* ========================================================================= */

  public toggleMute(muted?: boolean): void {
    const state = useHubStore.getState();
    const nextMuted = muted !== undefined ? muted : !state.isMuted;
    useHubStore.getState().setMuted(nextMuted);

    // Ajusta o ganho do microfone no pipeline WebAudio (sem cortar o Soundboard!)
    this.audioPipeline?.setMicMuted(nextMuted);

    if (nextMuted) {
      sounds.playMute();
    } else {
      sounds.playUnmute();
    }

    if (this.localPeer) {
      useHubStore.getState().updateParticipant(this.localPeer.id, {
        isMuted: nextMuted,
        isSpeaking: nextMuted ? false : useHubStore.getState().participants[this.localPeer.id]?.isSpeaking,
      });
      this.lastBroadcastSpeaking = false;
      this.broadcast({ type: 'speaking', peerId: this.localPeer.id, isSpeaking: false });
    }
    this.broadcastLocalState();
  }

  public toggleDeafen(deafened?: boolean): void {
    const state = useHubStore.getState();
    const nextDeafened = deafened !== undefined ? deafened : !state.isDeafened;
    useHubStore.getState().setDeafened(nextDeafened);

    // Atualiza o elemento de áudio de todas as sessões para silenciar imediatamente
    for (const session of this.sessions.values()) {
      if (session.voiceAudioEl) {
        const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
        session.voiceAudioEl.muted = nextDeafened;
        session.voiceAudioEl.volume = nextDeafened
          ? 0
          : Math.max(0, Math.min(1.0, peerVol * state.audioConfig.remoteStreamVolume));
      }
    }

    // Se ativou Deafen, muta microfone automaticamente (igual ao Discord)
    if (nextDeafened && !state.isMuted) {
      this.toggleMute(true);
    }

    if (this.localPeer) {
      useHubStore.getState().updateParticipant(this.localPeer.id, { isDeafened: nextDeafened });
    }
    this.broadcastLocalState();
  }

  public async toggleWebcam(): Promise<void> {
    const currentState = useHubStore.getState().isWebcamActive;

    if (currentState) {
      if (this.localWebcamStream) {
        this.localWebcamStream.getTracks().forEach((track) => track.stop());
        this.localWebcamStream = null;
      }
      useHubStore.getState().setLocalWebcamStream(null);
      useHubStore.getState().setWebcamActive(false);

      for (const session of this.sessions.values()) {
        if (session.webcamCall) {
          try { session.webcamCall.close(); } catch { /* ignore */ }
          session.webcamCall = null;
        }
        useHubStore.getState().setRemoteStream(session.peerId, 'webcam', null);
      }

      if (this.localPeer) {
        useHubStore.getState().updateParticipant(this.localPeer.id, { isWebcamActive: false });
      }
      this.broadcastLocalState();
      return;
    }

    try {
      const videoDeviceId = useHubStore.getState().audioConfig.videoDeviceId;
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: videoDeviceId && videoDeviceId !== 'default' ? { exact: videoDeviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localWebcamStream = stream;
      useHubStore.getState().setLocalWebcamStream(stream);
      useHubStore.getState().setWebcamActive(true);

      if (this.localPeer) {
        useHubStore.getState().updateParticipant(this.localPeer.id, { isWebcamActive: true });
      }
      this.broadcastLocalState();

      // Envia chamada de webcam para irmãos em call de voz
      for (const session of this.sessions.values()) {
        this.initiateWebcamCallWithPeer(session);
      }
    } catch (err) {
      console.error('[WebRTC Engine] Erro ao acessar webcam:', err);
      useHubStore.getState().setStatusText('Não foi possível acessar a webcam.');
    }
  }

  public async startScreenShare(sourceId: string, qualityConfig: VideoQualityConfig): Promise<void> {
    try {
      if (window.cbsHubAPI) {
        await window.cbsHubAPI.setCaptureSource(sourceId, qualityConfig.includeSystemAudio);
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: qualityConfig.includeSystemAudio,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          await videoTrack.applyConstraints({
            width: { ideal: qualityConfig.width, max: qualityConfig.width },
            height: { ideal: qualityConfig.height, max: qualityConfig.height },
            frameRate: { ideal: qualityConfig.fps, max: qualityConfig.fps },
          });
        } catch {
          /* alguns drivers ignoram constraints exatas */
        }

        if ('contentHint' in videoTrack) {
          videoTrack.contentHint = qualityConfig.fps >= 60 ? 'motion' : 'detail';
        }

        videoTrack.onended = () => {
          this.stopScreenShare();
        };
      }

      this.localScreenStream = stream;
      useHubStore.getState().setLocalScreenStream(stream);
      useHubStore.getState().setScreenSharing(true);
      sounds.playStreamStart();

      if (this.localPeer) {
        useHubStore.getState().updateParticipant(this.localPeer.id, {
          isScreenSharing: true,
          screenQualityLabel: `${qualityConfig.resolution} ${qualityConfig.fps}FPS`,
        });
      }
      this.broadcastLocalState();

      // Envia stream de tela para todos os irmãos na chamada
      const state = useHubStore.getState();
      for (const participant of Object.values(state.participants)) {
        if (participant.isLocal || !participant.inVoiceCall) continue;
        const session = this.sessions.get(participant.peerId);
        if (!session) {
          this.connectToPeer(participant.peerId, participant.clientId);
          continue;
        }
        this.initiateScreenCallWithPeer(session);
      }

      for (const session of this.sessions.values()) {
        this.initiateScreenCallWithPeer(session);
      }
    } catch (err) {
      console.error('[WebRTC Engine] Erro ao iniciar compartilhamento de tela:', err);
      useHubStore.getState().setStatusText('Compartilhamento de tela cancelado.');
      this.stopScreenShare();
    }
  }

  public stopScreenShare(): void {
    const stateBefore = useHubStore.getState();
    const hasAnyScreenCall = Array.from(this.sessions.values()).some((s) => s.screenCall);
    if (!this.localScreenStream && !stateBefore.isScreenSharing && !hasAnyScreenCall) {
      // Nada sendo transmitido: não toca som nem mexe no estado
      return;
    }

    if (this.abrIntervalId !== null) {
      clearInterval(this.abrIntervalId);
      this.abrIntervalId = null;
    }

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((track) => track.stop());
      this.localScreenStream = null;
    }

    for (const session of this.sessions.values()) {
      if (session.screenCall) {
        try { session.screenCall.close(); } catch { /* ignore */ }
        session.screenCall = null;
      }
    }

    useHubStore.getState().setLocalScreenStream(null);
    useHubStore.getState().setScreenSharing(false);
    useHubStore.getState().setTelemetry({ active: false });

    if (this.localPeer) {
      useHubStore.getState().updateParticipant(this.localPeer.id, {
        isScreenSharing: false,
        screenQualityLabel: undefined,
      });
      this.broadcast({
        type: 'screen_stopped',
        peerId: this.localPeer.id,
      });
    }

    sounds.playStreamStop();
  }

  /* ========================================================================= */
  /* MICROFONE LOCAL & PIPELINE DE ÁUDIO                                       */
  /* ========================================================================= */

  public setupLocalMicrophone(): Promise<boolean> {
    if (this.micSetupPromise) return this.micSetupPromise;
    this.micSetupPromise = this.doSetupLocalMicrophone().finally(() => {
      this.micSetupPromise = null;
    });
    return this.micSetupPromise;
  }

  private async doSetupLocalMicrophone(): Promise<boolean> {
    const audioConfig = useHubStore.getState().audioConfig;
    const useSuppression = Boolean(audioConfig.neuralNoiseGate);
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId:
          audioConfig.inputDeviceId && audioConfig.inputDeviceId !== 'default'
            ? { exact: audioConfig.inputDeviceId }
            : undefined,
        echoCancellation: audioConfig.echoCancellation,
        autoGainControl: audioConfig.autoGainControl,
        noiseSuppression: useSuppression,
        sampleRate: 48000,
        channelCount: 1,
      },
    };

    let nextRaw: MediaStream;
    try {
      nextRaw = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.error('[WebRTC Engine] Erro ao acessar o microfone:', err);
      useHubStore.getState().setStatusText(
        'Microfone bloqueado. Verifique a permissão do sistema para o cbsHUB.'
      );
      return false;
    }

    // Só agora descartamos o pipeline antigo: se o novo getUserMedia falhasse,
    // o usuário ficaria sem microfone nenhum (e "mudo" para sempre na call).
    const previousRaw = this.rawMicStream;
    const previousPipeline = this.audioPipeline;

    const pipeline = new VoiceAudioPipeline(nextRaw, audioConfig, (isSpeaking, level) => {
      const state = useHubStore.getState();
      if (isSpeaking !== state.isLocalSpeaking || Math.abs(level - state.micLevel) >= 2) {
        state.setIsLocalSpeaking(isSpeaking, level);
      }

      if (this.localPeer && isSpeaking !== this.lastBroadcastSpeaking) {
        this.lastBroadcastSpeaking = isSpeaking;
        useHubStore.getState().updateParticipant(this.localPeer.id, { isSpeaking });
        // Só transmite quando o estado muda (antes eram ~22 pacotes/s por irmão)
        this.broadcast({
          type: 'speaking',
          peerId: this.localPeer.id,
          isSpeaking,
        });
      }
    });

    // Aplica estado de mute inicial no pipeline
    pipeline.setMicMuted(useHubStore.getState().isMuted);

    let processed: MediaStream;
    try {
      processed = await pipeline.initialize();
    } catch (err) {
      console.error('[WebRTC Engine] Falha ao inicializar pipeline de áudio:', err);
      pipeline.destroy();
      this.rawMicStream = previousRaw;
      this.audioPipeline = previousPipeline;
      return false;
    }

    this.rawMicStream = nextRaw;
    this.audioPipeline = pipeline;
    this.lastBroadcastSpeaking = false;

    if (previousPipeline) previousPipeline.destroy();
    if (previousRaw) previousRaw.getTracks().forEach((t) => t.stop());

    useHubStore.getState().setLocalVoiceStream(processed);

    // Se já houver chamadas de voz ativas, substitui a track de áudio no RTCRtpSender sem derrubar a call
    const newAudioTrack = processed.getAudioTracks()[0];
    if (newAudioTrack) {
      for (const session of this.sessions.values()) {
        const pc = session.voiceCall?.peerConnection;
        if (!pc) continue;
        const audioSender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(newAudioTrack).catch(() => {});
        }
      }
    }

    // Registra hooks no soundboardEngine para que os clipes injetem no WebRTC
    soundboardEngine.registerPipelineHooks(
      () => this.audioPipeline?.getAudioContext() ?? null,
      () => this.audioPipeline?.getSoundboardInputNode() ?? null
    );

    return true;
  }

  public updateAudioSettings(partial: Partial<AudioProcessingConfig>): void {
    useHubStore.getState().updateAudioConfig(partial);
    if (this.audioPipeline) {
      this.audioPipeline.updateConfig(partial);
    }

    // Se o usuário ligou/desligou a supressão de ruído, aplica ao vivo na trilha do microfone
    if (typeof partial.neuralNoiseGate === 'boolean' && this.rawMicStream) {
      const audioTrack = this.rawMicStream.getAudioTracks()[0];
      if (audioTrack && typeof audioTrack.applyConstraints === 'function') {
        audioTrack.applyConstraints({ noiseSuppression: partial.neuralNoiseGate }).catch(() => {});
      }
    }

    // Se atualizou remoteStreamVolume ou outputDeviceId, aplica em todas as sessões
    const state = useHubStore.getState();
    for (const session of this.sessions.values()) {
      if (session.voiceAudioEl && typeof partial.remoteStreamVolume === 'number') {
        const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
        session.voiceAudioEl.volume = state.isDeafened
          ? 0
          : Math.max(0, Math.min(1.0, peerVol * partial.remoteStreamVolume));
      }

      if (partial.outputDeviceId && session.voiceAudioEl && 'setSinkId' in session.voiceAudioEl) {
        (session.voiceAudioEl as unknown as { setSinkId: (id: string) => Promise<void> })
          .setSinkId(partial.outputDeviceId)
          .catch(() => {});
      }
    }
  }

  /* ========================================================================= */
  /* SDP MUNGING & ADAPTIVE BITRATE (ABR)                                      */
  /* ========================================================================= */

  private patchCallSdp(call: MediaConnection, isStereo: boolean): void {
    try {
      const pc = call.peerConnection;
      if (!pc) return;

      const tagged = pc as unknown as { __cbsSdpPatched?: boolean };
      if (tagged.__cbsSdpPatched) return;
      tagged.__cbsSdpPatched = true;

      const origSetLocalDescription = pc.setLocalDescription.bind(pc);
      pc.setLocalDescription = async (desc?: RTCLocalSessionDescriptionInit) => {
        if (desc && desc.sdp) {
          desc.sdp = enhanceOpusSdp(desc.sdp, isStereo);
        }
        return origSetLocalDescription(desc);
      };
    } catch (err) {
      console.warn('[WebRTC Engine] Interceptação de setLocalDescription falhou:', err);
    }
  }

  private startAbrLoop(pc: RTCPeerConnection, sender: RTCRtpSender, config: VideoQualityConfig): void {
    if (this.abrIntervalId !== null) clearInterval(this.abrIntervalId);

    this.currentMaxBitrate = config.maxBitrateBps;
    this.targetMaxBitrate = config.maxBitrateBps;
    this.consecutiveBadCycles = 0;
    this.consecutiveGoodCycles = 0;
    this.prevSenderBytes = 0;
    this.prevSenderTimestamp = performance.now();

    this.abrIntervalId = window.setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let fps = config.fps;
        let bitrateMbps = 0;
        let rttMs = 20;
        let packetsLostPercent = 0;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
              fps = report.framesPerSecond;
            }
            const now = performance.now();
            const deltaMs = now - this.prevSenderTimestamp;
            if (this.prevSenderBytes > 0 && deltaMs > 0 && report.bytesSent) {
              const bytesDiff = report.bytesSent - this.prevSenderBytes;
              bitrateMbps = Math.max(0, Number(((bytesDiff * 8) / (deltaMs / 1000) / 1_000_000).toFixed(2)));
            }
            this.prevSenderBytes = report.bytesSent || 0;
            this.prevSenderTimestamp = now;
          }

          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (typeof report.currentRoundTripTime === 'number') {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
          }

          if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
            if (typeof report.fractionLost === 'number') {
              packetsLostPercent = Number((report.fractionLost * 100).toFixed(1));
            }
          }
        });

        let abrStatus: 'optimal' | 'throttled' | 'recovering' =
          useHubStore.getState().telemetry.abrStatus;

        if (packetsLostPercent > 4.0 || rttMs > 120) {
          this.consecutiveBadCycles++;
          this.consecutiveGoodCycles = 0;

          if (this.consecutiveBadCycles >= 2) {
            const throttled = Math.max(1_500_000, Math.round(this.currentMaxBitrate * 0.8));
            if (throttled !== this.currentMaxBitrate) {
              this.currentMaxBitrate = throttled;
              await configureVideoSender(sender, this.currentMaxBitrate);
            }
            abrStatus = 'throttled';
          }
        } else if (packetsLostPercent < 0.5 && rttMs <= 100) {
          this.consecutiveBadCycles = 0;
          this.consecutiveGoodCycles++;

          if (this.consecutiveGoodCycles >= 6) {
            const recovered = Math.min(this.targetMaxBitrate, Math.round(this.currentMaxBitrate * 1.15));
            if (recovered !== this.currentMaxBitrate) {
              this.currentMaxBitrate = recovered;
              await configureVideoSender(sender, this.currentMaxBitrate);
            }
            abrStatus = this.currentMaxBitrate >= this.targetMaxBitrate ? 'optimal' : 'recovering';
          }
        } else {
          this.consecutiveBadCycles = 0;
          this.consecutiveGoodCycles = 0;
        }

        useHubStore.getState().setTelemetry({
          active: true,
          resolution: `${config.resolution} (${config.width}x${config.height})`,
          fps: Math.round(fps),
          bitrateMbps,
          rttMs,
          packetsLostPercent,
          abrStatus,
        });
      } catch (err) {
        console.warn('[ABR Loop] Erro na leitura de stats:', err);
      }
    }, 1500);
  }

  private startReceiverStats(pc: RTCPeerConnection, stream: MediaStream): void {
    this.stopReceiverStats();
    this.prevReceiverBytes = 0;
    this.prevReceiverTimestamp = performance.now();

    this.receiverStatsIntervalId = window.setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let fps = 60;
        let bitrateMbps = 0;
        let rttMs = 18;
        let packetsLostPercent = 0;
        let resolution = '1080p';

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          if (settings.width && settings.height) {
            resolution = `${settings.width}x${settings.height}`;
          }
        }

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
              fps = report.framesPerSecond;
            }
            const now = performance.now();
            const deltaMs = now - this.prevReceiverTimestamp;
            if (this.prevReceiverBytes > 0 && deltaMs > 0 && report.bytesReceived) {
              const bytesDiff = report.bytesReceived - this.prevReceiverBytes;
              bitrateMbps = Math.max(0, Number(((bytesDiff * 8) / (deltaMs / 1000) / 1_000_000).toFixed(2)));
            }
            this.prevReceiverBytes = report.bytesReceived || 0;
            this.prevReceiverTimestamp = now;

            const packetsLost = report.packetsLost || 0;
            const packetsReceived = report.packetsReceived || 0;
            const total = packetsLost + packetsReceived;
            if (total > 0) {
              packetsLostPercent = Math.max(0, Number(((packetsLost / total) * 100).toFixed(1)));
            }
          }

          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (typeof report.currentRoundTripTime === 'number') {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
          }
        });

        useHubStore.getState().setTelemetry({
          active: true,
          resolution,
          fps: Math.round(fps),
          bitrateMbps,
          rttMs,
          packetsLostPercent,
          abrStatus: packetsLostPercent > 4 ? 'throttled' : 'optimal',
        });
      } catch (err) {
        console.warn('[Receiver Stats] Erro:', err);
      }
    }, 1500);
  }

  private stopReceiverStats(): void {
    if (this.receiverStatsIntervalId !== null) {
      clearInterval(this.receiverStatsIntervalId);
      this.receiverStatsIntervalId = null;
    }
  }

  /* ========================================================================= */
  /* MÉTODOS PÚBLICOS DE CHAT E SOUNDBOARD                                     */
  /* ========================================================================= */

  public async sendChatMessage(content: string): Promise<ChatMessage | null> {
    const trimmed = content.trim();
    if (!trimmed) return null;

    const state = useHubStore.getState();
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'msg-' + Date.now();

    const msg: ChatMessage = {
      id,
      roomId: state.roomId,
      type: 'user',
      authorClientId: state.clientId,
      authorNickname: state.nickname,
      authorAvatarColor: state.avatarColor,
      content: trimmed,
      createdAt: Date.now(),
      reactions: {},
    };

    await storageDb.saveMessage(msg);
    useHubStore.getState().addMessage(msg);

    this.broadcast({
      type: 'chat_message',
      message: msg,
    });

    return msg;
  }

  public async toggleMessageReaction(messageId: string, emoji: string): Promise<void> {
    const state = useHubStore.getState();
    await storageDb.toggleReaction(messageId, emoji, state.clientId, state.nickname);
    useHubStore.getState().updateMessageReaction(messageId, emoji, state.clientId, state.nickname);

    this.broadcast({
      type: 'chat_reaction_toggle',
      messageId,
      emoji,
      clientId: state.clientId,
      nickname: state.nickname,
    });
  }

  public sendTypingState(isTyping: boolean): void {
    const state = useHubStore.getState();
    this.broadcast({
      type: 'chat_typing',
      clientId: state.clientId,
      nickname: state.nickname,
      isTyping,
    });
  }

  public async triggerSoundboardClip(clip: SoundboardClip): Promise<void> {
    const state = useHubStore.getState();

    // Reproduz localmente e injeta no WebRTC
    await soundboardEngine.playClip(clip);

    if (this.localPeer) {
      // Exibe animação visual flutuante localmente
      useHubStore.getState().updateParticipant(this.localPeer.id, {
        activeSoundEffect: {
          emoji: clip.emoji,
          name: clip.name,
          expiresAt: Date.now() + 3500,
        },
      });

      // Notifica todos os irmãos para exibirem o badge animado
      this.broadcast({
        type: 'soundboard_triggered',
        peerId: this.localPeer.id,
        clientId: state.clientId,
        nickname: state.nickname,
        emoji: clip.emoji,
        soundName: clip.name,
      });

      // Registra mensagem de soundboard no chat
      const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'sb-' + Date.now();
      const soundMsg: ChatMessage = {
        id: msgId,
        roomId: state.roomId,
        type: 'soundboard',
        authorClientId: state.clientId,
        authorNickname: state.nickname,
        authorAvatarColor: state.avatarColor,
        content: `tocou "${clip.emoji} ${clip.name}" no Soundboard`,
        createdAt: Date.now(),
        reactions: {},
        soundMeta: {
          emoji: clip.emoji,
          soundName: clip.name,
        },
      };

      await storageDb.saveMessage(soundMsg);
      useHubStore.getState().addMessage(soundMsg);
      this.broadcast({
        type: 'chat_message',
        message: soundMsg,
      });

      window.setTimeout(() => {
        const current = useHubStore.getState().participants[this.localPeer?.id || ''];
        if (current?.activeSoundEffect?.name === clip.name) {
          useHubStore.getState().updateParticipant(this.localPeer!.id, { activeSoundEffect: null });
        }
      }, 3600);
    }
  }

  public async loadSoundboardClips(): Promise<void> {
    await soundboardEngine.loadAllClips();
  }

  /* ========================================================================= */
  /* ENCERRAMENTO COMPLETO DA SALA                                             */
  /* ========================================================================= */

  public leaveRoom(): void {
    const wasConnected = useHubStore.getState().isConnected;

    if (this.beaconHealTimeout !== null) {
      clearTimeout(this.beaconHealTimeout);
      this.beaconHealTimeout = null;
    }

    this.stopPresenceHeartbeat();
    this.stopScreenShare();
    this.stopReceiverStats();
    soundboardEngine.stopAll();

    if (this.localWebcamStream) {
      this.localWebcamStream.getTracks().forEach((t) => t.stop());
      this.localWebcamStream = null;
    }

    if (this.audioPipeline) {
      this.audioPipeline.destroy();
      this.audioPipeline = null;
    }

    if (this.rawMicStream) {
      this.rawMicStream.getTracks().forEach((t) => t.stop());
      this.rawMicStream = null;
    }

    // Encerra todas as sessões mesh ativas
    for (const session of this.sessions.values()) {
      if (session.voiceRetryTimeout !== null) {
        clearTimeout(session.voiceRetryTimeout);
        session.voiceRetryTimeout = null;
      }
      this.teardownPeerVoiceAudio(session);
      if (session.voiceCall) {
        try { session.voiceCall.close(); } catch { /* ignore */ }
        session.voiceCall = null;
      }
      if (session.webcamCall) {
        try { session.webcamCall.close(); } catch { /* ignore */ }
        session.webcamCall = null;
      }
      if (session.screenCall) {
        try { session.screenCall.close(); } catch { /* ignore */ }
        session.screenCall = null;
      }
      if (session.dataConn) {
        try { session.dataConn.close(); } catch { /* ignore */ }
      }
    }
    this.sessions.clear();
    this.pendingDials.clear();
    this.recentPeers.clear();
    this.participantSeen.clear();

    if (this.beaconPeer) {
      try { this.beaconPeer.destroy(); } catch { /* ignore */ }
      this.beaconPeer = null;
      this.isBeaconOwner = false;
    }

    if (this.localPeer) {
      const peer = this.localPeer;
      this.localPeer = null;
      try { peer.destroy(); } catch { /* ignore */ }
    }

    if (this.detectionCtx && this.detectionCtx.state !== 'closed') {
      this.detectionCtx.close().catch(() => {});
    }
    this.detectionCtx = null;
    this.lastBroadcastSpeaking = false;

    if (wasConnected) {
      sounds.playLeave();
    }
    useHubStore.getState().resetSession();
  }
}

export const webrtcEngine = new WebRTCEngine();
