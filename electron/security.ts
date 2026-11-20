export function trustedRenderer(url: string, renderer: string): boolean {
  try {
    const candidate = new URL(url), allowed = new URL(renderer);
    if (allowed.protocol === 'file:') return candidate.protocol === 'file:' && candidate.pathname === allowed.pathname && candidate.host === allowed.host;
    return ['http:', 'https:'].includes(allowed.protocol) && candidate.origin === allowed.origin;
  } catch { return false; }
}
export function externalLink(url: string): boolean {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
}
export function validCaptureSource(id: unknown, audio: unknown): boolean {
  return typeof id === 'string' && id.length <= 256 && /^(screen|window):[\w:.-]+$/.test(id) && typeof audio === 'boolean';
}

export const productionCsp = "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://0.peerjs.com wss://0.peerjs.com; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
export function permittedCapability(permission: string, url: string, renderer: string, mainFrame = true): boolean {
  return mainFrame && trustedRenderer(url, renderer) && ['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write'].includes(permission);
}
