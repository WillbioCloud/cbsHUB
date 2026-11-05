import React from 'react';
import {
  Hash,
  PhoneCall,
  PhoneOff,
  SlidersHorizontal,
  Volume2,
  LayoutGrid,
  Minimize2,
  Maximize2,
  Radio,
} from 'lucide-react';
import { useHubStore } from '../store/useHubStore';
import { webrtcEngine } from '../lib/webrtcEngine';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { SoundboardPopover } from './SoundboardPopover';

export const RoomTopBar: React.FC = () => {
  const {
    roomId,
    inVoiceCall,
    callStageMode,
    setCallStageMode,
    participants,
    setIsSettingsOpen,
  } = useHubStore();

  const totalMembers = Object.keys(participants).length || 1;
  const inVoiceCount = Object.values(participants).filter((p) => p.inVoiceCall).length;

  const handleToggleStageMode = () => {
    if (callStageMode === 'minimized') {
      setCallStageMode('grid');
    } else {
      setCallStageMode('minimized');
    }
  };

  return (
    <header className="h-12 bg-zinc-950 border-b border-border px-4 flex items-center justify-between select-none shrink-0 z-10">
      {/* Esquerda: Sala, Separador e Contagem de Irmãos Online */}
      <div className="flex items-center gap-2 min-w-0">
        <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold tracking-tight text-foreground font-mono truncate">
          {roomId}
        </span>

        <Separator orientation="vertical" className="h-4 mx-1" />

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
          <span className="hidden sm:inline">
            {totalMembers} {totalMembers === 1 ? 'irmão online' : 'irmãos online'}
          </span>
          <span className="sm:hidden font-mono font-medium text-foreground">
            {totalMembers}
          </span>
        </div>

        {inVoiceCount > 0 && !inVoiceCall && (
          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-medium ml-2">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>{inVoiceCount} na chamada de voz</span>
          </div>
        )}
      </div>

      {/* Direita: Ações de Chamada e Ferramentas */}
      <div className="flex items-center gap-2 shrink-0">
        {!inVoiceCall ? (
          <Button
            size="sm"
            onClick={() => webrtcEngine.joinVoiceCall()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Entrar na Voz</span>
          </Button>
        ) : (
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleStageMode}
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                >
                  {callStageMode === 'minimized' ? (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Expandir Palco</span>
                    </>
                  ) : (
                    <>
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Minimizar Palco</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Alternar modo de exibição do palco</TooltipContent>
            </Tooltip>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => webrtcEngine.leaveVoiceCall()}
              className="h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>Desligar</span>
            </Button>
          </div>
        )}

        <Separator orientation="vertical" className="h-4 mx-0.5" />

        <SoundboardPopover
          side="bottom"
          align="end"
          trigger={
            <div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Soundboard</TooltipContent>
              </Tooltip>
            </div>
          }
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSettingsOpen(true)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Configurações de Áudio e Vídeo</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};

