import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
export function AvatarCrop({
  file,
  onSave,
  onClose,
  embedded = false,
}: {
  embedded?: boolean;
  file: File | null;
  onSave: (data: string) => void;
  onClose: () => void;
}) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null),
    [url, setUrl] = useState(""),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [error, setError] = useState("");
  useEffect(() => {
    if (!file) return;
    let active = true;
    let image: ImageBitmap | null = null;
    let objectUrl = "";
    setError("");
    setZoom(1);
    setX(50);
    setY(50);
    (async () => {
      if (
        file.size > 20 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        throw Error("Use PNG, JPEG ou WebP de até 20 MB.");
      const data = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (
        !(
          (data[0] === 255 && data[1] === 216) ||
          (data[0] === 137 && data[1] === 80) ||
          (String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...data.slice(8, 12)) === "WEBP")
        )
      )
        throw Error("Conteúdo de imagem inválido.");
      image = await createImageBitmap(file);
      if (!active) {
        image.close();
        return;
      }
      if (
        image.width * image.height > 40000000 ||
        image.width > 10000 ||
        image.height > 10000
      )
        throw Error("Limite de 40 megapixels e 10000 px por lado.");
      objectUrl = URL.createObjectURL(file);
      setBitmap(image);
      setUrl(objectUrl);
    })().catch((e) => {
      image?.close();
      image = null;
      if (active) setError(e.message);
    });
    return () => {
      active = false;
      image?.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBitmap(null);
      setUrl("");
    };
  }, [file]);
  function save() {
    try {
      if (!bitmap) return;
      const side = Math.min(bitmap.width, bitmap.height) / zoom;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      canvas
        .getContext("2d")!
        .drawImage(
          bitmap,
          ((bitmap.width - side) * x) / 100,
          ((bitmap.height - side) * y) / 100,
          side,
          side,
          0,
          0,
          512,
          512,
        );
      let data = "";
      for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
        data = canvas.toDataURL("image/webp", quality);
        if (data.length <= 100000) break;
      }
      if (data.length > 100000)
        throw Error("Imagem muito detalhada; ajuste o recorte.");
      onSave(data);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const side = bitmap ? Math.min(bitmap.width, bitmap.height) / zoom : 1;
  const content = (
    <>
      <h3>Recortar avatar</h3>
      <p>Enquadre a imagem. O avatar será otimizado para 512 × 512 pixels.</p>
      {error && <p role="alert">{error}</p>}
      {bitmap && (
        <>
          <div className="relative overflow-hidden size-64 mx-auto bg-secondary">
            <img
              alt="Prévia do recorte"
              src={url}
              className="absolute max-w-none"
              style={{
                width: (bitmap.width / side) * 256,
                height: (bitmap.height / side) * 256,
                left: ((-(bitmap.width - side) * x) / 100 / side) * 256,
                top: ((-(bitmap.height - side) * y) / 100 / side) * 256,
              }}
            />
          </div>
          {[
            ["Zoom", zoom, setZoom, 1, 4],
            ["Posição horizontal", x, setX, 0, 100],
            ["Posição vertical", y, setY, 0, 100],
          ].map(([label, value, set, min, max]) => (
            <label key={String(label)} className="text-sm space-y-2">
              {String(label)}
              <Slider
                aria-label={String(label)}
                min={Number(min)}
                max={Number(max)}
                step={0.05}
                value={[Number(value)]}
                onValueChange={([v]) => (set as (v: number) => void)(v)}
              />
            </label>
          ))}
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar recorte
        </Button>
        <Button disabled={!bitmap || !!error} onClick={save}>
          Aplicar recorte
        </Button>
      </div>
    </>
  );
  return embedded ? (
    file ? (
      <section
        className="space-y-3 border-t border-border pt-4"
        aria-label="Recortar avatar"
      >
        {content}
      </section>
    ) : null
  ) : (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Recortar avatar</DialogTitle>
        <DialogDescription>Enquadre sua imagem.</DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
}
