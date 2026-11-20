import { settingsDirty } from "../lib/settingsDrafts";
import { useShallow } from "zustand/react/shallow";
import { MicrophoneLevelMeter } from "./MicrophoneLevelMeter";
import { useSettingsNavigation } from "../lib/settingsNavigation";
import { ProfileDialog } from "../profiles/ProfileDialog";
import { StudioDialog } from "../studio/StudioDialog";
import { MicrophoneTest } from "./MicrophoneTest";
import {
  useVoicePreferences,
  saveVoicePreferences,
  TALK_KEYS,
} from "../lib/voicePreferences";
import { CallDiagnosticsPanel } from "./CallDiagnosticsPanel";
import {
  useChatView,
  setChatCompact,
  useMessageIdentity,
  saveMessageIdentity,
} from "../chat/viewState";
import { useStudio } from "../studio/StudioProvider";
import { PRESETS } from "../studio/theme";
import { supportsAudioOutput } from "../lib/mediaState";
import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";

export const SettingsModal: React.FC = () => {
  const settingsTab = useSettingsNavigation((s) => s.tab);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const closeSettings = (open: boolean) => {
    if (!open && settingsDirty()) {
      setConfirmDiscard(true);
      return;
    }
    setIsSettingsOpen(open);
    setConfirmDiscard(false);
    if (!open) studio.cancel();
  };
  const voicePreferences = useVoicePreferences();
  const [voicePreferenceError, setVoicePreferenceError] = useState("");
  const saveVoice = (patch: Parameters<typeof saveVoicePreferences>[0]) => {
    try {
      saveVoicePreferences(patch);
      setVoicePreferenceError("");
    } catch {
      setVoicePreferenceError(
        "Não foi possível salvar as preferências de voz.",
      );
    }
  };
  const messageIdentity = useMessageIdentity();
  const compact = useChatView((state) => state.compact);
  const [appearanceError, setAppearanceError] = useState("");
  const studio = useStudio();
  const { isSettingsOpen, setIsSettingsOpen, audioConfig } = useHubStore(
    useShallow((s) => ({
      isSettingsOpen: s.isSettingsOpen,
      setIsSettingsOpen: s.setIsSettingsOpen,
      audioConfig: s.audioConfig,
    })),
  );

  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  const loadDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      setMicrophones(devices.filter((d) => d.kind === "audioinput"));
      setSpeakers(devices.filter((d) => d.kind === "audiooutput"));
      setCameras(devices.filter((d) => d.kind === "videoinput"));
    } catch (err) {
      console.warn("[SettingsModal] Erro ao listar dispositivos:", err);
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      loadDevices();
    }
  }, [isSettingsOpen]);

  const handleDeviceChange = (
    key: "inputDeviceId" | "outputDeviceId" | "videoDeviceId",
    value: string,
  ) => {
    if (key === "inputDeviceId") void webrtcEngine.selectMicrophone(value);
    else if (key === "videoDeviceId") void webrtcEngine.selectCamera(value);
    else webrtcEngine.updateAudioSettings({ [key]: value });
  };

  const handleToggle = (
    key:
      | "neuralNoiseGate"
      | "highPassFilter80Hz"
      | "echoCancellation"
      | "autoGainControl",
  ) => {
    const nextVal = !audioConfig[key];
    webrtcEngine.updateAudioSettings({ [key]: nextVal });
    if (key === "echoCancellation" || key === "autoGainControl") {
      if (useHubStore.getState().inVoiceCall)
        void webrtcEngine.setupLocalMicrophone().catch(() => {});
    }
  };

  const handleGainChange = (gain: number) => {
    webrtcEngine.updateAudioSettings({ micGain: gain });
  };

  const handleVolumeChange = (vol: number) => {
    webrtcEngine.updateAudioSettings({ remoteStreamVolume: vol });
  };

  const currentMicLabel =
    audioConfig.inputDeviceId === "default"
      ? "Dispositivo Padrão do Sistema"
      : microphones.find((m) => m.deviceId === audioConfig.inputDeviceId)
          ?.label || `Microfone (${audioConfig.inputDeviceId.slice(0, 6)})`;

  const currentSpeakerLabel =
    audioConfig.outputDeviceId === "default"
      ? "Dispositivo Padrão do Sistema"
      : speakers.find((s) => s.deviceId === audioConfig.outputDeviceId)
          ?.label || `Alto-falante (${audioConfig.outputDeviceId.slice(0, 6)})`;

  const currentCamLabel =
    audioConfig.videoDeviceId === "default"
      ? "Dispositivo Padrão do Sistema"
      : cameras.find((c) => c.deviceId === audioConfig.videoDeviceId)?.label ||
        `Webcam (${audioConfig.videoDeviceId.slice(0, 6)})`;

  return (
    <Dialog open={isSettingsOpen} onOpenChange={closeSettings}>
      <DialogContent className="settings-window max-w-5xl bg-surface border border-border text-foreground p-0 overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
        {/* Cabeçalho */}
        <DialogHeader className="p-5 border-b border-border/60 bg-card/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Configurações do cbsHUB
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Personalize sua identidade, dispositivos e filtros de estúdio em
                tempo real.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Abas e Conteúdo */}
        <Tabs
          value={settingsTab}
          onValueChange={(tab) =>
            useSettingsNavigation.setState({ tab: tab as typeof settingsTab })
          }
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-5 pt-3 border-b border-border/50 bg-card/20 shrink-0">
            <TabsList
              aria-label="Seções das configurações"
              className="bg-secondary/70 h-auto min-h-8 p-0.5 flex-wrap"
            >
              <TabsTrigger
                value="profile"
                className="text-xs h-7 px-3 flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5" />
                <span>Perfil & Identidade</span>
              </TabsTrigger>
              <TabsTrigger
                value="audio"
                className="text-xs h-7 px-3 flex items-center gap-1.5"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Áudio, Vídeo & Estúdio</span>
              </TabsTrigger>
              <TabsTrigger value="appearance">Aparência</TabsTrigger>
              <TabsTrigger value="diagnostics">Diagnóstico</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            <TabsContent value="diagnostics" className="m-0">
              <CallDiagnosticsPanel />
            </TabsContent>
            <TabsContent
              forceMount
              hidden={settingsTab !== "appearance"}
              value="appearance"
              className="m-0 space-y-4"
            >
              {" "}
              <div className="px-5 py-3 flex gap-2 items-center flex-wrap">
                <span className="text-sm">Aparência</span>
                {PRESETS.filter((t) =>
                  [
                    "Clássico",
                    "Moderno Roxo",
                    "Sakura Dream",
                    "Velvet Nocturne",
                  ].includes(t.name),
                ).map((t) => (
                  <Button
                    key={t.name}
                    size="sm"
                    variant={
                      studio.theme.name === t.name ? "default" : "outline"
                    }
                    onClick={() => studio.selectPreset(t)}
                  >
                    {t.name}
                  </Button>
                ))}
              </div>
              <StudioDialog embedded />
              <section
                aria-labelledby="message-identity-heading"
                className="space-y-3 rounded-lg border border-border p-3"
              >
                <h3 id="message-identity-heading" className="font-semibold">
                  Identidade das Mensagens
                </h3>
                <p className="text-sm text-muted-foreground">
                  Preferências de leitura salvas neste dispositivo. O nome do
                  autor permanece visível; cores sem contraste suficiente usam a
                  cor do tema.
                </p>
                {(
                  [
                    ["showAvatars", "Exibir avatares nas mensagens"],
                    ["colorNames", "Usar cores dos autores nos nomes"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    {label}
                    <Switch
                      aria-label={label}
                      checked={messageIdentity[key]}
                      onCheckedChange={(value) => {
                        try {
                          saveMessageIdentity({ [key]: value });
                          setAppearanceError("");
                        } catch {
                          setAppearanceError(
                            "Não foi possível salvar a identidade das mensagens.",
                          );
                        }
                      }}
                    />
                  </label>
                ))}
              </section>
              <h3 className="font-semibold">Densidade das mensagens</h3>
              <p className="text-sm text-muted-foreground">
                Ajuste a apresentação do chat. A escolha é salva neste
                dispositivo.
              </p>
              <div
                role="group"
                aria-label="Densidade das mensagens"
                className="flex gap-2"
              >
                {[false, true].map((value) => (
                  <Button
                    key={String(value)}
                    variant={compact === value ? "default" : "outline"}
                    aria-pressed={compact === value}
                    onClick={() => {
                      try {
                        setChatCompact(value);
                        setAppearanceError("");
                      } catch {
                        setAppearanceError(
                          "Não foi possível salvar a densidade.",
                        );
                      }
                    }}
                  >
                    {value ? "Compacta" : "Confortável"}
                  </Button>
                ))}
              </div>
              {appearanceError && <p role="alert">{appearanceError}</p>}
            </TabsContent>
            {/* ABA 1: PERFIL & IDENTIDADE */}
            <TabsContent
              forceMount
              hidden={settingsTab !== "profile"}
              value="profile"
              className="m-0"
            >
              <ProfileDialog embedded />
            </TabsContent>
            {/* ABA 2: ÁUDIO, VÍDEO & ESTÚDIO */}
            <TabsContent value="audio" className="m-0 space-y-6">
              <section
                className="space-y-3 rounded-lg border border-border p-3"
                aria-label="Modo de fala"
              >
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="push-to-talk" className="text-sm font-medium">
                    Push-to-talk
                  </label>
                  <Switch
                    id="push-to-talk"
                    aria-label="Push-to-talk"
                    checked={voicePreferences.pushToTalk}
                    onCheckedChange={(value) =>
                      saveVoice({ pushToTalk: value })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Segure a tecla para falar com a janela em foco. Não funciona
                  enquanto digita. O silêncio manual sempre prevalece; Os
                  efeitos sonoros continuam independentes.
                </p>
                <label className="text-xs flex items-center gap-2">
                  Tecla de fala
                  <select
                    aria-label="Tecla de push-to-talk"
                    className="rounded-md bg-secondary p-1"
                    value={voicePreferences.talkKey}
                    onChange={(event) =>
                      saveVoice({
                        talkKey: event.target
                          .value as (typeof TALK_KEYS)[number],
                      })
                    }
                  >
                    {TALK_KEYS.map((key) => (
                      <option key={key}>{key}</option>
                    ))}
                  </select>
                </label>
                {voicePreferenceError && (
                  <p role="alert">{voicePreferenceError}</p>
                )}
              </section>
              <MicrophoneTest />
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
                      <PopoverContent
                        align="start"
                        className="w-[320px] sm:w-[420px] p-2 space-y-1 max-h-52 overflow-y-auto"
                      >
                        <button
                          onClick={() =>
                            handleDeviceChange("inputDeviceId", "default")
                          }
                          className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                            audioConfig.inputDeviceId === "default"
                              ? "bg-primary text-primary-foreground font-medium"
                              : "hover:bg-accent text-foreground"
                          }`}
                        >
                          <span>Dispositivo Padrão do Sistema</span>
                          {audioConfig.inputDeviceId === "default" && (
                            <Check className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </button>
                        {microphones.map((mic) => {
                          const isSelected =
                            audioConfig.inputDeviceId === mic.deviceId;
                          return (
                            <button
                              key={mic.deviceId}
                              onClick={() =>
                                handleDeviceChange(
                                  "inputDeviceId",
                                  mic.deviceId,
                                )
                              }
                              className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                                isSelected
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "hover:bg-accent text-foreground"
                              }`}
                            >
                              <span className="truncate pr-2">
                                {mic.label ||
                                  `Microfone (${mic.deviceId.slice(0, 6)})`}
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Fones / Alto-falantes */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-success" />
                      <span>Alto-falante / Fone de Ouvido (Saída)</span>
                    </label>

                    <Popover onOpenChange={(open) => open && loadDevices()}>
                      <PopoverTrigger asChild>
                        <Button
                          disabled={!supportsAudioOutput()}
                          title={
                            !supportsAudioOutput()
                              ? "Seleção de saída indisponível neste navegador"
                              : undefined
                          }
                          variant="secondary"
                          className="w-full justify-between h-9 px-3 text-xs bg-secondary/80 border border-border/60 hover:bg-accent font-normal"
                        >
                          <span className="truncate">
                            {currentSpeakerLabel}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[320px] sm:w-[420px] p-2 space-y-1 max-h-52 overflow-y-auto"
                      >
                        <button
                          onClick={() =>
                            handleDeviceChange("outputDeviceId", "default")
                          }
                          className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                            audioConfig.outputDeviceId === "default"
                              ? "bg-primary text-primary-foreground font-medium"
                              : "hover:bg-accent text-foreground"
                          }`}
                        >
                          <span>Dispositivo Padrão do Sistema</span>
                          {audioConfig.outputDeviceId === "default" && (
                            <Check className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </button>
                        {speakers.map((spk) => {
                          const isSelected =
                            audioConfig.outputDeviceId === spk.deviceId;
                          return (
                            <button
                              key={spk.deviceId}
                              onClick={() =>
                                handleDeviceChange(
                                  "outputDeviceId",
                                  spk.deviceId,
                                )
                              }
                              className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                                isSelected
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "hover:bg-accent text-foreground"
                              }`}
                            >
                              <span className="truncate pr-2">
                                {spk.label ||
                                  `Saída (${spk.deviceId.slice(0, 6)})`}
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              )}
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
                      <PopoverContent
                        align="start"
                        className="w-[320px] sm:w-[420px] p-2 space-y-1 max-h-52 overflow-y-auto"
                      >
                        <button
                          onClick={() =>
                            handleDeviceChange("videoDeviceId", "default")
                          }
                          className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                            audioConfig.videoDeviceId === "default"
                              ? "bg-primary text-primary-foreground font-medium"
                              : "hover:bg-accent text-foreground"
                          }`}
                        >
                          <span>Dispositivo Padrão do Sistema</span>
                          {audioConfig.videoDeviceId === "default" && (
                            <Check className="w-3.5 h-3.5 shrink-0" />
                          )}
                        </button>
                        {cameras.map((cam) => {
                          const isSelected =
                            audioConfig.videoDeviceId === cam.deviceId;
                          return (
                            <button
                              key={cam.deviceId}
                              onClick={() =>
                                handleDeviceChange(
                                  "videoDeviceId",
                                  cam.deviceId,
                                )
                              }
                              className={`w-full px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                                isSelected
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "hover:bg-accent text-foreground"
                              }`}
                            >
                              <span className="truncate pr-2">
                                {cam.label ||
                                  `Câmera (${cam.deviceId.slice(0, 6)})`}
                              </span>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 shrink-0" />
                              )}
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
                <MicrophoneLevelMeter />

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
                      <span>Filtro de ruído (Noise Gate + navegador)</span>
                      <span className="px-1.5 py-0.5 rounded text-micro font-bold bg-primary/20 text-primary uppercase">
                        48 kHz
                      </span>
                    </div>
                    <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
                      Noise Gate com envelope de 2ms de ataque e 120ms de
                      liberação para suprimir digitação de teclado mecânico e
                      ruídos de fundo.
                    </p>
                  </div>
                  <Switch
                    checked={audioConfig.neuralNoiseGate}
                    onCheckedChange={() => handleToggle("neuralNoiseGate")}
                  />
                </div>

                {/* High-Pass 80Hz */}
                <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-warning" />
                      <span>Filtro Passa-Alta (High-Pass 80Hz, Q=0.707)</span>
                    </div>
                    <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
                      Corta vibrações mecânicas da mesa, zumbidos da rede
                      elétrica e ruído de coolers de PC sem degradar o timbre da
                      voz.
                    </p>
                  </div>
                  <Switch
                    checked={audioConfig.highPassFilter80Hz}
                    onCheckedChange={() => handleToggle("highPassFilter80Hz")}
                  />
                </div>

                {/* Eco */}
                <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      Cancelamento Acústico de Eco (AEC)
                    </div>
                    <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
                      Elimina o retorno de voz proveniente de alto-falantes
                      abertos para evitar realimentação.
                    </p>
                  </div>
                  <Switch
                    checked={audioConfig.echoCancellation}
                    onCheckedChange={() => handleToggle("echoCancellation")}
                  />
                </div>

                {/* AGC */}
                <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      Controle Automático de Ganho (AGC)
                    </div>
                    <p className="text-caption text-muted-foreground mt-0.5 leading-snug">
                      Normaliza falas distantes ou sussurros e previne clipagem
                      quando você falar mais alto.
                    </p>
                  </div>
                  <Switch
                    checked={audioConfig.autoGainControl}
                    onCheckedChange={() => handleToggle("autoGainControl")}
                  />
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {confirmDiscard && (
          <section
            role="alert"
            aria-label="Alterações não salvas"
            className="border-t border-border p-3 space-y-2"
          >
            <p className="text-sm">
              Há alterações não salvas. Deseja descartá-las?
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDiscard(false)}
              >
                Continuar editando
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  studio.cancel();
                  setConfirmDiscard(false);
                  setIsSettingsOpen(false);
                }}
              >
                Descartar alterações e fechar
              </Button>
            </div>
          </section>
        )}
        {/* Rodapé */}
        <DialogFooter className="p-4 border-t border-border/60 bg-card/40 flex items-center justify-between shrink-0">
          <div className="text-caption text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Preferências salvas neste dispositivo</span>
          </div>
          <Button
            size="sm"
            onClick={() => closeSettings(false)}
            className="h-8 px-5 text-xs font-semibold"
          >
            Concluído
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
