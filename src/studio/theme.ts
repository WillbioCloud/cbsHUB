export const COLOR_LABELS = {
  background: "Fundo principal",
  sidebar: "Barras laterais",
  messages: "Fundo das mensagens",
  editor: "Editor de mensagens",
  button: "Botões",
  buttonText: "Texto dos botões",
  text: "Texto principal",
  muted: "Texto secundário",
  accent: "Destaque",
  border: "Bordas",
  hover: "Interação / hover",
  focus: "Foco de teclado",
} as const;
export type ColorKey = keyof typeof COLOR_LABELS;
export interface Theme {
  name: string;
  mode: "dark" | "light";
  colors: Record<ColorKey, string>;
  background: {
    kind: "solid" | "gradient" | "image";
    from: string;
    to: string;
    angle: number;
    image: string;
    opacity: number;
    blur: number;
  };
  layout: {
    sidebarWidth: number;
    sidebarCollapsed: boolean;
    membersOpen: boolean;
    density: number;
    avatarSize: number;
    fontSize: number;
    scale: number;
    radius: number;
    spacing: number;
    shadow: number;
    transparency: number;
    animations: boolean;
    reducedMotion: boolean;
  };
}
export interface ThemeFile {
  format: "cbshub-studio";
  version: 1;
  theme: Theme;
}
export const MAX_FILE_BYTES = 1_500_000;
export const DEFAULT_THEME: Theme = {
  name: "Moderno Roxo",
  mode: "dark",
  colors: {
    background: "#101116",
    sidebar: "#171820",
    messages: "#101116",
    editor: "#1d1f2a",
    button: "#7c3aed",
    buttonText: "#ffffff",
    text: "#f5f5f7",
    muted: "#a1a1aa",
    accent: "#8b5cf6",
    border: "#2b2d3a",
    hover: "#2a2638",
    focus: "#a78bfa",
  },
  background: {
    kind: "solid",
    from: "#172c30",
    to: "#29233e",
    angle: 135,
    image: "",
    opacity: 0.3,
    blur: 0,
  },
  layout: {
    sidebarWidth: 264,
    sidebarCollapsed: false,
    membersOpen: true,
    density: 1,
    avatarSize: 36,
    fontSize: 14,
    scale: 1,
    radius: 12,
    spacing: 1,
    shadow: 0.22,
    transparency: 1,
    animations: true,
    reducedMotion: false,
  },
};
const preset = (
  name: string,
  colors: Partial<Theme["colors"]>,
  extra: Partial<Theme> = {},
): Theme => ({
  ...structuredClone(DEFAULT_THEME),
  name,
  ...extra,
  colors: { ...DEFAULT_THEME.colors, ...colors },
});
export const PRESETS: Theme[] = [
  preset(
    "Clássico",
    {
      background: "#090909",
      sidebar: "#111111",
      messages: "#090909",
      editor: "#191919",
      button: "#757575",
      buttonText: "#ffffff",
      accent: "#bdbdbd",
      border: "#282828",
      hover: "#242424",
      focus: "#cccccc",
    },
    {
      layout: {
        ...DEFAULT_THEME.layout,
        sidebarWidth: 240,
        membersOpen: false,
        density: 0.85,
        radius: 4,
        spacing: 0.85,
        shadow: 0,
      },
    },
  ),
  structuredClone(DEFAULT_THEME),
  preset(
    "Light Modern",
    {
      background: "#f6f8fa",
      sidebar: "#ffffff",
      messages: "#f6f8fa",
      editor: "#ffffff",
      button: "#176b56",
      buttonText: "#ffffff",
      text: "#17202d",
      muted: "#526071",
      accent: "#176b56",
      border: "#c9d0d9",
      hover: "#e6ebf1",
      focus: "#1566b7",
    },
    { mode: "light" },
  ),
  preset("OLED Black", {
    background: "#000000",
    sidebar: "#060606",
    messages: "#000000",
    editor: "#121212",
    muted: "#a3a3a3",
    border: "#303030",
    hover: "#1c1c1c",
  }),
  preset(
    "Minimal",
    {
      background: "#f8f7f4",
      sidebar: "#eeede9",
      messages: "#f8f7f4",
      editor: "#ffffff",
      button: "#343a40",
      buttonText: "#ffffff",
      text: "#25282c",
      muted: "#62656b",
      accent: "#3e5260",
      border: "#c9c9c6",
      hover: "#e6e5e0",
      focus: "#3e5260",
    },
    {
      mode: "light",
      layout: { ...DEFAULT_THEME.layout, radius: 4, shadow: 0, density: 0.85 },
    },
  ),
  preset("Gamer Neon", {
    background: "#0c0b18",
    sidebar: "#121023",
    messages: "#0c0b18",
    editor: "#201a35",
    button: "#d6a3ff",
    buttonText: "#231332",
    accent: "#67f4d3",
    border: "#4d3c69",
    hover: "#2f2447",
    focus: "#e6c5ff",
  }),
  preset(
    "Sakura Dream",
    {
      background: "#fff8f3",
      sidebar: "#fbe4ee",
      messages: "#fff8f3",
      editor: "#fffdfb",
      button: "#f2a3c1",
      buttonText: "#4a3050",
      text: "#4d3a52",
      muted: "#705567",
      accent: "#873f6c",
      border: "#d2aabf",
      hover: "#eadcf7",
      focus: "#873f6c",
    },
    {
      mode: "light",
      layout: { ...DEFAULT_THEME.layout, radius: 18, shadow: 0.1 },
    },
  ),
  preset(
    "Velvet Nocturne",
    {
      background: "#171318",
      sidebar: "#211a20",
      messages: "#171318",
      editor: "#2b2029",
      button: "#b99a62",
      buttonText: "#171318",
      text: "#e8dcc7",
      muted: "#baa9a8",
      accent: "#d8b675",
      border: "#654c59",
      hover: "#3a2530",
      focus: "#d8b675",
    },
    { layout: { ...DEFAULT_THEME.layout, radius: 8, shadow: 0.18 } },
  ),
  preset("Custom", {}),
];
function object(
  value: unknown,
  keys: string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path}: objeto inválido.`);
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(record, key))
  )
    throw new Error(`${path}: campos ausentes ou desconhecidos.`);
  return record;
}
function hex(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error("Use cores HEX com seis dígitos (#RRGGBB).");
  return value.toLowerCase();
}
function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`Medida fora do intervalo ${min}–${max}.`);
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Opção inválida.");
  return value;
}
export function themeName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 60 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error("O nome deve ter de 1 a 60 caracteres.");
  return value.trim();
}
export function validateTheme(value: unknown): Theme {
  const t = object(
    value,
    ["name", "mode", "colors", "background", "layout"],
    "Tema",
  );
  if (t.mode !== "dark" && t.mode !== "light")
    throw new Error("Modo de tema inválido.");
  const c = object(t.colors, Object.keys(COLOR_LABELS), "Cores");
  const colors = Object.fromEntries(
    Object.entries(c).map(([key, val]) => [key, hex(val)]),
  ) as Theme["colors"];
  const b = object(
    t.background,
    ["kind", "from", "to", "angle", "image", "opacity", "blur"],
    "Fundo",
  );
  if (!["solid", "gradient", "image"].includes(String(b.kind)))
    throw new Error("Tipo de fundo inválido.");
  if (
    typeof b.image !== "string" ||
    b.image.length > 1_400_000 ||
    (b.image !== "" &&
      !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(
        b.image,
      ))
  )
    throw new Error("Imagem inválida: use PNG, JPEG ou WebP incorporado.");
  if (b.kind === "image" && !b.image)
    throw new Error("Escolha uma imagem para este fundo.");
  const l = object(t.layout, Object.keys(DEFAULT_THEME.layout), "Layout");
  return {
    name: themeName(t.name),
    mode: t.mode,
    colors,
    background: {
      kind: b.kind as Theme["background"]["kind"],
      from: hex(b.from),
      to: hex(b.to),
      angle: number(b.angle, 0, 360),
      image: b.image,
      opacity: number(b.opacity, 0, 1),
      blur: number(b.blur, 0, 30),
    },
    layout: {
      sidebarWidth: number(l.sidebarWidth, 224, 360),
      sidebarCollapsed: boolean(l.sidebarCollapsed),
      membersOpen: boolean(l.membersOpen),
      density: number(l.density, 0.7, 1.5),
      avatarSize: number(l.avatarSize, 24, 56),
      fontSize: number(l.fontSize, 12, 18),
      scale: number(l.scale, 0.85, 1.15),
      radius: number(l.radius, 0, 24),
      spacing: number(l.spacing, 0.75, 1.5),
      shadow: number(l.shadow, 0, 0.6),
      transparency: number(l.transparency, 0.65, 1),
      animations: boolean(l.animations),
      reducedMotion: boolean(l.reducedMotion),
    },
  };
}
export function parseTheme(text: string): Theme {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES)
    throw new Error("Arquivo muito grande (limite de 1,5 MB).");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("JSON inválido.");
  }
  const file = object(value, ["format", "version", "theme"], "Arquivo");
  if (file.format !== "cbshub-studio" || file.version !== 1)
    throw new Error("Formato ou versão de tema não suportado.");
  return validateTheme(file.theme);
}
export function serializeTheme(theme: Theme): string {
  return JSON.stringify(
    { format: "cbshub-studio", version: 1, theme: validateTheme(theme) },
    null,
    2,
  );
}
export function contrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const rgb = hex(color)
      .slice(1)
      .match(/../g)!
      .map((n) => parseInt(n, 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function contrastChecks(t: Theme) {
  return [
    ["Texto / fundo", t.colors.text, t.colors.background],
    ["Texto / mensagens", t.colors.text, t.colors.messages],
    ["Texto / editor", t.colors.text, t.colors.editor],
    ["Texto / sidebar", t.colors.text, t.colors.sidebar],
    ["Texto secundário", t.colors.muted, t.colors.background],
    ["Texto / botão", t.colors.buttonText, t.colors.button],
  ].map(([label, a, b]) => ({ label, ratio: contrast(a, b) }));
}
