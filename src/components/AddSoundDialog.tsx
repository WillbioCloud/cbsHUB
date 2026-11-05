import React, { useState, useRef } from 'react';
import {
  Upload,
  Music,
  Play,
  Square,
  Volume2,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { soundboardEngine } from '../lib/soundboardEngine';
import { storageDb } from '../lib/storageDb';
import { webrtcEngine } from '../lib/webrtcEngine';
import type { SoundboardClip } from '../types/cbshub';

interface AddSoundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const AddSoundDialog: React.FC<AddSoundDialogProps> = ({ open, onOpenChange }) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🔊');
  const [volume, setVolume] = useState(0.85);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setFile(null);
    setName('');
    setEmoji('🔊');
    setVolume(0.85);
    setDurationSec(null);
    setErrorMsg(null);
    setIsPlayingPreview(false);
    setIsSaving(false);
    soundboardEngine.stopAll();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const processFile = async (selectedFile: File) => {
    setErrorMsg(null);

    // Validação de Tamanho (Máx 5MB)
    if (selectedFile.size > MAX_FILE_SIZE) {
      setErrorMsg(`O arquivo tem ${(selectedFile.size / (1024 * 1024)).toFixed(1)}MB. O limite máximo é de 5MB.`);
      return;
    }

    setFile(selectedFile);

    // Auto-preenche o nome a partir do arquivo (removendo extensão)
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, '').trim();
    setName(baseName || 'Meu Som');

    // Decodifica a duração com AudioContext
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 48000 });
      const arrayBuffer = await selectedFile.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      setDurationSec(Number(audioBuffer.duration.toFixed(1)));
      ctx.close().catch(() => {});
    } catch {
      setDurationSec(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      processFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handlePlayPreview = async () => {
    if (!file) return;
    try {
      setIsPlayingPreview(true);
      await soundboardEngine.previewAudioBlob(file, volume);
      setTimeout(() => {
        setIsPlayingPreview(false);
      }, (durationSec ? durationSec * 1000 : 3000) + 200);
    } catch {
      setIsPlayingPreview(false);
    }
  };

  const handleStopPreview = () => {
    soundboardEngine.stopAll();
    setIsPlayingPreview(false);
  };

  const handleSave = async () => {
    if (!file || !name.trim()) return;

    setIsSaving(true);
    try {
      const clipId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'clip-' + Date.now();

      const newClip: SoundboardClip = {
        id: clipId,
        name: name.trim(),
        emoji,
        isBuiltIn: false,
        audioBlob: file,
        volume,
        durationSec: durationSec || undefined,
        isFavorite: false,
        createdAt: Date.now(),
      };

      await storageDb.saveSoundboardClip(newClip);
      await webrtcEngine.loadSoundboardClips();

      handleOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar efeito sonoro.';
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#151518] border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="w-4 h-4 text-primary" />
            <span>Adicionar Efeito ao Soundboard</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Importe um áudio próprio (.mp3, .wav, .ogg) para tocar durante as chamadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* 1. Área de Upload / Arraste */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
              file
                ? 'border-primary/60 bg-primary/5'
                : 'border-border/80 hover:border-primary/50 hover:bg-secondary/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {file ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                  <Music className="w-5 h-5" />
                </div>
                <span className="font-semibold text-foreground text-xs truncate max-w-xs">{file.name}</span>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                  {durationSec !== null && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-0.5 font-mono text-emerald-400">
                        <Clock className="w-3 h-3" />
                        <span>{durationSec}s</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-secondary text-muted-foreground flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-semibold text-foreground">Clique para escolher um arquivo</span>
                  <span className="text-muted-foreground"> ou arraste para cá</span>
                </div>
                <span className="text-[10px] text-muted-foreground">MP3, WAV, OGG, M4A ou WEBM (Máx 5MB)</span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 2. Configurações do Efeito */}
          {file && (
            <div className="space-y-3 pt-1 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                {/* Seletor de Emoji */}
                <EmojiPickerPopover
                  onSelectEmoji={setEmoji}
                  side="top"
                  align="start"
                  trigger={
                    <button
                      type="button"
                      title="Escolher Emoji"
                      className="w-10 h-10 rounded-lg bg-secondary hover:bg-accent border border-border flex items-center justify-center text-xl shrink-0 transition-transform active:scale-95"
                    >
                      {emoji}
                    </button>
                  }
                />

                {/* Nome do Efeito */}
                <div className="flex-1">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do Efeito (Ex: Cavalo, Headshot)"
                    className="h-10 text-xs bg-secondary/80 border-border"
                  />
                </div>
              </div>

              {/* Slider de Volume */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Volume Padrão</span>
                  </span>
                  <span className="font-mono font-bold text-foreground">{Math.round(volume * 100)}%</span>
                </div>
                <Slider
                  min={0.1}
                  max={1.5}
                  step={0.05}
                  value={[volume]}
                  onValueChange={([val]) => setVolume(val)}
                />
              </div>

              {/* Teste de Áudio (Preview) */}
              <div className="flex items-center gap-2 pt-1">
                {!isPlayingPreview ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePlayPreview}
                    className="h-8 text-xs flex items-center gap-1.5 text-foreground"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
                    <span>Ouvir Prévia</span>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleStopPreview}
                    className="h-8 text-xs flex items-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Parar Prévia</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!file || !name.trim() || isSaving}
            onClick={handleSave}
            className="text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSaving ? 'Salvando...' : 'Salvar no Soundboard'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
