import { notifyNative } from "./nativeNotifications";
import type { StreamTelemetry } from "../types/cbshub";
import { useVoicePreferences } from "./voicePreferences";
import {
  callEvent,
  beginCallDiagnostics,
  endCallDiagnostics,
} from "./callDiagnostics";
import { peerState } from "./signalingValidation";
import { soundActivity } from "../chat/activities";
import { chatLedger } from "../chat/ledger";
import {
  validateMessage,
  validateOperation,
  type ChatOperation,
} from "../chat/model";
import { publicProfile, validatePublicProfile } from "../profiles/model";
import { readOwnProfile, isBlocked } from "../profiles/repository";
import Peer, { type MediaConnection, type DataConnection } from "peerjs";
import { useHubStore } from "../store/useHubStore";
import { sounds } from "./sounds";
import { VoiceAudioPipeline } from "./audioPipeline";
import { soundboardEngine } from "./soundboardEngine";
import { storageDb } from "./storageDb";
import { enhanceOpusSdp, configureVideoSender } from "./sdpMunger";
import type {
  VideoQualityConfig,
  AudioProcessingConfig,
  Participant,
  ChatMessage,
  SoundboardClip,
  SignalingPacket,
} from "../types/cbshub";

import { useMediaState, mediaError } from "./mediaState";

const MAX_ROOM_PEERS = 6;

function buildPeerIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ];

  const username = import.meta.env.VITE_METERED_USERNAME;
  const credential = import.meta.env.VITE_METERED_CREDENTIAL;
  const turnUrl =
    import.meta.env.VITE_METERED_TURN_URL ||
    "turn:standard.relay.metered.ca:80";
  const turnsUrl =
    import.meta.env.VITE_METERED_TURNS_URL ||
    "turns:standard.relay.metered.ca:443?transport=tcp";

  if (username && credential) {
    servers.push(
      { urls: turnUrl, username, credential },
      { urls: turnsUrl, username, credential },
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
  outgoingScreen?: MediaConnection | null;
  outgoingWebcam?: MediaConnection | null;
  qualityTimer?: number;
  mediaFlowVerified?: boolean;
  recoveryRxBase?: number;
  recoveryTxBase?: number;
  recoveryMediaAt?: number;
  voiceRetryTimer?: number;
  voiceRetryAttempts?: number;
  dataGraceTimer?: number;
  dataConnectTimer?: number;
  dataConnecting?: boolean;

  // Reprodução direta (0–100%); WebAudio separado apenas para detecção de fala.
  voiceAudioCtx: AudioContext | null;
  voiceSourceNode: MediaStreamAudioSourceNode | null;
  voiceGainNode: GainNode | null;
  voiceDestNode: MediaStreamAudioDestinationNode | null;
  voiceAudioEl: HTMLAudioElement | null;
  remoteSpeakingInterval: number | null;
}

class WebRTCEngine {
  private chatClock = 0;
  private roomGeneration = 0;
  private micGeneration = 0;
  /* Recuperação do microfone: tentativas com espera crescente, limitadas e
     canceladas ao sair da voz/sala ou quando o usuário troca o microfone. */
  private micRecoveryDelaysMs = [0, 1000, 2500, 5000, 10000, 20000];
  private micRecoveryAttempt = 0;
  private micRecoveryTimer: number | null = null;
  private lastMicRecoveredAt = -Infinity;
  private micMuteWatchdog: number | null = null;
  private micMuteWatchdogMs = 2500;
  private cameraGeneration = 0;
  private screenGeneration = 0;
  private joiningVoice = false;
  private recoveryTimer: number | null = null;
  private recoveryAttempts = 0;
  private recoveryCancelled = false;

  private localPeer: Peer | null = null;
  private beaconPeer: Peer | null = null;
  private isBeaconOwner = false;
  private beaconHealTimeout: number | null = null;
  private beaconHealthTimer: number | null = null;
  private currentRoomSlug = "";

  // Falso-positivo de reconexão: separa sinalização de presença P2P ativa.
  private reconnectCancelled = false;
  private wasInVoiceCall = false;
  private onlineWatcher: number | null = null;

  // Heartbeat P2P para detecção de queda real em menos de 12 segundos.
  private heartbeatInterval: number | null = null;

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
    const slug = input.toLowerCase().replace(/[^a-z0-9-]/g, "");
    return slug || "cbs-irmandade";
  }

  private generateShortId(clientId: string): string {
    const clean = clientId.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return clean.substring(0, 6) || Math.random().toString(36).substring(2, 8);
  }

  /* ========================================================================= */
  /* CONEXÃO NA SALA (TEXTO + PRESENÇA + BEACON MESH)                          */
  /* ========================================================================= */

  public async joinRoom(
    roomInput: string,
    autoJoinVoice = false,
  ): Promise<void> {
    if (
      this.sanitizeSlug(roomInput) === this.currentRoomSlug &&
      this.localPeer &&
      !this.localPeer.destroyed
    )
      return;
    localStorage.removeItem("cbshub-room-removed-active");
    this.leaveRoom();
    const generation = this.roomGeneration;

    const slug = this.sanitizeSlug(roomInput);
    this.currentRoomSlug = slug;
    useHubStore.getState().setMessages([]);
    useHubStore.getState().setRoomId(slug);
    useHubStore.getState().setStatusText("Conectando à sala...");

    // Carrega mensagens salvas localmente no IndexedDB
    try {
      const savedMessages = await chatLedger.refresh(slug);
      if (this.currentRoomSlug !== slug || generation !== this.roomGeneration)
        return;
      useHubStore.getState().addMessageBatch(savedMessages);
    } catch (err) {
      console.warn("[WebRTC Engine] Erro ao carregar histórico local:", err);
    }

    // Carrega efeitos do Soundboard
    try {
      await soundboardEngine.loadAllClips();
    } catch {
      /* ignore */
    }

    if (this.currentRoomSlug !== slug || generation !== this.roomGeneration)
      return;
    this.openRoomPeer(slug, autoJoinVoice);
  }

  private openRoomPeer(slug: string, autoJoinVoice: boolean): void {
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
      inVoiceCall: state.inVoiceCall,
      isMuted: state.isMuted,
      isDeafened: state.isDeafened,
      isSpeaking: false,
      isWebcamActive: state.isWebcamActive,
      isScreenSharing: state.isScreenSharing,
      activeSoundEffect: null,
    };

    useHubStore.getState().setParticipants({ [localPeerId]: localParticipant });

    // Inicializa localPeer
    useMediaState.setState({ signaling: "connecting" });
    this.signalingPendingAt = Date.now();
    this.localPeer = this.createSignalingPeer(localPeerId);

    const peer = this.localPeer;
    let firstOpen = true;
    this.setupLocalPeerListeners();
    this.localPeer.on("open", (id) => {
      if (this.localPeer !== peer) return;
      callEvent("signaling_open");
      this.signalingPendingAt = 0;
      useMediaState.setState({
        signaling: "online",
      });
      useHubStore
        .getState()
        .setConnectionStatus(
          false,
          true,
          id,
          null,
          "Sinalização aberta; verificando participantes...",
        );
      sounds.playJoin();

      // Configura escuta de conexões de dados e chamadas de mídia entrantes
      // Tenta assumir ou consultar o Beacon da sala
      this.ensureDiscovery();
      this.refreshRecoveryState();

      const shouldJoinVoice = autoJoinVoice && firstOpen;
      firstOpen = false;
      if (shouldJoinVoice && !useHubStore.getState().inVoiceCall) {
        this.joinVoiceCall().catch((e) =>
          console.warn("[WebRTC Engine] Auto-join voice falhou:", e),
        );
      }
    });

    this.localPeer.on("error", (err: { type?: string }) => {
      if (this.localPeer !== peer) return;
      callEvent("signaling_error", {
        reason:
          err.type === "network" ||
          err.type === "socket-error" ||
          err.type === "server-error"
            ? err.type
            : "unknown",
      });
      console.error("[WebRTC Engine] Erro no localPeer:", err);
      if (
        err.type === "network" ||
        err.type === "socket-error" ||
        err.type === "server-error"
      )
        this.scheduleRecovery();
      useHubStore
        .getState()
        .setStatusText(`Aviso de rede: ${err.type || "desconhecido"}`);
    });

    this.localPeer.on("disconnected", () => {
      if (this.localPeer !== peer) return;
      useMediaState.setState({ signaling: "offline" });
      this.discoveryConfirmed = false;
      callEvent("signaling_disconnected");
      // Falso-positivo: se já há um DataConnection ou MediaConnection ativo com
      // outro participante da sala, não exiba o banner de reconexão na UI. Apenas
      // tente o reconnect() silenciosamente em background.
      const hasActiveP2P = [...this.sessions.values()].some(
        (s) => s.dataConn.open || s.voiceCall || s.webcamCall || s.screenCall,
      );
      if (!hasActiveP2P) {
        useHubStore.setState({ isConnected: false });
        this.scheduleRecovery();
      } else {
        try {
          this.localPeer?.reconnect();
        } catch {
          /* ignorado: o scheduleRecovery padrão cuidará se necessário */
        }
      }
    });

    this.localPeer.on("close", () => {
      // Fechamento inesperado recupera sinalização; leaveRoom invalida a identidade antes de destroy.
      if (this.localPeer === peer && this.currentRoomSlug) {
        useMediaState.setState({ signaling: "offline" });
        useHubStore.setState({ isConnected: false });
        callEvent("signaling_closed", { reason: "peer_closed" });
        this.localPeer = null;
        this.scheduleRecovery();
      }
    });
  }

  private createSignalingPeer(id: string): Peer {
    return new Peer(id, PEER_CONFIG);
  }
  private recoveryEpoch = 0;
  private recoveryActive = false;
  private discoveryConfirmed = false;
  private beaconPendingAt = 0;
  private waitingForMedia = new Set<string>();
  private directoryConn: DataConnection | null = null;
  private directoryTimer: number | null = null;
  private beginRecovery() {
    if (this.recoveryActive) return;
    this.recoveryActive = true;
    this.recoveryEpoch++;
    const state = useHubStore.getState();
    if (state.inVoiceCall)
      for (const p of Object.values(state.participants))
        if (!p.isLocal && p.inVoiceCall) {
          this.waitingForMedia.add(p.clientId);
          const session = this.sessions.get(p.peerId);
          if (session) {
            session.mediaFlowVerified = false;
            session.recoveryRxBase = undefined;
            session.recoveryTxBase = undefined;
            session.recoveryMediaAt = undefined;
          }
          useMediaState.setState((s) => ({
            quality: {
              ...s.quality,
              ...(s.quality[p.peerId]
                ? { [p.peerId]: { ...s.quality[p.peerId], flowing: false } }
                : {}),
            },
          }));
        }
  }
  private refreshRecoveryState(): boolean {
    const signaling =
      !!this.localPeer?.open &&
      !this.localPeer.destroyed &&
      !this.localPeer.disconnected &&
      navigator.onLine;
    const pendingData = [...this.sessions.values()].some(
      (s) => !s.dataConn.open,
    );
    if (
      signaling &&
      this.discoveryConfirmed &&
      !pendingData &&
      !this.recoveryCancelled
    ) {
      useHubStore.setState({ isConnected: true });
      const hasOpenData = [...this.sessions.values()].some((s) => s.dataConn.open);
      if (hasOpenData && !this.recoveryCancelled) this.startHeartbeat();
    } else {
      this.stopHeartbeat();
    }
    if (!this.recoveryActive || this.recoveryCancelled) return false;
    const phase = !signaling
      ? "signaling"
      : !this.discoveryConfirmed || pendingData
        ? "discovery"
        : this.waitingForMedia.size
          ? "media"
          : "idle";
    if (phase === "media")
      for (const session of this.sessions.values())
        if (
          this.waitingForMedia.has(session.clientId) &&
          session.recoveryMediaAt === undefined
        )
          session.recoveryMediaAt = Date.now();
    if (phase === "idle") {
      this.recoveryActive = false;
      this.recoveryAttempts = 0;
      if (this.recoveryTimer !== null) clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
      useMediaState.setState({
        reconnecting: false,
        recoveryPhase: "idle",
        recoveryMissingMedia: 0,
        recoveryAttempt: 0,
        signaling: "online",
        error: null,
      });
      useHubStore
        .getState()
        .setStatusText("Sinalização e sessões recuperadas.");
      return true;
    }
    if (this.recoveryAttempts >= 8) {
      useMediaState.setState({
        reconnecting: false,
        recoveryPhase: "failed",
        recoveryMissingMedia: this.waitingForMedia.size,
      });
      return false;
    }
    useMediaState.setState({
      reconnecting: true,
      recoveryPhase: phase,
      recoveryMissingMedia: this.waitingForMedia.size,
    });
    return false;
  }
  private closeDirectory() {
    const conn = this.directoryConn;
    this.directoryConn = null;
    if (this.directoryTimer !== null) clearTimeout(this.directoryTimer);
    this.directoryTimer = null;
    try {
      conn?.close();
    } catch {}
  }
  private ensureDiscovery() {
    if (!this.localPeer?.open || this.recoveryCancelled) return;
    let beacon = this.beaconPeer;
    if (
      beacon &&
      !beacon.open &&
      this.beaconPendingAt > 0 &&
      Date.now() - this.beaconPendingAt > 12000
    ) {
      this.beaconPeer = null;
      this.isBeaconOwner = false;
      try {
        beacon.destroy();
      } catch {}
      beacon = null;
    }
    if (beacon && !beacon.destroyed && beacon.disconnected) {
      this.beaconPendingAt ||= Date.now();
      try {
        beacon.reconnect();
      } catch {
        this.beaconPeer = null;
        this.isBeaconOwner = false;
        try {
          beacon.destroy();
        } catch {}
      }
    }
    if (!this.beaconPeer || this.beaconPeer.destroyed)
      this.attemptClaimBeacon(this.currentRoomSlug);
    else this.queryBeaconDirectory(`cbshub-v2-${this.currentRoomSlug}-beacon`);
  }

  private signalingPendingAt = 0;

  private scheduleRecovery(): void {
    if (
      !this.currentRoomSlug ||
      this.recoveryTimer !== null ||
      this.recoveryCancelled
    )
      return;
    this.beginRecovery();
    if (this.recoveryAttempts >= 8) {
      callEvent("retry_exhausted", {
        attempt: this.recoveryAttempts,
        reason: "retry_limit",
      });
      useMediaState.setState({
        reconnecting: false,
        recoveryPhase: "failed",
        recoveryMissingMedia: this.waitingForMedia.size,
        signaling: this.localPeer?.open ? "online" : "failed",
        error: this.waitingForMedia.size
          ? "Não foi possível confirmar a recuperação de mídia. Verifique a conexão e tente novamente."
          : "Não foi possível recuperar sinalização e participantes. Tente novamente.",
      });
      return;
    }
    const attempt = ++this.recoveryAttempts;
    const delayMs = Math.round(
      Math.min(15000, 1000 * 2 ** Math.min(attempt - 1, 4)) *
        (0.8 + Math.random() * 0.4),
    );
    callEvent("retry_scheduled", { attempt, delayMs });
    if (this.refreshRecoveryState()) return;
    useMediaState.setState({ reconnecting: true, recoveryAttempt: attempt });
    useHubStore
      .getState()
      .setStatusText("Reconectando sinalização e participantes...");
    const generation = this.roomGeneration;
    this.recoveryTimer = window.setTimeout(() => {
      this.recoveryTimer = null;
      if (
        generation !== this.roomGeneration ||
        this.recoveryCancelled ||
        !this.currentRoomSlug
      )
        return;
      if (navigator.onLine) {
        const stalled =
          this.localPeer &&
          !this.localPeer.open &&
          !this.localPeer.disconnected &&
          this.signalingPendingAt > 0 &&
          Date.now() - this.signalingPendingAt > 12000;
        if (!this.localPeer || this.localPeer.destroyed || stalled) {
          const obsolete = this.localPeer;
          this.localPeer = null;
          try {
            obsolete?.destroy();
          } catch {}
          const old = [...this.sessions.values()];
          this.sessions.clear();
          for (const session of old) {
            if (session.dataConnectTimer)
              clearTimeout(session.dataConnectTimer);
            this.closeBlockedMedia(session);
            try {
              session.dataConn.close();
            } catch {}
          }
          this.closeDirectory();
          this.discoveryConfirmed = false;
          const beacon = this.beaconPeer;
          this.beaconPeer = null;
          this.isBeaconOwner = false;
          try {
            beacon?.destroy();
          } catch {}
          try {
            this.openRoomPeer(this.currentRoomSlug, false);
          } catch {
            callEvent("signaling_error", { reason: "unknown" });
          }
        } else if (this.localPeer.disconnected) {
          try {
            this.signalingPendingAt = Date.now();
            useMediaState.setState({ signaling: "connecting" });
            this.localPeer.reconnect();
          } catch {
            callEvent("signaling_error", { reason: "unknown" });
          }
        } else if (this.localPeer.open) {
          this.signalingPendingAt = 0;
          this.ensureDiscovery();
          let pending = false;
          for (const session of this.sessions.values())
            if (!session.dataConn.open) {
              pending = true;
              this.connectToPeer(session.peerId, session.clientId);
            }
          this.broadcastLocalState();
          if (this.refreshRecoveryState()) return;
        }
      }
      this.scheduleRecovery();
    }, delayMs);
  }

  public retryConnection(): void {
    this.recoveryCancelled = false;
    this.recoveryAttempts = 0;
    if (this.recoveryTimer !== null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    useMediaState.setState({ error: null });
    // Se o localPeer estiver travado/desconectado, destrua-o completamente e
    // execute uma nova conexão limpa mantendo o roomId atual e o estado de voz.
    if (
      this.localPeer &&
      (this.localPeer.destroyed || this.localPeer.disconnected || !this.localPeer.open)
    ) {
      const obsolete = this.localPeer;
      this.localPeer = null;
      try {
        obsolete.destroy();
      } catch {}
    }
    if (!this.localPeer && this.currentRoomSlug) {
      const autoJoin = useHubStore.getState().inVoiceCall;
      try {
        this.openRoomPeer(this.currentRoomSlug, autoJoin);
      } catch {
        callEvent("signaling_error", { reason: "unknown" });
      }
    }
    for (const session of this.sessions.values()) {
      session.voiceRetryAttempts = 0;
      if (useHubStore.getState().inVoiceCall && !session.voiceCall)
        this.scheduleVoiceRetry(session);
    }
    this.scheduleRecovery();
  }

  public notifyNetwork(online: boolean): void {
    callEvent(online ? "network_online" : "network_offline");
    if (!online) {
      this.discoveryConfirmed = false;
      this.closeDirectory();
      useHubStore.setState({ isConnected: false });
      useMediaState.setState({ signaling: "offline" });
    }
    if (online && !this.recoveryCancelled) {
      this.retryConnection();
      return;
    }
    this.scheduleRecovery();
  }

  public cancelRecovery(): void {
    this.recoveryCancelled = true;
    this.recoveryActive = false;
    this.waitingForMedia.clear();
    this.closeDirectory();
    this.stopHeartbeat();
    useMediaState.setState({ recoveryPhase: "idle", recoveryMissingMedia: 0 });
    if (this.recoveryTimer !== null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    for (const session of this.sessions.values()) {
      if (session.voiceRetryTimer) clearTimeout(session.voiceRetryTimer);
      session.voiceRetryTimer = undefined;
    }
    useHubStore.getState().setStatusText("");
    useMediaState.setState({
      reconnecting: false,
      error: null,
    });
    callEvent("retry_cancelled", { reason: "manual_leave" });
  }

  private scheduleVoiceRetry(session: PeerMediaSession): void {
    if (
      this.recoveryCancelled ||
      (this.recoveryActive && this.recoveryAttempts >= 8) ||
      session.voiceRetryTimer ||
      this.sessions.get(session.peerId) !== session ||
      !this.canCallSession(session)
    )
      return;
    const attempt = (session.voiceRetryAttempts || 0) + 1;
    if (attempt > 6) {
      session.voiceRetryAttempts = 7;
      callEvent(
        "retry_exhausted",
        { attempt: 6, reason: "retry_limit" },
        session.peerId,
      );
      useMediaState.setState({
        error:
          "Não foi possível recuperar uma conexão de voz. Use Tentar novamente.",
      });
      return;
    }
    session.voiceRetryAttempts = attempt;
    const base = (this.localPeer?.id || "") < session.peerId ? 500 : 1500;
    const delayMs = Math.round(
      Math.min(15000, base * 2 ** (attempt - 1)) * (0.8 + Math.random() * 0.4),
    );
    callEvent("retry_scheduled", { attempt, delayMs }, session.peerId);
    const generation = this.roomGeneration;
    session.voiceRetryTimer = window.setTimeout(() => {
      session.voiceRetryTimer = undefined;
      if (
        generation === this.roomGeneration &&
        !this.recoveryCancelled &&
        this.sessions.get(session.peerId) === session &&
        !session.voiceCall &&
        this.canCallSession(session)
      )
        this.initiateVoiceCallWithPeer(session);
    }, delayMs);
  }

  private setupLocalPeerListeners(): void {
    if (!this.localPeer) return;

    // Conexões de dados entrantes (Chat, Presença, Sincronização)
    this.localPeer.on("connection", (conn) => {
      this.handleIncomingDataConnection(conn);
    });

    // Chamadas de mídia entrantes (Voz, Webcam, Compartilhamento de Tela)
    this.localPeer.on("call", (call) => {
      this.handleIncomingMediaCall(call);
    });
  }

  /* ========================================================================= */
  /* BEACON DE DESCOBERTA E AUTO-HEAL ANTI-QUEDA                               */
  /* ========================================================================= */

  private attemptClaimBeacon(slug: string): void {
    if (!slug || this.recoveryCancelled || !this.localPeer?.open) return;
    if (this.beaconPeer && !this.beaconPeer.destroyed) return;
    const generation = this.roomGeneration,
      beaconId = `cbshub-v2-${slug}-beacon`;
    try {
      const peer = this.createSignalingPeer(beaconId);
      this.beaconPeer = peer;
      this.beaconPendingAt = Date.now();
      const current = () =>
        generation === this.roomGeneration &&
        this.beaconPeer === peer &&
        slug === this.currentRoomSlug;
      peer.on("connection", (conn) => {
        if (current()) this.handleBeaconDirectoryConnection(conn);
        else conn.close();
      });
      peer.on("open", () => {
        if (!current()) return;
        this.isBeaconOwner = true;
        this.beaconPendingAt = 0;
        if (this.recoveryActive) this.queryBeaconDirectory(beaconId);
        else this.discoveryConfirmed = true;
        this.refreshRecoveryState();
      });
      peer.on("disconnected", () => {
        if (!current()) return;
        this.beaconPendingAt = Date.now();
        this.discoveryConfirmed = false;
        this.scheduleRecovery();
      });
      peer.on("close", () => {
        if (!current()) return;
        this.beaconPeer = null;
        this.isBeaconOwner = false;
        this.discoveryConfirmed = false;
        this.scheduleRecovery();
      });
      peer.on("error", (error: { type?: string }) => {
        if (!current()) return;
        if (error.type === "unavailable-id") {
          this.beaconPeer = null;
          this.isBeaconOwner = false;
          try {
            peer.destroy();
          } catch {}
          this.queryBeaconDirectory(beaconId);
          // Health check: se o Beacon existente não responder ao directory_request
          // em 2.5s (socket zumbi), tente assumir o Beacon novamente com backoff curto.
          this.scheduleBeaconHealthCheck(beaconId);
        } else {
          this.discoveryConfirmed = false;
          this.scheduleRecovery();
        }
      });
    } catch {
      this.discoveryConfirmed = false;
      this.scheduleRecovery();
    }
  }

  /**
   * Responde a novos membros que conectam ao Beacon para pedir a lista de participantes
   */
  private handleBeaconDirectoryConnection(conn: DataConnection): void {
    const generation = this.roomGeneration;
    conn.on("data", (data) => {
      if (generation !== this.roomGeneration) return;
      const packet = data as SignalingPacket;
      if (packet && packet.type === "directory_request") {
        const state = useHubStore.getState();
        // Coleta participantes conhecidos (limite de 6)
        const knownPeers: Array<Omit<Participant, "isLocal">> = Object.values(
          state.participants,
        )
          .map((p) => {
            const { isLocal, profile: _profile, ...rest } = p;
            return rest;
          })
          .slice(0, MAX_ROOM_PEERS);

        // Responde com o diretório completo
        try {
          conn.send({
            type: "directory_response",
            peers: knownPeers,
          } as SignalingPacket);
        } catch (err) {
          console.warn(
            "[WebRTC Beacon] Falha ao enviar directory_response:",
            err,
          );
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
    if (
      !this.localPeer?.open ||
      this.localPeer.destroyed ||
      this.directoryConn ||
      this.recoveryCancelled
    )
      return;
    const generation = this.roomGeneration,
      peer = this.localPeer;
    let conn: DataConnection;
    try {
      conn = peer.connect(beaconId, { reliable: true });
    } catch {
      this.scheduleRecovery();
      return;
    }
    this.directoryConn = conn;
    const current = () =>
      this.directoryConn === conn &&
      this.localPeer === peer &&
      generation === this.roomGeneration &&
      !this.recoveryCancelled;
    const failed = () => {
      if (!current()) return;
      this.discoveryConfirmed = false;
      this.closeDirectory();
      this.scheduleBeaconElection();
      this.scheduleRecovery();
    };
    this.directoryTimer = window.setTimeout(failed, 8000);
    conn.on("open", () => {
      if (!current()) return;
      const state = useHubStore.getState(),
        local = Object.values(state.participants).find((p) => p.isLocal);
      if (!local) return;
      const { isLocal, profile, ...info } = local;
      try {
        conn.send({
          type: "directory_request",
          peerInfo: info,
        } as SignalingPacket);
      } catch {
        failed();
      }
    });
    conn.on("data", (data) => {
      if (!current()) return;
      const packet = data as SignalingPacket;
      if (packet?.type !== "directory_response" || !Array.isArray(packet.peers))
        return;
      const peers = packet.peers
        .slice(0, MAX_ROOM_PEERS)
        .filter(
          (p) =>
            p &&
            typeof p.peerId === "string" &&
            p.peerId.startsWith(`cbshub-v2-${this.currentRoomSlug}-p-`) &&
            p.peerId.length <= 180 &&
            typeof p.clientId === "string" &&
            p.clientId.length <= 128,
        );
      this.discoveryConfirmed = true;
      for (const p of peers)
        if (p.peerId !== peer.id) this.connectToPeer(p.peerId, p.clientId);
      this.closeDirectory();
      this.refreshRecoveryState();
    });
    conn.on("error", failed);
    conn.on("close", () => {
      if (current()) failed();
    });
  }

  /**
   * Eleição determinística de novo Beacon baseada em ordem alfabética dos clientIds
   */
  private scheduleBeaconElection(): void {
    if (
      (this.isBeaconOwner &&
        this.beaconPeer?.open &&
        !this.beaconPeer.disconnected &&
        !this.beaconPeer.destroyed) ||
      this.beaconHealTimeout !== null ||
      this.recoveryCancelled ||
      this.recoveryAttempts >= 8
    )
      return;

    const state = useHubStore.getState();
    const allParticipants = Object.values(state.participants);
    const sortedClientIds = allParticipants.map((p) => p.clientId).sort();
    const myIndex = sortedClientIds.indexOf(state.clientId);

    if (myIndex === -1) return;

    // Backoff ordenado: 0 * 400ms, 1 * 400ms, etc.
    const delay = myIndex * 400 + 150;

    this.beaconHealTimeout = window.setTimeout(() => {
      this.beaconHealTimeout = null;
      if (this.currentRoomSlug && !this.recoveryCancelled) {
        if (this.beaconPeer?.disconnected) {
          try {
            this.beaconPeer.reconnect();
          } catch {}
        } else this.attemptClaimBeacon(this.currentRoomSlug);
      }
    }, delay);
  }

  /** Inicia o heartbeat leve a cada 10s entre pares conectados para detectar
   *  queda real de P2P em menos de 12 segundos, em vez de esperar o timeout de 45s do WebRTC. */
  private startHeartbeat(): void {
    if (this.heartbeatInterval !== null || this.recoveryCancelled) return;
    this.heartbeatInterval = window.setInterval(() => {
      this.sendHeartbeat();
    }, 10_000);
    this.sendHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sendHeartbeat(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (!session.dataConn.open) continue;
      try {
        session.dataConn.send({ type: "ping", at: now } as SignalingPacket);
      } catch {
        /* ignore: o fechamento do dataConn limpará a sessão */
      }
    }
  }

  /** Verificação de saúde do Beacon: se não responder ao directory_request em
   *  2.5s (socket zumbi no servidor PeerJS), tente assumir o Beacon novamente com
   *  backoff curto e faça broadcast de presença. */
  private scheduleBeaconHealthCheck(beaconId: string): void {
    if (this.beaconHealthTimer !== null) return;
    this.beaconHealthTimer = window.setTimeout(() => {
      this.beaconHealthTimer = null;
      if (!this.currentRoomSlug || this.recoveryCancelled) return;
      const conn = this.directoryConn;
      const stale = !conn || !conn.open;
      if (stale && this.localPeer?.open && !this.localPeer.destroyed) {
        // Tente assumir o beacon novamente com backoff curto.
        try {
          this.attemptClaimBeacon(this.currentRoomSlug);
        } catch {
          /* ignorado */
        }
        this.broadcastLocalState();
      }
    }, 2_500);
  }

  /* ========================================================================= */
  /* GESTÃO DE SESSÕES MESH (DATACONNECTION & MEDIACONNECTION)                  */
  /* ========================================================================= */

  private connectToPeer(remotePeerId: string, clientId?: string): void {
    if (
      !this.localPeer ||
      this.localPeer.destroyed ||
      remotePeerId === this.localPeer.id
    )
      return;
    const existing = this.sessions.get(remotePeerId);
    if (existing && (existing.dataConn.open || existing.dataConnecting)) return;

    const conn = this.localPeer.connect(remotePeerId, {
      reliable: true,
      metadata: { initiator: this.localPeer.id },
    });
    this.setupDataConnection(conn, clientId);
  }

  private handleIncomingDataConnection(conn: DataConnection): void {
    if (this.sessions.has(conn.peer)) {
      // Já existe sessão ativa; fecha duplicada
      const existing = this.sessions.get(conn.peer);
      if (
        existing &&
        (existing.dataConn.open ||
          (existing.dataConnecting && (this.localPeer?.id || "") < conn.peer))
      ) {
        conn.close();
        return;
      }
    }
    this.setupDataConnection(conn);
  }

  private setupDataConnection(
    conn: DataConnection,
    initialClientId?: string,
  ): void {
    const remotePeerId = conn.peer;

    const previous = this.sessions.get(remotePeerId);
    const session: PeerMediaSession = previous || {
      peerId: remotePeerId,
      clientId: initialClientId || "",
      nickname: "Irmão Conectando...",
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

    const replaced = previous?.dataConn;
    if (session.dataGraceTimer) clearTimeout(session.dataGraceTimer);
    session.dataGraceTimer = undefined;
    if (session.dataConnectTimer) clearTimeout(session.dataConnectTimer);
    session.dataConn = conn;
    session.dataConnecting = !conn.open;
    // Dedup por clientId ao conectar novo peer: encerre sessão antiga com mesmo
    // clientId e peerId diferente para evitar split-brain / sala duplicada.
    if (initialClientId) {
      for (const [pid, other] of this.sessions.entries()) {
        if (pid === remotePeerId) continue;
        if (other.clientId === initialClientId) {
          this.finalizePeerDisconnected(other);
        }
      }
    }

    this.sessions.set(remotePeerId, session);
    if (replaced && replaced !== conn) {
      callEvent("data_replaced", {}, remotePeerId);
      try {
        replaced.close();
      } catch {}
    }
    const generation = this.roomGeneration;
    session.dataConnectTimer = window.setTimeout(() => {
      if (
        generation === this.roomGeneration &&
        session.dataConn === conn &&
        !conn.open
      ) {
        session.dataConnecting = false;
        try {
          conn.close();
        } catch {}
        this.handlePeerDisconnected(session);
      }
    }, 10000);

    conn.on("open", () => {
      if (
        this.sessions.get(remotePeerId) !== session ||
        session.dataConn !== conn
      )
        return;
      session.dataConnecting = false;
      if (session.dataConnectTimer) clearTimeout(session.dataConnectTimer);
      session.dataConnectTimer = undefined;
      callEvent("data_open", {}, remotePeerId);
      this.refreshRecoveryState();
      const state = useHubStore.getState();
      const localParticipant = state.participants[this.localPeer?.id || ""];

      // Envia nosso estado completo para o irmão
      if (localParticipant) {
        const { isLocal, profile: _profile, ...myState } = localParticipant;
        conn.send({
          type: "peer_state_sync",
          state: myState,
        } as SignalingPacket);
      }

      this.sendProfileToSession(session);

      // Sincroniza chat recente (IndexedDB)
      this.requestChatSync(conn);

      // Compatibilidade legada com 1v1
      if (!useHubStore.getState().remotePeerId) {
        useHubStore.getState().setRemoteNickname(session.nickname);
      }
    });

    conn.on("data", (data) => {
      if (
        this.sessions.get(remotePeerId) !== session ||
        session.dataConn !== conn
      )
        return;
      this.handleIncomingSignalingPacket(session, data as SignalingPacket);
    });

    conn.on("close", () => {
      if (session.dataConn !== conn) return;
      session.dataConnecting = false;
      this.handlePeerDisconnected(session);
    });

    conn.on("error", (err) => {
      console.warn(
        `[WebRTC Engine] Erro no dataConn com ${remotePeerId}:`,
        err,
      );
    });
  }

  private handlePeerDisconnected(session: PeerMediaSession): void {
    if (this.sessions.get(session.peerId) !== session) return;
    session.dataConnecting = false;
    const pc = session.voiceCall?.peerConnection;
    callEvent(
      "data_closed",
      {
        connection: pc?.connectionState,
        reason:
          pc?.connectionState === "connected"
            ? "preserve_media"
            : "remote_or_unknown",
      },
      session.peerId,
    );
    if (
      useHubStore.getState().inVoiceCall &&
      session.voiceCall &&
      pc?.connectionState !== "failed" &&
      pc?.connectionState !== "closed"
    ) {
      this.scheduleRecovery();
      if (!session.dataGraceTimer)
        session.dataGraceTimer = window.setTimeout(() => {
          session.dataGraceTimer = undefined;
          if (
            this.sessions.get(session.peerId) !== session ||
            session.dataConn.open
          )
            return;
          if (
            session.voiceCall?.peerConnection?.connectionState === "connected"
          )
            return;
          this.finalizePeerDisconnected(session);
        }, 15000);
      return;
    }
    this.finalizePeerDisconnected(session);
  }

  private finalizePeerDisconnected(session: PeerMediaSession): void {
    if (this.sessions.get(session.peerId) !== session) return;
    this.sessions.delete(session.peerId);
    if (session.dataConnectTimer) clearTimeout(session.dataConnectTimer);
    session.dataConnectTimer = undefined;
    this.closeBlockedMedia(session);
    this.waitingForMedia.delete(session.clientId);
    sounds.playLeave();
    this.teardownPeerVoiceAudio(session);

    if (session.voiceCall) {
      try {
        session.voiceCall.close();
      } catch {
        /* ignore */
      }
    }
    if (session.webcamCall) {
      try {
        session.webcamCall.close();
      } catch {
        /* ignore */
      }
    }
    if (session.screenCall) {
      try {
        session.screenCall.close();
      } catch {
        /* ignore */
      }
    }

    this.sessions.delete(session.peerId);
    useHubStore.getState().removeParticipant(session.peerId);
    useHubStore.getState().removeRemoteStreams(session.peerId);
    this.scheduleRecovery();

    // Compatibilidade legada
    if (useHubStore.getState().remotePeerId === session.peerId) {
      const remainingSessions = Array.from(this.sessions.values());
      if (remainingSessions.length > 0) {
        useHubStore.getState().setRemoteNickname(remainingSessions[0].nickname);
      } else {
        useHubStore.getState().setRemoteNickname("Aguardando irmão...");
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

  private handleIncomingSignalingPacket(
    session: PeerMediaSession,
    packet: SignalingPacket,
  ): void {
    if (!packet || !packet.type) return;

    if (packet.type !== "peer_state_sync" && isBlocked(session.clientId))
      return;
    switch (packet.type) {
      case "profile_update": {
        if (
          !session.clientId ||
          !useHubStore.getState().participants[session.peerId]
        )
          return;
        try {
          const profile =
            packet.profile === null
              ? null
              : validatePublicProfile(packet.profile);
          useHubStore.getState().updateParticipant(session.peerId, { profile });
        } catch {
          /* Malformed remote profile is ignored, not merged. */
        }
        break;
      }
      case "ping": {
        // Responda com pong pelo mesmo dataConn para manter o enlace P2P vivo.
        try {
          session.dataConn.send(
            { type: "pong", at: packet.at } as SignalingPacket,
          );
        } catch {
          /* ignore */
        }
        break;
      }
      case "pong": {
        // Pong recebido: enlace P2P ativo; a sessão se mantém.
        break;
      }
      case "peer_state_sync": {
        const remote = peerState(
          packet.state,
          session.peerId,
          session.clientId,
        );
        if (!remote) return;
        const beforeParticipant =
          useHubStore.getState().participants[session.peerId];
        session.clientId = remote.clientId;
        session.nickname = remote.nickname;

        // Dedup por clientId: se já existe outra sessão com o mesmo clientId e
        // peerId diferente (split-brain / sala duplicada), encerre a antiga antes
        // de registrar a nova.
        for (const [pid, other] of this.sessions.entries()) {
          if (pid === session.peerId) continue;
          if (other.clientId === remote.clientId) {
            this.finalizePeerDisconnected(other);
          }
        }

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

        if (isBlocked(remote.clientId)) {
          this.closeBlockedMedia(session);
          return;
        }
        if (
          beforeParticipant &&
          !beforeParticipant.inVoiceCall &&
          remote.inVoiceCall &&
          !useHubStore.getState().inVoiceCall
        ) {
          const room = this.currentRoomSlug,
            generation = this.roomGeneration;
          notifyNative(
            {
              id: crypto.randomUUID(),
              kind: "call",
              title: "Chamada na sala",
              body: `${remote.nickname.slice(0, 80)} iniciou uma chamada. Clique para atender.`,
            },
            () => {
              if (
                this.roomGeneration === generation &&
                this.currentRoomSlug === room &&
                this.sessions.get(session.peerId) === session &&
                useHubStore.getState().participants[session.peerId]
                  ?.inVoiceCall &&
                !isBlocked(session.clientId) &&
                !useHubStore.getState().inVoiceCall
              )
                void this.joinVoiceCall().catch((error) =>
                  mediaError("Atender chamada", error),
                );
            },
          );
        }
        this.sendProfileToSession(session);
        // Compatibilidade legada
        useHubStore.getState().setRemoteNickname(remote.nickname);

        // Se ambos estiverem em chamada de voz e a chamada ainda não tiver chegado após 400ms:
        const localState = useHubStore.getState();
        if (
          localState.inVoiceCall &&
          remote.inVoiceCall &&
          !session.voiceCall
        ) {
          window.setTimeout(() => {
            const currentSession = this.sessions.get(session.peerId);
            const stillInVoice = useHubStore.getState().inVoiceCall;
            if (
              stillInVoice &&
              currentSession === session &&
              !currentSession.voiceCall
            ) {
              this.initiateVoiceCallWithPeer(currentSession);
            }
          }, 400);
        }

        if (!remote.inVoiceCall) {
          this.waitingForMedia.delete(remote.clientId);
          this.closeBlockedMedia(session);
          this.refreshRecoveryState();
        }
        if (
          localState.inVoiceCall &&
          remote.inVoiceCall &&
          this.localWebcamStream &&
          !session.outgoingWebcam
        )
          this.initiateWebcamCallWithPeer(session);

        // Se local estiver compartilhando tela e o irmão estiver em call de voz
        if (
          localState.isScreenSharing &&
          this.localScreenStream &&
          remote.inVoiceCall &&
          !session.outgoingScreen
        ) {
          this.initiateScreenCallWithPeer(session);
        }
        break;
      }

      case "speaking": {
        if (
          packet.peerId !== session.peerId ||
          typeof packet.isSpeaking !== "boolean"
        )
          return;
        useHubStore
          .getState()
          .updateParticipant(packet.peerId, { isSpeaking: packet.isSpeaking });
        useHubStore.getState().setIsRemoteSpeaking(packet.isSpeaking);
        break;
      }

      case "screen_stopped": {
        if (packet.peerId !== session.peerId) return;
        useHubStore.getState().updateParticipant(packet.peerId, {
          isScreenSharing: false,
          screenQualityLabel: undefined,
        });
        useHubStore.getState().setRemoteStream(packet.peerId, "screen", null);
        useHubStore.getState().setRemoteScreenStream(null);
        if (useHubStore.getState().telemetry.sourcePeerId === session.peerId)
          useHubStore.getState().setTelemetry({ active: false });
        this.stopReceiverStats(session.peerId);
        sounds.playStreamStop();
        break;
      }

      case "chat_message": {
        const room = useHubStore.getState().roomId;
        try {
          const msg = validateMessage(packet.message, room);
          if (msg.type === "soundboard") return;
          if (msg.authorClientId !== session.clientId) return;
          chatLedger
            .mergeMessages(room, [msg])
            .then((merged) => {
              if (useHubStore.getState().roomId !== room) return;
              const fresh = !useHubStore
                .getState()
                .messages.some((m) => m.id === msg.id);
              useHubStore.getState().setMessages(merged);
              if (fresh) useHubStore.getState().setUnreadCount((n) => n + 1);
              if (fresh && msg.type === "user" && !isBlocked(session.clientId))
                notifyNative({
                  id: msg.id,
                  kind: "message",
                  title: msg.authorNickname.slice(0, 100),
                  body: msg.content.slice(0, 240),
                });
              session.dataConn.send({
                type: "chat_ack",
                roomId: room,
                messageId: msg.id,
              } as SignalingPacket);
            })
            .catch((error) =>
              console.warn("[Chat] Falha ao persistir mensagem:", error),
            );
        } catch {
          /* Invalid remote content is not rendered or stored. */
        }
        break;
      }
      case "chat_ack": {
        const state = useHubStore.getState();
        const message = state.messages.find(
          (m) =>
            m.id === packet.messageId && m.authorClientId === state.clientId,
        );
        if (!message || packet.roomId !== state.roomId) return;
        chatLedger
          .acknowledge(packet.roomId, message.id)
          .then((messages) => {
            if (useHubStore.getState().roomId === packet.roomId)
              useHubStore.getState().setMessages(messages);
          })
          .catch(() => {});
        break;
      }
      case "chat_operation": {
        this.receiveChatOperations(session, useHubStore.getState().roomId, [
          packet.operation,
        ]);
        break;
      }
      case "chat_operations_sync": {
        if (
          packet.roomId !== useHubStore.getState().roomId ||
          !Array.isArray(packet.operations) ||
          packet.operations.length > 100
        )
          return;
        this.receiveChatOperations(session, packet.roomId, packet.operations);
        break;
      }

      case "chat_reaction_toggle": {
        if (
          typeof packet.emoji !== "string" ||
          packet.emoji.length > 16 ||
          ["__proto__", "constructor", "prototype"].includes(packet.emoji)
        )
          return;
        const ownerState = useHubStore.getState();
        const message = ownerState.messages.find(
          (m) => m.id === packet.messageId,
        );
        if (
          packet.clientId !== session.clientId ||
          (message?.authorClientId === ownerState.clientId &&
            !readOwnProfile(ownerState.clientId, ownerState.nickname).privacy
              .allowReactions)
        )
          return;
        storageDb
          .toggleReaction(
            packet.messageId,
            packet.emoji,
            packet.clientId,
            packet.nickname,
          )
          .catch(() => {});
        useHubStore
          .getState()
          .updateMessageReaction(
            packet.messageId,
            packet.emoji,
            packet.clientId,
            packet.nickname,
          );
        break;
      }

      case "chat_typing": {
        if (
          packet.clientId !== session.clientId ||
          typeof packet.nickname !== "string" ||
          packet.nickname.length > 80 ||
          typeof packet.isTyping !== "boolean"
        )
          return;
        useHubStore
          .getState()
          .setTypingUser(packet.clientId, packet.nickname, packet.isTyping);
        break;
      }

      case "chat_sync_request": {
        const room = useHubStore.getState().roomId;
        if (
          packet.roomId !== room ||
          !Array.isArray(packet.knownIds) ||
          packet.knownIds.length > 500
        )
          return;
        storageDb
          .getMessagesByRoom(room)
          .then((all) => {
            if (useHubStore.getState().roomId !== room) return;
            const known = new Set(packet.knownIds);
            const missing = all.filter(
              (m) =>
                !known.has(m.id) &&
                m.type !== "soundboard" &&
                !m.deleted &&
                !isBlocked(m.authorClientId),
            );
            // Original author is needed to authenticate a new v2 edit/delete; history remains best-effort P2P.
            for (let i = 0; i < missing.length; i += 50)
              session.dataConn.send({
                type: "chat_sync_response",
                roomId: room,
                messages: missing.slice(i, i + 50),
              } as SignalingPacket);
          })
          .catch(() => {});
        this.sendChatOperations(session.dataConn, room);
        break;
      }
      case "chat_sync_response": {
        const room = useHubStore.getState().roomId;
        if (
          packet.roomId !== room ||
          !Array.isArray(packet.messages) ||
          packet.messages.length > 500
        )
          return;
        try {
          const clean = packet.messages
            .filter(
              (m) => m.type !== "soundboard" && !isBlocked(m.authorClientId),
            )
            .map((m) => validateMessage(m, room));
          chatLedger
            .mergeMessages(room, clean)
            .then((merged) => {
              if (useHubStore.getState().roomId === room)
                useHubStore.getState().setMessages(merged);
            })
            .catch(() => {});
        } catch {
          /* Ignore invalid history batches. */
        }
        break;
      }

      case "soundboard_triggered": {
        if (
          packet.peerId !== session.peerId ||
          packet.clientId !== session.clientId ||
          typeof packet.emoji !== "string" ||
          packet.emoji.length > 24 ||
          typeof packet.soundName !== "string" ||
          packet.soundName.length > 80
        )
          return;
        soundActivity(
          useHubStore.getState().roomId,
          session.clientId,
          session.nickname,
          packet.emoji,
          packet.soundName,
        );
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
            useHubStore
              .getState()
              .updateParticipant(packet.peerId, { activeSoundEffect: null });
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
    const room = this.currentRoomSlug;
    if (!room) return;
    storageDb
      .getMessagesByRoom(room)
      .then((messages) => {
        if (this.currentRoomSlug !== room || !conn.open) return;
        conn.send({
          type: "chat_sync_request",
          roomId: room,
          sinceTimestamp: 0,
          knownIds: messages.map((m) => m.id),
        } as SignalingPacket);
        for (const msg of messages.filter(
          (m) =>
            m.authorClientId === useHubStore.getState().clientId && !m.deleted,
        ))
          conn.send({ type: "chat_message", message: msg } as SignalingPacket);
        this.sendChatOperations(conn, room);
      })
      .catch(() => {});
  }

  private sendChatOperations(conn: DataConnection, room: string): void {
    chatLedger
      .operations(room)
      .then((ops) => {
        if (useHubStore.getState().roomId !== room || !conn.open) return;
        const own = ops.filter(
          (o) => o.actorClientId === useHubStore.getState().clientId,
        );
        for (let i = 0; i < own.length; i += 100)
          conn.send({
            type: "chat_operations_sync",
            roomId: room,
            operations: own.slice(i, i + 100),
          } as SignalingPacket);
      })
      .catch(() => {});
  }

  private receiveChatOperations(
    session: PeerMediaSession,
    room: string,
    incoming: ChatOperation[],
  ): void {
    try {
      const state = useHubStore.getState();
      const clean = incoming
        .map((o) => validateOperation(o, room, session.clientId))
        .filter((o) => {
          const target = state.messages.find((m) => m.id === o.messageId);
          if (
            o.kind === "reaction" &&
            target?.authorClientId === state.clientId &&
            !readOwnProfile(state.clientId, state.nickname).privacy
              .allowReactions
          )
            return false;
          return (
            o.kind === "reaction" ||
            !target ||
            target.authorClientId === session.clientId
          );
        });
      chatLedger
        .record(room, clean, session.clientId)
        .then((messages) => {
          if (useHubStore.getState().roomId !== room) return;
          useHubStore.getState().setMessages(messages);
        })
        .catch((error) => console.warn("[Chat] Operação recusada:", error));
    } catch {
      /* Untrusted operations are ignored. */
    }
  }

  public async mutateChat(
    messageId: string,
    kind: ChatOperation["kind"],
    data: { content?: string; emoji?: string; active?: boolean } = {},
  ): Promise<void> {
    const state = useHubStore.getState();
    const message = state.messages.find((m) => m.id === messageId);
    if (!message || message.deleted) throw new Error("Mensagem indisponível.");
    if (kind !== "reaction" && message.authorClientId !== state.clientId)
      throw new Error("Você só pode alterar ou fixar suas próprias mensagens.");
    const author = Object.values(state.participants).find(
      (p) => p.clientId === message.authorClientId,
    );
    if (
      isBlocked(message.authorClientId) ||
      (kind === "reaction" && author?.profile?.interactions.reactions === false)
    )
      throw new Error("Interação não permitida.");
    this.chatClock = Math.max(Date.now(), this.chatClock + 1);
    const op = validateOperation(
      {
        id: crypto.randomUUID(),
        roomId: state.roomId,
        messageId,
        actorClientId: state.clientId,
        nickname: state.nickname,
        at: this.chatClock,
        kind,
        ...data,
      },
      state.roomId,
      state.clientId,
    );
    const messages = await chatLedger.record(
      state.roomId,
      [op],
      state.clientId,
    );
    if (useHubStore.getState().roomId === state.roomId)
      useHubStore.getState().setMessages(messages);
    this.broadcast({ type: "chat_operation", operation: op });
  }

  /* ========================================================================= */
  /* CHAMADAS DE MÍDIA ENTRANTES & SAÍDAS (FULL MESH)                          */
  /* ========================================================================= */

  private handleIncomingMediaCall(call: MediaConnection): void {
    const channel = call.metadata?.channel || "voice";
    const remotePeerId = call.peer;
    const session = this.sessions.get(remotePeerId);
    const ownState = useHubStore.getState();
    if (
      !session ||
      !ownState.inVoiceCall ||
      !["voice", "screen", "webcam"].includes(channel) ||
      isBlocked(session.clientId) ||
      !readOwnProfile(ownState.clientId, ownState.nickname).privacy.allowCalls
    ) {
      call.close();
      return;
    }

    if (channel === "voice") {
      if (session.voiceCall) {
        if ((this.localPeer?.id || "") < session.peerId) {
          call.close();
          return;
        }
        session.voiceCall.close();
      }
      const state = useHubStore.getState();
      if (!state.inVoiceCall) {
        // Se o usuário local NÃO está na call de voz, não envia microfone
        call.answer();
      } else {
        const localVoiceStream =
          this.audioPipeline?.getProcessedStream() || this.rawMicStream;
        call.answer(localVoiceStream || undefined);
      }

      if (session) {
        session.voiceCall = call;
      }

      this.patchCallSdp(call, false);

      this.monitorVoiceCall(session, call);
      call.on("stream", (stream) => {
        if (session.voiceCall !== call) return;
        if (session) {
          this.setupPeerVoiceAudio(session, stream);
        }
        useHubStore.getState().setRemoteStream(remotePeerId, "voice", stream);
        useHubStore.getState().setRemoteVoiceStream(stream);
      });

      call.on("close", () => {
        if (session.voiceCall !== call) return;
        if (session) {
          this.teardownPeerVoiceAudio(session);
          session.voiceCall = null;
        }
        useHubStore.getState().setRemoteStream(remotePeerId, "voice", null);
      });
    } else if (channel === "screen") {
      session.screenCall?.close();
      call.answer(); // Atende tela sem enviar vídeo de volta
      if (session) {
        session.screenCall = call;
      }

      this.patchCallSdp(call, true);

      call.on("stream", (stream) => {
        if (session.screenCall !== call) return;
        sounds.playStreamStart();
        useHubStore.getState().setRemoteStream(remotePeerId, "screen", stream);
        useHubStore.getState().setRemoteScreenStream(stream);
        useHubStore
          .getState()
          .updateParticipant(remotePeerId, { isScreenSharing: true });
        this.startReceiverStats(call.peerConnection, stream, remotePeerId);
      });

      call.on("close", () => {
        if (session.screenCall !== call) return;
        session.screenCall = null;
        useHubStore.getState().setRemoteStream(remotePeerId, "screen", null);
        useHubStore.getState().setRemoteScreenStream(null);
        useHubStore
          .getState()
          .updateParticipant(remotePeerId, { isScreenSharing: false });
        if (useHubStore.getState().telemetry.sourcePeerId === session.peerId)
          useHubStore.getState().setTelemetry({ active: false });
        this.stopReceiverStats(session.peerId);
        sounds.playStreamStop();
      });
    } else if (channel === "webcam") {
      session.webcamCall?.close();
      call.answer();
      if (session) {
        session.webcamCall = call;
      }

      call.on("stream", (stream) => {
        if (session.webcamCall !== call) return;
        useHubStore.getState().setRemoteStream(remotePeerId, "webcam", stream);
        useHubStore
          .getState()
          .updateParticipant(remotePeerId, { isWebcamActive: true });
      });

      call.on("close", () => {
        if (session.webcamCall !== call) return;
        session.webcamCall = null;
        useHubStore.getState().setRemoteStream(remotePeerId, "webcam", null);
        useHubStore
          .getState()
          .updateParticipant(remotePeerId, { isWebcamActive: false });
      });
    }
  }

  private initiateVoiceCallWithPeer(session: PeerMediaSession): void {
    if (
      !this.localPeer ||
      this.localPeer.destroyed ||
      session.voiceCall ||
      (session.voiceRetryAttempts || 0) > 6 ||
      !this.canCallSession(session)
    )
      return;

    const voiceStream =
      this.audioPipeline?.getProcessedStream() || this.rawMicStream;
    if (!voiceStream) return;

    let call: MediaConnection;
    try {
      call = this.localPeer.call(session.peerId, voiceStream, {
        metadata: { channel: "voice" },
      });
      if (!call) {
        this.scheduleVoiceRetry(session);
        return;
      }
    } catch {
      callEvent("signaling_error", { reason: "unknown" }, session.peerId);
      this.scheduleVoiceRetry(session);
      return;
    }

    session.voiceCall = call;
    this.patchCallSdp(call, false);

    this.monitorVoiceCall(session, call);
    call.on("stream", (stream) => {
      if (session.voiceCall !== call) return;
      this.setupPeerVoiceAudio(session, stream);
      useHubStore.getState().setRemoteStream(session.peerId, "voice", stream);
      useHubStore.getState().setRemoteVoiceStream(stream);
    });

    call.on("close", () => {
      if (session.voiceCall !== call) return;
      this.teardownPeerVoiceAudio(session);
      session.voiceCall = null;
      useHubStore.getState().setRemoteStream(session.peerId, "voice", null);
    });
  }

  private monitorVoiceCall(
    session: PeerMediaSession,
    call: MediaConnection,
  ): void {
    if (session.qualityTimer) clearInterval(session.qualityTimer);
    if (session.voiceRetryTimer) clearTimeout(session.voiceRetryTimer);
    session.voiceRetryTimer = undefined;
    session.mediaFlowVerified = false;
    session.recoveryRxBase = 0;
    session.recoveryTxBase = 0;
    session.recoveryMediaAt = undefined;
    const connectingAt = Date.now();
    let lastState = "",
      lastTick = Date.now();
    let previousReceived = 0,
      previousLost = 0,
      busy = false,
      disconnectedAt = 0;
    session.qualityTimer = window.setInterval(async () => {
      if (
        this.sessions.get(session.peerId) !== session ||
        session.voiceCall !== call
      )
        return;
      const pc = call.peerConnection;
      if (!pc) return;
      const tick = Date.now();
      if (tick - lastTick > 15000)
        callEvent("timer_gap", { delayMs: tick - lastTick }, session.peerId);
      lastTick = tick;
      const signature = [
        pc.connectionState,
        pc.iceConnectionState,
        pc.signalingState,
      ].join(":");
      if (signature !== lastState) {
        lastState = signature;
        callEvent(
          "media_state",
          {
            connection: pc.connectionState,
            ice: pc.iceConnectionState,
            signaling: pc.signalingState,
          },
          session.peerId,
        );
      }
      if (pc.connectionState !== "connected") session.mediaFlowVerified = false;
      const previousQuality = useMediaState.getState().quality[session.peerId];
      if (previousQuality && previousQuality.state !== pc.connectionState)
        useMediaState.setState((s) => ({
          quality: {
            ...s.quality,
            [session.peerId]: {
              ...previousQuality,
              state: pc.connectionState,
              flowing: false,
            },
          },
        }));
      if (pc.connectionState === "connected" && session.mediaFlowVerified)
        session.voiceRetryAttempts = 0;
      if (pc.connectionState === "disconnected") disconnectedAt ||= Date.now();
      else disconnectedAt = 0;
      if (
        pc.connectionState === "failed" ||
        (this.recoveryActive &&
          this.recoveryAttempts < 8 &&
          this.discoveryConfirmed &&
          this.waitingForMedia.has(session.clientId) &&
          session.recoveryMediaAt !== undefined &&
          Date.now() - session.recoveryMediaAt > 10000) ||
        (disconnectedAt && Date.now() - disconnectedAt > 8000) ||
        (["new", "connecting"].includes(pc.connectionState) &&
          Date.now() - connectingAt > 30000)
      ) {
        callEvent(
          "media_closed",
          {
            reason:
              pc.connectionState === "failed"
                ? "media_failed"
                : "media_timeout",
          },
          session.peerId,
        );
        call.close();
        this.broadcastLocalState();
        return;
      }
      if (busy) return;
      busy = true;
      try {
        const epoch = this.recoveryEpoch;
        const stats = await pc.getStats();
        if (session.voiceCall !== call || epoch !== this.recoveryEpoch) return;
        let rttMs: number | null = null,
          loss: number | null = null,
          jitterMs: number | null = null;
        let receivedAudio = 0,
          sentAudio = 0;
        stats.forEach((report) => {
          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded" &&
            report.nominated &&
            Number.isFinite(report.currentRoundTripTime)
          )
            rttMs = Math.round(report.currentRoundTripTime * 1000);
          if (
            report.type === "inbound-rtp" &&
            (report.kind === "audio" || report.mediaType === "audio")
          ) {
            if (Number.isFinite(report.jitter))
              jitterMs = Math.round(report.jitter * 10000) / 10;
            receivedAudio = Number.isFinite(report.packetsReceived)
              ? report.packetsReceived
              : 0;
            const received = report.packetsReceived || 0,
              lost = report.packetsLost || 0;
            const delta = Math.max(0, received - previousReceived),
              missed = Math.max(0, lost - previousLost);
            loss =
              delta + missed
                ? Math.round((1000 * missed) / (delta + missed)) / 10
                : null;
            previousReceived = received;
            previousLost = lost;
          }
          if (
            report.type === "outbound-rtp" &&
            (report.kind === "audio" || report.mediaType === "audio") &&
            report.bytesSent > 0
          )
            sentAudio = report.bytesSent;
        });
        if (
          this.waitingForMedia.has(session.clientId) &&
          session.recoveryRxBase === undefined
        ) {
          session.recoveryRxBase = receivedAudio;
          session.recoveryTxBase = sentAudio;
        } else if (
          receivedAudio > (session.recoveryRxBase ?? 0) &&
          sentAudio > (session.recoveryTxBase ?? 0) &&
          !!session.voiceAudioEl?.srcObject &&
          pc.connectionState === "connected"
        ) {
          session.mediaFlowVerified = true;
          this.waitingForMedia.delete(session.clientId);
        }
        const flowing =
          pc.connectionState === "connected" &&
          session.mediaFlowVerified === true;
        this.refreshRecoveryState();
        useMediaState.setState((s) => ({
          quality: {
            ...s.quality,
            [session.peerId]: {
              state: pc.connectionState,
              rttMs,
              loss,
              jitterMs,
              flowing,
            },
          },
        }));
      } catch {
        /* Stats unavailable: never fabricate quality. */
      } finally {
        busy = false;
      }
    }, 2000);
    call.on("close", () => {
      if (session.voiceCall && session.voiceCall !== call) return;
      if (session.qualityTimer) clearInterval(session.qualityTimer);
      session.qualityTimer = undefined;
      useMediaState.setState((s) => {
        const quality = { ...s.quality };
        if (this.canCallSession(session))
          quality[session.peerId] = {
            state: "closed",
            rttMs: null,
            loss: null,
            jitterMs: null,
            flowing: false,
          };
        else delete quality[session.peerId];
        return { quality };
      });
      callEvent(
        "media_closed",
        {
          connection: call.peerConnection?.connectionState,
          reason: "remote_or_unknown",
        },
        session.peerId,
      );
      this.scheduleVoiceRetry(session);
    });
  }

  private initiateWebcamCallWithPeer(session: PeerMediaSession): void {
    if (
      !this.localPeer ||
      !this.localWebcamStream ||
      session.outgoingWebcam ||
      !this.canCallSession(session)
    )
      return;
    const call = this.localPeer.call(session.peerId, this.localWebcamStream, {
      metadata: { channel: "webcam" },
    });
    session.outgoingWebcam = call;
    call.on("close", () => {
      if (session.outgoingWebcam === call) session.outgoingWebcam = null;
    });
  }

  private initiateScreenCallWithPeer(session: PeerMediaSession): void {
    if (
      !this.localPeer ||
      !this.localScreenStream ||
      session.outgoingScreen ||
      !this.canCallSession(session)
    )
      return;

    const call = this.localPeer.call(session.peerId, this.localScreenStream, {
      metadata: { channel: "screen" },
    });

    session.outgoingScreen = call;
    call.on("close", () => {
      if (session.outgoingScreen === call) session.outgoingScreen = null;
    });
    this.patchCallSdp(call, true);

    const senders = call.peerConnection.getSenders();
    const videoSender = senders.find(
      (s) => s.track && s.track.kind === "video",
    );
    if (videoSender) {
      configureVideoSender(
        videoSender,
        useHubStore.getState().videoQualityConfig.maxBitrateBps,
      );
      this.startAbrLoop(
        call.peerConnection,
        videoSender,
        useHubStore.getState().videoQualityConfig,
        session.peerId,
      );
    }
  }

  /* ========================================================================= */
  /* ÁUDIO INDIVIDUAL POR IRMÃO (0% A 100%) & SINK ID                          */
  /* ========================================================================= */

  private setupPeerVoiceAudio(
    session: PeerMediaSession,
    stream: MediaStream,
  ): void {
    this.teardownPeerVoiceAudio(session);

    try {
      // Zera o jitter buffer extra nos receivers de áudio do WebRTC para latência mínima
      const pc = session.voiceCall?.peerConnection;
      if (pc && typeof pc.getReceivers === "function") {
        pc.getReceivers().forEach((receiver) => {
          if (
            receiver.track?.kind === "audio" &&
            "playoutDelayHint" in receiver
          ) {
            (
              receiver as unknown as { playoutDelayHint: number }
            ).playoutDelayHint = 0.01;
          }
        });
      }

      // Reprodução direta na tag <audio> sem intermediário WebAudio (elimina ~250ms de atraso)
      let audioEl = document.getElementById(
        `audio-peer-${session.peerId}`,
      ) as HTMLAudioElement | null;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = `audio-peer-${session.peerId}`;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
      }

      const state = useHubStore.getState();
      const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
      const effVol = state.isDeafened
        ? 0
        : Math.max(
            0,
            Math.min(1.0, peerVol * state.audioConfig.remoteStreamVolume),
          );

      audioEl.autoplay = true;
      audioEl.muted = state.isDeafened;
      audioEl.volume = effVol;
      audioEl.srcObject = stream;

      const outputId = state.audioConfig.outputDeviceId;
      if (outputId && outputId !== "default" && "setSinkId" in audioEl) {
        (audioEl as unknown as { setSinkId: (id: string) => Promise<void> })
          .setSinkId(outputId)
          .catch((e) => mediaError("Saída de áudio indisponível", e));
      }

      audioEl
        .play()
        .catch((e) => console.warn("[WebRTC Audio] Falha ao iniciar play:", e));

      session.voiceAudioEl = audioEl;
      this.startRemoteVoiceDetection(session, stream);
    } catch (err) {
      console.warn(
        `[WebRTC Audio] Falha ao configurar áudio para ${session.peerId}:`,
        err,
      );
    }
  }

  private teardownPeerVoiceAudio(session: PeerMediaSession): void {
    if (session.remoteSpeakingInterval !== null) {
      clearInterval(session.remoteSpeakingInterval);
      session.remoteSpeakingInterval = null;
    }
    if (session.voiceSourceNode) {
      try {
        session.voiceSourceNode.disconnect();
      } catch {
        /* ignore */
      }
      session.voiceSourceNode = null;
    }
    if (session.voiceGainNode) {
      try {
        session.voiceGainNode.disconnect();
      } catch {
        /* ignore */
      }
      session.voiceGainNode = null;
    }
    if (session.voiceAudioEl) {
      session.voiceAudioEl.pause();
      session.voiceAudioEl.srcObject = null;
      session.voiceAudioEl.remove();
      session.voiceAudioEl = null;
    }
    if (session.voiceAudioCtx && session.voiceAudioCtx.state !== "closed") {
      session.voiceAudioCtx.close().catch(() => {});
      session.voiceAudioCtx = null;
    }
  }

  public setPeerVolume(clientId: string, volume: number): void {
    if (!Number.isFinite(volume)) return;
    useHubStore
      .getState()
      .setPeerVolume(clientId, Math.max(0, Math.min(1, volume)));
    const clamped = Math.max(0, Math.min(1.0, volume));
    const state = useHubStore.getState();

    for (const session of this.sessions.values()) {
      if (session.clientId === clientId && session.voiceAudioEl) {
        const effVol = state.isDeafened
          ? 0
          : Math.max(
              0,
              Math.min(1.0, clamped * state.audioConfig.remoteStreamVolume),
            );
        session.voiceAudioEl.volume = effVol;
      }
    }
  }

  private startRemoteVoiceDetection(
    session: PeerMediaSession,
    stream: MediaStream,
  ): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      session.voiceAudioCtx = ctx;
      session.voiceSourceNode = source;
      let lastLoudAt = 0;
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
        if (db > -42) lastLoudAt = Date.now();
        const isSpeaking = Date.now() - lastLoudAt < 180;
        if (
          useHubStore.getState().participants[session.peerId]?.isSpeaking !==
          isSpeaking
        )
          useHubStore
            .getState()
            .updateParticipant(session.peerId, { isSpeaking });
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
    if (state.inVoiceCall || this.joiningVoice) return;
    const generation = this.roomGeneration;
    this.joiningVoice = true;
    this.clearMicRecovery();
    try {
      await this.setupLocalMicrophone();
    } catch {
      this.joiningVoice = false;
      return;
    }
    this.joiningVoice = false;
    if (generation !== this.roomGeneration || !this.rawMicStream?.active)
      return;
    this.recoveryCancelled = false;
    for (const session of this.sessions.values())
      session.voiceRetryAttempts = 0;
    beginCallDiagnostics();
    sounds.playJoin();

    useHubStore.getState().setInVoiceCall(true);
    if (this.localPeer) {
      useHubStore
        .getState()
        .updateParticipant(this.localParticipantId(), { inVoiceCall: true });
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

  public leaveVoiceCall(
    reason: "manual_leave" | "microphone_ended" = "manual_leave",
  ): void {
    endCallDiagnostics(reason);
    this.waitingForMedia.clear();
    this.pushToTalkHeld = false;
    const state = useHubStore.getState();
    this.micGeneration++;
    this.clearMicRecovery();
    this.joiningVoice = false;
    this.cameraGeneration++;
    this.screenGeneration++;
    useMediaState.setState({
      microphoneBusy: false,
      cameraBusy: false,
      screenBusy: false,
    });
    soundboardEngine.stopAll();
    this.audioPipeline?.destroy();
    this.audioPipeline = null;
    this.rawMicStream?.getTracks().forEach((t) => t.stop());
    this.rawMicStream = null;
    state.setLocalVoiceStream(null);
    state.setIsLocalSpeaking(false, 0);
    if (!state.inVoiceCall) return;
    state.setInVoiceCall(false);
    sounds.playLeave();

    if (state.isScreenSharing) {
      this.stopScreenShare();
    }

    if (state.isWebcamActive) {
      this.toggleWebcam().catch(() => {});
    }

    // Encerra mídia, preservando as DataConnections do chat.
    for (const session of this.sessions.values()) {
      this.closeBlockedMedia(session);
      if (session.voiceCall) {
        try {
          session.voiceCall.close();
        } catch {
          /* ignore */
        }
        session.voiceCall = null;
      }
      this.teardownPeerVoiceAudio(session);
    }

    useHubStore.getState().setInVoiceCall(false);
    useHubStore.getState().setRemoteVoiceStream(null);

    if (this.localPeer) {
      useHubStore
        .getState()
        .updateParticipant(this.localParticipantId(), { inVoiceCall: false });
    }

    // Notifica todos os irmãos mantendo o chat ativo!
    this.broadcastLocalState();
    this.refreshRecoveryState();
  }

  private canCallSession(session: PeerMediaSession): boolean {
    const state = useHubStore.getState();
    return (
      state.inVoiceCall &&
      state.participants[session.peerId]?.inVoiceCall === true &&
      !isBlocked(session.clientId) &&
      readOwnProfile(state.clientId, state.nickname).privacy.allowCalls &&
      state.participants[session.peerId]?.profile?.interactions.calls !== false
    );
  }

  private closeBlockedMedia(session: PeerMediaSession): void {
    if (session.voiceRetryTimer) clearTimeout(session.voiceRetryTimer);
    session.voiceRetryTimer = undefined;
    if (session.dataGraceTimer) clearTimeout(session.dataGraceTimer);
    session.dataGraceTimer = undefined;
    this.teardownPeerVoiceAudio(session);
    for (const call of [
      session.voiceCall,
      session.webcamCall,
      session.screenCall,
      session.outgoingScreen,
      session.outgoingWebcam,
    ]) {
      try {
        call?.close();
      } catch {}
    }
    session.voiceCall = null;
    session.webcamCall = null;
    session.screenCall = null;
    session.outgoingScreen = null;
    session.outgoingWebcam = null;
    if (session.qualityTimer) clearInterval(session.qualityTimer);
    useHubStore.getState().removeRemoteStreams(session.peerId);
  }

  private sendProfileToSession(session: PeerMediaSession): void {
    if (!session.dataConn.open || isBlocked(session.clientId)) return;
    const state = useHubStore.getState();
    session.dataConn.send({
      type: "profile_update",
      profile: publicProfile(readOwnProfile(state.clientId, state.nickname)),
    } as SignalingPacket);
  }

  public refreshLocalProfile(): void {
    const state = useHubStore.getState();
    const profile = readOwnProfile(state.clientId, state.nickname);
    state.setNickname(profile.displayName);
    state.setAvatarColor(profile.appearance.color);
    if (this.localPeer)
      state.updateParticipant(this.localParticipantId(), {
        nickname: profile.displayName,
        avatarColor: profile.appearance.color,
      });
    this.broadcastLocalState();
    for (const session of this.sessions.values()) {
      if (isBlocked(session.clientId) || !profile.privacy.allowCalls)
        this.closeBlockedMedia(session);
      if (isBlocked(session.clientId)) {
        useHubStore
          .getState()
          .updateParticipant(session.peerId, { profile: null });
      } else this.sendProfileToSession(session);
    }
  }

  private broadcastLocalState(): void {
    if (!this.localPeer) return;
    const state = useHubStore.getState();
    const local = state.participants[this.localParticipantId()];
    if (!local) return;

    const { isLocal, profile: _profile, ...rest } = local;
    this.broadcast({
      type: "peer_state_sync",
      state: rest,
    });
  }

  public broadcast(packet: SignalingPacket): void {
    for (const session of this.sessions.values()) {
      if (
        !isBlocked(session.clientId) &&
        session.dataConn &&
        session.dataConn.open
      ) {
        try {
          session.dataConn.send(packet);
        } catch (err) {
          console.warn(
            `[WebRTC Broadcast] Falha ao enviar para ${session.peerId}:`,
            err,
          );
        }
      }
    }
  }

  // Compatibilidade legada
  public sendData(msg: { type: string; [key: string]: unknown }): void {
    if (msg.type === "nickname" && typeof msg.name === "string") {
      useHubStore.getState().setNickname(msg.name);
      if (this.localPeer) {
        useHubStore
          .getState()
          .updateParticipant(this.localParticipantId(), { nickname: msg.name });
      }
      this.broadcastLocalState();
    } else if (msg.type === "speaking") {
      this.broadcast({
        type: "speaking",
        peerId: this.localPeer?.id || "",
        isSpeaking: Boolean(msg.isSpeaking),
      });
    }
  }

  /* ========================================================================= */
  /* CONTROLES DE MÍDIA LOCAL (MUTE, DEAFEN, WEBCAM, SCREEN SHARE)             */
  /* ========================================================================= */

  private localParticipantId(): string {
    const participants = useHubStore.getState().participants;
    const id = this.localPeer?.id;
    return id && participants[id]?.isLocal
      ? id
      : Object.values(participants).find((p) => p.isLocal)?.peerId || "";
  }
  private pushToTalkHeld = false;
  public setPushToTalkHeld(held: boolean): void {
    this.pushToTalkHeld = held && useHubStore.getState().inVoiceCall;
    this.audioPipeline?.setMicMuted(this.microphoneGated());
  }
  private microphoneGated(): boolean {
    return (
      useHubStore.getState().isMuted ||
      (useVoicePreferences.getState().pushToTalk && !this.pushToTalkHeld)
    );
  }

  public toggleMute(muted?: boolean): void {
    const state = useHubStore.getState();
    const nextMuted = muted !== undefined ? muted : !state.isMuted;
    useHubStore.getState().setMuted(nextMuted);

    // Ajusta o ganho do microfone no pipeline WebAudio (sem cortar o Soundboard!)
    this.audioPipeline?.setMicMuted(this.microphoneGated());

    if (nextMuted) {
      sounds.playMute();
    } else {
      sounds.playUnmute();
    }

    if (this.localPeer) {
      useHubStore
        .getState()
        .updateParticipant(this.localParticipantId(), { isMuted: nextMuted });
    }
    this.broadcastLocalState();
  }

  public toggleDeafen(deafened?: boolean): void {
    const state = useHubStore.getState();
    const nextDeafened = deafened !== undefined ? deafened : !state.isDeafened;
    useHubStore.getState().setDeafened(nextDeafened);

    // Atualiza o elemento de áudio de todas as sessões para silenciar imediatamente se deafened
    for (const session of this.sessions.values()) {
      if (session.voiceAudioEl) {
        const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
        session.voiceAudioEl.muted = nextDeafened;
        session.voiceAudioEl.volume = nextDeafened
          ? 0
          : Math.max(
              0,
              Math.min(1.0, peerVol * state.audioConfig.remoteStreamVolume),
            );
      }
    }

    // Se ativou Deafen, muta microfone automaticamente (igual ao Discord)
    if (nextDeafened && !state.isMuted) {
      this.toggleMute(true);
    }

    if (this.localPeer) {
      useHubStore.getState().updateParticipant(this.localParticipantId(), {
        isDeafened: nextDeafened,
      });
    }
    this.broadcastLocalState();
  }

  public async toggleWebcam(): Promise<void> {
    if (useMediaState.getState().cameraBusy) return;
    const generation = ++this.cameraGeneration;
    useMediaState.setState({ error: null });
    const currentState = useHubStore.getState().isWebcamActive;

    if (currentState) {
      if (this.localWebcamStream) {
        this.localWebcamStream.getTracks().forEach((track) => track.stop());
        this.localWebcamStream = null;
      }
      useHubStore.getState().setLocalWebcamStream(null);
      useHubStore.getState().setWebcamActive(false);

      for (const session of this.sessions.values()) {
        if (session.outgoingWebcam) {
          try {
            session.outgoingWebcam.close();
          } catch {
            /* ignore */
          }
          session.outgoingWebcam = null;
        }
      }

      if (this.localPeer) {
        useHubStore.getState().updateParticipant(this.localParticipantId(), {
          isWebcamActive: false,
        });
      }
      this.broadcastLocalState();
    } else {
      if (!useHubStore.getState().inVoiceCall) return;
      useMediaState.setState({ cameraBusy: true });
      try {
        const videoDeviceId = useHubStore.getState().audioConfig.videoDeviceId;
        const constraints: MediaStreamConstraints = {
          video: {
            deviceId:
              videoDeviceId && videoDeviceId !== "default"
                ? { exact: videoDeviceId }
                : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (
          generation !== this.cameraGeneration ||
          !useHubStore.getState().inVoiceCall
        ) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.localWebcamStream = stream;
        stream.getVideoTracks()[0].onended = () => {
          if (this.localWebcamStream === stream) void this.toggleWebcam();
        };
        useHubStore.getState().setLocalWebcamStream(stream);
        useHubStore.getState().setWebcamActive(true);

        if (this.localPeer) {
          useHubStore.getState().updateParticipant(this.localParticipantId(), {
            isWebcamActive: true,
          });
        }
        this.broadcastLocalState();

        // Envia chamada de webcam para irmãos em call de voz
        for (const session of this.sessions.values()) {
          const p = useHubStore.getState().participants[session.peerId];
          if (
            p?.inVoiceCall &&
            this.localPeer &&
            this.canCallSession(session)
          ) {
            this.initiateWebcamCallWithPeer(session);
          }
        }
      } catch (err) {
        mediaError("Câmera indisponível", err);
      } finally {
        if (generation === this.cameraGeneration)
          useMediaState.setState({ cameraBusy: false });
      }
    }
  }

  public async startScreenShare(
    sourceId: string,
    qualityConfig: VideoQualityConfig,
  ): Promise<void> {
    if (
      !useHubStore.getState().inVoiceCall ||
      useMediaState.getState().screenBusy
    )
      return;
    const generation = ++this.screenGeneration;
    let acquired: MediaStream | null = null;
    useMediaState.setState({ screenBusy: true, error: null });
    try {
      if (window.cbsHubAPI) {
        await window.cbsHubAPI.setCaptureSource(
          sourceId,
          qualityConfig.includeSystemAudio,
        );
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: qualityConfig.includeSystemAudio,
      });

      acquired = stream;
      if (
        generation !== this.screenGeneration ||
        !useHubStore.getState().inVoiceCall
      ) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        await videoTrack.applyConstraints({
          width: { ideal: qualityConfig.width, max: qualityConfig.width },
          height: { ideal: qualityConfig.height, max: qualityConfig.height },
          frameRate: { ideal: qualityConfig.fps, max: qualityConfig.fps },
        });

        if ("contentHint" in videoTrack) {
          videoTrack.contentHint =
            qualityConfig.fps >= 60 ? "motion" : "detail";
        }

        videoTrack.onended = () => {
          if (this.localScreenStream === stream) this.stopScreenShare();
        };
      }

      if (
        generation !== this.screenGeneration ||
        !useHubStore.getState().inVoiceCall
      ) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.localScreenStream?.getTracks().forEach((t) => t.stop());
      for (const session of this.sessions.values()) {
        session.outgoingScreen?.close();
        session.outgoingScreen = null;
      }
      this.localScreenStream = stream;
      useHubStore.getState().setLocalScreenStream(stream);
      useHubStore.getState().setScreenSharing(true);
      sounds.playStreamStart();

      if (this.localPeer) {
        useHubStore.getState().updateParticipant(this.localParticipantId(), {
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
      console.error(
        "[WebRTC Engine] Erro ao iniciar compartilhamento de tela:",
        err,
      );
      acquired?.getTracks().forEach((t) => t.stop());
      mediaError("Compartilhamento indisponível", err);
    } finally {
      if (generation === this.screenGeneration)
        useMediaState.setState({ screenBusy: false });
    }
  }

  public stopScreenShare(): void {
    this.screenGeneration++;
    useMediaState.setState({ screenBusy: false });
    if (this.abrIntervalId !== null) {
      clearInterval(this.abrIntervalId);
      this.abrIntervalId = null;
    }

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((track) => track.stop());
      this.localScreenStream = null;
    }

    for (const session of this.sessions.values()) {
      if (session.outgoingScreen) {
        try {
          session.outgoingScreen.close();
        } catch {
          /* ignore */
        }
        session.outgoingScreen = null;
      }
    }

    useHubStore.getState().setLocalScreenStream(null);
    useHubStore.getState().setScreenSharing(false);
    useHubStore.getState().setTelemetry({ active: false });

    if (this.localPeer) {
      useHubStore.getState().updateParticipant(this.localParticipantId(), {
        isScreenSharing: false,
        screenQualityLabel: undefined,
      });
      this.broadcast({
        type: "screen_stopped",
        peerId: this.localPeer.id,
      });
    }

    sounds.playStreamStop();
  }

  /* ========================================================================= */
  /* MICROFONE LOCAL & PIPELINE DE ÁUDIO                                       */
  /* ========================================================================= */

  public async setupLocalMicrophone(
    options: { allowDefaultFallback?: boolean } = {},
  ): Promise<void> {
    const generation = ++this.micGeneration;
    let stream: MediaStream | null = null;
    let pipeline: VoiceAudioPipeline | null = null;
    useMediaState.setState({ microphoneBusy: true, error: null });
    try {
      const audioConfig = useHubStore.getState().audioConfig;
      const useSuppression = Boolean(audioConfig.neuralNoiseGate);
      const audioConstraints: MediaTrackConstraints = {
        deviceId:
          audioConfig.inputDeviceId !== "default"
            ? { exact: audioConfig.inputDeviceId }
            : undefined,
        echoCancellation: audioConfig.echoCancellation,
        autoGainControl: audioConfig.autoGainControl,
        noiseSuppression: useSuppression,
        sampleRate: 48000,
        channelCount: 1,
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      } catch (error) {
        // Só na recuperação automática: se o dispositivo escolhido sumiu ou mudou
        // de id (ex.: headset trocando de perfil), usa o microfone padrão sem
        // alterar a escolha salva do usuário.
        const name = (error as { name?: string } | null)?.name;
        if (
          options.allowDefaultFallback &&
          audioConfig.inputDeviceId !== "default" &&
          (name === "OverconstrainedError" || name === "NotFoundError")
        ) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { ...audioConstraints, deviceId: undefined },
          });
        } else {
          throw error;
        }
      }
      if (generation !== this.micGeneration) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      let previousSpeaking = false,
        lastLevel = -1;
      pipeline = new VoiceAudioPipeline(
        stream,
        audioConfig,
        (isSpeaking, level) => {
          if (
            generation !== this.micGeneration &&
            this.audioPipeline !== pipeline
          )
            return;
          if (lastLevel !== level || previousSpeaking !== isSpeaking)
            useHubStore.getState().setIsLocalSpeaking(isSpeaking, level);
          lastLevel = level;
          if (this.localPeer && previousSpeaking !== isSpeaking) {
            useHubStore
              .getState()
              .updateParticipant(this.localParticipantId(), { isSpeaking });
            if (useHubStore.getState().inVoiceCall)
              this.broadcast({
                type: "speaking",
                peerId: this.localPeer.id,
                isSpeaking,
              });
          }
          previousSpeaking = isSpeaking;
        },
      );
      pipeline.setMicMuted(this.microphoneGated());
      const processed = await pipeline.initialize();
      if (generation !== this.micGeneration) {
        pipeline.destroy();
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const newTrack = processed.getAudioTracks()[0];
      const senders = [...this.sessions.values()].flatMap(
        (session) =>
          session.voiceCall?.peerConnection
            .getSenders()
            .filter((sender) => sender.track?.kind === "audio") || [],
      );
      const oldTrack = this.audioPipeline
        ?.getProcessedStream()
        ?.getAudioTracks()[0];
      const replacements = await Promise.allSettled(
        senders.map((sender) => sender.replaceTrack(newTrack)),
      );
      const failure = replacements.find(
        (result) => result.status === "rejected",
      );
      if (failure?.status === "rejected") {
        await Promise.allSettled(
          senders.map((sender) => sender.replaceTrack(oldTrack || null)),
        );
        throw failure.reason;
      }
      if (generation !== this.micGeneration) {
        pipeline.destroy();
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      soundboardEngine.stopAll();
      this.audioPipeline?.destroy();
      this.rawMicStream?.getTracks().forEach((t) => t.stop());
      pipeline.setMicMuted(this.microphoneGated());
      this.audioPipeline = pipeline;
      this.rawMicStream = stream;
      this.watchMicrophone(stream, pipeline);
      callEvent("microphone_ready");
      useHubStore.getState().setLocalVoiceStream(processed);
      soundboardEngine.registerPipelineHooks(
        () => this.audioPipeline?.getAudioContext() ?? null,
        () => this.audioPipeline?.getSoundboardInputNode() ?? null,
      );
    } catch (error) {
      pipeline?.destroy();
      stream?.getTracks().forEach((t) => t.stop());
      callEvent("microphone_error", { reason: "unknown" });
      mediaError("Microfone indisponível", error);
      throw error;
    } finally {
      if (generation === this.micGeneration)
        useMediaState.setState({ microphoneBusy: false });
    }
  }

  /* Detecta captura interrompida de três formas: faixa encerrada, faixa muda
     (driver/SO silenciou sem encerrar) e AudioContext parado. */
  private watchMicrophone(
    stream: MediaStream,
    pipeline: VoiceAudioPipeline,
  ): void {
    this.clearMicMuteWatchdog();
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.onended = () => this.handleMicInterruption(stream, "microphone_ended");
    track.onmute = () => {
      this.clearMicMuteWatchdog();
      this.micMuteWatchdog = window.setTimeout(() => {
        this.micMuteWatchdog = null;
        if (track.muted) this.handleMicInterruption(stream, "microphone_muted");
      }, this.micMuteWatchdogMs);
    };
    track.onunmute = () => this.clearMicMuteWatchdog();
    pipeline.setInterruptionHandler(() =>
      this.handleMicInterruption(stream, "audio_context_suspended"),
    );
  }

  private handleMicInterruption(
    stream: MediaStream,
    reason: "microphone_ended" | "microphone_muted" | "audio_context_suspended",
  ): void {
    if (
      this.rawMicStream !== stream ||
      useMediaState.getState().microphoneBusy ||
      !useHubStore.getState().inVoiceCall
    )
      return;
    callEvent("microphone_interrupted", { reason });
    // Captura interrompida não tira o usuário da sala nem fecha pares saudáveis.
    if (Date.now() - this.lastMicRecoveredAt > 30000)
      this.micRecoveryAttempt = 0;
    if (this.micRecoveryAttempt > 0)
      mediaError(
        "Microfone interrompido",
        "A chamada continua. Reconectando o microfone…",
      );
    this.scheduleMicRecovery();
  }

  private scheduleMicRecovery(): void {
    if (this.micRecoveryTimer !== null) return;
    if (this.micRecoveryAttempt >= this.micRecoveryDelaysMs.length) {
      mediaError(
        "Microfone sem sinal",
        "A chamada continua, mas o microfone parou de responder. Selecione o microfone novamente.",
      );
      return;
    }
    const delay = this.micRecoveryDelaysMs[this.micRecoveryAttempt++];
    const generation = this.micGeneration;
    this.micRecoveryTimer = window.setTimeout(() => {
      this.micRecoveryTimer = null;
      if (
        generation !== this.micGeneration ||
        !useHubStore.getState().inVoiceCall
      )
        return;
      callEvent("microphone_recovery", {
        attempt: this.micRecoveryAttempt,
        delayMs: delay,
      });
      void this.setupLocalMicrophone({ allowDefaultFallback: true })
        .then(() => {
          if (this.rawMicStream?.active) this.lastMicRecoveredAt = Date.now();
        })
        .catch(() => {
          // A falha já foi informada por setupLocalMicrophone. Tenta de novo só se
          // nada mais mexeu no microfone (saída, troca manual) nesse meio tempo.
          if (this.micGeneration === generation + 1) this.scheduleMicRecovery();
        });
    }, delay);
  }

  private clearMicMuteWatchdog(): void {
    if (this.micMuteWatchdog !== null) clearTimeout(this.micMuteWatchdog);
    this.micMuteWatchdog = null;
  }

  private clearMicRecovery(): void {
    if (this.micRecoveryTimer !== null) clearTimeout(this.micRecoveryTimer);
    this.micRecoveryTimer = null;
    this.clearMicMuteWatchdog();
    this.micRecoveryAttempt = 0;
    this.lastMicRecoveredAt = -Infinity;
  }

  public async selectMicrophone(deviceId: string): Promise<void> {
    if (useMediaState.getState().microphoneBusy) return;
    const previous = useHubStore.getState().audioConfig.inputDeviceId;
    this.updateAudioSettings({ inputDeviceId: deviceId });
    if (useHubStore.getState().inVoiceCall) {
      try {
        await this.setupLocalMicrophone();
      } catch {
        this.updateAudioSettings({ inputDeviceId: previous });
      }
    }
  }

  public async selectCamera(deviceId: string): Promise<void> {
    if (useMediaState.getState().cameraBusy) return;
    if (!useHubStore.getState().isWebcamActive) {
      this.updateAudioSettings({ videoDeviceId: deviceId });
      return;
    }
    const generation = ++this.cameraGeneration;
    const oldStream = this.localWebcamStream;
    let acquired: MediaStream | null = null;
    useMediaState.setState({ cameraBusy: true, error: null });
    try {
      acquired = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId:
            deviceId && deviceId !== "default"
              ? { exact: deviceId }
              : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });
      if (
        generation !== this.cameraGeneration ||
        !useHubStore.getState().inVoiceCall
      ) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = acquired.getVideoTracks()[0];
      const senders = [...this.sessions.values()].flatMap(
        (session) =>
          session.outgoingWebcam?.peerConnection
            .getSenders()
            .filter((sender) => sender.track?.kind === "video") || [],
      );
      const results = await Promise.allSettled(
        senders.map((sender) => sender.replaceTrack(track)),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        await Promise.allSettled(
          senders.map((sender) =>
            sender.replaceTrack(oldStream?.getVideoTracks()[0] || null),
          ),
        );
        throw failure.reason;
      }
      if (
        generation !== this.cameraGeneration ||
        !useHubStore.getState().inVoiceCall
      ) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      const stream = acquired;
      this.localWebcamStream = stream;
      track.onended = () => {
        if (this.localWebcamStream === stream) void this.toggleWebcam();
      };
      useHubStore.getState().setLocalWebcamStream(stream);
      this.updateAudioSettings({ videoDeviceId: deviceId });
      oldStream?.getTracks().forEach((t) => t.stop());
    } catch (error) {
      acquired?.getTracks().forEach((t) => t.stop());
      mediaError("Não foi possível trocar a câmera", error);
    } finally {
      if (generation === this.cameraGeneration)
        useMediaState.setState({ cameraBusy: false });
    }
  }

  public updateAudioSettings(partial: Partial<AudioProcessingConfig>): void {
    useHubStore.getState().updateAudioConfig(partial);
    if (this.audioPipeline) {
      this.audioPipeline.updateConfig(partial);
    }

    // Se o usuário ligou/desligou a supressão de ruído, aplica ao vivo na trilha do microfone
    if (typeof partial.neuralNoiseGate === "boolean" && this.rawMicStream) {
      const audioTrack = this.rawMicStream.getAudioTracks()[0];
      if (audioTrack && typeof audioTrack.applyConstraints === "function") {
        audioTrack
          .applyConstraints({ noiseSuppression: partial.neuralNoiseGate })
          .catch(() => {});
      }
    }

    // Se atualizou remoteStreamVolume ou outputDeviceId, aplica em todas as sessões
    const state = useHubStore.getState();
    for (const session of this.sessions.values()) {
      if (
        session.voiceAudioEl &&
        typeof partial.remoteStreamVolume === "number"
      ) {
        const peerVol = state.peerVolumes[session.clientId] ?? 1.0;
        session.voiceAudioEl.volume = state.isDeafened
          ? 0
          : Math.max(0, Math.min(1.0, peerVol * partial.remoteStreamVolume));
      }

      if (
        partial.outputDeviceId &&
        session.voiceAudioEl &&
        "setSinkId" in session.voiceAudioEl
      ) {
        (
          session.voiceAudioEl as unknown as {
            setSinkId: (id: string) => Promise<void>;
          }
        )
          .setSinkId(partial.outputDeviceId)
          .catch((error) => mediaError("Saída de áudio indisponível", error));
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
      pc.setLocalDescription = async (
        desc?: RTCLocalSessionDescriptionInit,
      ) => {
        if (desc && desc.sdp) {
          desc.sdp = enhanceOpusSdp(desc.sdp, isStereo);
        }
        return origSetLocalDescription(desc);
      };
    } catch (err) {
      console.warn(
        "[WebRTC Engine] Interceptação de setLocalDescription falhou:",
        err,
      );
    }
  }

  private abrStatsGeneration = 0;
  private receiverStatsGeneration = 0;
  private receiverStatsPeerId: string | null = null;
  private publishScreenTelemetry(sample: StreamTelemetry) {
    const state = useHubStore.getState(),
      focus = state.focusedPeerStreamKey;
    if (sample.direction === "outgoing" && !state.isScreenSharing) return;
    const focusPeerId = focus?.startsWith("screen-") ? focus.slice(7) : null;
    const validFocus =
      focusPeerId &&
      (state.participants[focusPeerId]?.isLocal
        ? state.localScreenStream
        : state.remoteStreams[focusPeerId]?.screen);
    if (
      state.callStageMode === "spotlight" &&
      validFocus &&
      focusPeerId !== sample.sourcePeerId
    )
      return;
    useHubStore.getState().setTelemetry(sample);
  }

  private startAbrLoop(
    pc: RTCPeerConnection,
    sender: RTCRtpSender,
    config: VideoQualityConfig,
    linkPeerId: string,
  ): void {
    const generation = ++this.abrStatsGeneration;
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
        if (
          generation !== this.abrStatsGeneration ||
          !useHubStore.getState().isScreenSharing
        )
          return;
        let fps = 0;
        let bitrateMbps = 0;
        let rttMs = 0;
        let packetsLostPercent = 0,
          lossMeasured = false,
          bitrateMeasured = false;

        stats.forEach((report) => {
          if (report.type === "outbound-rtp" && report.kind === "video") {
            if (
              typeof report.framesPerSecond === "number" &&
              report.framesPerSecond > 0
            ) {
              fps = report.framesPerSecond;
            }
            const now = performance.now();
            const deltaMs = now - this.prevSenderTimestamp;
            if (this.prevSenderBytes > 0 && deltaMs > 0 && report.bytesSent) {
              bitrateMeasured = true;
              const bytesDiff = report.bytesSent - this.prevSenderBytes;
              bitrateMbps = Math.max(
                0,
                Number(
                  ((bytesDiff * 8) / (deltaMs / 1000) / 1_000_000).toFixed(2),
                ),
              );
            }
            this.prevSenderBytes = report.bytesSent || 0;
            this.prevSenderTimestamp = now;
          }

          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded"
          ) {
            if (Number.isFinite(report.currentRoundTripTime)) {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
          }

          if (report.type === "remote-inbound-rtp" && report.kind === "video") {
            const packetsLost = report.packetsLost || 0;
            const packetsReceived = report.packetsReceived || 0;
            const total = packetsLost + packetsReceived;
            if (total > 0) {
              lossMeasured = true;
              packetsLostPercent = Math.max(
                0,
                Number(((packetsLost / total) * 100).toFixed(1)),
              );
            }
          }
        });

        let abrStatus: "optimal" | "throttled" | "recovering" =
          this.currentMaxBitrate >= this.targetMaxBitrate
            ? "optimal"
            : "recovering";

        const networkMeasured = rttMs > 0 || lossMeasured;
        if (networkMeasured && (packetsLostPercent > 4.0 || rttMs > 120)) {
          this.consecutiveBadCycles++;
          this.consecutiveGoodCycles = 0;

          if (this.consecutiveBadCycles >= 2) {
            const throttled = Math.max(
              1_500_000,
              Math.round(this.currentMaxBitrate * 0.8),
            );
            if (throttled !== this.currentMaxBitrate) {
              this.currentMaxBitrate = throttled;
              await configureVideoSender(sender, this.currentMaxBitrate);
            }
            abrStatus = "throttled";
          }
        } else if (
          networkMeasured &&
          packetsLostPercent < 0.5 &&
          rttMs <= 100
        ) {
          this.consecutiveBadCycles = 0;
          this.consecutiveGoodCycles++;

          if (this.consecutiveGoodCycles >= 6) {
            const recovered = Math.min(
              this.targetMaxBitrate,
              Math.round(this.currentMaxBitrate * 1.15),
            );
            if (recovered !== this.currentMaxBitrate) {
              this.currentMaxBitrate = recovered;
              await configureVideoSender(sender, this.currentMaxBitrate);
            }
            abrStatus =
              this.currentMaxBitrate >= this.targetMaxBitrate
                ? "optimal"
                : "recovering";
          }
        } else {
          this.consecutiveBadCycles = 0;
          this.consecutiveGoodCycles = 0;
        }

        if (generation !== this.abrStatsGeneration) return;
        this.publishScreenTelemetry({
          sourcePeerId: this.localParticipantId(),
          observedLinkPeerId: linkPeerId,
          direction: "outgoing",
          lossMeasured,
          bitrateMeasured,
          active: true,
          resolution: `Meta ${config.resolution} (${config.width}x${config.height})`,
          fps: Math.round(fps),
          bitrateMbps,
          rttMs,
          packetsLostPercent,
          abrStatus,
        });
      } catch (err) {
        console.warn("[ABR Loop] Erro na leitura de stats:", err);
      }
    }, 1500);
  }

  public observeScreenTelemetry(peerId: string): void {
    const state = useHubStore.getState();
    if (state.participants[peerId]?.isLocal) {
      this.stopReceiverStats();
      return;
    }
    const session = this.sessions.get(peerId),
      stream = state.remoteStreams[peerId]?.screen;
    if (this.receiverStatsPeerId === peerId) return;
    if (session?.screenCall?.peerConnection && stream)
      this.startReceiverStats(
        session.screenCall.peerConnection,
        stream,
        peerId,
      );
  }

  private startReceiverStats(
    pc: RTCPeerConnection,
    stream: MediaStream,
    peerId: string,
  ): void {
    const state = useHubStore.getState(),
      focus = state.focusedPeerStreamKey;
    const focusPeerId = focus?.startsWith("screen-") ? focus.slice(7) : null;
    const validFocus =
      focusPeerId &&
      (state.participants[focusPeerId]?.isLocal
        ? state.localScreenStream
        : state.remoteStreams[focusPeerId]?.screen);
    if (
      state.callStageMode === "spotlight" &&
      validFocus &&
      focusPeerId !== peerId
    )
      return;
    this.stopReceiverStats();
    this.receiverStatsPeerId = peerId;
    const generation = this.receiverStatsGeneration;
    this.prevReceiverBytes = 0;
    this.prevReceiverTimestamp = performance.now();

    this.receiverStatsIntervalId = window.setInterval(async () => {
      try {
        const stats = await pc.getStats();
        if (generation !== this.receiverStatsGeneration || !stream.active)
          return;
        let fps = 0;
        let bitrateMbps = 0;
        let rttMs = 0;
        let packetsLostPercent = 0,
          lossMeasured = false,
          bitrateMeasured = false;
        let resolution = "—";

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          if (settings.width && settings.height) {
            resolution = `${settings.width}x${settings.height}`;
          }
        }

        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video") {
            if (
              typeof report.framesPerSecond === "number" &&
              report.framesPerSecond > 0
            ) {
              fps = report.framesPerSecond;
            }
            const now = performance.now();
            const deltaMs = now - this.prevReceiverTimestamp;
            if (
              this.prevReceiverBytes > 0 &&
              deltaMs > 0 &&
              report.bytesReceived
            ) {
              bitrateMeasured = true;
              const bytesDiff = report.bytesReceived - this.prevReceiverBytes;
              bitrateMbps = Math.max(
                0,
                Number(
                  ((bytesDiff * 8) / (deltaMs / 1000) / 1_000_000).toFixed(2),
                ),
              );
            }
            this.prevReceiverBytes = report.bytesReceived || 0;
            this.prevReceiverTimestamp = now;

            const packetsLost = report.packetsLost || 0;
            const packetsReceived = report.packetsReceived || 0;
            const total = packetsLost + packetsReceived;
            if (total > 0) {
              lossMeasured = true;
              packetsLostPercent = Math.max(
                0,
                Number(((packetsLost / total) * 100).toFixed(1)),
              );
            }
          }

          if (
            report.type === "candidate-pair" &&
            report.state === "succeeded"
          ) {
            if (Number.isFinite(report.currentRoundTripTime)) {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
          }
        });

        this.publishScreenTelemetry({
          sourcePeerId: peerId,
          observedLinkPeerId: peerId,
          direction: "incoming",
          lossMeasured,
          bitrateMeasured,
          active: true,
          resolution,
          fps: Math.round(fps),
          bitrateMbps,
          rttMs,
          packetsLostPercent,
          abrStatus: packetsLostPercent > 4 ? "throttled" : "optimal",
        });
      } catch (err) {
        console.warn("[Receiver Stats] Erro:", err);
      }
    }, 1500);
  }

  private stopReceiverStats(peerId?: string): void {
    if (peerId && this.receiverStatsPeerId !== peerId) return;
    this.receiverStatsGeneration++;
    this.receiverStatsPeerId = null;
    if (this.receiverStatsIntervalId !== null) {
      clearInterval(this.receiverStatsIntervalId);
      this.receiverStatsIntervalId = null;
    }
  }

  /* ========================================================================= */
  /* MÉTODOS PÚBLICOS DE CHAT E SOUNDBOARD                                     */
  /* ========================================================================= */

  public async sendChatMessage(
    content: string,
    replyTo?: string,
  ): Promise<ChatMessage | null> {
    if (!useHubStore.getState().roomId)
      throw new Error("Entre em uma sala para enviar mensagens.");
    await storageDb.requirePersistentStorage();
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (trimmed.length > 8000)
      throw new Error("Limite de 8000 caracteres por mensagem.");

    const state = useHubStore.getState();
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "msg-" + Date.now();

    const msg: ChatMessage = {
      id,
      roomId: state.roomId,
      type: "user",
      ...(replyTo ? { replyTo } : {}),
      delivery: "queued",
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
      type: "chat_message",
      message: msg,
    });

    return msg;
  }

  public async toggleMessageReaction(
    messageId: string,
    emoji: string,
  ): Promise<void> {
    const state = useHubStore.getState();
    const msg = state.messages.find((m) => m.id === messageId);
    await this.mutateChat(messageId, "reaction", {
      emoji,
      active: !msg?.reactions[emoji]?.reactorClientIds.includes(state.clientId),
    });
  }

  public sendTypingState(isTyping: boolean): void {
    const state = useHubStore.getState();
    this.broadcast({
      type: "chat_typing",
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
      useHubStore.getState().updateParticipant(this.localParticipantId(), {
        activeSoundEffect: {
          emoji: clip.emoji,
          name: clip.name,
          expiresAt: Date.now() + 3500,
        },
      });

      // Notifica todos os irmãos para exibirem o badge animado
      this.broadcast({
        type: "soundboard_triggered",
        peerId: this.localPeer.id,
        clientId: state.clientId,
        nickname: state.nickname,
        emoji: clip.emoji,
        soundName: clip.name,
      });

      soundActivity(
        state.roomId,
        state.clientId,
        state.nickname,
        clip.emoji,
        clip.name,
      );

      window.setTimeout(() => {
        const current =
          useHubStore.getState().participants[this.localPeer?.id || ""];
        if (current?.activeSoundEffect?.name === clip.name) {
          useHubStore.getState().updateParticipant(this.localParticipantId(), {
            activeSoundEffect: null,
          });
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
    this.recoveryActive = false;
    this.waitingForMedia.clear();
    this.discoveryConfirmed = false;
    this.closeDirectory();
    endCallDiagnostics("room_left");
    this.pushToTalkHeld = false;
    this.recoveryCancelled = false;
    this.recoveryAttempts = 0;
    this.roomGeneration++;
    this.micGeneration++;
    this.clearMicRecovery();
    this.cameraGeneration++;
    this.screenGeneration++;
    this.currentRoomSlug = "";
    this.joiningVoice = false;
    if (this.recoveryTimer !== null) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    useMediaState.setState({
      microphoneBusy: false,
      cameraBusy: false,
      screenBusy: false,
      reconnecting: false,
      signaling: "idle",
      recoveryAttempt: 0,
      recoveryPhase: "idle",
      recoveryMissingMedia: 0,
      quality: {},
    });
    const leavingPeer = this.localPeer;
    this.localPeer = null;
    if (this.beaconHealTimeout !== null) {
      clearTimeout(this.beaconHealTimeout);
      this.beaconHealTimeout = null;
    }

    this.stopScreenShare();
    this.stopReceiverStats();
    this.stopHeartbeat();
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
    const leavingSessions = [...this.sessions.values()];
    this.sessions.clear();
    for (const session of leavingSessions) {
      if (session.dataConnectTimer) clearTimeout(session.dataConnectTimer);
      session.dataConnectTimer = undefined;
      this.closeBlockedMedia(session);
      this.teardownPeerVoiceAudio(session);
      if (session.voiceCall) {
        try {
          session.voiceCall.close();
        } catch {
          /* ignore */
        }
      }
      if (session.webcamCall) {
        try {
          session.webcamCall.close();
        } catch {
          /* ignore */
        }
      }
      if (session.screenCall) {
        try {
          session.screenCall.close();
        } catch {
          /* ignore */
        }
      }
      if (session.dataConn) {
        try {
          session.dataConn.close();
        } catch {
          /* ignore */
        }
      }
    }
    this.sessions.clear();

    if (this.beaconPeer) {
      try {
        this.beaconPeer.destroy();
      } catch {
        /* ignore */
      }
      this.beaconPeer = null;
      this.isBeaconOwner = false;
    }

    if (leavingPeer) {
      try {
        leavingPeer.destroy();
      } catch {
        /* ignore */
      }
      this.localPeer = null;
    }

    sounds.playLeave();
    useHubStore.getState().resetSession();
  }
}

export const webrtcEngine = new WebRTCEngine();
