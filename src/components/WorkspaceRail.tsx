import { OfficialLogo } from "./OfficialLogo";
import {
  AudioLines,
  Palette,
  UserRound,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  UsersRound,
  Plus,
} from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useHubStore } from "../store/useHubStore";
import { SoundboardPopover } from "./SoundboardPopover";
import { useStudio } from "../studio/StudioProvider";
import { useProfiles } from "../profiles/ProfileProvider";
interface Props {
  sidebarOpen: boolean;
  membersOpen: boolean;
  onToggleSidebar: () => void;
  onToggleMembers: () => void;
}
export function WorkspaceRail({
  sidebarOpen,
  membersOpen,
  onToggleSidebar,
  onToggleMembers,
}: Props) {
  const studio = useStudio();
  const profiles = useProfiles();
  const openSettings = useHubStore((state) => state.setIsSettingsOpen);
  return (
    <nav className="workspace-rail" aria-label="Navegação principal">
      <div className="workspace-mark" aria-label="cbsHUB">
        <OfficialLogo decorative />
      </div>
      <div className="rail-divider" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rail-button"
            data-active={sidebarOpen}
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Recolher navegação" : "Abrir navegação"}
            aria-expanded={sidebarOpen}
            aria-controls="room-navigation"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-5" />
            ) : (
              <PanelLeftOpen className="size-5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          {sidebarOpen ? "Recolher navegação" : "Abrir navegação"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rail-button"
            onClick={() => document.getElementById("message-composer")?.focus()}
            aria-label="Ir para a conversa"
          >
            <MessageSquare className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Conversa</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rail-button"
            data-active={membersOpen}
            onClick={onToggleMembers}
            aria-label="Alternar membros"
            aria-expanded={membersOpen}
            aria-controls="room-members"
          >
            <UsersRound className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Membros da sala</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rail-button"
            aria-label="Adicionar ou entrar em sala"
            onClick={() => {
              if (!sidebarOpen) onToggleSidebar();
              window.setTimeout(
                () => document.getElementById("join-room")?.focus(),
                0,
              );
            }}
          >
            <Plus className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Adicionar ou entrar em sala
        </TooltipContent>
      </Tooltip>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        className="rail-button"
        aria-label="Meu perfil"
        title="Meu perfil"
        onClick={() => profiles.view("self")}
      >
        <UserRound className="size-5" />
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rail-button"
            onClick={studio.begin}
            aria-label="Abrir cbsHUB Studio"
          >
            <Palette className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">cbsHUB Studio</TooltipContent>
      </Tooltip>
      <SoundboardPopover
        side="right"
        align="end"
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="rail-button"
            aria-label="Efeitos Sonoros rápidos"
            title="Efeitos Sonoros"
          >
            <AudioLines className="size-5" />
          </Button>
        }
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rail-button"
            onClick={() => openSettings(true)}
            aria-label="Configurações"
          >
            <Settings2 className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Configurações</TooltipContent>
      </Tooltip>
    </nav>
  );
}
