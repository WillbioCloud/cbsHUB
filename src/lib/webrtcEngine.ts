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

  if (username && credential) {
    servers.push(
      { urls: turnUrl, username, credential },
      { urls: turnsUrl, username, credential }
    );
  }

  return servers;
}

const PEER_CONFIG = {
  config: {
    iceServers: buildPeerIceServers(),
    iceCandidatePoolSize: 10,
  },
  debug: 1,
};

interface PeerMediaSession {
  peerId: string;
  clientId: string;
  nickname: string;
  dataConn: DataConnection;
  voiceCall: MediaConnection | null;
  webcamCall: MediaConnection | null;
  screenCall: MediaConnection | null;

  // Roteamento WebAudio individual: 0% a 200% de volume + setSinkId
  voiceAudioCtx: AudioContext | null;
  voiceSourceNode: MediaStreamAudioSourceNode | null;
  voiceGainNode: GainNode | null;
  voiceDestNode: MediaStreamAudioDestinationNode | null;
  voiceAudioEl: HTMLAudioElement | null;
  remoteSpeakingInterval: number | null;
}

class WebRTCEngine {
  private localPeer: Peer | null = null;
  private beaconPeer: Peer | null = null;
  private isBeaconOwner = false;
  private beaconHealTimeout: number | null = null;
  private currentRoomSlug = '';

  // Malha de sessões ativas (chave: peerId)
  private sessions: Map<string, PeerMediaSession> = new Map();

  // Pipeline e mídia local
  private audioPipeline: VoiceAudioPipeline | null = null;
  private rawMicStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private localWebcamStream: MediaStream | null = null;

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

  public async joinRoom(roomInput: string, autoJoinVoice = false): Promise<void> {
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

    // Inicializa localPeer
    this.localPeer = new Peer(localPeerId, PEER_CONFIG);

    this.localPeer.on('open', (id) => {
      useHubStore.getState().setConnectionStatus(true, false, id, null, 'Conectado à sala de texto e presença!');
      sounds.playJoin();

      // Configura escuta de conexões de dados e chamadas de mídia entrantes
      this.setupLocalPeerListeners();

      // Tenta assumir ou consultar o Beacon da sala
      this.attemptClaimBeacon(slug);

      if (autoJoinVoice) {
        this.joinVoiceCall().catch((e) => console.warn('[WebRTC Engine] Auto-join voice falhou:', e));
      }
    });

    this.localPeer.on('error', (err: { type?: string }) => {
      console.error('[WebRTC Engine] Erro no localPeer:', err);
      useHubStore.getState().setStatusText(`Aviso de rede: ${err.type || 'desconhecido'}`);
    });

    this.localPeer.on('disconnected', () => {
      if (this.localPeer && !this.localPeer.destroyed) {
        useHubStore.getState().setStatusText('Reconectando sinalização...');
        this.localPeer.reconnect();
      }
    });

    this.localPeer.on('close', () => {
      // Executa saída apenas se o peer não foi fechado intencionalmente pelo leaveRoom
      if (useHubStore.getState().isConnected) {
        this.leaveRoom();
      }
    });
  }

  private setupLocalPeerListeners(): void {
    if (!this.localPeer) return;

    // Conexões de dados entrantes (Chat, Presença, Sincronização)
    this.localPeer.on('connection', (conn) => {
      this.handleIncomingDataConnection(conn);
    });

    // Chamadas de mídia entrantes (Voz, Webcam, Compartilhamento de Tela)
    this.localPeer.on('call', (call) => {
      this.handleIncomingMediaCall(call);
    });
  }

  /* ========================================================================= */
  /* BEACON DE DESCOBERTA E AUTO-HEAL ANTI-QUEDA                               */
  /* ========================================================================= */

