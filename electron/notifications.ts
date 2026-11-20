export interface NoticeRequest {
  id: string;
  kind: "message" | "call";
  title: string;
  body: string;
}
export function validateNotice(value: unknown): NoticeRequest | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => !["id", "kind", "title", "body"].includes(k)) ||
    !["message", "call"].includes(String(v.kind))
  )
    return null;
  for (const [key, max] of [
    ["id", 120],
    ["title", 100],
    ["body", 240],
  ] as const)
    if (
      typeof v[key] !== "string" ||
      !v[key] ||
      v[key].length > max ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v[key])
    )
      return null;
  return v as unknown as NoticeRequest;
}
export function callToastXml(title: string, body: string) {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  return `<toast duration="long"><visual><binding template="ToastGeneric"><text>${escape(title)}</text><text>${escape(body)}</text></binding></visual><actions><action content="Atender" arguments="answer" activationType="foreground"/></actions></toast>`;
}
