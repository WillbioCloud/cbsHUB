import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import { EmojiPickerPopover } from "./EmojiPickerPopover";
import { AudioTrimEditor } from "./AudioTrimEditor";
import { storageDb } from "../lib/storageDb";
import { webrtcEngine } from "../lib/webrtcEngine";
export function AddSoundDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [file, setFile] = useState<File | null>(null),
    [edited, setEdited] = useState<Blob | null>(null),
    [duration, setDuration] = useState(0),
    [name, setName] = useState(""),
    [emoji, setEmoji] = useState("🔊"),
    [volume, setVolume] = useState(0.85),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setFile(null);
      setEdited(null);
      setError("");
      setName("");
      setEmoji("🔊");
      setVolume(0.85);
    }
  }, [open]);
  const choose = (next?: File) => {
    if (!next) return;
    if (next.size > 5 * 1024 * 1024) {
      setError("Use áudio de até 5 MB.");
      return;
    }
    setFile(next);
    setEdited(null);
    setName(next.name.replace(/\.[^.]+$/, "").slice(0, 60));
    setError("");
  };
  const save = async () => {
    if (!file || !edited || !name.trim() || busy) return;
    setBusy(true);
    try {
      await storageDb.saveSoundboardClip({
        id: crypto.randomUUID(),
        name: name.trim(),
        emoji,
        volume,
        isBuiltIn: false,
        isFavorite: false,
        createdAt: Date.now(),
        audioBlob: edited,
        originalAudioBlob: file,
        durationSec: duration,
        trimStartSec: range.start,
        trimEndSec: range.end,
      });
      await webrtcEngine.loadSoundboardClips();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[88dvh] overflow-y-auto">
        <DialogTitle>Adicionar Efeito Sonoro</DialogTitle>
        <DialogDescription>
          Importe áudio de até 5 MB e 120 segundos, selecione o trecho e aplique
          o corte antes de salvar.
        </DialogDescription>
        <div
          className="border border-dashed border-border rounded-lg p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files[0]);
          }}
        >
          <label className="text-sm">
            Arquivo de áudio
            <Input
              type="file"
              aria-label="Arquivo de áudio"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </label>
        </div>
        {file && (
          <>
            <AudioTrimEditor
              source={file}
              onPendingChange={() => setEdited(null)}
              onApply={(blob, seconds, start, end) => {
                setRange({ start, end });
                setEdited(blob);
                setDuration(seconds);
              }}
            />
            <label className="text-sm">
              Nome do efeito
              <Input
                aria-label="Nome do efeito"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <EmojiPickerPopover
              onSelectEmoji={setEmoji}
              trigger={
                <Button variant="outline" aria-label="Escolher emoji do efeito">
                  {emoji}
                </Button>
              }
            />
            <label className="text-sm">
              Volume padrão: {Math.round(volume * 100)}%
              <Slider
                aria-label="Volume padrão do efeito"
                min={0}
                max={1.5}
                step={0.05}
                value={[volume]}
                onValueChange={([value]) => setVolume(value)}
              />
            </label>
            {edited && (
              <p role="status" className="text-xs">
                Corte aplicado: {duration.toFixed(2)} s. Original preservado.
              </p>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            disabled={!edited || !name.trim() || busy}
            onClick={() => void save()}
          >
            {busy ? "Salvando…" : "Salvar efeito"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