  private attemptClaimBeacon(slug: string): void {
    const beaconId = `cbshub-v2-${slug}-beacon`;

    try {
      this.beaconPeer = new Peer(beaconId, PEER_CONFIG);

      this.beaconPeer.on('open', () => {
        // Cenário A: Este cliente assumiu com sucesso o papel de Beacon (Diretório)
        this.isBeaconOwner = true;
        useHubStore.getState().setStatusText('Conectado como Diretório da sala.');

        this.beaconPeer!.on('connection', (conn) => {
          this.handleBeaconDirectoryConnection(conn);
        });
      });

      this.beaconPeer.on('error', (err: { type?: string }) => {
        if (err.type === 'unavailable-id') {
          // Cenário B: Já existe um Beacon ativo na sala! Conectar a ele para descobrir os irmãos
          this.isBeaconOwner = false;
          try {
            this.beaconPeer?.destroy();
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

        // O visitante já discará para os membros recebidos na lista; não discamos de volta para evitar colisão
        // (Glare) no DataChannel
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

      conn.send({
        type: 'directory_request',
        peerInfo: myInfo,
      } as SignalingPacket);
    });

    conn.on('data', (data) => {
      const packet = data as SignalingPacket;
      if (packet && packet.type === 'directory_response' && Array.isArray(packet.peers)) {
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
        }, 500);
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
    const delay = myIndex * 400 + 150;

    this.beaconHealTimeout = window.setTimeout(() => {
      this.beaconHealTimeout = null;
      if (!this.isBeaconOwner && this.currentRoomSlug) {
        this.attemptClaimBeacon(this.currentRoomSlug);
      }
    }, delay);
  }

  /* ========================================================================= */
  /* GESTÃO DE SESSÕES MESH (DATACONNECTION & MEDIACONNECTION)                  */
  /* ========================================================================= */

  private connectToPeer(remotePeerId: string, clientId?: string): void {
    if (!this.localPeer || this.localPeer.destroyed || remotePeerId === this.localPeer.id) return;
    if (this.sessions.has(remotePeerId)) return;

    const conn = this.localPeer.connect(remotePeerId, { reliable: true });
    this.setupDataConnection(conn, clientId);
  }

  private handleIncomingDataConnection(conn: DataConnection): void {
    if (this.sessions.has(conn.peer)) {
      // Já existe sessão ativa; fecha duplicada
      const existing = this.sessions.get(conn.peer);
      if (existing && existing.dataConn.open) {
        return;
      }
    }
    this.setupDataConnection(conn);
  }

  private setupDataConnection(conn: DataConnection, initialClientId?: string): void {
    const remotePeerId = conn.peer;

    const session: PeerMediaSession = {
      peerId: remotePeerId,
      clientId: initialClientId || '',
      nickname: 'Irmão Conectando...',
      dataConn: conn,
      voiceCall: null,
      webcamCall: null,
      screenCall: null,
      voiceAudioCtx: null,
      voiceSourceNode: null,
      voiceGainNode: null,
      voiceDestNode: null,
      voiceAudioEl: null,
      remoteSpeakingInterval: null,
    };

    this.sessions.set(remotePeerId, session);

    conn.on('open', () => {
      const state = useHubStore.getState();
      const localParticipant = state.participants[this.localPeer?.id || ''];

      // Envia nosso estado completo para o irmão
      if (localParticipant) {
        const { isLocal, ...myState } = localParticipant;
        conn.send({
          type: 'peer_state_sync',
          state: myState,
        } as SignalingPacket);
      }

      // Sincroniza chat recente (IndexedDB)
      this.requestChatSync(conn);

      // Compatibilidade legada com 1v1
      if (!useHubStore.getState().remotePeerId) {
        useHubStore.getState().setRemoteNickname(session.nickname);
      }
    });

    conn.on('data', (data) => {
      this.handleIncomingSignalingPacket(session, data as SignalingPacket);
    });

    conn.on('close', () => {
      this.handlePeerDisconnected(session);
    });

    conn.on('error', (err) => {
      console.warn(`[WebRTC Engine] Erro no dataConn com ${remotePeerId}:`, err);
    });
  }

  private handlePeerDisconnected(session: PeerMediaSession): void {
    sounds.playLeave();
    this.teardownPeerVoiceAudio(session);

    if (session.voiceCall) {
      try { session.voiceCall.close(); } catch { /* ignore */ }
    }
    if (session.webcamCall) {
      try { session.webcamCall.close(); } catch { /* ignore */ }
    }
    if (session.screenCall) {
      try { session.screenCall.close(); } catch { /* ignore */ }
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

  /* ========================================================================= */
  /* TRATAMENTO DE PACOTES DE SINALIZAÇÃO P2P                                  */
  /* ========================================================================= */

  private handleIncomingSignalingPacket(session: PeerMediaSession, packet: SignalingPacket): void {
    if (!packet || !packet.type) return;

    switch (packet.type) {
      case 'peer_state_sync': {
        const remote = packet.state;
        session.clientId = remote.clientId;
        session.nickname = remote.nickname;

        useHubStore.getState().updateParticipant(session.peerId, {
          ...remote,
          isLocal: false,
        });

        // Se o par acabou de ser registrado, insere caso não exista ainda
        if (!useHubStore.getState().participants[session.peerId]) {
          useHubStore.getState().setParticipants({
            ...useHubStore.getState().participants,
            [session.peerId]: { ...remote, isLocal: false },
          });
        }

        // Compatibilidade legada
        useHubStore.getState().setRemoteNickname(remote.nickname);

        // Se ambos estiverem em chamada de voz e a chamada ainda não tiver chegado após 400ms:
        const localState = useHubStore.getState();
        if (localState.inVoiceCall && remote.inVoiceCall && !session.voiceCall) {
          window.setTimeout(() => {
            const currentSession = this.sessions.get(session.peerId);
            const stillInVoice = useHubStore.getState().inVoiceCall;
            if (stillInVoice && currentSession && !currentSession.voiceCall) {
              this.initiateVoiceCallWithPeer(currentSession);
            }
          }, 400);
        }

        // Se local estiver compartilhando tela e o irmão estiver em call de voz
        if (localState.isScreenSharing && this.localScreenStream && remote.inVoiceCall && !session.screenCall) {
          this.initiateScreenCallWithPeer(session);
        }
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
          if (missing.length > 0) {
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

  private handleIncomingMediaCall(call: MediaConnection): void {
    const channel = call.metadata?.channel || 'voice';
    const remotePeerId = call.peer;
    const session = this.sessions.get(remotePeerId);

    if (channel === 'voice') {
      const state = useHubStore.getState();
      if (!state.inVoiceCall) {
        // Se o usuário local NÃO está na call de voz, não envia microfone
        call.answer();
      } else {
        const localVoiceStream = this.audioPipeline?.getProcessedStream() || this.rawMicStream;
        call.answer(localVoiceStream || undefined);
      }

      if (session) {
        session.voiceCall = call;
      }

      this.patchCallSdp(call, false);

      call.on('stream', (stream) => {
        if (session) {
          this.setupPeerVoiceAudio(session, stream);
        }
        useHubStore.getState().setRemoteStream(remotePeerId, 'voice', stream);
        useHubStore.getState().setRemoteVoiceStream(stream);
      });

      call.on('close', () => {
        if (session) {
          this.teardownPeerVoiceAudio(session);
          session.voiceCall = null;
        }
        useHubStore.getState().setRemoteStream(remotePeerId, 'voice', null);
      });
    } else if (channel === 'screen') {
      call.answer(); // Atende tela sem enviar vídeo de volta
      if (session) {
        session.screenCall = call;
      }

      this.patchCallSdp(call, true);

      call.on('stream', (stream) => {
        sounds.playStreamStart();
        useHubStore.getState().setRemoteStream(remotePeerId, 'screen', stream);
        useHubStore.getState().setRemoteScreenStream(stream);
        useHubStore.getState().updateParticipant(remotePeerId, { isScreenSharing: true });
        useHubStore.getState().setTelemetry({ active: true, abrStatus: 'optimal' });

        this.startReceiverStats(call.peerConnection, stream);
      });

      call.on('close', () => {
        if (session) session.screenCall = null;
        useHubStore.getState().setRemoteStream(remotePeerId, 'screen', null);
        useHubStore.getState().setRemoteScreenStream(null);
        useHubStore.getState().updateParticipant(remotePeerId, { isScreenSharing: false });
        useHubStore.getState().setTelemetry({ active: false });
        this.stopReceiverStats();
        sounds.playStreamStop();
      });
    } else if (channel === 'webcam') {
      call.answer();
      if (session) {
        session.webcamCall = call;
      }

      call.on('stream', (stream) => {
        useHubStore.getState().setRemoteStream(remotePeerId, 'webcam', stream);
        useHubStore.getState().updateParticipant(remotePeerId, { isWebcamActive: true });
      });

      call.on('close', () => {
        if (session) session.webcamCall = null;
        useHubStore.getState().setRemoteStream(remotePeerId, 'webcam', null);
        useHubStore.getState().updateParticipant(remotePeerId, { isWebcamActive: false });
      });
    }
  }

  private initiateVoiceCallWithPeer(session: PeerMediaSession): void {
    if (!this.localPeer || session.voiceCall) return;

    const voiceStream = this.audioPipeline?.getProcessedStream() || this.rawMicStream;
    if (!voiceStream) return;

    const call = this.localPeer.call(session.peerId, voiceStream, {
      metadata: { channel: 'voice' },
    });

    session.voiceCall = call;
    this.patchCallSdp(call, false);

    call.on('stream', (stream) => {
      this.setupPeerVoiceAudio(session, stream);
      useHubStore.getState().setRemoteStream(session.peerId, 'voice', stream);
      useHubStore.getState().setRemoteVoiceStream(stream);
    });

    call.on('close', () => {
      this.teardownPeerVoiceAudio(session);
      session.voiceCall = null;
      useHubStore.getState().setRemoteStream(session.peerId, 'voice', null);
    });
  }

  private initiateScreenCallWithPeer(session: PeerMediaSession): void {
    if (!this.localPeer || !this.localScreenStream || session.screenCall) return;

    const call = this.localPeer.call(session.peerId, this.localScreenStream, {
      metadata: { channel: 'screen' },
    });

    session.screenCall = call;
    this.patchCallSdp(call, true);

    const senders = call.peerConnection.getSenders();
    const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
    if (videoSender) {
      configureVideoSender(videoSender, useHubStore.getState().videoQualityConfig.maxBitrateBps);
      this.startAbrLoop(call.peerConnection, videoSender, useHubStore.getState().videoQualityConfig);
    }
  }

  /* ========================================================================= */
  /* ÁUDIO INDIVIDUAL POR IRMÃO (0% A 200%) & SINK ID                          */
  /* ========================================================================= */

  private setupPeerVoiceAudio(session: PeerMediaSession, stream: MediaStream): void {
    this.teardownPeerVoiceAudio(session);

    try {
      // 1. WORKAROUND OFICIAL CHROMIUM (Bug #933677):
      // O Chromium só decodifica tracks remotas do WebRTC para o WebAudio se a stream bruta
      // também estiver associada a uma tag <audio> (mesmo que mutada).
      let rawKeepAliveEl = document.getElementById(`raw-keepalive-${session.peerId}`) as HTMLAudioElement | null;
      if (!rawKeepAliveEl) {
        rawKeepAliveEl = document.createElement('audio');
        rawKeepAliveEl.id = `raw-keepalive-${session.peerId}`;
        rawKeepAliveEl.style.display = 'none';
        document.body.appendChild(rawKeepAliveEl);
      }
      rawKeepAliveEl.srcObject = stream;
      rawKeepAliveEl.muted = true;
      rawKeepAliveEl.play().catch(() => {});

      // 2. Grafo WebAudio para controle de volume de 0% a 200%
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 48000 });
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();

      const state = useHubStore.getState();
      const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
      const effGain = Math.max(0, Math.min(2.0, peerVol)) * state.audioConfig.remoteStreamVolume * (state.isDeafened ? 0 : 1);
      gain.gain.setValueAtTime(effGain, ctx.currentTime);

      source.connect(gain);
      gain.connect(dest);

      // 3. Elemento <audio> final no DOM para saída no fone selecionado (setSinkId)
      let audioEl = document.getElementById(`audio-peer-${session.peerId}`) as HTMLAudioElement | null;
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = `audio-peer-${session.peerId}`;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
      }

      audioEl.autoplay = true;
      audioEl.muted = false;
      audioEl.srcObject = dest.stream;

      const outputId = state.audioConfig.outputDeviceId;
      if (outputId && outputId !== 'default' && 'setSinkId' in audioEl) {
        (audioEl as unknown as { setSinkId: (id: string) => Promise<void> })
          .setSinkId(outputId)
          .catch((e) => console.warn('[WebRTC Audio] setSinkId falhou:', e));
      }

      audioEl.play().catch((e) => console.warn('[WebRTC Audio] Falha ao iniciar play:', e));

      session.voiceAudioCtx = ctx;
      session.voiceSourceNode = source;
      session.voiceGainNode = gain;
      session.voiceDestNode = dest;
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
    if (session.voiceGainNode) {
      try { session.voiceGainNode.disconnect(); } catch { /* ignore */ }
      session.voiceGainNode = null;
    }
    const rawKeepAliveEl = document.getElementById(`raw-keepalive-${session.peerId}`) as HTMLAudioElement | null;
    if (rawKeepAliveEl) {
      rawKeepAliveEl.pause();
      rawKeepAliveEl.srcObject = null;
      rawKeepAliveEl.remove();
    }
    if (session.voiceAudioEl) {
      session.voiceAudioEl.pause();
      session.voiceAudioEl.srcObject = null;
      session.voiceAudioEl.remove();
      session.voiceAudioEl = null;
    }
    if (session.voiceAudioCtx && session.voiceAudioCtx.state !== 'closed') {
      session.voiceAudioCtx.close().catch(() => {});
      session.voiceAudioCtx = null;
    }
  }

  public setPeerVolume(clientId: string, volume: number): void {
    useHubStore.getState().setPeerVolume(clientId, volume);
    const clamped = Math.max(0, Math.min(2.0, volume));
    const state = useHubStore.getState();

    for (const session of this.sessions.values()) {
      if (session.clientId === clientId && session.voiceGainNode && session.voiceAudioCtx) {
        const effGain = clamped * state.audioConfig.remoteStreamVolume * (state.isDeafened ? 0 : 1);
        session.voiceGainNode.gain.setValueAtTime(effGain, session.voiceAudioCtx.currentTime);
      }
    }
  }

  private startRemoteVoiceDetection(session: PeerMediaSession, stream: MediaStream): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      session.remoteSpeakingInterval = window.setInterval(() => {
        if (!stream.active || stream.getAudioTracks().length === 0) {
          if (session.remoteSpeakingInterval !== null) {
            clearInterval(session.remoteSpeakingInterval);
            session.remoteSpeakingInterval = null;
          }
          ctx.close().catch(() => {});
          return;
        }

        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length);
        const db = rms > 0.0001 ? 20 * Math.log10(rms) : -100;
        const isSpeaking = db > -42;

        useHubStore.getState().updateParticipant(session.peerId, { isSpeaking });
      }, 50);
    } catch {
      /* ignore */
    }
  }

  /* ========================================================================= */
  /* ENTRAR E SAIR DA CHAMADA DE VOZ (INDEPENDENTE DO CHAT)                    */
  /* ========================================================================= */

  public async joinVoiceCall(): Promise<void> {
    const state = useHubStore.getState();
    if (state.inVoiceCall) return;

    await this.setupLocalMicrophone();
    sounds.playJoin();

    useHubStore.getState().setInVoiceCall(true);
    if (this.localPeer) {
      useHubStore.getState().updateParticipant(this.localPeer.id, { inVoiceCall: true });
    }

    // Notifica todos os irmãos da sala via peer_state_sync
    this.broadcastLocalState();

    // Inicia chamadas de voz com todos os irmãos que já estão em chamada
    for (const session of this.sessions.values()) {
      const p = useHubStore.getState().participants[session.peerId];
      if (p && p.inVoiceCall && !session.voiceCall) {
        this.initiateVoiceCallWithPeer(session);
      }
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
      if (session.voiceCall) {
        try { session.voiceCall.close(); } catch { /* ignore */ }
        session.voiceCall = null;
      }
      this.teardownPeerVoiceAudio(session);
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
      useHubStore.getState().updateParticipant(this.localPeer.id, { isMuted: nextMuted });
    }
    this.broadcastLocalState();
  }

  public toggleDeafen(deafened?: boolean): void {
    const state = useHubStore.getState();
    const nextDeafened = deafened !== undefined ? deafened : !state.isDeafened;
    useHubStore.getState().setDeafened(nextDeafened);

    // Atualiza ganho de todas as sessões para silenciar tudo se deafened
    for (const session of this.sessions.values()) {
      if (session.voiceGainNode && session.voiceAudioCtx) {
        const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
        const effGain = nextDeafened ? 0 : Math.max(0, Math.min(2.0, peerVol)) * state.audioConfig.remoteStreamVolume;
        session.voiceGainNode.gain.setValueAtTime(effGain, session.voiceAudioCtx.currentTime);
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
      }

      if (this.localPeer) {
        useHubStore.getState().updateParticipant(this.localPeer.id, { isWebcamActive: false });
      }
      this.broadcastLocalState();
    } else {
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
          const p = useHubStore.getState().participants[session.peerId];
          if (p?.inVoiceCall && this.localPeer) {
            const call = this.localPeer.call(session.peerId, stream, {
              metadata: { channel: 'webcam' },
            });
            session.webcamCall = call;
          }
        }
      } catch (err) {
        console.error('[WebRTC Engine] Erro ao acessar webcam:', err);
      }
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
        await videoTrack.applyConstraints({
          width: { ideal: qualityConfig.width, max: qualityConfig.width },
          height: { ideal: qualityConfig.height, max: qualityConfig.height },
          frameRate: { ideal: qualityConfig.fps, max: qualityConfig.fps },
        });

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
      for (const session of this.sessions.values()) {
        const p = useHubStore.getState().participants[session.peerId];
        if (p?.inVoiceCall) {
          this.initiateScreenCallWithPeer(session);
        }
      }
    } catch (err) {
      console.error('[WebRTC Engine] Erro ao iniciar compartilhamento de tela:', err);
      this.stopScreenShare();
    }
  }

  public stopScreenShare(): void {
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

  public async setupLocalMicrophone(): Promise<void> {
    try {
      if (this.rawMicStream) {
        this.rawMicStream.getTracks().forEach((t) => t.stop());
      }
      if (this.audioPipeline) {
        this.audioPipeline.destroy();
      }

      const audioConfig = useHubStore.getState().audioConfig;
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: audioConfig.inputDeviceId !== 'default' ? { exact: audioConfig.inputDeviceId } : undefined,
          echoCancellation: audioConfig.echoCancellation,
          autoGainControl: audioConfig.autoGainControl,
          noiseSuppression: false, // Krisp-like AudioWorklet dedicado cuida disso
          sampleRate: 48000,
          channelCount: 1,
        },
      };

      this.rawMicStream = await navigator.mediaDevices.getUserMedia(constraints);

      this.audioPipeline = new VoiceAudioPipeline(this.rawMicStream, audioConfig, (isSpeaking, level) => {
        useHubStore.getState().setIsLocalSpeaking(isSpeaking, level);
        if (this.localPeer) {
          useHubStore.getState().updateParticipant(this.localPeer.id, { isSpeaking });
          this.broadcast({
            type: 'speaking',
            peerId: this.localPeer.id,
            isSpeaking,
          });
        }
      });

      // Aplica estado de mute inicial no pipeline
      this.audioPipeline.setMicMuted(useHubStore.getState().isMuted);

      const processed = await this.audioPipeline.initialize();
      useHubStore.getState().setLocalVoiceStream(processed);

      // Se já houver chamadas de voz ativas, substitui a track de áudio no RTCRtpSender sem derrubar a call
      const newAudioTrack = processed.getAudioTracks()[0];
      if (newAudioTrack) {
        for (const session of this.sessions.values()) {
          const pc = session.voiceCall?.peerConnection;
          if (pc) {
            const audioSender = pc.getSenders().find((s) => s.track?.kind === 'audio');
            if (audioSender) {
              audioSender.replaceTrack(newAudioTrack).catch(() => {});
            }
          }
        }
      }

      // Registra hooks no soundboardEngine para que os clipes injetem no WebRTC
      soundboardEngine.registerPipelineHooks(
        () => this.audioPipeline?.getAudioContext() ?? null,
        () => this.audioPipeline?.getSoundboardInputNode() ?? null
      );
    } catch (err) {
      console.error('[WebRTC Engine] Erro ao configurar microfone:', err);
    }
  }

  public updateAudioSettings(partial: Partial<AudioProcessingConfig>): void {
    useHubStore.getState().updateAudioConfig(partial);
    if (this.audioPipeline) {
      this.audioPipeline.updateConfig(partial);
    }

    // Se atualizou remoteStreamVolume ou outputDeviceId, aplica em todas as sessões
    const state = useHubStore.getState();
    for (const session of this.sessions.values()) {
      if (session.voiceGainNode && session.voiceAudioCtx && typeof partial.remoteStreamVolume === 'number') {
        const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
        const effGain = Math.max(0, Math.min(2.0, peerVol)) * partial.remoteStreamVolume * (state.isDeafened ? 0 : 1);
        session.voiceGainNode.gain.setValueAtTime(effGain, session.voiceAudioCtx.currentTime);
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
            const packetsLost = report.packetsLost || 0;
            const packetsReceived = report.packetsReceived || 0;
            const total = packetsLost + packetsReceived;
            if (total > 0) {
              packetsLostPercent = Math.max(0, Number(((packetsLost / total) * 100).toFixed(1)));
            }
          }
        });

        let abrStatus: 'optimal' | 'throttled' | 'recovering' = useHubStore.getState().telemetry.abrStatus;

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
    if (this.beaconHealTimeout !== null) {
      clearTimeout(this.beaconHealTimeout);
      this.beaconHealTimeout = null;
    }

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
      this.teardownPeerVoiceAudio(session);
      if (session.voiceCall) {
        try { session.voiceCall.close(); } catch { /* ignore */ }
      }
      if (session.webcamCall) {
        try { session.webcamCall.close(); } catch { /* ignore */ }
      }
      if (session.screenCall) {
        try { session.screenCall.close(); } catch { /* ignore */ }
      }
      if (session.dataConn) {
        try { session.dataConn.close(); } catch { /* ignore */ }
      }
    }
    this.sessions.clear();

    if (this.beaconPeer) {
      try { this.beaconPeer.destroy(); } catch { /* ignore */ }
      this.beaconPeer = null;
      this.isBeaconOwner = false;
    }

    if (this.localPeer) {
      try { this.localPeer.destroy(); } catch { /* ignore */ }
      this.localPeer = null;
    }

    sounds.playLeave();
    useHubStore.getState().resetSession();
  }
}

export const webrtcEngine = new WebRTCEngine();
