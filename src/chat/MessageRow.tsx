import { useShallow } from "zustand/react/shallow";
import { useMessageIdentity } from "./viewState";
import { useStudio } from "../studio/StudioProvider";
import { contrast } from "../studio/theme";
import { useState } from "react";
import { Copy, MoreHorizontal, Pencil, Pin, Reply, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import { EmojiPickerPopover } from "../components/EmojiPickerPopover";
import { ParticipantAvatar } from "../components/ParticipantAvatar";
import { SafeMarkdown, LinkPreview } from "./SafeMarkdown";
import type { ChatMessage } from "../types/cbshub";
interface Props {
  message: ChatMessage;
  grouped: boolean;
  own: boolean;
  replied?: ChatMessage;
  mentions: { username: string; clientId: string }[];
  onMention: (id: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onReact: (emoji: string) => void;
  compact: boolean;
  onReplay?: () => void;
}
export function MessageRow({
  message: m,
  grouped,
  own,
  replied,
  mentions,
  onMention,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onReact,
  compact,
  onReplay,
}: Props) {
  const { showAvatars, colorNames } = useMessageIdentity(
    useShallow((s) => ({
      showAvatars: s.showAvatars,
      colorNames: s.colorNames,
    })),
  );
  const { theme } = useStudio();
  const authorColor =
    colorNames &&
    /^#[0-9a-f]{6}$/i.test(m.authorAvatarColor) &&
    contrast(m.authorAvatarColor, theme.colors.messages) >= 4.5
      ? m.authorAvatarColor
      : undefined;
  const [copy, setCopy] = useState("Copiar conteúdo");
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article
      onContextMenu={(event) => {
        if (!m.deleted) {
          event.preventDefault();
          setMenuOpen(true);
        }
      }}
      id={`message-${m.id}`}
      className={`chat-message-row ${grouped || compact ? "chat-message-compact" : ""} ${m.type === "soundboard" ? "chat-sound-event" : ""}`}
      data-message-id={m.id}
    >
      {!grouped && !compact && showAvatars && (
        <ParticipantAvatar
          clientId={m.authorClientId}
          name={m.authorNickname}
          color={m.authorAvatarColor}
        />
      )}
      <div className="min-w-0 flex-1">
        <header className="chat-message-meta">
          {(!grouped || compact) && (
            <strong style={{ color: authorColor }}>{m.authorNickname}</strong>
          )}
          <time
            dateTime={new Date(m.createdAt).toISOString()}
            title={new Date(m.createdAt).toLocaleString()}
          >
            {new Date(m.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          {m.editedAt && !m.deleted && <span>editada</span>}
          {m.pinned && !m.deleted && (
            <span className="chat-pinned-label">
              <Pin className="size-3" />
              Fixada
            </span>
          )}
          {own && (
            <span aria-label="Estado de envio">
              {m.delivery === "received"
                ? "Recebida por um participante"
                : m.delivery === "error"
                  ? "Erro ao enviar"
                  : m.delivery === "sent"
                    ? "Enviada"
                    : "Salva localmente"}
            </span>
          )}
        </header>
        {m.replyTo && (
          <div className="chat-reply-preview">
            <Reply className="size-3" />
            <span>
              {replied && !replied.deleted
                ? `${replied.authorNickname}: ${replied.content.slice(0, 120)}`
                : "Mensagem original indisponível"}
            </span>
          </div>
        )}
        {m.deleted ? (
          <p className="text-sm text-muted-foreground italic">
            Mensagem excluída
          </p>
        ) : m.type === "soundboard" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{m.soundMeta?.emoji || "♫"}</span>
            <span>{m.content}</span>
            {onReplay && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReplay}
                aria-label="Tocar som novamente"
              >
                Ouvir
              </Button>
            )}
          </div>
        ) : (
          <>
            <SafeMarkdown
              content={m.content}
              mentions={mentions}
              onMention={onMention}
            />
            <LinkPreview content={m.content} />
          </>
        )}
        {!m.deleted && (
          <div className="chat-reactions">
            {Object.values(m.reactions).map((r) => (
              <button
                key={r.emoji}
                title={Object.values(r.reactorNicknames).join(", ")}
                aria-label={`Reagir ${r.emoji}`}
                onClick={() => onReact(r.emoji)}
              >
                {r.emoji} {r.reactorClientIds.length}
              </button>
            ))}
          </div>
        )}
      </div>
      {!m.deleted && (
        <div className="chat-message-tools">
          <EmojiPickerPopover
            onSelectEmoji={onReact}
            trigger={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Reagir à mensagem de ${m.authorNickname}`}
              >
                ☺
              </Button>
            }
          />
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Opções da mensagem de ${m.authorNickname}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onReply}>
                <Reply className="size-4 mr-2" />
                Responder
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  try {
                    await navigator.clipboard.writeText(m.content);
                    setCopy("Copiado");
                  } catch {
                    setCopy("Falha ao copiar");
                  }
                }}
              >
                <Copy className="size-4 mr-2" />
                {copy}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onReact("👍")}>
                👍 Reagir à mensagem
              </DropdownMenuItem>
              {own && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil className="size-4 mr-2" />
                    Editar mensagem
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onPin}>
                    <Pin className="size-4 mr-2" />
                    {m.pinned ? "Desafixar mensagem" : "Fixar mensagem"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={onDelete}
                    className="text-destructive"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Excluir mensagem
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </article>
  );
}
