import { useElementSize } from "../hooks/useElementSize";
import { callGrid } from "../lib/callGrid";
import { useShallow } from "zustand/react/shallow";
import { useMediaOutput } from "../hooks/useMediaOutput";
import React, { useRef, useState, useEffect } from "react";
import {
  PhoneCall,
  PhoneOff,
  Maximize2,
  Minimize2,
  LayoutGrid,
  ChevronDown,
  Zap,
  Volume2,
  VolumeX,
  Activity,
  Mic,
  MicOff,
  Headphones,
  Tv,
} from "lucide-react";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
import { UserCallCard, ScreenShareTile } from "./UserCallCard";
import { CallControls } from "./CallControls";
import { Button } from "./ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import type { Participant } from "../types/cbshub";

export const CallStagePanel: React.FC = () => {
  const gridBounds = useElementSize();
  const spotlightBounds = useElementSize();

  const {
    inVoiceCall,
    callStageMode,
    callStageHeight,
    focusedPeerStreamKey,
    participants,
    localScreenStream,
    remoteStreams,
    telemetry,
    isMuted,
    isDeafened,
    setCallStageMode,
    setCallStageHeight,
    setFocusedPeerStreamKey,
  } = useHubStore(
    useShallow((state) => ({
      inVoiceCall: state.inVoiceCall,
      callStageMode: state.callStageMode,
      callStageHeight: state.callStageHeight,
      focusedPeerStreamKey: state.focusedPeerStreamKey,
      participants: state.participants,
      localScreenStream: state.localScreenStream,
      remoteStreams: state.remoteStreams,
      telemetry: state.telemetry,
      isMuted: state.isMuted,
      isDeafened: state.isDeafened,
      setCallStageMode: state.setCallStageMode,
      setCallStageHeight: state.setCallStageHeight,
      setFocusedPeerStreamKey: state.setFocusedPeerStreamKey,
    })),
  );

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [isMutedStream, setIsMutedStream] = useState(false);

  const spotlightVideoRef = useRef<HTMLVideoElement>(null);
  const spotlightContainerRef = useRef<HTMLDivElement>(null);

  // Lista de participantes que estão na chamada de voz
  const participantsInVoice = Object.values(participants).filter(
    (p) => p.inVoiceCall,
  );
  const inVoiceCount = participantsInVoice.length;
  const spotlightGeometry = callGrid(
    spotlightBounds.width,
    spotlightBounds.height,
    inVoiceCount,
    spotlightBounds.gap,
  );

  // Participantes compartilhando tela
  const screenSharers: Array<{
    participant: Participant;
    stream: MediaStream;
    key: string;
  }> = [];

  for (const p of Object.values(participants)) {
    if (p.isScreenSharing) {
      const stream = p.isLocal
        ? localScreenStream
        : remoteStreams[p.peerId]?.screen;
      if (stream) {
        screenSharers.push({
          participant: p,
          stream,
          key: `screen-${p.peerId}`,
        });
      }
    }
  }

  // Stream focado no modo Spotlight
  let focusedItem: { participant: Participant; stream: MediaStream } | null =
    null;
  if (screenSharers.length > 0) {
    const found =
      screenSharers.find((s) => s.key === focusedPeerStreamKey) ||
      screenSharers[0];
    focusedItem = { participant: found.participant, stream: found.stream };
  }

  useMediaOutput(
    spotlightVideoRef,
    focusedItem?.participant.clientId || "",
    callStageMode === "spotlight" ? focusedItem?.stream : null,
  );
  useEffect(() => {
    const listener = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);
  useEffect(() => {
    if (spotlightVideoRef.current && focusedItem?.stream) {
      spotlightVideoRef.current.srcObject = focusedItem.stream;
      spotlightVideoRef.current.play().catch(() => {});
    }
  }, [focusedItem?.stream, callStageMode]);

  useEffect(() => {
    const state = useHubStore.getState();
    const key = state.focusedPeerStreamKey;
    const id = key?.startsWith("screen-") ? key.slice(7) : null;
    const valid =
      id &&
      (state.participants[id]?.isLocal
        ? state.localScreenStream
        : state.remoteStreams[id]?.screen);
    const expected = valid ? id : focusedItem?.participant.peerId;
    if (state.callStageMode === "spotlight" && expected)
      webrtcEngine.observeScreenTelemetry(expected);
    if (
      state.callStageMode === "spotlight" &&
      state.telemetry.active &&
      state.telemetry.sourcePeerId !== expected
    )
      state.setTelemetry({ active: false });
  }, [focusedPeerStreamKey, focusedItem?.participant.peerId]);

  // Redimensionamento arrastando a borda inferior
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = callStageHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const maxHeight = window.innerHeight * 0.75;
      const newHeight = Math.min(maxHeight, Math.max(180, startHeight + delta));
      setCallStageHeight(newHeight);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const toggleFullscreen = () => {
    if (!spotlightContainerRef.current) return;
    if (!document.fullscreenElement) {
      spotlightContainerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  const toggleMuteStream = () => {
    if (spotlightVideoRef.current) {
      setIsMutedStream(!isMutedStream);
    }
  };

  /* ========================================================================= */
  /* CASO 1: USUÁRIO FORA DA CHAMADA DE VOZ                                    */
  /* ========================================================================= */
  if (!inVoiceCall) {
    if (inVoiceCount === 0) {
      // Nenhum irmão em voz: 0px livre para o Chat
      return null;
    }

    // Irmãos em voz: banner compacto no topo
    return (
      <div className="bg-surface border-b border-border px-4 py-2.5 flex items-center justify-between select-none shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2 overflow-hidden">
            {participantsInVoice.slice(0, 4).map((p) => (
              <div
                key={p.peerId}
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-2xs text-white uppercase border-2 border-surface shadow ${
                  p.isSpeaking ? "ring-2 ring-success" : ""
                }`}
                style={{ backgroundColor: p.avatarColor || "var(--primary)" }}
              >
                {p.nickname.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>

          <div className="text-xs">
            <span className="font-semibold text-success">
              {inVoiceCount}{" "}
              {inVoiceCount === 1 ? "irmão está" : "irmãos estão"} na chamada de
              voz
            </span>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => webrtcEngine.joinVoiceCall()}
          className="bg-success hover:bg-success/90 text-primary-foreground h-7 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow"
        >
          <PhoneCall className="w-3.5 h-3.5" />
          <span>Entrar na Chamada</span>
        </Button>
      </div>
    );
  }

  /* ========================================================================= */
  /* CASO 2: USUÁRIO NA CHAMADA — MODO MINIMIZADO                              */
  /* ========================================================================= */
  if (callStageMode === "minimized") {
    return (
      <div className="h-12 bg-surface border-b border-border px-4 flex items-center justify-between select-none shrink-0 z-20">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-semibold text-foreground">
            Chamada em Andamento
          </span>
          <div className="flex -space-x-1.5 overflow-hidden ml-2">
            {participantsInVoice.map((p) => (
              <div
                key={p.peerId}
                title={p.nickname}
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-micro text-white uppercase border-2 border-surface ${
                  p.isSpeaking ? "ring-2 ring-success" : ""
                }`}
                style={{ backgroundColor: p.avatarColor || "var(--primary)" }}
              >
                {p.nickname.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => webrtcEngine.toggleMute()}
            className={`h-7 w-7 rounded-md ${isMuted ? "text-destructive bg-destructive/10" : "text-muted-foreground"}`}
          >
            {isMuted ? (
              <MicOff className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => webrtcEngine.toggleDeafen()}
            className={`h-7 w-7 rounded-md ${isDeafened ? "text-destructive bg-destructive/10" : "text-muted-foreground"}`}
          >
            <Headphones
              className={`w-3.5 h-3.5 ${isDeafened ? "line-through text-destructive" : ""}`}
            />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCallStageMode("grid")}
            className="h-7 text-xs px-2.5 flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Expandir Palco</span>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => webrtcEngine.leaveVoiceCall()}
            className="h-7 px-2.5 text-xs font-medium"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  /* ========================================================================= */
  /* CASO 3: USUÁRIO NA CHAMADA — MODO FOCO 4K60 (SPOTLIGHT)                   */
  /* ========================================================================= */
  if (callStageMode === "spotlight" && focusedItem) {
    const isLocal = focusedItem.participant.isLocal;

    return (
      <div
        ref={spotlightContainerRef}
        onDoubleClick={toggleFullscreen}
        style={{
          height: `${callStageHeight}px`,
          containerType: "size",
          maxHeight: "55dvh",
        }}
        className="relative bg-surface border-b border-border flex flex-col justify-between overflow-hidden select-none shrink-0"
      >
        {/* Vídeo Focado 4K */}
        <div className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-black overflow-hidden">
          <video
            ref={spotlightVideoRef}
            autoPlay
            playsInline
            muted={isLocal || isMutedStream || isDeafened}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* HUD de Telemetria no Topo Esquerdo */}
          {showHud &&
            telemetry.active &&
            telemetry.sourcePeerId === focusedItem.participant.peerId && (
              <div
                data-stream-metrics={telemetry.sourcePeerId}
                className="absolute top-3 left-3 z-20 backdrop-blur-md bg-black/80 border border-border rounded-xl px-3 py-2 shadow-2xl text-xs space-y-1"
              >
                <div className="flex items-center gap-2 border-b border-border pb-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-success animate-ping" />
                  <span className="font-extrabold text-white uppercase text-caption tracking-wider">
                    {isLocal
                      ? "Sua Transmissão Local"
                      : `Tela de ${focusedItem.participant.nickname}`}
                  </span>
                  <span className="text-micro px-1.5 py-0.2 bg-primary/20 text-primary-foreground rounded font-mono font-bold">
                    Ao vivo
                  </span>
                </div>

                <div className="flex items-center gap-2 text-foreground font-mono text-caption">
                  <span className="font-semibold text-white">
                    {telemetry.resolution}
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-success font-bold">
                    {telemetry.fps > 0
                      ? `${telemetry.fps} FPS`
                      : "FPS indisponível"}
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-primary font-bold">
                    {telemetry.bitrateMeasured
                      ? `${telemetry.bitrateMbps} Mbps`
                      : "Bitrate indisponível"}
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-warning font-bold">
                    {telemetry.rttMs > 0
                      ? `${telemetry.rttMs} ms (enlace)`
                      : "RTT indisponível"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-2xs text-muted-foreground pt-0.5">
                  <span className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-success" />
                    <span className="font-semibold uppercase text-micro">
                      {telemetry.abrStatus === "optimal"
                        ? "Qualidade estável"
                        : telemetry.abrStatus === "throttled"
                          ? "Qualidade ajustada"
                          : "Recuperando qualidade"}
                    </span>
                  </span>
                  <span>
                    Perda:{" "}
                    {telemetry.lossMeasured
                      ? telemetry.packetsLostPercent + "%"
                      : "indisponível"}
                  </span>
                </div>
              </div>
            )}

          {/* Botões do Topo Direito */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowHud(!showHud)}
                  className="p-1.5 rounded-lg backdrop-blur-md bg-black/60 border border-border text-foreground hover:text-white hover:bg-black/80 transition-colors"
                >
                  <Zap
                    className={`w-4 h-4 ${showHud ? "text-warning" : "text-muted-foreground"}`}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {showHud ? "Ocultar Telemetria" : "Exibir Telemetria"}
              </TooltipContent>
            </Tooltip>

            {!isLocal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleMuteStream}
                    className="p-1.5 rounded-lg backdrop-blur-md bg-black/60 border border-border text-foreground hover:text-white hover:bg-black/80 transition-colors"
                  >
                    {isMutedStream ? (
                      <VolumeX className="w-4 h-4 text-destructive" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-success" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isMutedStream
                    ? "Desmutar Áudio da Tela"
                    : "Mutar Áudio da Tela"}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg backdrop-blur-md bg-black/60 border border-border text-foreground hover:text-white hover:bg-black/80 transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Tela Cheia</TooltipContent>
            </Tooltip>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCallStageMode("grid")}
              className="h-8 text-xs px-2.5 flex items-center gap-1 shadow-md ml-1"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Voltar para Grade</span>
            </Button>
          </div>
        </div>

        {/* Tira Horizontal de Mini-Cards dos Irmãos (para continuar vendo quem fala) */}
        <div className="call-spotlight-footer bg-surface/90 border-t border-border px-3 py-1.5 flex items-center justify-between gap-2 min-w-0 shrink-0 z-20">
          <div
            ref={spotlightBounds.ref}
            className="call-spotlight-area flex-1 min-w-0 h-full flex items-center justify-center"
          >
            <div
              className="call-spotlight-grid grid"
              style={{
                gridTemplateColumns: `repeat(${spotlightGeometry.columns}, ${spotlightGeometry.width}px)`,
                gridAutoRows: `${spotlightGeometry.height}px`,
                gap: spotlightGeometry.gap,
                width:
                  spotlightGeometry.width * spotlightGeometry.columns +
                  spotlightGeometry.gap * (spotlightGeometry.columns - 1),
              }}
            >
              {participantsInVoice.map((p) => (
                <UserCallCard key={p.peerId} participant={p} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-center shrink-0">
          <CallControls />
        </div>

        {/* Handle de Redimensionamento */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="cursor-row-resize h-1.5 hover:bg-primary/50 transition-colors w-full absolute bottom-0 left-0 right-0 z-30"
        />
      </div>
    );
  }

  /* ========================================================================= */
  /* CASO 4: USUÁRIO NA CHAMADA — MODO GRADE DINÂMICA (GRID DEFAULT)           */
  /* ========================================================================= */
  const totalTiles = participantsInVoice.length + screenSharers.length;

  const geometry = callGrid(
    gridBounds.width,
    gridBounds.height,
    totalTiles,
    gridBounds.gap,
  );

  return (
    <div
      style={{
        height: expanded ? "75dvh" : `${callStageHeight}px`,
        maxHeight: expanded ? "75dvh" : "50dvh",
      }}
      className="relative bg-surface border-b border-border flex flex-col justify-between overflow-hidden select-none shrink-0"
    >
      <div className="call-stage-toolbar">
        <span className="truncate min-w-0 text-muted-foreground">
          {inVoiceCount} participantes ·{" "}
          {participantsInVoice
            .filter((p) => p.isSpeaking && !p.isMuted)
            .map((p) => p.nickname)
            .join(", ") || "Ninguém falando"}
        </span>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            className="call-toolbar-action"
            aria-label={expanded ? "Reduzir painel" : "Expandir painel"}
            title={expanded ? "Reduzir painel" : "Expandir painel"}
            aria-pressed={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="call-toolbar-action"
            aria-label="Minimizar painel"
            title="Minimizar painel"
            onClick={() => setCallStageMode("minimized")}
          >
            <ChevronDown className="size-3.5" />
          </Button>
        </div>
      </div>
      {/* Grade de Cards Responsiva */}
      <div
        ref={gridBounds.ref}
        className="call-grid-area min-h-0 flex-1 overflow-hidden p-3"
      >
        <div
          className="call-responsive-grid grid gap-3 mx-auto"
          style={{
            gridTemplateColumns: `repeat(${geometry.columns},minmax(0,1fr))`,
            gridAutoRows: `${geometry.height}px`,
            width:
              geometry.width * geometry.columns +
              geometry.gap * (geometry.columns - 1),
            gap: geometry.gap,
          }}
        >
          {/* Tiles de Transmissão de Tela */}
          {screenSharers.map(({ participant, stream, key }) => (
            <ScreenShareTile
              key={key}
              participant={participant}
              stream={stream}
              onFocus={() => {
                setFocusedPeerStreamKey(key);
                setCallStageMode("spotlight");
              }}
            />
          ))}

          {/* Cards dos Usuários na Voz */}
          {participantsInVoice.map((p) => (
            <UserCallCard key={p.peerId} participant={p} />
          ))}
        </div>
      </div>

      {/* Dock de Controles Centralizada na Base */}
      <div className="pb-3 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <CallControls />
        </div>
      </div>

      {/* Handle de Redimensionamento */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="cursor-row-resize h-1.5 hover:bg-primary/50 transition-colors w-full absolute bottom-0 left-0 right-0 z-30"
      />
    </div>
  );
};
