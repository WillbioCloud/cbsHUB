import React, { useRef, useEffect, useState } from 'react';
import {
  MicOff,
  Headphones,
  Maximize2,
  Volume2,
  VolumeX,
  Radio,
  Sliders,
  Tv,
} from 'lucide-react';
import { useHubStore } from '../store/useHubStore';
import { webrtcEngine } from '../lib/webrtcEngine';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import type { Participant } from '../types/cbshub';

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface UserCallCardProps {
  participant: Participant;
  isCompact?: boolean;
}

export const UserCallCard: React.FC<UserCallCardProps> = ({ participant, isCompact = false }) => {
  const { localWebcamStream, remoteStreams, peerVolumes } = useHubStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const isLocal = participant.isLocal;
  const webcamStream = isLocal ? localWebcamStream : remoteStreams[participant.peerId]?.webcam;
  const hasActiveWebcam = participant.isWebcamActive && Boolean(webcamStream);
  const isSpeakingNow = participant.isSpeaking && !participant.isMuted;
  const volume = peerVolumes[participant.clientId] ?? 1.0;

  useEffect(() => {
    if (videoRef.current && webcamStream) {
      videoRef.current.srcObject = webcamStream;
      videoRef.current.play().catch(() => {});
    }
  }, [webcamStream]);

  const soundEffect = participant.activeSoundEffect;
  const isSoundActive = soundEffect && soundEffect.expiresAt > Date.now();

  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 overflow-hidden flex items-center justify-center select-none group bg-[#141418] ${
        isCompact ? 'h-20 w-32 shrink-0' : 'w-full h-full min-h-[140px] aspect-video'
      } ${
        isSpeakingNow
          ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
          : 'border-white/[0.07] hover:border-white/20'
      }`}
    >
      {/* 1. Vídeo da Webcam ou Avatar Centralizado */}
      {hasActiveWebcam ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-2">
          <div
            className={`rounded-full flex items-center justify-center font-bold text-white uppercase shadow-md transition-all duration-200 ${
              isCompact ? 'w-10 h-10 text-xs' : 'w-16 h-16 text-lg'
            } ${
              isSpeakingNow
                ? 'ring-4 ring-emerald-500 shadow-xl shadow-emerald-500/40 animate-pulse'
                : 'ring-1 ring-white/10'
            }`}
            style={{ backgroundColor: participant.avatarColor || 'hsl(var(--primary))' }}
          >
            {getInitials(participant.nickname)}
          </div>
        </div>
      )}

      {/* 2. Badge Flutuante Animada de Soundboard */}
      {isSoundActive && (
        <div className="absolute top-2 z-20 animate-bounce bg-zinc-950/95 border border-primary/50 text-foreground px-2.5 py-1 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-1.5 backdrop-blur-md">
          <span className="text-sm">{soundEffect.emoji}</span>
          <span className="truncate max-w-[120px]">{soundEffect.name}</span>
        </div>
      )}

      {/* 3. Rodapé Inferior: Nickname (Esquerda) e Badges de Mídia (Direita) */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1 pointer-events-none z-10">
        <div className="bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 text-white text-[11px] font-medium flex items-center gap-1 truncate max-w-[70%]">
          <span className="truncate">{participant.nickname}</span>
          {isLocal && (
            <span className="text-[9px] font-mono text-muted-foreground shrink-0">
              (Você)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {participant.isMuted && (
            <div className="bg-destructive/90 text-destructive-foreground p-1 rounded-md shadow flex items-center justify-center">
              <MicOff className="w-3 h-3" />
            </div>
          )}
          {participant.isDeafened && (
            <div className="bg-destructive/90 text-destructive-foreground p-1 rounded-md shadow flex items-center justify-center">
              <Headphones className="w-3 h-3 line-through" />
            </div>
          )}

          {/* Botão de Controle Rápido de Volume (se remoto) */}
          {!isLocal && (
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  aria-label="Ajustar Volume"
                  className="pointer-events-auto bg-black/70 hover:bg-black/90 text-white p-1 rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Sliders className="w-3 h-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="w-60 p-3 space-y-2 pointer-events-auto">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5 text-primary" />
                    <span>Volume de {participant.nickname}</span>
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
                <Slider
                  min={0}
                  max={2}
                  step={0.05}
                  value={[volume]}
                  onValueChange={([val]) => webrtcEngine.setPeerVolume(participant.clientId, val)}
                />
                <div className="flex justify-between items-center pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => webrtcEngine.setPeerVolume(participant.clientId, volume === 0 ? 1 : 0)}
                    className="h-6 text-[10px] px-2 text-muted-foreground"
                  >
                    {volume === 0 ? 'Desmutar' : 'Mutar'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => webrtcEngine.setPeerVolume(participant.clientId, 1.0)}
                    className="h-6 text-[10px] px-2 text-muted-foreground"
                  >
                    100%
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
};

interface ScreenShareTileProps {
  participant: Participant;
  stream: MediaStream;
  onFocus: () => void;
  isFocused?: boolean;
}

export const ScreenShareTile: React.FC<ScreenShareTileProps> = ({
  participant,
  stream,
  onFocus,
  isFocused = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isLocal = participant.isLocal;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div
      onClick={onFocus}
      className={`relative rounded-xl border border-white/10 bg-black overflow-hidden flex items-center justify-center select-none group cursor-pointer aspect-video w-full h-full min-h-[140px] shadow-lg transition-all ${
        isFocused ? 'ring-2 ring-primary' : 'hover:border-primary/50'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-contain pointer-events-none"
      />

      {/* Badge Superior Direito: AO VIVO */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white font-bold text-[10px] shadow-md tracking-wider">
        <Radio className="w-3 h-3 animate-pulse" />
        <span>AO VIVO</span>
        {participant.screenQualityLabel && (
          <>
            <span className="opacity-70">•</span>
            <span>{participant.screenQualityLabel}</span>
          </>
        )}
      </div>

      {/* Overlay no Hover: Assistir no Palco */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 z-20">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg transform group-hover:scale-110 transition-transform">
          <Maximize2 className="w-5 h-5" />
        </div>
        <span className="text-xs font-bold text-white tracking-wide">
          Focar Transmissão 4K60
        </span>
      </div>

      {/* Rodapé: Tela de Nickname */}
      <div className="absolute bottom-2 left-2 z-10 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 text-white text-[11px] font-medium flex items-center gap-1.5">
        <Tv className="w-3.5 h-3.5 text-primary" />
        <span>Tela de {participant.nickname}</span>
      </div>
    </div>
  );
};

