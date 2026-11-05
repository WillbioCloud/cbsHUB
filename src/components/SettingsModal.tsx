import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Mic,
  Headphones,
  Camera,
  Activity,
  Shield,
  Filter,
  Check,
  ChevronDown,
  User,
  Sparkles,
  Volume2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useHubStore } from '../store/useHubStore';
import { webrtcEngine } from '../lib/webrtcEngine';

const AVATAR_PALETTE = [
  { label: 'Índigo Blurple', color: 'hsl(235, 86%, 65%)' },
  { label: 'Esmeralda', color: 'hsl(145, 65%, 42%)' },
  { label: 'Coral', color: 'hsl(358, 85%, 60%)' },
  { label: 'Âmbar Dourado', color: 'hsl(38, 92%, 50%)' },
  { label: 'Roxo Estelar', color: 'hsl(280, 75%, 60%)' },
  { label: 'Ciano Neônio', color: 'hsl(190, 85%, 45%)' },
  { label: 'Rosa Pink', color: 'hsl(330, 80%, 60%)' },
  { label: 'Aço Escuro', color: 'hsl(215, 25%, 45%)' },
];

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    audioConfig,
    nickname,
    setNickname,
    avatarColor,
    setAvatarColor,
    clientId,
    localPeerId,
    micLevel,
    isLocalSpeaking,
    updateParticipant,
  } = useHubStore();

  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [localNickname, setLocalNickname] = useState(nickname);

  const loadDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
      const devices = await navigator.mediaDevices.enumerateDevices();

      setMicrophones(devices.filter((d) => d.kind === 'audioinput'));
      setSpeakers(devices.filter((d) => d.kind === 'audiooutput'));
      setCameras(devices.filter((d) => d.kind === 'videoinput'));
    } catch (err) {
      console.warn('[SettingsModal] Erro ao listar dispositivos:', err);
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      loadDevices();
      setLocalNickname(nickname);
    }
  }, [isSettingsOpen, nickname]);

  const handleDeviceChange = (key: 'inputDeviceId' | 'outputDeviceId' | 'videoDeviceId', value: string) => {
    webrtcEngine.updateAudioSettings({ [key]: value });
    if (key === 'inputDeviceId') {
      webrtcEngine.setupLocalMicrophone();
    }
  };

  const handleToggle = (key: 'neuralNoiseGate' | 'highPassFilter80Hz' | 'echoCancellation' | 'autoGainControl') => {
    const nextVal = !audioConfig[key];
    webrtcEngine.updateAudioSettings({ [key]: nextVal });
    if (key === 'echoCancellation' || key === 'autoGainControl') {
      webrtcEngine.setupLocalMicrophone();
    }
  };

  const handleGainChange = (gain: number) => {
    webrtcEngine.updateAudioSettings({ micGain: gain });
  };

  const handleVolumeChange = (vol: number) => {
    webrtcEngine.updateAudioSettings({ remoteStreamVolume: vol });
  };

  const handleSaveNickname = () => {
    const trimmed = localNickname.trim();
    if (trimmed && trimmed !== nickname) {
      setNickname(trimmed);
      if (localPeerId) {
        updateParticipant(localPeerId, { nickname: trimmed });
      }
      webrtcEngine.sendData({ type: 'nickname', name: trimmed });
    }
  };

  const handleSelectAvatarColor = (color: string) => {
    setAvatarColor(color);
    if (localPeerId) {
      updateParticipant(localPeerId, { avatarColor: color });
    }
    // Propaga via signaling packet
    webrtcEngine.sendData({
      type: 'peer_state_sync',
      state: {
        peerId: localPeerId,
        clientId,
        nickname: localNickname,
        avatarColor: color,
        inVoiceCall: useHubStore.getState().inVoiceCall,
      },
    });
  };

  const currentMicLabel =
    audioConfig.inputDeviceId === 'default'
      ? 'Dispositivo Padrão do Sistema'
      : microphones.find((m) => m.deviceId === audioConfig.inputDeviceId)?.label ||
        `Microfone (${audioConfig.inputDeviceId.slice(0, 6)})`;

  const currentSpeakerLabel =
    audioConfig.outputDeviceId === 'default'
      ? 'Dispositivo Padrão do Sistema'
      : speakers.find((s) => s.deviceId === audioConfig.outputDeviceId)?.label ||
        `Alto-falante (${audioConfig.outputDeviceId.slice(0, 6)})`;

  const currentCamLabel =
    audioConfig.videoDeviceId === 'default'
      ? 'Dispositivo Padrão do Sistema'
      : cameras.find((c) => c.deviceId === audioConfig.videoDeviceId)?.label ||
        `Webcam (${audioConfig.videoDeviceId.slice(0, 6)})`;

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
      <DialogContent className="max-w-2xl bg-zinc-950 border border-white/10 text-foreground p-0 overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
        {/* Cabeçalho */}
        <DialogHeader className="p-5 border-b border-border/60 bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Configurações do cbsHUB
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Personalize sua identidade, dispositivos e filtros de estúdio em tempo real.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Abas e Conteúdo */}
        <Tabs defaultValue="audio" className="flex-1 flex flex-col min-h-0">
          <div className="px-5 pt-3 border-b border-border/50 bg-zinc-900/20 shrink-0">
            <TabsList className="bg-secondary/70 h-8 p-0.5">
              <TabsTrigger value="profile" className="text-xs h-7 px-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                <span>Perfil & Identidade</span>
              </TabsTrigger>
              <TabsTrigger value="audio" className="text-xs h-7 px-3 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                <span>Áudio, Vídeo & Estúdio</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            {/* ABA 1: PERFIL & IDENTIDADE */}
            <TabsContent value="profile" className="m-0 space-y-6">
              {/* Preview do Avatar e Nickname */}
              <div className="p-4 rounded-xl bg-secondary/40 border border-border/60 flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white uppercase shadow-lg ring-2 ring-white/10 transition-colors"
                  style={{ backgroundColor: avatarColor }}
                >
                  {getInitials(localNickname || nickname)}
                </div>

                <div className="space-y-1 min-w-0 flex-1">
                  <div className="text-sm font-bold text-foreground truncate">
                    {localNickname || nickname}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    ID: {clientId.slice(0, 18)}...
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Perfil ativo na sala</span>
                  </div>
                </div>
              </div>

              {/* Apelido na Sala */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                  Seu Apelido na Sala
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={localNickname}
                    onChange={(e) => setLocalNickname(e.target.value)}
                    onBlur={handleSaveNickname}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveNickname()}
                    placeholder="Digite seu apelido..."
                    className="flex-1 bg-secondary/80 border-border/60 text-xs text-foreground focus-visible:ring-primary/40"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveNickname}
                    className="h-9 px-4 text-xs font-semibold"
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Salvar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Seus irmãos na sala verão este apelido na lista de participantes, no chat e nas chamadas.
                </p>
              </div>

              {/* Seletor de Cores de Avatar */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                  Cor do Círculo de Avatar
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
                  {AVATAR_PALETTE.map((item) => {
                    const isSelected = avatarColor === item.color;
                    return (
                      <button
                        key={item.color}
                        onClick={() => handleSelectAvatarColor(item.color)}
                        title={item.label}
                        className={`w-full aspect-square rounded-xl transition-all flex items-center justify-center shadow-md relative ${
                          isSelected
                            ? 'ring-2 ring-white scale-105'
                            : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: item.color }}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white drop-shadow" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Escolha a cor distintiva que acompanhará suas mensagens de texto e seu avatar na chamada.
                </p>
              </div>
            </TabsContent>

            {/* ABA 2: ÁUDIO, VÍDEO & ESTÚDIO */}
            <TabsContent value="audio" className="m-0 space-y-6">
              {/* Seletores de Dispositivos (Sem <select> HTML nativo!) */}
              <div className="space-y-3.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                  Dispositivos de Entrada e Saída
                </span>

                <div className="grid grid-cols-1 gap-3">
                  {/* Microfone */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-primary" />
                      <span>Microfone (Entrada)</span>
                    </label>

                    <Popover onOpenChange={(open) => open && loadDevices()}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="secondary"
                          className="w-full justify-between h-9 px-3 text-xs bg-secondary/80 border border-border/60 hover:bg-accent font-normal"
                        >
                          <span className="truncate">{currentMicLabel}</span>
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[320px] sm:w-[420px] p-2 space-y-1 max-h-52 overflow-y-auto">
                        <button
                          onClick={() => handleDeviceChange('inputDeviceId', 'default')}
                          className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                            audioConfig.inputDeviceId === 'default'
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'hover:bg-accent text-foreground'
                          }`}
                        >
                          <span>Dispositivo Padrão do Sistema</span>
                          {audioConfig.inputDeviceId === 'default' && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                        {microphones.map((mic) => {
                          const isSelected = audioConfig.inputDeviceId === mic.deviceId;
                          return (
                            <button
                              key={mic.deviceId}
                              onClick={() => handleDeviceChange('inputDeviceId', mic.deviceId)}
                              className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                                isSelected
                                  ? 'bg-primary text-primary-foreground font-medium'
                                  : 'hover:bg-accent text-foreground'
                              }`}
                            >
                              <span className="truncate pr-2">{mic.label || `Microfone (${mic.deviceId.slice(0, 6)})`}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Fones / Alto-falantes */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Alto-falante / Fone de Ouvido (Saída)</span>
                    </label>

                    <Popover onOpenChange={(open) => open && loadDevices()}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="secondary"
                          className="w-full justify-between h-9 px-3 text-xs bg-secondary/80 border border-border/60 hover:bg-accent font-normal"
                        >
                          <span className="truncate">{currentSpeakerLabel}</span>
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[320px] sm:w-[420px] p-2 space-y-1 max-h-52 overflow-y-auto">
                        <button
                          onClick={() => handleDeviceChange('outputDeviceId', 'default')}
                          className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                            audioConfig.outputDeviceId === 'default'
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'hover:bg-accent text-foreground'
                          }`}
                        >
                          <span>Dispositivo Padrão do Sistema</span>
                          {audioConfig.outputDeviceId === 'default' && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                        {speakers.map((spk) => {
                          const isSelected = audioConfig.outputDeviceId === spk.deviceId;
                          return (
                            <button
                              key={spk.deviceId}
                              onClick={() => handleDeviceChange('outputDeviceId', spk.deviceId)}
                              className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                                isSelected
                                  ? 'bg-primary text-primary-foreground font-medium'
                                  : 'hover:bg-accent text-foreground'
                              }`}
                            >
                              <span className="truncate pr-2">{spk.label || `Saída (${spk.deviceId.slice(0, 6)})`}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Câmera */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-primary" />
                      <span>Webcam (Vídeo)</span>
                    </label>

                    <Popover onOpenChange={(open) => open && loadDevices()}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="secondary"
                          className="w-full justify-between h-9 px-3 text-xs bg-secondary/80 border border-border/60 hover:bg-accent font-normal"
                        >
                          <span className="truncate">{currentCamLabel}</span>
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[320px] sm:w-[420px] p-2 space-y-1 max-h-52 overflow-y-auto">
                        <button
                          onClick={() => handleDeviceChange('videoDeviceId', 'default')}
                          className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                            audioConfig.videoDeviceId === 'default'
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'hover:bg-accent text-foreground'
                          }`}
                        >
                          <span>Dispositivo Padrão do Sistema</span>
                          {audioConfig.videoDeviceId === 'default' && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                        {cameras.map((cam) => {
                          const isSelected = audioConfig.videoDeviceId === cam.deviceId;
                          return (
                            <button
                              key={cam.deviceId}
                              onClick={() => handleDeviceChange('videoDeviceId', cam.deviceId)}
                              className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                                isSelected
                                  ? 'bg-primary text-primary-foreground font-medium'
                                  : 'hover:bg-accent text-foreground'
                              }`}
                            >
                              <span className="truncate pr-2">{cam.label || `Câmera (${cam.deviceId.slice(0, 6)})`}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* VU Meter e Controles de Volume */}
              <div className="p-4 rounded-xl bg-secondary/40 border border-border/60 space-y-4">
                {/* VU Meter ao Vivo */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Activity className={`w-4 h-4 ${isLocalSpeaking ? 'text-emerald-400 animate-pulse' : 'text-muted-foreground'}`} />
                      <span>Nível do Microfone (VU Meter)</span>
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {isLocalSpeaking ? 'Falando' : 'Silêncio'}
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden p-0.5 border border-border/40">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        micLevel > 70 ? 'bg-destructive' : micLevel > 20 ? 'bg-emerald-500' : 'bg-primary'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, micLevel))}%` }}
                    />
                  </div>
                </div>

                {/* Slider Ganho do Mic */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Volume / Ganho do Microfone</span>
                    <span className="font-mono font-bold text-foreground">
                      {Math.round(audioConfig.micGain * 100)}%
                    </span>
                  </div>
                  <Slider
                    min={0.0}
                    max={2.0}
                    step={0.05}
                    value={[audioConfig.micGain]}
                    onValueChange={([val]) => handleGainChange(val)}
                  />
                </div>

                {/* Slider Volume Chamada Remota */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-primary" />
                      <span>Volume Geral da Chamada</span>
                    </span>
                    <span className="font-mono font-bold text-foreground">
                      {Math.round(audioConfig.remoteStreamVolume * 100)}%
                    </span>
                  </div>
                  <Slider
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={[audioConfig.remoteStreamVolume]}
                    onValueChange={([val]) => handleVolumeChange(val)}
                  />
                </div>
              </div>

              {/* Pipeline de Áudio de Estúdio */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                  Pipeline de Áudio de Estúdio
                </span>

                {/* Krisp-like Noise Gate */}
                <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>Supressão Neural de Ruído (Krisp-like Worklet)</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/20 text-primary uppercase">
                        48 kHz
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      Noise Gate com envelope de 2ms de ataque e 120ms de liberação para suprimir digitação de teclado mecânico e ruídos de fundo.
                    </p>
                  </div>
                  <Switch
                    checked={audioConfig.neuralNoiseGate}
                    onCheckedChange={() => handleToggle('neuralNoiseGate')}
                  />
                </div>

                {/* High-Pass 80Hz */}
                <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-amber-400" />
                      <span>Filtro Passa-Alta (High-Pass 80Hz, Q=0.707)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      Corta vibrações mecânicas da mesa, zumbidos da rede elétrica e ruído de coolers de PC sem degradar o timbre da voz.
                    </p>
                  </div>
                  <Switch
                    checked={audioConfig.highPassFilter80Hz}
                    onCheckedChange={() => handleToggle('highPassFilter80Hz')}
                  />
                </div>

                {/* Eco */}
                <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground">Cancelamento Acústico de Eco (AEC)</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      Elimina o retorno de voz proveniente de alto-falantes abertos para evitar realimentação.
                    </p>
                  </div>
                  <Switch
                    checked={audioConfig.echoCancellation}
                    onCheckedChange={() => handleToggle('echoCancellation')}
                  />
                </div>

                {/* AGC */}
                <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground">Controle Automático de Ganho (AGC)</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      Normaliza falas distantes ou sussurros e previne clipagem quando você falar mais alto.
                    </p>
                  </div>
                  <Switch
                    checked={audioConfig.autoGainControl}
                    onCheckedChange={() => handleToggle('autoGainControl')}
                  />
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Rodapé */}
        <DialogFooter className="p-4 border-t border-border/60 bg-zinc-900/40 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Configurações sincronizadas localmente</span>
          </div>
          <Button
            size="sm"
            onClick={() => setIsSettingsOpen(false)}
            className="h-8 px-5 text-xs font-semibold"
          >
            Concluído
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
