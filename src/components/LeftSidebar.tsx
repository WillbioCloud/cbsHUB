import { openSettings } from "../lib/settingsNavigation";
import { CallQualityBadge, LocalConnectionBadge } from "./CallStatus";
import { useShallow } from "zustand/react/shallow";
import { useVoicePreferences } from "../lib/voicePreferences";
import { useStudio } from "../studio/StudioProvider";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "./ui/alert-dialog";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Hash,
  Headphones,
  Mic,
  MicOff,
  MoreHorizontal,
  Plus,
  Settings2,
  Signal,
  Sparkles,
  Search,
  Star,
  Video,
  VideoOff,
  MonitorUp,
  MonitorStop,
  PhoneOff,
  Sliders,
} from "lucide-react";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

import { useMediaState } from "../lib/mediaState";
import { useProfiles } from "../profiles/ProfileProvider";

export function LeftSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const {
    roomId,
    recentRooms,
    nickname,
    avatarColor,
    isMuted,
    isDeafened,
    isLocalSpeaking,
    inVoiceCall,
    isConnected,
    setIsSettingsOpen,
  } = useHubStore(
    useShallow((state) => ({
      roomId: state.roomId,
      recentRooms: state.recentRooms,
      nickname: state.nickname,
      avatarColor: state.avatarColor,
      isMuted: state.isMuted,
      isDeafened: state.isDeafened,
      isLocalSpeaking: state.isLocalSpeaking,
      inVoiceCall: state.inVoiceCall,
      isConnected: state.isConnected,
      setIsSettingsOpen: state.setIsSettingsOpen,
    })),
  );
  const profiles = useProfiles();
  const ptt = useVoicePreferences((s) => s.pushToTalk),
    talkKey = useVoicePreferences((s) => s.talkKey);
  const unreadCount = useHubStore((s) => s.unreadCount);
  const signaling = useMediaState((s) => s.signaling);
  const localImpaired = !isConnected || signaling !== "online";
  const cameraBusy = useMediaState((s) => s.cameraBusy);
  const screenBusy = useMediaState((s) => s.screenBusy);
  const isWebcamActive = useHubStore((s) => s.isWebcamActive);
  const isScreenSharing = useHubStore((s) => s.isScreenSharing);
  const [favoriteError, setFavoriteError] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem("cbshub-room-favorites") || "[]",
      );
      return Array.isArray(value)
        ? value
            .filter(
              (v): v is string =>
                typeof v === "string" && /^[a-z0-9-]{1,64}$/.test(v),
            )
            .slice(0, 50)
        : [];
    } catch {
      return [];
    }
  });
  const toggleFavorite = (room: string) => {
    const next = favorites.includes(room)
      ? favorites.filter((r) => r !== room)
      : [...favorites, room].slice(-50);
    try {
      localStorage.setItem("cbshub-room-favorites", JSON.stringify(next));
      setFavorites(next);
      setFavoriteError("");
    } catch {
      setFavoriteError("Não foi possível salvar favoritos neste dispositivo.");
    }
  };
  const studio = useStudio();
  const participants = useHubStore((s) => s.participants);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState(false);
  const rooms = [...new Set([roomId, ...recentRooms])]
    .filter(Boolean)
    .filter((room) => room.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) => Number(favorites.includes(b)) - Number(favorites.includes(a)),
    );
  const favoriteRooms = rooms.filter((room) => favorites.includes(room));
  const recentRoomList = rooms.filter((room) => !favorites.includes(room));
  const join = async (room: string) => {
    if (!room.trim() || room === roomId) return;
    await webrtcEngine.joinRoom(room);
    setSlug("");
    onNavigate?.();
  };
  const createRoom = () =>
    join(`encontro-${Math.random().toString(36).slice(2, 8)}`);
  const copyRoom = async (room: string) => {
    try {
      await navigator.clipboard.writeText(room);
      setCopied(room);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  };
  return (
    <aside id="room-navigation" className="room-navigation" aria-label="Salas">
      <div className="navigation-heading">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Conversas</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={createRoom}
                aria-label="Criar sala"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Criar uma sala</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <form
        className="px-4 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          join(slug);
        }}
      >
        <label htmlFor="join-room" className="section-eyebrow block mb-2">
          Entrar em uma sala
        </label>
        <div className="flex gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="join-room"
              value={slug}
              onChange={(event) =>
                setSlug(
                  event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
              placeholder="Código da sala"
              className="pl-8 bg-background/60"
              autoComplete="off"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            variant="secondary"
            disabled={!slug.trim()}
            aria-label="Entrar na sala"
          >
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
      <div className="navigation-section-label">
        <span className="section-eyebrow">Suas salas</span>
        <span className="text-caption text-muted-foreground">
          {new Set([roomId, ...recentRooms].filter(Boolean)).size}
        </span>
      </div>
      <div className="px-4 pb-2 relative">
        <Search className="absolute left-6 top-2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          aria-label="Filtrar salas recentes"
          placeholder="Filtrar salas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 bg-transparent pl-7"
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 px-3 py-1">
          {[
            { label: "Favoritas", rooms: favoriteRooms },
            {
              label: favoriteRooms.length ? "Recentes" : "",
              rooms: recentRoomList,
            },
          ].map((group) => (
            <section
              key={group.label}
              aria-label={group.label || "Salas recentes"}
            >
              {group.label && group.rooms.length > 0 && (
                <h2 className="section-eyebrow px-2 py-2">{group.label}</h2>
              )}
              {group.rooms.map((room) => (
                <div
                  key={room}
                  className="room-item"
                  data-active={room === roomId}
                >
                  <button
                    className="room-item-link"
                    title={room}
                    onClick={() => join(room)}
                    aria-current={room === roomId ? "page" : undefined}
                  >
                    <span className="room-icon">
                      <Hash className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium">
                        {room}
                      </span>
                      <span className="block text-caption text-muted-foreground">
                        {room === roomId
                          ? inVoiceCall
                            ? "Chamada em andamento"
                            : "Conversa atual"
                          : "Sala recente"}
                      </span>
                    </span>
                    {favorites.includes(room) && (
                      <Star
                        className="size-3 shrink-0 text-primary"
                        aria-label="Favorita"
                      />
                    )}
                    {room === roomId && unreadCount > 0 && (
                      <span
                        className="room-unread"
                        aria-label={`${unreadCount} mensagens não lidas`}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                    {room === roomId && isConnected && (
                      <span className="status-dot" />
                    )}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Opções da sala ${room}`}
                        className="room-menu"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => toggleFavorite(room)}>
                        <Star className="mr-2 size-4" />
                        {favorites.includes(room)
                          ? "Remover dos favoritos"
                          : "Adicionar aos favoritos"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setRemoving(room)}>
                        Remover sala deste dispositivo
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => join(room)}>
                        <Hash className="mr-2 size-4" />
                        Abrir sala
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => copyRoom(room)}>
                        {copied === room ? (
                          <Check className="mr-2 size-4" />
                        ) : (
                          <Copy className="mr-2 size-4" />
                        )}
                        Copiar código
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </section>
          ))}
          {rooms.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              Nenhuma sala encontrada.
            </p>
          )}
        </div>
        {studio.theme.name === "Clássico" && (
          <div className="px-3 py-4 border-t border-border">
            <p className="section-eyebrow mb-3">Na sala</p>
            {Object.values(participants).map((p) => (
              <div key={p.peerId} className="flex gap-2 items-center py-2">
                <ParticipantAvatar
                  clientId={p.clientId}
                  name={p.nickname}
                  color={p.avatarColor}
                  className="size-8"
                />
                <div className="text-xs">
                  <p>{p.nickname}</p>
                  <span className="text-muted-foreground">
                    {p.inVoiceCall ? "Na voz" : "No chat"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      {removed && (
        <Button
          variant="ghost"
          onClick={() => {
            useHubStore.getState().addRecentRoom(removed);
            setRemoved(null);
          }}
        >
          Restaurar sala removida
        </Button>
      )}
      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remover sala deste dispositivo?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove apenas dos seus recentes e sai da sala atual. Os
            participantes, mensagens e arquivos são preservados. Você poderá
            restaurar ou entrar pelo código novamente.
          </AlertDialogDescription>
          <Button
            data-alert-cancel
            variant="outline"
            onClick={() => setRemoving(null)}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!removing) return;
              const room = removing;
              if (room === roomId) {
                webrtcEngine.leaveRoom();
                localStorage.setItem("cbshub-room-removed-active", "1");
                useHubStore.setState({ roomId: "" });
              }
              useHubStore.setState((s) => ({
                recentRooms: s.recentRooms.filter((r) => r !== room),
              }));
              setRemoved(room);
              setRemoving(null);
            }}
          >
            Confirmar remoção local
          </Button>
        </AlertDialogContent>
      </AlertDialog>
      <div role="status" className="sr-only">
        {copyError
          ? "Não foi possível copiar o código."
          : copied
            ? `Código de ${copied} copiado.`
            : ""}
      </div>
      {favoriteError && (
        <p role="alert" className="px-3 text-xs">
          {favoriteError}
        </p>
      )}
      {!inVoiceCall && rooms.length < 2 && (
        <div className="navigation-note">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <p>Compartilhe o código de uma sala e comece uma conversa.</p>
        </div>
      )}
      {inVoiceCall && (
        <section className="sidebar-voice-panel" aria-label="Painel de voz">
          <div className="flex items-center gap-2 min-w-0">
            <Signal
              className={`size-4 shrink-0 ${localImpaired ? "text-warning" : "text-success"}`}
            />
            <div className="min-w-0 flex-1">
              <p
                role="status"
                className={`text-xs font-semibold ${localImpaired ? "text-warning" : "text-success"}`}
              >
                <LocalConnectionBadge />
              </p>
              <p
                className="truncate text-caption text-muted-foreground"
                title={roomId}
              >
                {roomId}
              </p>
            </div>
            <VoiceAction
              label="Desconectar voz"
              onClick={() => webrtcEngine.leaveVoiceCall()}
            >
              <PhoneOff className="size-4" />
            </VoiceAction>
          </div>
          {Object.values(participants)
            .filter((p) => !p.isLocal && p.inVoiceCall)
            .slice(0, 6)
            .map((p) => (
              <div
                key={p.peerId}
                className="text-micro mt-1 flex gap-1 items-center min-w-0"
              >
                <span className="truncate" title={p.nickname}>
                  {p.nickname}
                </span>
                <CallQualityBadge peerId={p.peerId} />
              </div>
            ))}
          <div className="flex gap-1 mt-2">
            <VoiceAction
              label={
                isScreenSharing
                  ? "Parar compartilhamento pela sidebar"
                  : "Compartilhar tela pela sidebar"
              }
              pressed={isScreenSharing}
              disabled={screenBusy}
              onClick={() =>
                isScreenSharing
                  ? webrtcEngine.stopScreenShare()
                  : useHubStore.getState().setIsScreenPickerOpen(true)
              }
            >
              {isScreenSharing ? (
                <MonitorStop className="size-4" />
              ) : (
                <MonitorUp className="size-4" />
              )}
            </VoiceAction>
            <VoiceAction
              label={
                isWebcamActive
                  ? "Desligar câmera pela sidebar"
                  : "Ligar câmera pela sidebar"
              }
              pressed={isWebcamActive}
              disabled={cameraBusy}
              onClick={() => void webrtcEngine.toggleWebcam()}
            >
              {isWebcamActive ? (
                <VideoOff className="size-4" />
              ) : (
                <Video className="size-4" />
              )}
            </VoiceAction>
            <VoiceAction
              label="Configurações de voz"
              onClick={() => openSettings("audio")}
            >
              <Sliders className="size-4" />
            </VoiceAction>
          </div>
        </section>
      )}
      <div className="local-user-panel">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            aria-label="Editar meu perfil"
            onClick={() => profiles.view("self")}
          >
            <ParticipantAvatar
              clientId={profiles.own.ownerId}
              interactive={false}
              name={nickname}
              color={avatarColor}
              speaking={isLocalSpeaking && !isMuted}
              className="size-7"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{nickname}</p>
            <p className="flex items-center gap-1 text-caption text-muted-foreground">
              <Signal className="size-3" />
              {inVoiceCall
                ? ptt
                  ? `PTT · ${talkKey}`
                  : "Na chamada"
                : isConnected
                  ? "Disponível"
                  : "Offline"}
            </p>
          </div>
          <VoiceAction
            label={isMuted ? "Ativar microfone" : "Silenciar microfone"}
            pressed={isMuted}
            onClick={() => webrtcEngine.toggleMute()}
          >
            {isMuted ? (
              <MicOff className="size-4 text-destructive" />
            ) : (
              <Mic className="size-4" />
            )}
          </VoiceAction>
          <VoiceAction
            label={isDeafened ? "Ativar áudio" : "Silenciar áudio"}
            pressed={isDeafened}
            onClick={() => webrtcEngine.toggleDeafen()}
          >
            <Headphones
              className={`size-4 ${isDeafened ? "text-destructive" : ""}`}
            />
          </VoiceAction>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsSettingsOpen(true)}
                aria-label="Configurações do perfil"
              >
                <Settings2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configurações</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}

function VoiceAction({
  label,
  onClick,
  children,
  pressed,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
