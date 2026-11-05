import React, { useState } from 'react';
import { Minus, Square, X, Pin, Radio, SlidersHorizontal } from 'lucide-react';
import { useHubStore } from '../store/useHubStore';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

export const TitleBar: React.FC = () => {
  const {
    roomId,
    isConnected,
    isAlwaysOnTop,
    setAlwaysOnTop,
    telemetry,
    participants,
    setIsSettingsOpen,
  } = useHubStore();

  const [isMaximized, setIsMaximized] = useState(false);

  const handleMinimize = () => {
    if (window.cbsHubAPI) {
      window.cbsHubAPI.minimizeWindow();
    } else {
      console.warn('[TitleBar] cbsHubAPI indisponível no renderer.');
    }
  };

  const handleMaximize = () => {
    if (window.cbsHubAPI) {
      window.cbsHubAPI.maximizeWindow();
      setIsMaximized((prev) => !prev);
    } else {
      console.warn('[TitleBar] cbsHubAPI indisponível no renderer.');
    }
  };

  const handleClose = () => {
    if (window.cbsHubAPI) {
      window.cbsHubAPI.closeWindow();
    } else {
      console.warn('[TitleBar] cbsHubAPI indisponível no renderer.');
    }
  };

  const togglePin = () => {
    const nextVal = !isAlwaysOnTop;
    setAlwaysOnTop(nextVal);
    if (window.cbsHubAPI) {
      window.cbsHubAPI.setAlwaysOnTop(nextVal);
    }
  };

  const participantCount = Object.keys(participants).length || 1;

  return (
    <header className="h-9 bg-zinc-950 border-b border-border px-3 drag-region select-none flex items-center justify-between text-xs text-foreground z-50">
      {/* Brand & Minimalist Tag */}
      <div className="flex items-center gap-2 no-drag">
        <div className="w-5 h-5 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-sm shadow-primary/20">
          <Radio className="w-3 h-3 animate-pulse" />
        </div>
        <span className="font-semibold text-xs tracking-tight text-foreground flex items-center">
          cbs<span className="text-primary font-bold">HUB</span>
        </span>
        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-secondary/80 text-muted-foreground border border-border/50">
          v2.0
        </span>
      </div>

      {/* Central Mesh Status Pill */}
      <div className="no-drag flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary/60 border border-border/60 text-[11px] font-medium text-muted-foreground">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isConnected
              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
              : 'bg-amber-400 animate-pulse'
          }`}
        />
        <span className="text-foreground/90 font-mono text-[11px]">#{roomId}</span>
        <span className="text-border">•</span>
        <span>
          {isConnected
            ? `${participantCount} ${participantCount === 1 ? 'membro' : 'membros'}${
                telemetry.rttMs > 0 ? ` • ${telemetry.rttMs}ms` : ''
              }`
            : 'Modo Offline'}
        </span>
      </div>

      {/* Action Controls & Window Buttons com no-drag explícito */}
      <div
        className="flex items-center gap-0.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Configurações"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Configurações</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={togglePin}
              aria-label={isAlwaysOnTop ? 'Desafixar do topo' : 'Fixar no topo'}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              className={`h-7 w-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                isAlwaysOnTop
                  ? 'text-primary bg-primary/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${isAlwaysOnTop ? 'rotate-45' : ''}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isAlwaysOnTop ? 'Desafixar do topo' : 'Fixar no topo'}
          </TooltipContent>
        </Tooltip>
        <div className="h-3.5 w-px bg-border/80 mx-1" />
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="Minimizar janela"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="h-7 w-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          aria-label={isMaximized ? 'Restaurar janela' : 'Maximizar janela'}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="h-7 w-8 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fechar janela"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="h-7 w-8 rounded flex items-center justify-center text-muted-foreground hover:text-destructive-foreground hover:bg-destructive transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
