import { useShallow } from "zustand/react/shallow";
import { useSidebarControls } from "../hooks/useSidebarControls";
import {
  useChatView,
  updateChatView,
  EMPTY_CHAT_VIEW,
} from "../chat/viewState";
import { useState } from "react";
import {
  Check,
  Search,
  Pin,
  Activity,
  Copy,
  Hash,
  LogOut,
  Minimize2,
  Maximize2,
  MoreHorizontal,
  PhoneCall,
  PhoneOff,
  UsersRound,
  Settings2,
} from "lucide-react";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { StreamDiagnostics } from "./StreamDiagnostics";
interface Props {
  membersOpen: boolean;
  onToggleMembers: () => void;
}
export function RoomTopBar({ membersOpen, onToggleMembers }: Props) {
  const sidebarControls = useSidebarControls();
  const {
    roomId,
    inVoiceCall,
    callStageMode,
    setCallStageMode,
    participants,
    isConnected,
    setIsSettingsOpen,
  } = useHubStore(
    useShallow((s) => ({
      roomId: s.roomId,
      inVoiceCall: s.inVoiceCall,
      callStageMode: s.callStageMode,
      setCallStageMode: s.setCallStageMode,
      participants: s.participants,
      isConnected: s.isConnected,
      setIsSettingsOpen: s.setIsSettingsOpen,
    })),
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const view = useChatView((state) => state.views[roomId] ?? EMPTY_CHAT_VIEW);
  const count = Object.keys(participants).length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };
  return (
    <header className="room-topbar">
      <div className="room-heading-icon">
        <Hash className="size-5" />
      </div>
      <div className="room-heading">
        <h2 className="truncate text-sm font-semibold tracking-tight">
          {roomId}
        </h2>
        <p className="room-subtitle">
          <span className="status-dot" data-offline={!isConnected} />
          {isConnected
            ? `${count} ${count === 1 ? "pessoa conectada" : "pessoas conectadas"}`
            : "Offline · histórico local"}
        </p>
      </div>
      <div className="room-actions">

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Pesquisar mensagens"
              aria-expanded={view.searchOpen}
              onClick={() =>
                updateChatView(roomId, {
                  searchOpen: !view.searchOpen,
                  query: view.searchOpen ? "" : view.query,
                })
              }
            >
              <Search className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Pesquisar mensagens</TooltipContent>
        </Tooltip>
        {inVoiceCall && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="stage-toggle"
                onClick={() =>
                  setCallStageMode(
                    callStageMode === "minimized" ? "grid" : "minimized",
                  )
                }
                aria-label={
                  callStageMode === "minimized"
                    ? "Expandir palco"
                    : "Minimizar palco"
                }
              >
                {callStageMode === "minimized" ? (
                  <Maximize2 className="size-4" />
                ) : (
                  <Minimize2 className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Alternar palco da chamada</TooltipContent>
          </Tooltip>
        )}
        {(!inVoiceCall ||
          (!sidebarControls && callStageMode === "minimized")) && (
          <Button
            size="sm"
            variant={inVoiceCall ? "destructive" : "default"}
            className="voice-action gap-2"
            onClick={() =>
              inVoiceCall
                ? webrtcEngine.leaveVoiceCall()
                : webrtcEngine.joinVoiceCall()
            }
            aria-label={inVoiceCall ? "Desligar chamada" : "Entrar na voz"}
          >
            {inVoiceCall ? (
              <PhoneOff className="size-4" />
            ) : (
              <PhoneCall className="size-4" />
            )}
            <span>{inVoiceCall ? "Desligar" : "Entrar na voz"}</span>
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleMembers}
              aria-label="Mostrar membros"
              aria-expanded={membersOpen}
              aria-controls="room-members"
              className="members-toggle"
              data-active={membersOpen}
            >
              <UsersRound className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {membersOpen ? "Ocultar membros" : "Mostrar membros"}
          </TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Opções da sala">
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => updateChatView(roomId, { pinned: !view.pinned })}
            >
              <Pin className="mr-2 size-4" />
              {view.pinned ? "Mostrar todas as mensagens" : "Mensagens fixadas"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => updateChatView(roomId, { activities: true })}
            >
              <Activity className="mr-2 size-4" />
              Atividades de Efeitos Sonoros
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={copy}>
              {copyState === "copied" ? (
                <Check className="mr-2 size-4" />
              ) : (
                <Copy className="mr-2 size-4" />
              )}
              Copiar código da sala
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsSettingsOpen(true)}>
              <Settings2 className="mr-2 size-4" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => webrtcEngine.leaveRoom()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 size-4" />
              Sair da sala
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <span role="status" className="sr-only">
        {copyState === "copied"
          ? "Código da sala copiado."
          : copyState === "error"
            ? "Não foi possível copiar o código."
            : ""}
      </span>
    </header>
  );
}
