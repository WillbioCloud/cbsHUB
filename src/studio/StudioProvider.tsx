import { openSettings } from "../lib/settingsNavigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME, validateTheme, type Theme } from "./theme";
const KEY = "cbshub-studio-v1";
interface Entry {
  id: string;
  theme: Theme;
}
interface Saved {
  active: Theme;
  library: Entry[];
}
function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.library) ||
        parsed.library.length > 20
      )
        throw new Error("Preferências inválidas");
      return {
        active: validateTheme(parsed.active),
        library: parsed.library.map((item: Entry) => {
          if (
            typeof item.id !== "string" ||
            !/^[a-zA-Z0-9-]{1,80}$/.test(item.id)
          )
            throw new Error("ID inválido");
          return { id: item.id, theme: validateTheme(item.theme) };
        }),
      };
    }
    const legacy = JSON.parse(
      localStorage.getItem("cbshub-workspace-layout") || "{}",
    );
    const theme = structuredClone(DEFAULT_THEME);
    if (Number.isFinite(legacy.sidebarWidth))
      theme.layout.sidebarWidth = Math.max(
        224,
        Math.min(360, legacy.sidebarWidth),
      );
    if (typeof legacy.sidebarCollapsed === "boolean")
      theme.layout.sidebarCollapsed = legacy.sidebarCollapsed;
    if (typeof legacy.membersOpen === "boolean")
      theme.layout.membersOpen = legacy.membersOpen;
    return { active: theme, library: [] };
  } catch {
    return { active: structuredClone(DEFAULT_THEME), library: [] };
  }
}
interface StudioContext {
  dirty: boolean;
  selectPreset: (theme: Theme) => void;
  theme: Theme;
  library: Entry[];
  open: boolean;
  error: string;
  editingId: string | null;
  begin: () => void;
  cancel: () => void;
  preview: (theme: Theme, id?: string | null) => void;
  save: (name?: string) => void;
  rename: (id: string, name: string) => void;
  duplicate: (theme: Theme) => void;
  remove: (id: string) => void;
  updateLayout: (partial: Partial<Theme["layout"]>) => void;
  clearError: () => void;
}
const Context = createContext<StudioContext | null>(null);
export function useStudio() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("StudioProvider ausente");
  return ctx;
}
export function StudioProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState(read);
  const [draft, setDraft] = useState<Theme | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const theme = draft ?? saved.active;
  function persist(next: Saved) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, ...next }));
      setSaved(next);
      setError("");
      return true;
    } catch {
      setError(
        "Não foi possível salvar. O armazenamento pode estar cheio ou indisponível. Exporte o tema para preservar suas alterações.",
      );
      return false;
    }
  }
  const context: StudioContext = {
    dirty: !!draft && JSON.stringify(draft) !== JSON.stringify(saved.active),
    selectPreset: (next) => {
      if (persist({ ...saved, active: validateTheme(next) })) setDraft(null);
    },
    theme,
    library: saved.library,
    open,
    error,
    editingId,
    begin: () => {
      setDraft(structuredClone(saved.active));
      setEditingId(null);
      setOpen(true);
      openSettings("appearance");
      setError("");
    },
    cancel: () => {
      setDraft(null);
      setOpen(false);
      setEditingId(null);
    },
    preview: (next, id) => {
      setDraft(validateTheme(next));
      if (id !== undefined) setEditingId(id);
    },
    save: (name) => {
      if (!editingId && saved.library.length >= 20) {
        setError("Limite de 20 temas. Exclua um tema antes de salvar outro.");
        return;
      }
      const next = validateTheme({ ...theme, name: name ?? theme.name });
      const id = editingId ?? crypto.randomUUID();
      const library = [
        ...saved.library.filter((e) => e.id !== id),
        { id, theme: next },
      ];
      if (persist({ active: next, library })) {
        setDraft(null);
        setOpen(false);
        setEditingId(null);
      }
    },
    rename: (id, name) => {
      try {
        persist({
          ...saved,
          library: saved.library.map((e) =>
            e.id === id
              ? { ...e, theme: validateTheme({ ...e.theme, name }) }
              : e,
          ),
        });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    duplicate: (t) => {
      if (saved.library.length >= 20) {
        setError("Limite de 20 temas.");
        return;
      }
      persist({
        ...saved,
        library: [
          ...saved.library,
          {
            id: crypto.randomUUID(),
            theme: validateTheme({
              ...t,
              name: `${t.name.slice(0, 50)} (cópia)`,
            }),
          },
        ],
      });
    },
    remove: (id) => {
      persist({ ...saved, library: saved.library.filter((e) => e.id !== id) });
      if (editingId === id) setEditingId(null);
    },
    updateLayout: (partial) => {
      const next = validateTheme({
        ...theme,
        layout: { ...theme.layout, ...partial },
      });
      if (draft) setDraft(next);
      else persist({ ...saved, active: next });
    },
    clearError: () => setError(""),
  };
  useEffect(() => {
    const dismiss = () => {
      setDraft(null);
      setOpen(false);
      setEditingId(null);
    };
    window.addEventListener("cbshub-settings-dismissed", dismiss);
    return () =>
      window.removeEventListener("cbshub-settings-dismissed", dismiss);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.workspaceStyle =
      theme.name === "Clássico" ? "classic" : "modern";
    root.dataset.themePreset =
      theme.name === "Sakura Dream"
        ? "sakura"
        : theme.name === "Velvet Nocturne"
          ? "velvet"
          : "default";
    const c = theme.colors,
      l = theme.layout;
    const vars: Record<string, string> = {
      "--success":
        theme.name === "Velvet Nocturne"
          ? "#b99a62"
          : theme.mode === "light"
            ? "#38694f"
            : "#6eddbd",
      "--warning": theme.mode === "light" ? "#7a4d18" : "#f0bd68",
      "--destructive": theme.mode === "light" ? "#9f254c" : "#f1788a",
      "--destructive-foreground": theme.mode === "light" ? "#ffffff" : "#2b0b12",
      "--success-foreground":
        theme.name === "Velvet Nocturne"
          ? "#171318"
          : theme.mode === "light"
            ? "#ffffff"
            : "#0b1f19",
      "--title-font":
        theme.name === "Velvet Nocturne"
          ? 'Georgia, "Times New Roman", serif'
          : "inherit",
      "--background": c.background,
      "--foreground": c.text,
      "--surface": c.sidebar,
      "--surface-raised": c.hover,
      "--card": c.editor,
      "--card-foreground": c.text,
      "--popover": c.sidebar,
      "--popover-foreground": c.text,
      "--primary": c.button,
      "--primary-foreground": c.buttonText,
      "--secondary": c.hover,
      "--secondary-foreground": c.text,
      "--muted": c.editor,
      "--muted-foreground": c.muted,
      "--accent": c.hover,
      "--accent-foreground": c.text,
      "--border": c.border,
      "--input": c.border,
      "--ring": c.focus,
      "--studio-highlight": c.accent,
      "--studio-messages": c.messages,
      "--radius": `${l.radius}px`,
      "--studio-avatar-size": `${l.avatarSize}px`,
      "--studio-spacing": `${l.spacing}`,
      "--studio-density": `${l.density}`,
      "--studio-transparency": `${l.transparency}`,
      "--elevation-panel": `0 8px 32px rgb(0 0 0 / ${l.shadow})`,
      "--elevation-floating": `0 16px 48px rgb(0 0 0 / ${Math.min(0.8, l.shadow + 0.15)})`,
      "--studio-wallpaper":
        theme.background.kind === "gradient"
          ? `linear-gradient(${theme.background.angle}deg, ${theme.background.from}, ${theme.background.to})`
          : theme.background.kind === "image"
            ? `url("${theme.background.image}")`
            : "none",
      "--studio-wallpaper-opacity": `${theme.background.opacity}`,
      "--studio-wallpaper-blur": `${theme.background.blur}px`,
    };
    for (const [key, value] of Object.entries(vars))
      root.style.setProperty(key, value);
    root.style.fontSize = `${16 * (l.fontSize / 14) * l.scale}px`;
    root.style.colorScheme = theme.mode;
    root.dataset.studioMotion =
      !l.animations || l.reducedMotion ? "reduced" : "system";
  }, [theme]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
