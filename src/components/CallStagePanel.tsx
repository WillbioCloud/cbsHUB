import React, { useRef, useState, useEffect } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Zap,
  Volume2,
  VolumeX,
  Activity,
  Mic,
  MicOff,
  Headphones,
  Tv,
} from 'lucide-react';
import { useHubStore } from '../store/useHubStore';
import { webrtcEngine } from '../lib/webrtcEngine';
import { UserCallCard, ScreenShareTile } from './UserCallCard';
import { CallControlDock } from './CallControlDock';
import { Button } from './ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import type { Participant } from '../types/cbshub';

export const CallStagePanel: React.FC = () => {
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
  } = useHubStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [isMutedStream, setIsMutedStream] = useState(false);

  const spotlightVideoRef = useRef<HTMLVideoElement>(null);
  const spotlightContainerRef = useRef<HTMLDivElement>(null);

  // Lista de participantes que estão na chamada de voz
  const participantsInVoice = Object.values(participants).filter((p) => p.inVoiceCall);
  const inVoiceCount = participantsInVoice.length;

  // Participantes compartilhando tela
  const screenSharers: Array<{ participant: Participant; stream: MediaStream; key: string }> = [];

  for (const p of Object.values(participants)) {
    if (p.isScreenSharing) {
      const stream = p.isLocal ? localScreenStream : remoteStreams[p.peerId]?.screen;
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
  let focusedItem: { participant: Participant; stream: MediaStream } | null = null;
  if (screenSharers.length > 0) {
    const found = screenSharers.find((s) => s.key === focusedPeerStreamKey) || screenSharers[0];
    focusedItem = { participant: found.participant, stream: found.stream };
  }

  useEffect(() => {
    if (spotlightVideoRef.current && focusedItem?.stream) {
      spotlightVideoRef.current.srcObject = focusedItem.stream;
      spotlightVideoRef.current.play().catch(() => {});
    }
  }, [focusedItem?.stream, callStageMode]);

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
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const toggleFullscreen = () => {
    if (!spotlightContainerRef.current) return;
    if (!document.fullscreenElement) {
      spotlightContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const toggleMuteStream = () => {
    if (spotlightVideoRef.current) {
      spotlightVideoRef.current.muted = !isMutedStream;
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
      <div className="bg-zinc-950 border-b border-border px-4 py-2.5 flex items-center justify-between select-none shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2 overflow-hidden">
            {participantsInVoice.slice(0, 4).map((p) => (
              <div
                key={p.peerId}
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-white uppercase border-2 border-zinc-950 shadow ${
                  p.isSpeaking ? 'ring-2 ring-emerald-500' : ''
                }`}
                style={{ backgroundColor: p.avatarColor || 'hsl(var(--primary))' }}
              >
                {p.nickname.slice(0, 2).toUpperCase()}
              </div>
            ))}
          </div>

          <div className="text-xs">
            <span className="font-semibold text-emerald-400">
              {inVoiceCount} {inVoiceCount === 1 ? 'irmão está' : 'irmãos estão'} na chamada de voz
            </span>
          </div>
        </div>

        <Button
          size="sm"
          onClick={() => webrtcEngine.joinVoiceCall()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow"
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
  if (callStageMode === 'minimized') {
    return (
      <div className="h-12 bg-zinc-950 border-b border-border px-4 flex items-center justify-between select-none shrink-0 z-20">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-foreground">Chamada em Andamento</span>
          <div className="flex -space-x-1.5 overflow-hidden ml-2">
            {participantsInVoice.map((p) => (
              <div
                key={p.peerId}
                title={p.nickname}
                className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[9px] text-white uppercase border-2 border-zinc-950 ${
                  p.isSpeaking ? 'ring-2 ring-emerald-500' : ''
                }`}
                style={{ backgroundColor: p.avatarColor || 'hsl(var(--primary))' }}
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
            className={`h-7 w-7 rounded-md ${isMuted ? 'text-destructive bg-destructive/10' : 'text-muted-foreground'}`}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => webrtcEngine.toggleDeafen()}
            className={`h-7 w-7 rounded-md ${isDeafened ? 'text-destructive bg-destructive/10' : 'text-muted-foreground'}`}
          >
            <Headphones className={`w-3.5 h-3.5 ${isDeafened ? 'line-through text-destructive' : ''}`} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCallStageMode('grid')}
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
  if (callStageMode === 'spotlight' && focusedItem) {
    const isLocal = focusedItem.participant.isLocal;

    return (
      <div
        ref={spotlightContainerRef}
        onDoubleClick={toggleFullscreen}
        style={{ height: `${callStageHeight}px`, minHeight: '360px' }}
        className="relative bg-zinc-950 border-b border-border flex flex-col justify-between overflow-hidden select-none shrink-0"
      >
        {/* Vídeo Focado 4K */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
          <video
            ref={spotlightVideoRef}
            autoPlay
            playsInline
            muted={isLocal || isMutedStream}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* HUD de Telemetria no Topo Esquerdo */}
          {showHud && telemetry.active && (
            <div className="absolute top-3 left-3 z-20 backdrop-blur-md bg-black/80 border border-white/10 rounded-xl px-3 py-2 shadow-2xl text-xs space-y-1">
              <div className="flex items-center gap-2 border-b border-white/10 pb-1 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-extrabold text-white uppercase text-[11px] tracking-wider">
                  {isLocal ? 'Sua Transmissão Local' : `Tela de ${focusedItem.participant.nickname}`}
                </span>
                <span className="text-[9px] px-1.5 py-0.2 bg-primary/20 text-primary-foreground rounded font-mono font-bold">
                  Mesh P2P
                </span>
              </div>

              <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px]">
                <span className="font-semibold text-white">{telemetry.resolution}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-emerald-400 font-bold">{telemetry.fps} FPS</span>
                <span className="text-zinc-600">•</span>
                <span className="text-blue-400 font-bold">{telemetry.bitrateMbps} Mbps</span>
                <span className="text-zinc-600">•</span>
                <span className="text-amber-400 font-bold">{telemetry.rttMs} ms</span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span className="font-semibold uppercase text-[9px]">
                    {telemetry.abrStatus === 'optimal'
                      ? 'ABR: Optimal 60FPS'
                      : telemetry.abrStatus === 'throttled'
                      ? 'ABR: Throttled'
                      : 'ABR: Recuperando'}
                  </span>
                </span>
                <span>Perda: {telemetry.packetsLostPercent}%</span>
              </div>
            </div>
          )}

          {/* Botões do Topo Direito */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowHud(!showHud)}
                  className="p-1.5 rounded-lg backdrop-blur-md bg-black/60 border border-white/10 text-zinc-300 hover:text-white hover:bg-black/80 transition-colors"
                >
                  <Zap className={`w-4 h-4 ${showHud ? 'text-amber-400' : 'text-zinc-400'}`} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {showHud ? 'Ocultar Telemetria' : 'Exibir Telemetria'}
              </TooltipContent>
            </Tooltip>

            {!isLocal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleMuteStream}
                    className="p-1.5 rounded-lg backdrop-blur-md bg-black/60 border border-white/10 text-zinc-300 hover:text-white hover:bg-black/80 transition-colors"
                  >
                    {isMutedStream ? (
                      <VolumeX className="w-4 h-4 text-destructive" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isMutedStream ? 'Desmutar Áudio da Tela' : 'Mutar Áudio da Tela'}
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg backdrop-blur-md bg-black/60 border border-white/10 text-zinc-300 hover:text-white hover:bg-black/80 transition-colors"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Tela Cheia</TooltipContent>
            </Tooltip>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCallStageMode('grid')}
              className="h-8 text-xs px-2.5 flex items-center gap-1 shadow-md ml-1"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Voltar para Grade</span>
            </Button>
          </div>
        </div>

        {/* Tira Horizontal de Mini-Cards dos Irmãos (para continuar vendo quem fala) */}
        <div className="h-24 bg-zinc-950/90 border-t border-border px-3 py-1.5 flex items-center justify-between gap-2 overflow-x-auto shrink-0 z-20">
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {participantsInVoice.map((p) => (
              <UserCallCard key={p.peerId} participant={p} isCompact />
            ))}
          </div>

          <div className="pl-2 shrink-0">
            <CallControlDock />
          </div>
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

  const getGridColsClass = () => {
    if (totalTiles <= 1) return 'grid-cols-1 max-w-xl';
    if (totalTiles === 2) return 'grid-cols-2 max-w-4xl';
    if (totalTiles <= 4) return 'grid-cols-2 max-w-4xl';
    if (totalTiles <= 6) return 'grid-cols-3 max-w-6xl';
    return 'grid-cols-3 max-w-6xl';
  };

  return (
    <div
      style={{ height: `${callStageHeight}px` }}
      className="relative bg-zinc-950 border-b border-border flex flex-col justify-between overflow-hidden select-none shrink-0"
    >
      {/* Grade de Cards Responsiva */}
      <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
        <div className={`grid gap-3 w-full mx-auto items-center justify-center ${getGridColsClass()}`}>
          {/* Tiles de Transmissão de Tela */}
          {screenSharers.map(({ participant, stream, key }) => (
            <ScreenShareTile
              key={key}
              participant={participant}
              stream={stream}
              onFocus={() => {
                setFocusedPeerStreamKey(key);
                setCallStageMode('spotlight');
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
          <CallControlDock />
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

