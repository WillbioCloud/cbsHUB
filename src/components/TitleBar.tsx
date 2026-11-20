import { StreamDiagnostics } from "./StreamDiagnostics";
import { OfficialLogo } from "./OfficialLogo";
import React, { useState, useEffect } from "react";
import { Minus, Square, X, Pin, Radio, SlidersHorizontal } from "lucide-react";
import { useHubStore } from "../store/useHubStore";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

export const TitleBar: React.FC = () => {
  const isAlwaysOnTop = useHubStore((state) => state.isAlwaysOnTop);
  const setAlwaysOnTop = useHubStore((state) => state.setAlwaysOnTop);

  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    const api = window.cbsHubAPI;
    let active = true;
    void api
      ?.getWindowState?.()
      .then((state) => {
        if (active) setIsMaximized(state.isMaximized);
      })
      .catch(() => {});
    const unsubscribe = api?.onWindowStateChanged?.((state) =>
      setIsMaximized(state.isMaximized),
    );
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const handleMinimize = () => {
    if (window.cbsHubAPI) {
      window.cbsHubAPI.minimizeWindow();
    } else {
      console.warn("[TitleBar] cbsHubAPI indisponível no renderer.");
    }
  };

  const handleMaximize = () => {
    if (window.cbsHubAPI) {
      window.cbsHubAPI.maximizeWindow();
    } else {
      console.warn("[TitleBar] cbsHubAPI indisponível no renderer.");
    }
  };

  const handleClose = () => {
    if (window.cbsHubAPI) {
      window.cbsHubAPI.closeWindow();
    } else {
      console.warn("[TitleBar] cbsHubAPI indisponível no renderer.");
    }
  };

  const togglePin = () => {
    const nextVal = !isAlwaysOnTop;
    setAlwaysOnTop(nextVal);
    if (window.cbsHubAPI) {
      window.cbsHubAPI.setAlwaysOnTop(nextVal);
    }
  };

  return (
    <header className="native-titlebar drag-region">
      <div className="flex items-center gap-2 min-w-0">
        <OfficialLogo />
        <span className="font-semibold tracking-tight text-caption text-foreground">
          cbs<span className="text-primary">HUB</span>
        </span>
      </div>
      <div className="flex items-center gap-1 no-drag">
        <StreamDiagnostics />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="native-window-button"
              aria-label={isAlwaysOnTop ? "Desafixar do topo" : "Fixar no topo"}
              aria-pressed={isAlwaysOnTop}
              onClick={togglePin}
            >
              <Pin
                className={`size-3 ${isAlwaysOnTop ? "text-primary" : ""}`}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>Manter janela no topo</TooltipContent>
        </Tooltip>
        <span className="h-3 w-px bg-border mx-1" />
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="Minimizar janela"
          className="native-window-button"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          aria-label={isMaximized ? "Restaurar janela" : "Maximizar janela"}
          className="native-window-button"
        >
          <Square className="size-3" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fechar janela"
          title="Continuar em segundo plano. Para encerrar, use o menu da bandeja."
          className="native-window-button hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </header>
  );
};
