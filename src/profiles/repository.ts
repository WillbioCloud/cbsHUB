import {
  defaultProfile,
  PROFILE_KEY,
  validateProfile,
  type UserProfile,
} from "./model";
const BLOCK_KEY = "cbshub-blocked-v1";
export function loadProfile(owner: string, name: string): UserProfile {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (raw) {
    try {
      return validateProfile(JSON.parse(raw), owner);
    } catch {
      throw new Error(
        "Perfil salvo inválido ou de outra identidade. Seus dados não foram sobrescritos.",
      );
    }
  }
  const p = defaultProfile(owner, name);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  return p;
}
export function saveProfile(profile: UserProfile, owner: string): UserProfile {
  const validated = validateProfile(profile, owner);
  const current = localStorage.getItem(PROFILE_KEY);
  if (current) {
    const old = validateProfile(JSON.parse(current), owner);
    if (old.createdAt !== validated.createdAt)
      throw new Error("A data de criação não pode ser alterada.");
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(validated));
  return validated;
}
export function readOwnProfile(owner: string, name: string): UserProfile {
  try {
    return loadProfile(owner, name);
  } catch {
    const safe = defaultProfile(owner, name);
    safe.privacy.visibility = 'private';
    safe.privacy.allowCalls = false;
    safe.privacy.allowReactions = false;
    return safe;
  }
}
export function blockedIds(): string[] {
  try {
    const x = JSON.parse(localStorage.getItem(BLOCK_KEY) || "[]");
    return Array.isArray(x)
      ? x
          .filter((id) => typeof id === "string" && id.length <= 100)
          .slice(0, 200)
      : [];
  } catch {
    return [];
  }
}
export function isBlocked(id: string) {
  return blockedIds().includes(id);
}
export function setBlocked(id: string, blocked: boolean, owner: string) {
  if (id === owner)
    throw new Error("Você não pode bloquear a própria identidade.");
  const list = blockedIds().filter((x) => x !== id);
  if (blocked) list.push(id);
  if (list.length > 200) throw new Error("Limite de bloqueios atingido.");
  localStorage.setItem(BLOCK_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("cbshub-profile-changed"));
}
export async function profileImage(
  file: File,
  kind: "avatar" | "banner",
): Promise<string> {
  const limit = kind === "avatar" ? 1024 * 1024 : 2 * 1024 * 1024;
  if (file.size > limit)
    throw new Error(
      `Arquivo muito grande: limite ${kind === "avatar" ? "1" : "2"} MB.`,
    );
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Use PNG, JPEG ou WebP. SVG não é permitido.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > 8192 || bitmap.height > 8192)
      throw new Error("Imagem com dimensões excessivas.");
    const w = kind === "avatar" ? 256 : 960,
      h = kind === "avatar" ? 256 : 320;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    const scale = Math.max(w / bitmap.width, h / bitmap.height);
    ctx.drawImage(
      bitmap,
      (w - bitmap.width * scale) / 2,
      (h - bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    );
    const data = c.toDataURL("image/webp", 0.75);
    if (data.length > (kind === "avatar" ? 100000 : 240000))
      throw new Error("Imagem muito detalhada. Reduza a resolução.");
    return data;
  } finally {
    bitmap.close();
  }
}
