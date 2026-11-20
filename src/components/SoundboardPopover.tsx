import { AudioTrimEditor } from "./AudioTrimEditor";
import React, { useMemo, useState } from "react";
import {
  Volume2,
  Plus,
  Square,
  Search,
  Star,
  Play,
  Settings2,
  ArrowUp,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
import { soundboardEngine } from "../lib/soundboardEngine";
import { storageDb } from "../lib/storageDb";
import { AddSoundDialog } from "./AddSoundDialog";
import {
  setSoundMode,
  useSoundPreferences,
  type SoundMode,
} from "../chat/soundPreferences";
import type { SoundboardClip } from "../types/cbshub";

interface Props {
  trigger?: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}
export const SoundboardPopover: React.FC<Props> = ({
  trigger,
  side = "top",
  align = "center",
}) => {
  const clips = useHubStore((s) => s.soundboardClips),
    volume = useHubStore((s) => s.soundboardVolume),
    inVoice = useHubStore((s) => s.inVoiceCall),
    deafened = useHubStore((s) => s.isDeafened);
  const mode = useSoundPreferences((s) => s.mode);
  const [trimPending, setTrimPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [search, setSearch] = useState(""),
    [tab, setTab] = useState("all"),
    [category, setCategory] = useState("all");
  const [adding, setAdding] = useState(false),
    [editing, setEditing] = useState<SoundboardClip | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const categories = useMemo(
    () =>
      [
        ...new Set(
          clips.map(
            (c) => c.category || (c.isBuiltIn ? "Clássicos" : "Meus sons"),
          ),
        ),
      ].sort(),
    [clips],
  );
  const filtered = clips.filter(
    (c) =>
      (tab !== "favorites" || c.isFavorite) &&
      (tab !== "custom" || !c.isBuiltIn) &&
      (category === "all" ||
        (c.category || (c.isBuiltIn ? "Clássicos" : "Meus sons")) ===
          category) &&
      `${c.name} ${c.emoji}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };
  const save = async (clip: SoundboardClip) => {
    await storageDb.saveSoundboardClip(clip);
    soundboardEngine.invalidateClip(clip.id);
    await webrtcEngine.loadSoundboardClips();
  };
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          {trigger || (
            <Button variant="secondary" aria-label="Abrir Efeitos Sonoros">
              <Volume2 className="size-4" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          side={side}
          align={align}
          className="w-[min(26rem,calc(100vw-2rem))] max-h-[80dvh] overflow-y-auto p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Efeitos Sonoros</h3>
              <p className="text-xs text-muted-foreground">
                {inVoice
                  ? "Sons enviados à chamada"
                  : "Reprodução somente neste dispositivo"}
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Parar todos os sons"
                onClick={() => soundboardEngine.stopAll()}
              >
                <Square className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAdding(true)}
              >
                <Plus className="size-4 mr-1" />
                Adicionar
              </Button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {deafened && (
            <p className="text-xs text-warning">
              Áudio local silenciado. Sons ainda são enviados à chamada.
            </p>
          )}
          <label className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              aria-label="Buscar sons"
              placeholder="Buscar por nome ou emoji"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="favorites">Favoritos</TabsTrigger>
              <TabsTrigger value="custom">Meus sons</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-2 flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Categoria: {category === "all" ? "Todas" : category}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={category}
                  onValueChange={setCategory}
                >
                  <DropdownMenuRadioItem value="all">
                    Todas
                  </DropdownMenuRadioItem>
                  {categories.map((c) => (
                    <DropdownMenuRadioItem key={c} value={c}>
                      {c}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Eventos no chat
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={mode}
                  onValueChange={(value) =>
                    void run(async () => setSoundMode(value as SoundMode))
                  }
                >
                  <DropdownMenuRadioItem value="normal">
                    Eventos normais
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact">
                    Eventos compactos
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="hidden">
                    Somente atividades
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
            {filtered.map((clip) => (
              <div
                key={clip.id}
                className="rounded-lg border border-border bg-secondary/40 p-2 space-y-1"
              >
                <Button
                  variant="ghost"
                  disabled={busy}
                  className="w-full h-auto py-3 flex flex-col gap-1"
                  aria-label={`Tocar ${clip.name}`}
                  onClick={() =>
                    void run(() => webrtcEngine.triggerSoundboardClip(clip))
                  }
                >
                  <span className="text-2xl">{clip.emoji}</span>
                  <span className="text-xs truncate max-w-full">
                    {clip.name}
                  </span>
                </Button>
                <div className="flex items-center justify-between">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Prévia de ${clip.name}`}
                    title="Ouvir somente neste dispositivo"
                    disabled={busy || deafened}
                    onClick={() =>
                      void run(() => soundboardEngine.playClip(clip, true))
                    }
                  >
                    <Play className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Favoritar ${clip.name}`}
                    aria-pressed={clip.isFavorite}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        save({ ...clip, isFavorite: !clip.isFavorite }),
                      )
                    }
                  >
                    <Star
                      className={`size-3 ${clip.isFavorite ? "fill-current text-warning" : ""}`}
                    />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Editar ${clip.name}`}
                    onClick={() => {
                      setConfirmDelete(false);
                      setTrimPending(false);
                      setEditing({ ...clip });
                    }}
                  >
                    <Settings2 className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Mover ${clip.name} para o início`}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        save({
                          ...clip,
                          order:
                            Math.min(
                              0,
                              ...clips.map((c) => c.order ?? c.createdAt),
                            ) - 1,
                        }),
                      )
                    }
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
            {!filtered.length && (
              <p className="col-span-2 py-6 text-center text-xs text-muted-foreground">
                Nenhum som encontrado.
              </p>
            )}
          </div>
          <div className="border-t border-border pt-3 space-y-2">
            <label className="text-xs flex justify-between">
              Volume dos efeitos<span>{Math.round(volume * 100)}%</span>
            </label>
            <Slider
              aria-label="Volume dos efeitos"
              min={0}
              max={1.5}
              step={0.05}
              value={[volume]}
              onValueChange={([value]) =>
                useHubStore.getState().setSoundboardVolume(value)
              }
            />
          </div>
          <p className="text-micro text-muted-foreground">
            Sons importados ficam neste dispositivo. Na chamada, compartilham a
            faixa de voz e o volume do participante.
          </p>
        </PopoverContent>
      </Popover>
      <AddSoundDialog open={adding} onOpenChange={setAdding} />
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Personalizar botão de som</DialogTitle>
          <DialogDescription>
            Nome, emoji, categoria e volume são salvos neste dispositivo.
          </DialogDescription>
          {editing && (
            <>
              {error && (
                <p role="alert" className="text-destructive text-xs">
                  {error}
                </p>
              )}
              <label className="space-y-1 text-sm">
                Nome
                <Input
                  aria-label="Nome do som"
                  maxLength={60}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                Emoji
                <Input
                  aria-label="Emoji do som"
                  maxLength={12}
                  value={editing.emoji}
                  onChange={(e) =>
                    setEditing({ ...editing, emoji: e.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm">
                Categoria
                <Input
                  aria-label="Categoria do som"
                  maxLength={32}
                  value={editing.category || ""}
                  placeholder={editing.isBuiltIn ? "Clássicos" : "Meus sons"}
                  onChange={(e) =>
                    setEditing({ ...editing, category: e.target.value })
                  }
                />
              </label>
              <label className="space-y-2 text-sm">
                Volume: {Math.round(editing.volume * 100)}%
                <Slider
                  aria-label="Volume deste som"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={[editing.volume]}
                  onValueChange={([value]) =>
                    setEditing({ ...editing, volume: value })
                  }
                />
              </label>
              {!editing.isBuiltIn && editing.audioBlob && (
                <AudioTrimEditor
                  source={editing.originalAudioBlob || editing.audioBlob}
                  initialStart={editing.trimStartSec}
                  initialEnd={editing.trimEndSec}
                  onPendingChange={() => setTrimPending(true)}
                  onApply={(blob, seconds, start, end) => {
                    setTrimPending(false);
                    setEditing({
                      ...editing,
                      audioBlob: blob,
                      originalAudioBlob:
                        editing.originalAudioBlob || editing.audioBlob,
                      durationSec: seconds,
                      trimStartSec: start,
                      trimEndSec: end,
                    });
                  }}
                />
              )}
              {editing.isBuiltIn && (
                <p className="text-xs text-muted-foreground">
                  Efeito sintetizado: corte disponível para arquivos importados.
                </p>
              )}
              <DialogFooter>
                {!editing.isBuiltIn && (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      confirmDelete
                        ? void run(async () => {
                            await storageDb.deleteSoundboardClip(editing.id);
                            await webrtcEngine.loadSoundboardClips();
                            setEditing(null);
                          })
                        : setConfirmDelete(true)
                    }
                  >
                    {confirmDelete
                      ? "Confirmar exclusão do som e original"
                      : "Excluir som"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button
                  disabled={
                    busy ||
                    trimPending ||
                    !editing.name.trim() ||
                    !editing.emoji.trim()
                  }
                  onClick={() =>
                    void run(async () => {
                      await save({
                        ...editing,
                        name: editing.name.trim(),
                        emoji: editing.emoji.trim(),
                        category: editing.category?.trim(),
                      });
                      setEditing(null);
                    })
                  }
                >
                  Salvar som
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
