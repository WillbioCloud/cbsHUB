import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  SendHorizontal,
  SmilePlus,
  Smile,
  Copy,
  Check,
  ChevronDown,
  Hash,
  Volume2,
  Sparkles,
  Radio,
} from 'lucide-react';
import { shallow } from 'zustand/shallow';
import { useHubStore } from '../store/useHubStore';
import { webrtcEngine } from '../lib/webrtcEngine';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { SoundboardPopover } from './SoundboardPopover';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Button } from './ui/button';
import type { ChatMessage } from '../types/cbshub';

const QUICK_REACTIONS = ['👍', '😂', '🔥', '❤️'];

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Hoje às ${timeStr}`;
  if (isYesterday) return `Ontem às ${timeStr}`;
  return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${timeStr}`;
}

function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Hoje';
  if (isYesterday) return 'Ontem';
  return date.toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' });
}

function isJumboEmoji(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Regex Unicode que valida até 3 emojis puros e zero caracteres alfanuméricos
  const stripped = trimmed.replace(/\s+/g, '');
  const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}){1,3}$/u;
  return emojiRegex.test(stripped) && !/[a-zA-Z0-9]/.test(stripped);
}

function renderMessageText(content: string) {
  if (isJumboEmoji(content)) {
    return <span className="text-4xl leading-tight py-1 block select-text">{content.trim()}</span>;
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);

  return (
    <span className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground select-text cursor-text">
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline select-text font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </span>
  );
}

