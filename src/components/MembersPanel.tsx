import {
  Headphones,
  MicOff,
  MoreHorizontal,
  Radio,
  Volume2,
  X,
} from "lucide-react";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Slider } from "./ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { PRESENCES } from "../profiles/model";
import type { Participant } from "../types/cbshub";

function MemberRow({ participant: p }: { participant: Participant }) {
  const volume = useHubStore((state) =>
    Math.min(1, state.peerVolumes[p.clientId] ?? 1),
  );
  return (
    <div className="member-row">
      <ParticipantAvatar
        clientId={p.clientId}
        name={p.nickname}
        color={p.avatarColor}
        speaking={p.isSpeaking && !p.isMuted}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {p.nickname}{" "}
          {p.isLocal && (
            <span className="text-caption text-muted-foreground">· você</span>
          )}
        </p>
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          {p.isScreenSharing ? (
            <>
              <Radio className="size-3 text-primary" />
              Transmitindo
            </>
          ) : p.inVoiceCall ? (
            "Na chamada"
          ) : p.profile ? (
            PRESENCES[p.profile.presence]
          ) : (
            "Na conversa"
          )}
          {p.isMuted && (
            <MicOff aria-label="Microfone silenciado" className="size-3" />
          )}
          {p.isDeafened && (
            <Headphones aria-label="Áudio desativado" className="size-3" />
          )}
        </p>
      </div>
      {!p.isLocal && (
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Opções de ${p.nickname}`}
                  className="member-options"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Opções do membro</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <Volume2 className="size-4 text-primary" />
                Volume individual
              </span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <Slider
              aria-label={`Volume de ${p.nickname}`}
              min={0}
              max={1}
              step={0.05}
              value={[volume]}
              onValueChange={([v]) => webrtcEngine.setPeerVolume(p.clientId, v)}
            />
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() =>
                webrtcEngine.setPeerVolume(p.clientId, volume === 0 ? 1 : 0)
              }
            >
              {volume === 0 ? "Restaurar áudio" : "Silenciar para mim"}
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
export function MembersPanel({ onClose }: { onClose: () => void }) {
  const participants = useHubStore((state) => state.participants);
  const all = Object.values(participants);
  const groups = [
    { title: "Na chamada", members: all.filter((p) => p.inVoiceCall) },
    { title: "Na conversa", members: all.filter((p) => !p.inVoiceCall) },
  ];
  return (
    <aside
      id="room-members"
      className="members-panel"
      aria-label="Membros da sala"
    >
      <div className="panel-heading">
        <div>
          <p className="section-eyebrow">Juntos aqui</p>
          <h2 className="text-sm font-semibold">
            Membros{" "}
            <span className="ml-1 text-muted-foreground font-normal">
              {all.length}
            </span>
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Fechar membros"
        >
          <X className="size-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-5">
          {groups.map(
            (group) =>
              group.members.length > 0 && (
                <section key={group.title}>
                  <h3 className="section-eyebrow px-2 mb-2">
                    {group.title}{" "}
                    <span className="ml-1">{group.members.length}</span>
                  </h3>
                  {group.members.map((p) => (
                    <MemberRow key={p.peerId} participant={p} />
                  ))}
                </section>
              ),
          )}
          {all.length === 0 && (
            <p className="text-sm text-muted-foreground p-3 leading-relaxed">
              Os membros aparecem aqui quando você entra em uma sala.
            </p>
          )}
        </div>
      </ScrollArea>
      <p className="panel-footnote">Uma boa conversa começa com presença.</p>
    </aside>
  );
}
