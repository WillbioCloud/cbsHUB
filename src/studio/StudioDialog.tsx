import { useSettingsDrafts } from "../lib/settingsDrafts";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Download,
  Upload,
  Copy,
  Trash2,
  Palette,
  RotateCcw,
  Save,
  Check,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../components/ui/tabs";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import { useStudio } from "./StudioProvider";
import {
  COLOR_LABELS,
  DEFAULT_THEME,
  PRESETS,
  MAX_FILE_BYTES,
  contrastChecks,
  parseTheme,
  serializeTheme,
  type Theme,
  type ColorKey,
} from "./theme";

function download(theme: Theme) {
  const url = URL.createObjectURL(
    new Blob([serializeTheme(theme)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${theme.name.replace(/[^a-z0-9-]/gi, "-") || "tema"}.cbshub.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function normalizedImage(source: Blob): Promise<string> {
  if (source.size > 1_050_000) throw new Error("A imagem deve ter até 1 MB.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(source.type))
    throw new Error("Use uma imagem PNG, JPEG ou WebP. SVG não é permitido.");
  const bitmap = await createImageBitmap(source);
  try {
    if (bitmap.width > 8192 || bitmap.height > 8192)
      throw new Error("Use uma imagem de até 8192 × 8192 pixels.");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.8);
    if (data.length > 1_400_000)
      throw new Error(
        "Imagem muito detalhada. Reduza o tamanho e tente novamente.",
      );
    return data;
  } finally {
    bitmap.close();
  }
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setText(value);
  }
  const valid = /^#[0-9a-f]{6}$/i.test(text);
  return (
    <label className="studio-color">
      <span>{label}</span>
      <div>
        <input
          type="color"
          aria-label={`Seletor ${label}`}
          value={value}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
        />
        <Input
          aria-label={`HEX ${label}`}
          aria-invalid={!valid}
          value={text}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value))
              onChange(e.target.value);
          }}
          onBlur={() => {
            if (!valid) setText(value);
          }}
        />
      </div>
    </label>
  );
}
const ranges = {
  sidebarWidth: ["Largura da barra lateral", 224, 360, 8, "px"],
  density: ["Densidade das mensagens", 0.7, 1.5, 0.05, "×"],
  avatarSize: ["Tamanho dos avatares", 24, 56, 2, "px"],
  fontSize: ["Tamanho da fonte", 12, 18, 1, "px"],
  scale: ["Escala da interface", 0.85, 1.15, 0.05, "×"],
  radius: ["Arredondamento", 0, 24, 1, "px"],
  spacing: ["Espaçamento", 0.75, 1.5, 0.05, "×"],
  shadow: ["Intensidade das sombras", 0, 0.6, 0.05, ""],
  transparency: ["Opacidade dos painéis", 0.65, 1, 0.05, ""],
} as const;
export function StudioDialog({ embedded = false }: { embedded?: boolean }) {
  const studio = useStudio();
  const t = studio.theme;
  const [nameDraft, setNameDraft] = useState(t.name);
  useEffect(() => setNameDraft(t.name), [t.name, studio.open]);
  useEffect(() => {
    if (!embedded) return;
    useSettingsDrafts.setState({ theme: studio.dirty || nameDraft !== t.name });
    return () => useSettingsDrafts.setState({ theme: false });
  }, [embedded, studio.dirty, nameDraft, t.name]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const importer = useRef<HTMLInputElement>(null);
  const patch = (partial: Partial<Theme>) => {
    studio.preview({ ...t, ...partial });
    setNotice("");
  };
  const choose = (theme: Theme, id: string | null = null) => {
    studio.preview(structuredClone(theme), id);
    setNameDraft(theme.name);
    setError("");
    setNotice("Prévia aplicada. Salve para manter ou cancele para voltar.");
  };
  const checks = contrastChecks(t);
  const failing = checks.filter((c) => c.ratio < 4.5);
  const run = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > MAX_FILE_BYTES)
        throw new Error("Arquivo muito grande (limite de 1,5 MB).");
      const theme = parseTheme(await file.text());
      if (theme.background.image) {
        const blob = await (await fetch(theme.background.image)).blob();
        theme.background.image = await normalizedImage(blob);
      }
      choose(theme);
      setNotice(
        "Tema importado para prévia. Salve para adicionar à biblioteca.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const image = await normalizedImage(file);
      patch({ background: { ...t.background, kind: "image", image } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <>
      {" "}
      <header className="studio-heading">
        <div className="studio-logo">
          <Palette />
        </div>
        <div>
          {embedded ? (
            <h3>cbsHUB Studio</h3>
          ) : (
            <DialogTitle>cbsHUB Studio</DialogTitle>
          )}
          <p className="text-xs text-muted-foreground">
            Seu espaço, do seu jeito. Experimente antes de salvar.
          </p>
        </div>
      </header>
      <div className="studio-toolbar">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => importer.current?.click()}
          disabled={busy}
        >
          <Upload className="size-4 mr-2" />
          Importar JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => run(() => download({ ...t, name: nameDraft }))}
        >
          <Download className="size-4 mr-2" />
          Exportar tema
        </Button>
        <Button variant="ghost" size="sm" onClick={() => choose(DEFAULT_THEME)}>
          <RotateCcw className="size-4 mr-2" />
          Restaurar padrões
        </Button>
        <input
          ref={importer}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="Importar arquivo de tema"
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="studio-body">
        <div className="studio-editor">
          <Tabs defaultValue="themes">
            <TabsList aria-label="Seções do tema" className="studio-tabs">
              <TabsTrigger value="themes">Temas</TabsTrigger>
              <TabsTrigger value="colors">Cores</TabsTrigger>
              <TabsTrigger value="background">Fundo</TabsTrigger>
              <TabsTrigger value="layout">Layout</TabsTrigger>
            </TabsList>
            <TabsContent value="themes" className="studio-tab-content">
              <h3>Comece com um estilo</h3>
              <div className="studio-presets">
                {PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() => choose(p)}
                    aria-label={`Prévia ${p.name}`}
                    className="studio-preset"
                  >
                    <span
                      style={{
                        background: p.colors.background,
                        color: p.colors.text,
                        borderColor: p.colors.border,
                      }}
                    >
                      <i style={{ background: p.colors.sidebar }} />
                      <b style={{ background: p.colors.button }} />
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mt-6 mb-3">
                <h3>Meus temas ({studio.library.length}/20)</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => studio.duplicate(t)}
                >
                  <Copy className="size-3.5 mr-2" />
                  Duplicar atual
                </Button>
              </div>
              {studio.library.length === 0 && (
                <p className="studio-help">
                  Salve sua primeira criação. Seus temas ficam neste
                  dispositivo; você pode levar um tema a outro dispositivo
                  exportando o JSON.
                </p>
              )}
              {studio.library.map((entry) => (
                <div className="studio-library-item" key={entry.id}>
                  <Button
                    variant={
                      entry.id === studio.editingId ? "secondary" : "ghost"
                    }
                    onClick={() => choose(entry.theme, entry.id)}
                    className="justify-start truncate"
                  >
                    {entry.theme.name}
                  </Button>
                  <Input
                    aria-label={`Renomear ${entry.theme.name}`}
                    defaultValue={entry.theme.name}
                    maxLength={60}
                    onBlur={(e) => {
                      if (e.target.value !== entry.theme.name)
                        studio.rename(entry.id, e.target.value);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Duplicar ${entry.theme.name}`}
                    onClick={() => studio.duplicate(entry.theme)}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Exportar ${entry.theme.name}`}
                    onClick={() => run(() => download(entry.theme))}
                  >
                    <Download className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir ${entry.theme.name}`}
                    onClick={() => studio.remove(entry.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </TabsContent>
            <TabsContent value="colors" className="studio-tab-content">
              <h3>Uma paleta com a sua identidade</h3>
              <div className="studio-colors">
                {(Object.keys(COLOR_LABELS) as ColorKey[]).map((key) => (
                  <ColorField
                    key={key}
                    label={COLOR_LABELS[key]}
                    value={t.colors[key]}
                    onChange={(value) =>
                      patch({ colors: { ...t.colors, [key]: value } })
                    }
                  />
                ))}
              </div>
              <label className="studio-switch">
                Controles nativos claros
                <Switch
                  checked={t.mode === "light"}
                  onCheckedChange={(checked) =>
                    patch({ mode: checked ? "light" : "dark" })
                  }
                />
              </label>
            </TabsContent>
            <TabsContent value="background" className="studio-tab-content">
              <h3>O cenário da sua conversa</h3>
              <div className="flex gap-2 flex-wrap mb-5">
                {(["solid", "gradient", "image"] as const).map((kind, i) => (
                  <Button
                    key={kind}
                    variant={
                      t.background.kind === kind ? "default" : "secondary"
                    }
                    onClick={() => {
                      if (kind === "image" && !t.background.image) {
                        setNotice(
                          "Escolha uma imagem abaixo para ativar este fundo.",
                        );
                        return;
                      }
                      patch({ background: { ...t.background, kind } });
                    }}
                  >
                    {["Cor sólida", "Gradiente", "Imagem"][i]}
                  </Button>
                ))}
              </div>
              <p className="studio-help">
                A cor sólida usa o fundo principal da aba Cores. Gradientes e
                imagens ficam atrás do feed, sem reduzir a opacidade do texto.
              </p>
              <div className="studio-colors">
                <ColorField
                  label="Gradiente inicial"
                  value={t.background.from}
                  onChange={(from) =>
                    patch({ background: { ...t.background, from } })
                  }
                />
                <ColorField
                  label="Gradiente final"
                  value={t.background.to}
                  onChange={(to) =>
                    patch({ background: { ...t.background, to } })
                  }
                />
              </div>
              {(
                [
                  ["angle", "Ângulo", 0, 360, 5],
                  ["opacity", "Opacidade do fundo", 0, 1, 0.05],
                  ["blur", "Desfoque", 0, 30, 1],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label className="studio-range" key={key}>
                  <span>
                    {label}
                    <output>{t.background[key]}</output>
                  </span>
                  <Slider
                    aria-label={label}
                    min={min}
                    max={max}
                    step={step}
                    value={[t.background[key]]}
                    onValueChange={([v]) =>
                      patch({ background: { ...t.background, [key]: v } })
                    }
                  />
                </label>
              ))}
              <label className="studio-upload">
                Imagem personalizada (PNG, JPEG ou WebP, até 1 MB)
                <Input
                  aria-label="Imagem de fundo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {t.background.image && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    patch({
                      background: {
                        ...t.background,
                        image: "",
                        kind: "solid",
                      },
                    })
                  }
                >
                  Remover imagem
                </Button>
              )}
            </TabsContent>
            <TabsContent value="layout" className="studio-tab-content">
              <h3>Encontre seu ritmo</h3>
              {Object.entries(ranges).map(
                ([key, [label, min, max, step, unit]]) => (
                  <label className="studio-range" key={key}>
                    <span>
                      {label}
                      <output>
                        {Number(t.layout[key as keyof Theme["layout"]]).toFixed(
                          step < 1 ? 2 : 0,
                        )}
                        {unit}
                      </output>
                    </span>
                    <Slider
                      aria-label={label}
                      min={min}
                      max={max}
                      step={step}
                      value={[t.layout[key as keyof Theme["layout"]] as number]}
                      onValueChange={([value]) =>
                        patch({ layout: { ...t.layout, [key]: value } })
                      }
                    />
                  </label>
                ),
              )}
              {(
                [
                  ["sidebarCollapsed", "Recolher navegação"],
                  ["membersOpen", "Mostrar painel de membros"],
                  ["animations", "Animações discretas"],
                  ["reducedMotion", "Reduzir movimento"],
                ] as const
              ).map(([key, label]) => (
                <label className="studio-switch" key={key}>
                  {label}
                  <Switch
                    checked={t.layout[key]}
                    onCheckedChange={(checked) =>
                      patch({ layout: { ...t.layout, [key]: checked } })
                    }
                    aria-label={label}
                  />
                </label>
              ))}
              <p className="studio-help">
                A preferência de movimento reduzido do sistema é sempre
                respeitada. Em telas pequenas os painéis continuam disponíveis
                como gavetas.
              </p>
            </TabsContent>
          </Tabs>
        </div>
        <aside className="studio-preview-column">
          <div className="flex items-center gap-2 mb-3">
            <span className="status-dot" />
            <h3>Prévia em tempo real</h3>
          </div>
          <ThemePreview theme={t} />
          <label className="studio-name">
            Nome do tema
            <Input
              aria-label="Nome do tema"
              value={nameDraft}
              maxLength={60}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          </label>
          <section className="studio-contrast">
            <h3 className="flex items-center gap-2">
              {failing.length ? (
                <AlertTriangle className="size-4 text-warning" />
              ) : (
                <Check className="size-4 text-success" />
              )}
              Contraste do texto
            </h3>
            {checks.map((c) => (
              <div key={c.label}>
                <span>{c.label}</span>
                <strong>
                  {c.ratio.toFixed(2)}:1 {c.ratio >= 4.5 ? "AA" : "Revisar"}
                </strong>
              </div>
            ))}
            <p>
              Referência AA: 4,5:1 para texto normal. Fundos com imagem,
              transparência e gradientes exigem revisão visual adicional.
            </p>
          </section>
          <p className="studio-help">
            Preferências locais. Este aplicativo ainda não oferece backend de
            sincronização de temas.
          </p>
        </aside>
      </div>
      <footer className="studio-footer">
        <div
          role={error || studio.error ? "alert" : "status"}
          className="studio-status"
        >
          {error ||
            studio.error ||
            notice ||
            "Alterações em prévia. Fechar ou cancelar restaura o tema salvo."}
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            studio.cancel();
            setNameDraft(t.name);
            setError("");
            setNotice("Prévia cancelada.");
          }}
        >
          Cancelar
        </Button>
        <Button
          disabled={busy}
          onClick={() => run(() => studio.save(nameDraft))}
        >
          <Save className="size-4 mr-2" />
          Salvar tema
        </Button>
      </footer>
    </>
  );
  return embedded ? (
    <section className="studio-embedded" aria-label="Editor de temas">
      {content}
    </section>
  ) : (
    <Dialog
      open={studio.open}
      onOpenChange={(open) => {
        if (!open) studio.cancel();
      }}
    >
      <DialogContent className="studio-window">{content}</DialogContent>
    </Dialog>
  );
}
function ThemePreview({ theme: t }: { theme: Theme }) {
  const style: CSSProperties = {
    background: t.colors.background,
    color: t.colors.text,
    fontSize: t.layout.fontSize,
    borderColor: t.colors.border,
    borderRadius: t.layout.radius,
  };
  return (
    <div className="studio-preview" style={style} aria-label="Amostra do tema">
      <div
        className="studio-preview-bar"
        style={{ background: t.colors.sidebar, borderColor: t.colors.border }}
      >
        cbsHUB <span style={{ color: t.colors.accent }}>• Studio</span>
      </div>
      <div
        className="studio-preview-feed"
        style={{
          background: t.colors.messages,
          gap: 12 * t.layout.density,
          padding: 16 * t.layout.spacing,
        }}
      >
        <div
          className="studio-preview-background"
          style={{
            backgroundImage:
              t.background.kind === "gradient"
                ? `linear-gradient(${t.background.angle}deg,${t.background.from},${t.background.to})`
                : t.background.kind === "image"
                  ? `url("${t.background.image}")`
                  : "none",
            opacity: t.background.opacity,
            filter: `blur(${t.background.blur}px)`,
          }}
        />
        <div className="studio-preview-message">
          <span
            style={{
              background: t.colors.accent,
              width: t.layout.avatarSize,
              height: t.layout.avatarSize,
              borderRadius: "50%",
            }}
          />
          <div>
            <strong>Você</strong>
            <p>Uma conversa com a sua identidade.</p>
          </div>
        </div>
        <div style={{ color: t.colors.muted }}>
          Texto secundário e informações da sala.
        </div>
        <div
          style={{
            background: t.colors.editor,
            border: `1px solid ${t.colors.border}`,
            padding: 10,
            borderRadius: t.layout.radius,
          }}
        >
          Escreva uma mensagem…{" "}
          <button
            type="button"
            tabIndex={-1}
            style={{
              background: t.colors.button,
              color: t.colors.buttonText,
              borderRadius: t.layout.radius,
              padding: "4px 8px",
            }}
            aria-hidden="true"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
