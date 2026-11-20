import type { ChatMessage } from "../types/cbshub";
export interface ChatOperation {
  id: string;
  roomId: string;
  messageId: string;
  actorClientId: string;
  nickname: string;
  at: number;
  kind: "edit" | "delete" | "reaction" | "pin";
  content?: string;
  emoji?: string;
  active?: boolean;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Texto inválido ou muito longo.");
  return value;
}
export function validateMessage(value: unknown, room: string): ChatMessage {
  if (!value || typeof value !== "object")
    throw new Error("Mensagem inválida.");
  const m = value as ChatMessage;
  if (
    m.roomId !== room ||
    !["user", "system", "soundboard"].includes(m.type) ||
    !Number.isSafeInteger(m.createdAt) ||
    m.createdAt < 0 ||
    m.createdAt > Date.now() + 300000
  )
    throw new Error("Sala, tipo ou data inválida.");
  if (!m.id || !m.authorClientId) throw new Error("Identificador vazio.");
  const content = text(m.content, 8000);
  if (!content.trim()) throw new Error("Mensagem vazia.");
  return {
    id: text(m.id, 120),
    roomId: room,
    type: m.type,
    authorClientId: text(m.authorClientId, 100),
    authorNickname: text(m.authorNickname, 80),
    authorAvatarColor:
      typeof m.authorAvatarColor === "string" &&
      /^#[a-f0-9]{6}$/i.test(m.authorAvatarColor)
        ? m.authorAvatarColor
        : "#6eddbd",
    content,
    createdAt: m.createdAt,
    reactions: {},
    ...(m.replyTo ? { replyTo: text(m.replyTo, 120) } : {}),
    ...(m.soundMeta
      ? {
          soundMeta: {
            emoji: text(m.soundMeta.emoji, 16),
            soundName: text(m.soundMeta.soundName, 100),
          },
        }
      : {}),
  };
}
export function validateOperation(
  value: unknown,
  room: string,
  actor?: string,
): ChatOperation {
  if (!value || typeof value !== "object")
    throw new Error("Operação inválida.");
  const o = value as ChatOperation;
  if (
    o.roomId !== room ||
    (actor !== undefined && o.actorClientId !== actor) ||
    !["edit", "delete", "reaction", "pin"].includes(o.kind) ||
    !Number.isSafeInteger(o.at) ||
    o.at < 0 ||
    o.at > Date.now() + 300000
  )
    throw new Error("Operação não autorizada ou inválida.");
  const op: ChatOperation = {
    id: text(o.id, 120),
    messageId: text(o.messageId, 120),
    roomId: room,
    actorClientId: text(o.actorClientId, 100),
    nickname: text(o.nickname, 80),
    at: o.at,
    kind: o.kind,
  };
  if (!op.id || !op.messageId || !op.actorClientId)
    throw new Error("Identificador vazio.");
  if (o.kind === "edit") {
    op.content = text(o.content, 8000);
    if (!op.content.trim()) throw new Error("Mensagem vazia.");
  }
  if (o.kind === "reaction") {
    op.emoji = text(o.emoji, 16);
    if (
      !op.emoji ||
      ["__proto__", "constructor", "prototype"].includes(op.emoji)
    )
      throw new Error("Emoji inválido.");
  }
  if (o.kind === "reaction" || o.kind === "pin") {
    if (typeof o.active !== "boolean") throw new Error("Estado inválido.");
    op.active = o.active;
  }
  return op;
}
export function compareMessages(a: ChatMessage, b: ChatMessage) {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
export function projectMessage(
  message: ChatMessage,
  operations: ChatOperation[],
): ChatMessage {
  const m = structuredClone(message);
  for (const o of [...operations].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  )) {
    if (o.messageId !== m.id || o.roomId !== m.roomId) continue;
    if (
      o.kind === "edit" &&
      o.actorClientId === m.authorClientId &&
      !m.deleted
    ) {
      m.content = o.content!;
      m.editedAt = o.at;
    }
    if (o.kind === "delete" && o.actorClientId === m.authorClientId) {
      m.deleted = true;
      m.content = "";
      m.reactions = {};
      m.pinned = false;
    }
    if (m.deleted) continue;
    if (o.kind === "pin" && o.actorClientId === m.authorClientId)
      m.pinned = o.active;
    if (o.kind === "reaction") {
      const r = (Object.hasOwn(m.reactions, o.emoji!)
        ? m.reactions[o.emoji!]
        : undefined) ?? {
        emoji: o.emoji!,
        reactorClientIds: [],
        reactorNicknames: {},
      };
      r.reactorClientIds = r.reactorClientIds.filter(
        (id) => id !== o.actorClientId,
      );
      delete r.reactorNicknames[o.actorClientId];
      if (o.active) {
        r.reactorClientIds.push(o.actorClientId);
        r.reactorNicknames[o.actorClientId] = o.nickname;
      }
      r.reactorClientIds.sort();
      if (r.reactorClientIds.length) m.reactions[o.emoji!] = r;
      else delete m.reactions[o.emoji!];
    }
  }
  return m;
}
export function safeLink(value: string): URL | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}
