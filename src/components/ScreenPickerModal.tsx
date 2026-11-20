import React, { useState, useEffect } from 'react';
import {
  Monitor,
  AppWindow,
  Volume2,
  VolumeX,
  Sparkles,
  Tv,
  CheckCircle2,
  RefreshCw,
  Gauge,
  Radio,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { useHubStore } from '../store/useHubStore';
import { webrtcEngine } from '../lib/webrtcEngine';
import type { DesktopSourceItem, ResolutionPreset, FpsPreset } from '../types/cbshub';

const RESOLUTION_OPTIONS: { id: ResolutionPreset; label: string; sub: string; bitrate: string }[] = [
  { id: '720p', label: '720p HD', sub: '1280x720', bitrate: 'Até 5 Mbps' },
  { id: '1080p', label: '1080p Full HD', sub: '1920x1080', bitrate: 'Até 12 Mbps' },
  { id: '1440p', label: '1440p 2K QHD', sub: '2560x1440', bitrate: 'Até 20 Mbps' },
  { id: '2160p', label: '2160p 4K UHD', sub: '3840x2160', bitrate: 'Até 35 Mbps' },
];

const FPS_OPTIONS: FpsPreset[] = [24, 25, 30, 60];

export const ScreenPickerModal: React.FC = () => {
  const {
    isScreenPickerOpen,
    setIsScreenPickerOpen,
    videoQualityConfig,
    updateVideoQuality,
  } = useHubStore();

  const [activeTab, setActiveTab] = useState<'screen' | 'window'>('screen');
  const [sources, setSources] = useState<DesktopSourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [includeSystemAudio, setIncludeSystemAudio] = useState<boolean>(
    videoQualityConfig.includeSystemAudio
  );
  const [selectedRes, setSelectedRes] = useState<ResolutionPreset>(
    videoQualityConfig.resolution
  );
  const [selectedFps, setSelectedFps] = useState<FpsPreset>(videoQualityConfig.fps);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadSources = async () => {
    setIsLoading(true);
    try {
      if (window.cbsHubAPI) {
        const items = await window.cbsHubAPI.getDesktopSources();
        setSources(items);
        if (items.length > 0 && !selectedSourceId) {
          const screens = items.filter((i) => i.isScreen);
          setSelectedSourceId(screens.length > 0 ? screens[0].id : items[0].id);
        }
      }
    } catch (err) {
      console.error('[ScreenPickerModal] Erro ao buscar janelas e telas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isScreenPickerOpen) {
      loadSources();
      setIncludeSystemAudio(videoQualityConfig.includeSystemAudio);
      setSelectedRes(videoQualityConfig.resolution);
      setSelectedFps(videoQualityConfig.fps);
    }
  }, [isScreenPickerOpen, videoQualityConfig]);

  const filteredSources = sources.filter((s) =>
    activeTab === 'screen' ? s.isScreen : !s.isScreen
  );

  const handleStartShare = async () => {
    updateVideoQuality(selectedRes, selectedFps, includeSystemAudio);
    const updatedConfig = useHubStore.getState().videoQualityConfig;

    setIsScreenPickerOpen(false);
    await webrtcEngine.startScreenShare(selectedSourceId, updatedConfig);
  };

  return (
    <Dialog open={isScreenPickerOpen} onOpenChange={setIsScreenPickerOpen}>
      <DialogContent className="max-w-3xl bg-surface border border-border text-foreground p-0 overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
        {/* Cabeçalho */}
        <DialogHeader className="p-5 border-b border-border/60 bg-card/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <Tv className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Compartilhar tela
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Escolha a fonte e a qualidade desejada. Resolução, FPS e áudio dependem do dispositivo e da rede.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Corpo Principal com Scroll */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 min-h-0 text-xs">
          {/* Abas Telas vs Janelas + Botão Atualizar */}
          <div className="flex items-center justify-between gap-2">
            <Tabs
              value={activeTab}
              onValueChange={(val) => setActiveTab(val as 'screen' | 'window')}
              className="w-auto"
            >
              <TabsList className="bg-secondary/70 h-8 p-0.5">
                <TabsTrigger value="screen" className="text-xs h-7 px-3 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Telas Inteiras</span>
                </TabsTrigger>
                <TabsTrigger value="window" className="text-xs h-7 px-3 flex items-center gap-1.5">
                  <AppWindow className="w-3.5 h-3.5" />
                  <span>Janelas de Aplicativos</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              variant="outline"
              size="sm"
              onClick={loadSources}
              disabled={isLoading}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-primary' : ''}`} />
              <span>Atualizar</span>
            </Button>
          </div>

          {/* Grade de Miniaturas das Fontes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-56 overflow-y-auto p-1 rounded-xl bg-secondary/20 border border-border/50">
            {filteredSources.length > 0 ? (
              filteredSources.map((source) => {
                const isSelected = selectedSourceId === source.id;
                return (
                  <div
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    className={`group relative rounded-lg border p-2 cursor-pointer transition-all flex flex-col items-center select-none ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/40 bg-primary/10 shadow-md'
                        : 'border-border/60 hover:border-border hover:bg-secondary/60 bg-secondary/30'
                    }`}
                  >
                    <div className="w-full aspect-video rounded-md bg-black/80 overflow-hidden relative mb-2 flex items-center justify-center">
                      <img
                        src={source.thumbnailDataUrl}
                        alt={source.name}
                        className="w-full h-full object-contain"
                      />
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5 shadow">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="w-full flex items-center gap-1.5 px-0.5">
                      {source.appIconDataUrl && (
                        <img
                          src={source.appIconDataUrl}
                          alt="app icon"
                          className="w-3.5 h-3.5 object-contain shrink-0"
                        />
                      )}
                      <span className="text-caption text-foreground font-medium truncate flex-1" title={source.name}>
                        {source.name}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full py-10 text-center text-muted-foreground text-xs">
                {window.cbsHubAPI
                  ? 'Nenhuma janela detectada nesta categoria.'
                  : 'Modo navegador ativo. A janela nativa de captura será exibida pelo navegador.'}
              </div>
            )}
          </div>

          {/* Presets de Resolução */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-primary" />
              <span>Resolução da Transmissão</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {RESOLUTION_OPTIONS.map((opt) => {
                const isSelected = selectedRes === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedRes(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary/40 shadow-sm'
                        : 'border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    }`}
                  >
                    <div className="font-bold text-xs text-foreground">{opt.label}</div>
                    <div className="text-caption text-muted-foreground">{opt.sub}</div>
                    <div className="text-2xs text-primary font-semibold mt-0.5">{opt.bitrate}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Taxa de Quadros (FPS) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
              Taxa de Quadros (FPS)
            </label>
            <div className="grid grid-cols-4 gap-2">
              {FPS_OPTIONS.map((fps) => {
                const isSelected = selectedFps === fps;
                return (
                  <button
                    key={fps}
                    onClick={() => setSelectedFps(fps)}
                    className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                        : 'border-border/60 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    }`}
                  >
                    {fps} FPS {fps === 60 ? '⚡ Ultra' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Switch de Áudio do Sistema Estéreo (Loopback) */}
          <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/60 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  includeSystemAudio
                    ? 'bg-success/15 text-success border border-success/30'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {includeSystemAudio ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </div>
              <div>
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span>Compartilhar Áudio do Sistema (Loopback)</span>
                  <span className="px-1.5 py-0.2 rounded text-micro font-bold uppercase tracking-wider bg-success/20 text-success">
                    Estéreo 256kbps
                  </span>
                </div>
                <p className="text-caption text-muted-foreground mt-0.5">
                  Transmite áudio de jogos, Discord e vídeos em estéreo de alta fidelidade para seus irmãos.
                </p>
              </div>
            </div>

            <Switch
              checked={includeSystemAudio}
              onCheckedChange={setIncludeSystemAudio}
            />
          </div>
        </div>

        {/* Rodapé */}
        <DialogFooter className="p-4 border-t border-border/60 bg-card/40 flex items-center justify-between shrink-0">
          <div className="text-caption text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Transmissão P2P direta sem compressão de servidores</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsScreenPickerOpen(false)}
              className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleStartShare}
              disabled={filteredSources.length > 0 && !selectedSourceId}
              className="h-8 px-4 text-xs font-bold flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Iniciar Transmissão</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
