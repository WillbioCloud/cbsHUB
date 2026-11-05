import React, { useState } from 'react';
import {
  Hash,
  Copy,
  Check,
  ArrowRight,
  Mic,
  MicOff,
  Headphones,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Radio,
  Plus,
} from 'lucide-react';
import { useHubStore } from '../store/useHubStore';
import { webrtcEngine } from '../lib/webrtcEngine';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { Slider } from './ui/slider';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
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

export const LeftSidebar: React.FC = () => {
  const {
    roomId,
    recentRooms,
    participants,
    peerVolumes,
    nickname,
    avatarColor,
    isMuted,
    isDeafened,
    isLocalSpeaking,
    inVoiceCall,
    setIsSettingsOpen,
    setNickname,
  } = useHubStore();

  const [slugInput, setSlugInput] = useState(roomId);
  const [copied, setCopied] = useState(false);
  const [editingNick, setEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState(nickname);

  const handleCopySlug = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwitchRoom = async (newSlug: string) => {
    const clean = webrtcEngine.sanitizeSlug(newSlug);
    if (!clean) return;
    setSlugInput(clean);
    await webrtcEngine.joinRoom(clean);
  };

  const handleGenerateRandomRoom = async () => {
    const prefixes = ['jogatina', 'resenha', 'irmandade', 'gameplay', 'estudio', 'call'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const newRoom = `${randomPrefix}-${randomCode}`;
    setSlugInput(newRoom);
    await webrtcEngine.joinRoom(newRoom);
  };

  const handleSaveNickname = () => {
    const clean = nickInput.trim();
    if (clean && clean !== nickname) {
      setNickname(clean);
      webrtcEngine.sendData({ type: 'nickname', name: clean });
    }
    setEditingNick(false);
  };

  const participantList = Object.values(participants);

  return (
    <aside className="w-60 min-w-[240px] max-w-[240px] bg-[#111114] border-r border-border flex flex-col justify-between select-none h-full z-20">
      {/* Top Section: Room Header & Quick Switch */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Bloco 1: Sala Atual & Troca Rápida */}
        <div className="p-3 border-b border-border/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Hash className="w-3 h-3 text-primary" />
              <span>Sala Atual</span>
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopySlug}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {copied ? 'Código copiado!' : 'Copiar nome da sala'}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">
                #
              </span>
              <Input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSwitchRoom(slugInput);
                }}
                placeholder="nome-da-sala"
                className="h-8 pl-6 pr-2 text-xs font-mono bg-secondary/60 border-border/80 focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={handleGenerateRandomRoom}
                  title="Gerar sala aleatória"
                  className="h-8 w-8 shrink-0 hover:bg-secondary text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Criar sala com nome aleatório</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={() => handleSwitchRoom(slugInput)}
                  className="h-8 w-8 shrink-0 hover:bg-primary hover:text-primary-foreground"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Conectar / Trocar Sala</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Bloco 2: Salas Recentes / Favoritas */}
        {recentRooms.length > 1 && (
          <div className="px-3 py-2 border-b border-border/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Salas Recentes
              </span>
            </div>
            <div className="space-y-0.5">
              {recentRooms.slice(0, 4).map((room) => {
                const isActive = room === roomId;
                return (
                  <button
                    key={room}
                    onClick={() => handleSwitchRoom(room)}
                    className={`w-full h-7 px-2 rounded-md flex items-center justify-between text-xs transition-colors text-left ${
                      isActive
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    <span className="truncate flex items-center gap-1.5 font-mono text-[11px]">
                      <span className={isActive ? 'text-primary' : 'text-muted-foreground'}>#</span>
                      {room}
                    </span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bloco 3: Lista de Membros NA SALA — N */}
        <div className="flex-1 min-h-0 flex flex-col pt-2">
          <div className="px-3 pb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span>Na Sala</span>
              <span className="text-border">•</span>
              <span className="text-foreground/90 font-mono">{participantList.length}</span>
            </span>
          </div>

          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1 pb-2">
              {participantList.map((p) => {
                const isSpeakingNow = p.isSpeaking;
                const volume = peerVolumes[p.clientId] ?? 1.0;

                return (
                  <MemberListItem
                    key={p.peerId}
                    participant={p}
                    volume={volume}
                    isSpeaking={isSpeakingNow}
                  />
                );
              })}

              {participantList.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Nenhum irmão conectado na sala
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Rodapé: UserStatusPod (Estilo Discord Onyx) */}
      <div className="h-14 bg-[#0c0c0f] border-t border-border px-2.5 flex items-center justify-between select-none shrink-0">
        {/* Avatar e Nome Local com anel de voz */}
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
          <div className="relative shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white uppercase transition-all duration-150 ${
                isLocalSpeaking
                  ? 'ring-2 ring-emerald-500 shadow-md shadow-emerald-500/40 animate-pulse'
                  : 'ring-1 ring-white/10'
              }`}
              style={{ backgroundColor: avatarColor || 'hsl(var(--primary))' }}
            >
              {getInitials(nickname)}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c0c0f] ${
                inVoiceCall ? 'bg-emerald-500' : 'bg-zinc-500'
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            {editingNick ? (
              <input
                autoFocus
                type="text"
                value={nickInput}
                onChange={(e) => setNickInput(e.target.value)}
                onBlur={handleSaveNickname}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveNickname();
                  if (e.key === 'Escape') setEditingNick(false);
                }}
                className="w-full text-xs font-semibold bg-secondary/80 px-1 py-0.5 rounded border border-primary/50 text-foreground outline-none"
              />
            ) : (
              <div
                onClick={() => {
                  setNickInput(nickname);
                  setEditingNick(true);
                }}
                title="Clique para editar seu apelido"
                className="cursor-pointer group flex flex-col"
              >
                <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {nickname}
                </span>
                <span className="text-[10px] text-muted-foreground leading-tight flex items-center gap-1">
                  {inVoiceCall ? (
                    <span className="text-emerald-500 font-medium">Na chamada</span>
                  ) : (
                    <span>No chat</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Botões Mute, Deafen e Settings */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => webrtcEngine.toggleMute()}
                className={`h-7 w-7 rounded-md transition-colors ${
                  isMuted
                    ? 'text-destructive bg-destructive/10 hover:bg-destructive/20 hover:text-destructive'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => webrtcEngine.toggleDeafen()}
                className={`h-7 w-7 rounded-md transition-colors ${
                  isDeafened
                    ? 'text-destructive bg-destructive/10 hover:bg-destructive/20 hover:text-destructive'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Headphones className={`w-3.5 h-3.5 ${isDeafened ? 'line-through text-destructive' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isDeafened ? 'Desativar Silenciar Áudio' : 'Silenciar Áudio (Deafen)'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSettingsOpen(true)}
                className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Configurações</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
};

interface MemberListItemProps {
  participant: Participant;
  volume: number;
  isSpeaking: boolean;
}

const MemberListItem: React.FC<MemberListItemProps> = ({ participant, volume, isSpeaking }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleVolumeChange = (newVol: number) => {
    webrtcEngine.setPeerVolume(participant.clientId, newVol);
  };

  const isLocal = participant.isLocal;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          className={`w-full h-11 px-2 rounded-lg flex items-center justify-between gap-2 transition-colors text-left group ${
            popoverOpen
              ? 'bg-accent'
              : 'hover:bg-accent/60'
          }`}
        >
          {/* Avatar com Anel de Fala em Tempo Real */}
          <div className="relative shrink-0">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] text-white uppercase transition-all duration-150 ${
                isSpeaking
                  ? 'ring-2 ring-emerald-500 shadow-md shadow-emerald-500/40 animate-pulse'
                  : 'ring-1 ring-white/10'
              }`}
              style={{ backgroundColor: participant.avatarColor || 'hsl(var(--primary))' }}
            >
              {getInitials(participant.nickname)}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#111114] ${
                participant.inVoiceCall ? 'bg-emerald-500' : 'bg-zinc-500'
              }`}
            />
          </div>

          {/* Nome e Status */}
          <div className="min-w-0 flex-1 flex flex-col">
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium text-foreground truncate">
                {participant.nickname}
              </span>
              {isLocal && (
                <span className="text-[9px] font-mono text-muted-foreground/80 shrink-0">
                  (Você)
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground truncate leading-tight">
              {participant.inVoiceCall ? 'Na chamada' : 'No chat'}
            </span>
          </div>

          {/* Badges de Mídia à Direita */}
          <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
            {participant.isScreenSharing && (
              <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-destructive/20 text-destructive border border-destructive/30">
                LIVE
              </span>
            )}
            {participant.isMuted && <MicOff className="w-3.5 h-3.5 text-destructive" />}
            {participant.isDeafened && <Headphones className="w-3.5 h-3.5 text-destructive line-through" />}
          </div>
        </button>
      </PopoverTrigger>

      {/* Popover de Perfil e Controle Individual de Volume */}
      <PopoverContent side="right" align="start" className="w-64 p-3 space-y-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white uppercase shrink-0 shadow"
            style={{ backgroundColor: participant.avatarColor || 'hsl(var(--primary))' }}
          >
            {getInitials(participant.nickname)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-xs text-foreground truncate">
              {participant.nickname}
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  participant.inVoiceCall ? 'bg-emerald-500' : 'bg-zinc-500'
                }`}
              />
              <span>{participant.inVoiceCall ? 'Conectado na voz' : 'Apenas no chat'}</span>
              {participant.rttMs !== undefined && participant.rttMs > 0 && (
                <span className="font-mono">({participant.rttMs}ms)</span>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Slider de Volume Individual (0% a 200%) */}
        {!isLocal && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                <span>Volume do Usuário</span>
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
              onValueChange={([val]) => handleVolumeChange(val)}
            />

            <div className="flex justify-between items-center pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleVolumeChange(volume === 0 ? 1 : 0)}
                className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
              >
                {volume === 0 ? (
                  <>
                    <Volume2 className="w-3 h-3 mr-1" />
                    <span>Desmutar</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3 h-3 mr-1" />
                    <span>Mutar para mim</span>
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleVolumeChange(1.0)}
                className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
              >
                Resetar (100%)
              </Button>
            </div>
          </div>
        )}

        {isLocal && (
          <div className="text-[11px] text-muted-foreground italic text-center py-1">
            Este é o seu perfil local.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

