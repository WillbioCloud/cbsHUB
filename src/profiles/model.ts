export const PRESENCES = {
  online: "Online",
  away: "Ausente",
  busy: "Ocupado",
  invisible: "Invisível",
  offline: "Offline",
} as const;
export type Presence = keyof typeof PRESENCES;
export interface UserProfile {
  version: 1;
  ownerId: string;
  displayName: string;
  username: string;
  bio: string;
  status: string;
  emoji: string;
  avatar: string;
  banner: string;
  links: string[];
  createdAt: number;
  presence: Presence;
  appearance: {
    color: string;
    background: string;
    gradient: string;
    useGradient: boolean;
    border: "none" | "ring" | "double";
    card: "soft" | "outlined" | "glass";
    theme: "inherit" | "dark" | "light";
  };
  privacy: {
    visibility: "room" | "private";
    showBio: boolean;
    showLinks: boolean;
    showCreatedAt: boolean;
    shareImages: boolean;
    allowCalls: boolean;
    allowReactions: boolean;
  };
}
export interface PublicProfile {
  version: 1;
  displayName: string;
  username: string;
  bio: string;
  status: string;
  emoji: string;
  avatar: string;
  banner: string;
  links: string[];
  createdAt: number | null;
  presence: Exclude<Presence, "invisible">;
  appearance: UserProfile["appearance"];
  interactions: { calls: boolean; reactions: boolean };
}
export const PROFILE_KEY = "cbshub-profile-v1";
export function defaultProfile(ownerId: string, name: string): UserProfile {
  return {
    version: 1,
    ownerId,
    displayName: name.slice(0, 40) || "Pessoa",
    username: `user_${ownerId
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 12)
      .toLowerCase()}`,
    bio: "",
    status: "",
    emoji: "",
    avatar: "",
    banner: "",
    links: [],
    createdAt: Date.now(),
    presence: "online",
    appearance: {
      color: "#6eddbd",
      background: "#171b21",
      gradient: "#35314d",
      useGradient: false,
      border: "ring",
      card: "soft",
      theme: "inherit",
    },
    privacy: {
      visibility: "room",
      showBio: true,
      showLinks: false,
      showCreatedAt: false,
      shareImages: true,
      allowCalls: true,
      allowReactions: true,
    },
  };
}
function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) ||
    (required && !value.trim())
  )
    throw new Error(`Texto inválido (máximo ${max} caracteres).`);
  return value.trim();
}
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Perfil inválido.");
  return value as Record<string, unknown>;
}
function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (!values.includes(v as T)) throw new Error("Opção de perfil inválida.");
  return v as T;
}
function bool(v: unknown) {
  if (typeof v !== "boolean") throw new Error("Permissão inválida.");
  return v;
}
function color(v: unknown) {
  if (typeof v !== "string" || !/^#[a-f0-9]{6}$/i.test(v))
    throw new Error("Use uma cor HEX #RRGGBB.");
  return v;
}
export function imageData(v: unknown, max: number): string {
  if (v === "") return "";
  if (
    typeof v !== "string" ||
    v.length > max ||
    !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(v)
  )
    throw new Error("Imagem de perfil inválida.");
  const head = atob(v.split(",")[1].slice(0, 32));
  if (
    !(
      head.startsWith("\x89PNG\r\n\x1a\n") ||
      head.startsWith("\xff\xd8\xff") ||
      (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP")
    )
  )
    throw new Error("Conteúdo da imagem inválido.");
  return v;
}
function links(v: unknown) {
  if (!Array.isArray(v) || v.length > 3)
    throw new Error("Use até três links HTTPS.");
  return v.map((link) => {
    const raw = text(link, 250, true);
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("Link inválido.");
    }
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Use links HTTPS sem credenciais.");
    return url.href;
  });
}
function appearance(v: unknown): UserProfile["appearance"] {
  const a = obj(v);
  return {
    color: color(a.color),
    background: color(a.background),
    gradient: color(a.gradient),
    useGradient: bool(a.useGradient),
    border: choice(a.border, ["none", "ring", "double"]),
    card: choice(a.card, ["soft", "outlined", "glass"]),
    theme: choice(a.theme, ["inherit", "dark", "light"]),
  };
}
export function validateProfile(value: unknown, ownerId: string): UserProfile {
  const p = obj(value);
  if (p.version !== 1 || p.ownerId !== ownerId)
    throw new Error("O perfil não pertence a esta identidade local.");
  const username = text(p.username, 24, true).toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username))
    throw new Error(
      "Nome de usuário: 3–24 letras, números ou _, iniciando por letra.",
    );
  if (
    typeof p.createdAt !== "number" ||
    !Number.isSafeInteger(p.createdAt) ||
    p.createdAt < 0 ||
    p.createdAt > Date.now() + 60000
  )
    throw new Error("Data de criação inválida.");
  const privacy = obj(p.privacy);
  return {
    version: 1,
    ownerId,
    displayName: text(p.displayName, 40, true),
    username,
    bio: text(p.bio, 500),
    status: text(p.status, 100),
    emoji: text(p.emoji, 16),
    avatar: imageData(p.avatar, 100000),
    banner: imageData(p.banner, 240000),
    links: links(p.links),
    createdAt: p.createdAt,
    presence: choice(p.presence, Object.keys(PRESENCES) as Presence[]),
    appearance: appearance(p.appearance),
    privacy: {
      visibility: choice(privacy.visibility, ["room", "private"]),
      showBio: bool(privacy.showBio),
      showLinks: bool(privacy.showLinks),
      showCreatedAt: bool(privacy.showCreatedAt),
      shareImages: bool(privacy.shareImages),
      allowCalls: bool(privacy.allowCalls),
      allowReactions: bool(privacy.allowReactions),
    },
  };
}
export function publicProfile(p: UserProfile): PublicProfile | null {
  if (p.privacy.visibility === "private") return null;
  return {
    version: 1,
    displayName: p.displayName,
    username: p.username,
    bio: p.privacy.showBio ? p.bio : "",
    status: p.status,
    emoji: p.emoji,
    avatar: p.privacy.shareImages ? p.avatar : "",
    banner: p.privacy.shareImages ? p.banner : "",
    links: p.privacy.showLinks ? p.links : [],
    createdAt: p.privacy.showCreatedAt ? p.createdAt : null,
    presence: p.presence === "invisible" ? "offline" : p.presence,
    appearance: p.appearance,
    interactions: {
      calls: p.privacy.allowCalls,
      reactions: p.privacy.allowReactions,
    },
  };
}
export function validatePublicProfile(value: unknown): PublicProfile {
  const p = obj(value);
  if (p.version !== 1) throw new Error("Versão de perfil incompatível.");
  // Reconstruct only permitted public fields; never retain private or unknown properties.
  const owner = "remote";
  const candidate = {
    ...p,
    ownerId: owner,
    createdAt: p.createdAt ?? 0,
    privacy: {
      visibility: "room",
      showBio: true,
      showLinks: true,
      showCreatedAt: true,
      shareImages: true,
      allowCalls: bool(obj(p.interactions).calls),
      allowReactions: bool(obj(p.interactions).reactions),
    },
  };
  const clean = validateProfile(candidate, owner);
  const result = publicProfile(clean)!;
  result.createdAt = p.createdAt === null ? null : clean.createdAt;
  return result;
}
export function interactionAllowed(blocked: boolean, allowed: boolean) {
  return !blocked && allowed;
}
