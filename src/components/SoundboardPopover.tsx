import React, { useState, useMemo } from 'react';
import {
  Volume2,
  Sparkles,
  Plus,
  Square,
  Search,
  Star,
  Trash2,
  Music,
  X,
  VolumeX,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { useHubStore } from '../store/useHubStore';
import { webrtcEngine } from '../lib/webrtcEngine';
import { soundboardEngine } from '../lib/soundboardEngine';
import { storageDb } from '../lib/storageDb';
import { AddSoundDialog } from './AddSoundDialog';
import type { SoundboardClip } from '../types/cbshub';

interface SoundboardPopoverProps {
  trigger?: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export const SoundboardPopover: React.FC<SoundboardPopoverProps> = ({
  trigger,
  side = 'top',
  align = 'center',
}) => {
  const {
    soundboardClips,
    soundboardVolume,
    setSoundboardVolume,
  } = useHubStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'custom'>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);

  // Filtro de clips baseado na aba e na busca
  const filteredClips = useMemo(() => {
    let list = soundboardClips;

    if (activeTab === 'favorites') {
      list = list.filter((c) => c.isFavorite);
    } else if (activeTab === 'custom') {
      list = list.filter((c) => !c.isBuiltIn);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.emoji.includes(q)
      );
    }

    return list;
  }, [soundboardClips, activeTab, searchQuery]);

  const favoritesCount = useMemo(() => {
    return soundboardClips.filter((c) => c.isFavorite).length;
  }, [soundboardClips]);

  const customCount = useMemo(() => {
    return soundboardClips.filter((c) => !c.isBuiltIn).length;
  }, [soundboardClips]);

  const handlePlayClip = (clip: SoundboardClip) => {
    setPlayingClipId(clip.id);
    const duration = clip.durationSec ? clip.durationSec * 1000 : 2500;
    setTimeout(() => {
      setPlayingClipId((current) => (current === clip.id ? null : current));
    }, Math.min(duration, 5000));
    webrtcEngine.triggerSoundboardClip(clip);
  };

  const handleToggleFavorite = async (e: React.MouseEvent, clipId: string) => {
    e.stopPropagation();
    await storageDb.toggleFavoriteClip(clipId);
    await webrtcEngine.loadSoundboardClips();
  };

  const handleDeleteCustomClip = async (e: React.MouseEvent, clip: SoundboardClip) => {
    e.stopPropagation();
    if (window.confirm(`Tem certeza que deseja excluir o som "${clip.name}"?`)) {
      await storageDb.deleteSoundboardClip(clip.id);
      await webrtcEngine.loadSoundboardClips();
    }
  };

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          {trigger || (
            <Button
              variant="secondary"
              className="h-10 px-3 rounded-xl border border-border/60 hover:bg-accent text-foreground shadow-sm"
            >
              <Volume2 className="w-4 h-4 text-primary" />
            </Button>
          )}
        </PopoverTrigger>

        <PopoverContent
          side={side}
          align={align}
          className="w-80 md:w-96 p-3 space-y-3 bg-zinc-900/95 backdrop-blur-md border border-white/10 shadow-2xl z-50"
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between pb-1 border-b border-border/50">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground">Soundboard</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddDialogOpen(true)}
                className="h-7 px-2 text-[11px] font-medium border-primary/40 hover:bg-primary/10 text-primary hover:text-primary flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => soundboardEngine.stopAll()}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Parar todos os sons imediatamente</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar som por nome ou emoji..."
              className="h-8 pl-8 pr-7 text-xs bg-secondary/80 border-border/60 focus-visible:ring-primary/40"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Abas de Categorias */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'all' | 'favorites' | 'custom')}
            className="w-full"
          >
            <TabsList className="w-full grid grid-cols-3 h-7 p-0.5 bg-secondary/80">
              <TabsTrigger value="all" className="text-[11px] h-6">
                Todos ({soundboardClips.length})
              </TabsTrigger>
              <TabsTrigger value="favorites" className="text-[11px] h-6 flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span>Favoritos ({favoritesCount})</span>
              </TabsTrigger>
              <TabsTrigger value="custom" className="text-[11px] h-6">
                Meus Sons ({customCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Grade de Clipes de Áudio */}
          <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
            {filteredClips.length > 0 ? (
              filteredClips.map((clip) => {
                const isPlaying = playingClipId === clip.id;
                return (
                  <div
                    key={clip.id}
                    onClick={() => handlePlayClip(clip)}
                    className={`group relative p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2 select-none active:scale-[0.98] ${
                      isPlaying
                        ? 'bg-primary/20 border-primary ring-1 ring-primary/40 shadow-sm shadow-primary/20 animate-pulse'
                        : 'bg-secondary/70 hover:bg-accent border-border/50'
                    }`}
                  >
                    <span className="text-xl shrink-0 group-hover:scale-110 transition-transform">
                      {clip.emoji}
                    </span>

                    <div className="min-w-0 flex-1 pr-5">
                      <span className="text-xs font-semibold text-foreground truncate block leading-tight">
                        {clip.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground block truncate">
                        {clip.isBuiltIn ? 'Nativo' : 'Custom'}
                      </span>
                    </div>

                    {/* Ações Rápidas no Hover */}
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Favoritar */}
                      <button
                        onClick={(e) => handleToggleFavorite(e, clip.id)}
                        title={clip.isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        className={`p-1 rounded hover:bg-secondary transition-colors ${
                          clip.isFavorite ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${clip.isFavorite ? 'fill-amber-400' : ''}`} />
                      </button>

                      {/* Excluir (somente customizados) */}
                      {!clip.isBuiltIn && (
                        <button
                          onClick={(e) => handleDeleteCustomClip(e, clip)}
                          title="Excluir efeito"
                          className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Indicador de Favorito sempre visível se marcado */}
                    {clip.isFavorite && (
                      <div className="absolute right-1.5 top-1.5 group-hover:hidden">
                        <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 py-8 flex flex-col items-center justify-center text-center text-muted-foreground">
                <Music className="w-7 h-7 mb-2 opacity-40" />
                <p className="text-xs font-medium">Nenhum som encontrado</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  {activeTab === 'favorites'
                    ? 'Marque uma estrela nos seus sons favoritos para vê-los aqui.'
                    : activeTab === 'custom'
                    ? 'Adicione seus próprios arquivos .mp3 ou .wav de até 5MB.'
                    : 'Tente buscar por outro termo.'}
                </p>
                {activeTab === 'custom' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(true)}
                    className="mt-3 h-7 text-xs border-primary/40 text-primary"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Importar Som
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Rodapé: Volume Master do Soundboard */}
          <div className="pt-2 border-t border-border/50 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                {soundboardVolume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-destructive" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-primary" />
                )}
                <span>Volume dos Efeitos</span>
              </span>
              <span className="font-mono font-bold text-foreground">
                {Math.round(soundboardVolume * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={1.5}
              step={0.05}
              value={[soundboardVolume]}
              onValueChange={([val]) => setSoundboardVolume(val)}
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Modal de Importação Renderizado Fora do Popover para Evitar Fechamento Indesejado */}
      <AddSoundDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
      />
    </>
  );
};