export const TextChatSection: React.FC = () => {
  // Seletor com comparação rasa: o chat NÃO re-renderiza a lista inteira de
  // mensagens a cada atualização de micLevel/isSpeaking (era o que travava o app
  // durante a chamada). Só re-renderiza quando algo do chat realmente muda.
  const {
    messages,
    roomId,
    isConnected,
    setRoomId,
    clientId: localClientId,
    nickname: localNickname,
    typingUsers,
    unreadCount,
    setUnreadCount,
    clearExpiredTyping,
    soundboardClips,
  } = useHubStore(
    (state) => ({
      messages: state.messages,
      roomId: state.roomId,
      isConnected: state.isConnected,
      setRoomId: state.setRoomId,
      clientId: state.clientId,
      nickname: state.nickname,
      typingUsers: state.typingUsers,
      unreadCount: state.unreadCount,
      setUnreadCount: state.setUnreadCount,
      clearExpiredTyping: state.clearExpiredTyping,
      soundboardClips: state.soundboardClips,
    }),
    shallow
  );

  const handleCreateRandomRoom = async () => {
    const prefixes = ['jogatina', 'resenha', 'irmandade', 'gameplay', 'call'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const newRoom = `${randomPrefix}-${randomCode}`;
    setRoomId(newRoom);
    await webrtcEngine.joinRoom(newRoom);
  };

  const [inputText, setInputText] = useState('');
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Limpa indicadores de digitação expirados a cada 1s
  useEffect(() => {
    const timer = window.setInterval(() => {
      clearExpiredTyping();
    }, 1000);
    return () => clearInterval(timer);
  }, [clearExpiredTyping]);

  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTo({
        top: scrollViewportRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      setUnreadCount(0);
    }
  }, [setUnreadCount]);

  const handleScroll = () => {
    if (!scrollViewportRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const near = distanceFromBottom < 120;
    setIsNearBottom(near);
    if (near && unreadCount > 0) {
      setUnreadCount(0);
    }
  };

  // Auto-scroll ao chegar nova mensagem se estiver perto do fim
  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom(false);
    }
  }, [messages.length, isNearBottom, scrollToBottom]);

  const handleSendMessage = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setInputText('');
    webrtcEngine.sendTypingState(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await webrtcEngine.sendChatMessage(trimmed);
    scrollToBottom(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);

    // Ajusta altura automática do textarea (até 120px)
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(128, e.target.scrollHeight)}px`;

    // Dispara indicador de digitação com throttle de 2s
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      webrtcEngine.sendTypingState(true);
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart || 0;
      const end = textareaRef.current.selectionEnd || 0;
      const updated = inputText.substring(0, start) + emoji + inputText.substring(end);
      setInputText(updated);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = start + emoji.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    } else {
      setInputText((prev) => prev + emoji);
    }
  };

  const handleCopyMessage = (msg: ChatMessage) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedMsgId(msg.id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleReplaySound = (soundName?: string) => {
    if (!soundName) return;
    const found = soundboardClips.find((c) => c.name.toLowerCase() === soundName.toLowerCase());
    if (found) {
      webrtcEngine.triggerSoundboardClip(found);
    }
  };

  // Usuários digitando atualmente (excluindo usuário local)
  const typingEntries = Object.entries(typingUsers).filter(([id]) => id !== localClientId);

  return (
    <div className="flex-1 min-h-[180px] flex flex-col bg-background overflow-hidden relative select-none">
      {/* 1. Feed de Mensagens com Auto-Scroll */}
      <div
        ref={scrollViewportRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5"
      >
        {/* Estado Desconectado ou Canal Vazio */}
        {!isConnected ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-300">
            <div className="w-14 h-14 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center text-muted-foreground mb-3 shadow-lg">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground tracking-tight mb-1">
              Você não está conectado a nenhuma sala
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-4">
              Crie uma sala com nome aleatório ou digite o nome de uma sala na barra lateral para conversar e compartilhar sua tela.
            </p>
            <Button
              onClick={handleCreateRandomRoom}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-8 px-4 rounded-lg flex items-center gap-2 shadow"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Criar Nova Sala Aleatória</span>
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col justify-end pb-8 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-2xl bg-secondary/80 border border-border flex items-center justify-center text-primary mb-4 shadow-lg">
              <Hash className="w-9 h-9" />
            </div>
            <h3 className="text-xl font-bold text-foreground tracking-tight mb-1">
              Bem-vindo ao início de #{roomId}!
            </h3>
            <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
              Este é o começo do canal de texto da sala <span className="font-mono text-primary font-semibold">#{roomId}</span>. Todas as mensagens e reações são sincronizadas diretamente ponto-a-ponto (P2P Mesh) entre os irmãos e salvas no seu banco local IndexedDB.
            </p>
          </div>
        ) : (
          /* Renderização das Mensagens Agrupadas */
          <div className="space-y-0.5 pt-2">
            {messages.map((msg, index) => {
              const prevMsg = index > 0 ? messages[index - 1] : null;

              // Separador de Data
              const showDateSeparator =
                !prevMsg ||
                new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

              // Agrupamento Cozy Discord: mesmo autor, < 5 min, mesmo dia e tipo user
              const isGrouped =
                !showDateSeparator &&
                prevMsg &&
                prevMsg.type === 'user' &&
                msg.type === 'user' &&
                msg.authorClientId === prevMsg.authorClientId &&
                msg.createdAt - prevMsg.createdAt < 5 * 60 * 1000;

              return (
                <React.Fragment key={msg.id}>
                  {showDateSeparator && (
                    <div className="relative flex items-center justify-center my-3 select-none">
                      <div className="border-t border-border/80 w-full absolute" />
                      <span className="bg-background px-3 py-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider relative z-10 border border-border/60 rounded-full shadow-sm">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  {/* Mensagem do Soundboard */}
                  {msg.type === 'soundboard' ? (
                    <div className="py-1 px-3 my-0.5 rounded-lg bg-secondary/30 border border-border/40 text-xs text-muted-foreground flex items-center justify-between group">
                      <div className="flex items-center gap-2 truncate">
                        <Volume2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-semibold text-foreground">{msg.authorNickname}</span>
                        <span>{msg.content}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground/70">{formatMessageTime(msg.createdAt)}</span>
                        {msg.soundMeta && (
                          <button
                            onClick={() => handleReplaySound(msg.soundMeta?.soundName)}
                            title="Tocar som novamente"
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Sparkles className="w-3 h-3 text-primary" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Mensagem de Usuário (Agrupada ou Cabeçalho) */
                    <div
                      className={`relative group rounded-md hover:bg-secondary/40 transition-colors pr-2 ${
                        isGrouped ? 'pl-12 py-0.5' : 'pl-2 pt-2 pb-0.5 mt-2.5 flex items-start gap-3'
                      }`}
                    >
                      {/* Avatar apenas no cabeçalho do bloco */}
                      {!isGrouped && (
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white uppercase shrink-0 shadow mt-0.5"
                          style={{ backgroundColor: msg.authorAvatarColor || 'hsl(var(--primary))' }}
                        >
                          {getInitials(msg.authorNickname)}
                        </div>
                      )}

                      {/* Timestamp curto à esquerda no hover quando agrupada */}
                      {isGrouped && (
                        <span className="absolute left-2 top-1 text-[10px] font-mono text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity select-none w-8 text-right">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      )}

                      {/* Conteúdo Principal */}
                      <div className="min-w-0 flex-1">
                        {!isGrouped && (
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-foreground tracking-tight">
                              {msg.authorNickname}
                            </span>
                            {msg.authorClientId === localClientId && (
                              <span className="text-[9px] font-mono text-muted-foreground/80">
                                (Você)
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground select-none">
                              {formatFullDate(msg.createdAt)}
                            </span>
                          </div>
                        )}

                        {/* Texto da Mensagem */}
                        <div className="select-text cursor-text">{renderMessageText(msg.content)}</div>

                        {/* Pílulas de Reações P2P */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 pt-0.5">
                            {Object.values(msg.reactions).map((reaction) => {
                              const hasReacted = reaction.reactorClientIds.includes(localClientId);
                              const reactorNames = Object.values(reaction.reactorNicknames).join(', ');

                              return (
                                <Tooltip key={reaction.emoji}>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() =>
                                        webrtcEngine.toggleMessageReaction(msg.id, reaction.emoji)
                                      }
                                      className={`h-6 px-2 rounded-md text-xs flex items-center gap-1 border transition-colors select-none ${
                                        hasReacted
                                          ? 'bg-primary/15 border-primary/50 text-foreground font-semibold'
                                          : 'bg-secondary/60 border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground'
                                      }`}
                                    >
                                      <span>{reaction.emoji}</span>
                                      <span className="font-mono text-[11px]">{reaction.reactorClientIds.length}</span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <span className="text-xs">{reactorNames}</span>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Barra Flutuante de Ações no Hover */}
                      <div className="absolute right-3 -top-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border border-border rounded-lg shadow-lg px-1 py-0.5 flex items-center gap-0.5 select-none">
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => webrtcEngine.toggleMessageReaction(msg.id, emoji)}
                            className="h-6 w-6 rounded hover:bg-accent flex items-center justify-center text-xs hover:scale-125 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}

                        <EmojiPickerPopover
                          onSelectEmoji={(emoji) => webrtcEngine.toggleMessageReaction(msg.id, emoji)}
                          side="top"
                          align="end"
                          trigger={
                            <button
                              title="Adicionar Reação"
                              className="h-6 w-6 rounded hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground"
                            >
                              <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                          }
                        />

                        <div className="h-3 w-px bg-border/80 mx-0.5" />

                        <button
                          onClick={() => handleCopyMessage(msg)}
                          title="Copiar Texto"
                          className="h-6 w-6 rounded hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          {copiedMsgId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Pílula Flutuante de Mensagens Não Lidas */}
      {!isNearBottom && unreadCount > 0 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 animate-in fade-in slide-in-from-bottom-2">
          <Button
            size="sm"
            onClick={() => scrollToBottom(true)}
            className="h-7 px-3 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-full shadow-lg flex items-center gap-1.5"
          >
            <ChevronDown className="w-3.5 h-3.5 animate-bounce" />
            <span>{unreadCount} novas mensagens</span>
          </Button>
        </div>
      )}

      {/* 2. Indicador de Digitação (Faixa de Altura Fixa) */}
      <div className="h-5 px-5 text-[11px] text-muted-foreground flex items-center gap-1.5 select-none shrink-0">
        {typingEntries.length > 0 && (
          <>
            <span className="flex gap-0.5 items-center">
              <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              <span className="w-1 h-1 rounded-full bg-primary animate-pulse delay-75" />
              <span className="w-1 h-1 rounded-full bg-primary animate-pulse delay-150" />
            </span>
            <span className="font-medium text-foreground/90">
              {typingEntries.map(([, u]) => u.nickname).join(', ')}
            </span>
            <span>{typingEntries.length === 1 ? 'está digitando...' : 'estão digitando...'}</span>
          </>
        )}
      </div>

      {/* 3. Caixa de Envio (ChatComposer) */}
      <div className="mx-4 mb-3 rounded-xl bg-secondary/70 border border-border/80 focus-within:border-primary/60 px-3 py-2 flex items-end gap-2 transition-colors shrink-0">
        <textarea
          ref={textareaRef}
          value={inputText}
          rows={1}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={`Conversar em #${roomId}...`}
          className="flex-1 max-h-32 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed select-text cursor-text"
        />

        <div className="flex items-center gap-1 shrink-0 pb-0.5">
          <SoundboardPopover
            side="top"
            align="end"
            trigger={
              <button
                type="button"
                aria-label="Abrir soundboard"
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            }
          />

          <EmojiPickerPopover
            onSelectEmoji={handleInsertEmoji}
            side="top"
            align="end"
            trigger={
              <button
                type="button"
                aria-label="Inserir emoji"
                className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <Smile className="w-4 h-4" />
              </button>
            }
          />

          <Button
            type="button"
            size="icon"
            disabled={!inputText.trim()}
            onClick={handleSendMessage}
            className={`h-7 w-7 rounded-lg transition-all ${
              inputText.trim()
                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow'
                : 'bg-transparent text-muted-foreground/40 hover:bg-transparent cursor-not-allowed'
            }`}
          >
            <SendHorizontal className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
