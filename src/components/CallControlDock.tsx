import { useMediaState, supportsAudioOutput } from "../lib/mediaState";
import React, { useState, useEffect } from "react";
import {
  Mic,
  MicOff,
  Headphones,
  Video,
  VideoOff,
  MonitorUp,
  MonitorStop,
  PhoneOff,
  Volume2,
  ChevronDown,
  Check,
  Activity,
  Sliders,
} from "lucide-react";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
import { Button } from "./ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Separator } from "./ui/separator";
import { SoundboardPopover } from "./SoundboardPopover";

export const CallControlDock: React.FC = () => {
  const {
    isMuted,
    isDeafened,
    isWebcamActive,
    isScreenSharing,
    micLevel,
    audioConfig,
    setIsScreenPickerOpen,
  } = useHubStore();

  const microphoneBusy = useMediaState((s) => s.microphoneBusy);
  const cameraBusy = useMediaState((s) => s.cameraBusy);
  const screenBusy = useMediaState((s) => s.screenBusy);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);

  // Carrega dispositivos conectados ao abrir ou montar
  const refreshDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === "audioinput"));
      setAudioOutputs(devices.filter((d) => d.kind === "audiooutput"));
      setVideoInputs(devices.filter((d) => d.kind === "videoinput"));
    } catch (err) {
      console.warn("[CallControlDock] Erro ao listar dispositivos:", err);
    }
  };

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        refreshDevices,
      );
    };
  }, []);

  const handleSelectAudioInput = async (deviceId: string) => {
    await webrtcEngine.selectMicrophone(deviceId);
  };

  const handleSelectAudioOutput = (deviceId: string) => {
    webrtcEngine.updateAudioSettings({ outputDeviceId: deviceId });
  };

  const handleSelectVideoInput = (deviceId: string) => {
    void webrtcEngine.selectCamera(deviceId);
  };

  return (
    <div className="voice-dock select-none z-30">
      {/* 1. Split-Button Microfone [ 🎤 | ▾ ] */}
      <div className="flex items-center rounded-xl overflow-hidden bg-secondary border border-border/60">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={isMuted ? "Desmutar microfone" : "Mutar microfone"}
              aria-pressed={isMuted}
              onClick={() => webrtcEngine.toggleMute()}
              className={`h-10 px-3 flex items-center justify-center transition-colors ${
                isMuted
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "hover:bg-accent text-foreground"
              }`}
            >
              {isMuted ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4 text-success" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isMuted ? "Desmutar Microfone" : "Mutar Microfone"}
          </TooltipContent>
        </Tooltip>

        <Popover onOpenChange={(open) => open && refreshDevices()}>
          <PopoverTrigger asChild>
            <button
              aria-label="Opções de microfone"
              className="h-10 px-1.5 hover:bg-accent border-l border-border/40 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            className="w-72 p-3 space-y-3"
          >
            <div className="space-y-1">
              <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                Dispositivo de Entrada (Microfone)
              </span>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {audioInputs.map((dev) => {
                  const isSelected =
                    (audioConfig.inputDeviceId || "default") === dev.deviceId;
                  return (
                    <button
                      key={dev.deviceId || dev.label}
                      disabled={microphoneBusy}
                      onClick={() => handleSelectAudioInput(dev.deviceId)}
                      className={`w-full px-2 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-accent text-foreground"
                      }`}
                    >
                      <span className="truncate pr-2">
                        {dev.label || `Microfone (${dev.deviceId.slice(0, 5)})`}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Ganho e VU Meter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  Ganho do Microfone
                </span>
                <span className="font-mono font-bold text-foreground">
                  {Math.round((audioConfig.micGain ?? 1.0) * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                aria-label="Ganho do microfone"
                max={2}
                step={0.05}
                value={[audioConfig.micGain ?? 1.0]}
                onValueChange={([val]) =>
                  webrtcEngine.updateAudioSettings({ micGain: val })
                }
              />

              <div className="flex items-center justify-between text-2xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-success" />
                  <span>Nível de Entrada</span>
                </span>
                <span className="font-mono">{micLevel}%</span>
              </div>
              <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-success transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.max(0, micLevel))}%` }}
                />
              </div>
            </div>

            <Separator />

            {/* Supressão Neural Filtro de ruído */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-medium text-foreground">
                  Filtro de ruído
                </div>
                <div className="text-2xs text-muted-foreground">
                  Filtro de ruído via AudioWorklet
                </div>
              </div>
              <Switch
                aria-label="Filtro de ruído"
                checked={audioConfig.neuralNoiseGate}
                onCheckedChange={(checked) =>
                  webrtcEngine.updateAudioSettings({ neuralNoiseGate: checked })
                }
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* 2. Split-Button Fone / Áudio [ 🎧 | ▾ ] */}
      <div className="flex items-center rounded-xl overflow-hidden bg-secondary border border-border/60">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={
                isDeafened
                  ? "Ativar áudio da chamada"
                  : "Desativar áudio da chamada"
              }
              aria-pressed={isDeafened}
              onClick={() => webrtcEngine.toggleDeafen()}
              className={`h-10 px-3 flex items-center justify-center transition-colors ${
                isDeafened
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "hover:bg-accent text-foreground"
              }`}
            >
              <Headphones
                className={`w-4 h-4 ${isDeafened ? "line-through text-destructive-foreground" : ""}`}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isDeafened
              ? "Desativar Silenciar Áudio"
              : "Silenciar Áudio (Deafen)"}
          </TooltipContent>
        </Tooltip>

        <Popover onOpenChange={(open) => open && refreshDevices()}>
          <PopoverTrigger asChild>
            <button
              aria-label="Opções de saída de áudio"
              className="h-10 px-1.5 hover:bg-accent border-l border-border/40 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            className="w-72 p-3 space-y-3"
          >
            <div className="space-y-1">
              <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                Dispositivo de Saída (Fones)
              </span>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {!supportsAudioOutput() && (
                  <p className="text-xs text-muted-foreground">
                    Seleção de saída indisponível neste navegador.
                  </p>
                )}
                {supportsAudioOutput() &&
                  audioOutputs.map((dev) => {
                    const isSelected =
                      (audioConfig.outputDeviceId || "default") ===
                      dev.deviceId;
                    return (
                      <button
                        key={dev.deviceId || dev.label}
                        onClick={() => handleSelectAudioOutput(dev.deviceId)}
                        className={`w-full px-2 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground font-medium"
                            : "hover:bg-accent text-foreground"
                        }`}
                      >
                        <span className="truncate pr-2">
                          {dev.label ||
                            `Alto-falante (${dev.deviceId.slice(0, 5)})`}
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 shrink-0" />
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            <Separator />

            {/* Volume Mestre da Chamada */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Volume da Chamada</span>
                </span>
                <span className="font-mono font-bold text-foreground">
                  {Math.round((audioConfig.remoteStreamVolume ?? 1.0) * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                aria-label="Volume da chamada"
                max={1}
                step={0.02}
                value={[audioConfig.remoteStreamVolume ?? 1.0]}
                onValueChange={([val]) =>
                  webrtcEngine.updateAudioSettings({ remoteStreamVolume: val })
                }
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* 3. Split-Button Câmera [ 📷 | ▾ ] */}
      <div className="flex items-center rounded-xl overflow-hidden bg-secondary border border-border/60">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={isWebcamActive ? "Desligar câmera" : "Ligar câmera"}
              disabled={cameraBusy}
              aria-busy={cameraBusy}
              aria-pressed={isWebcamActive}
              onClick={() => webrtcEngine.toggleWebcam()}
              className={`h-10 px-3 flex items-center justify-center transition-colors ${
                isWebcamActive
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "hover:bg-accent text-foreground"
              }`}
            >
              {isWebcamActive ? (
                <Video className="w-4 h-4" />
              ) : (
                <VideoOff className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isWebcamActive ? "Desligar Câmera" : "Ligar Câmera"}
          </TooltipContent>
        </Tooltip>

        <Popover onOpenChange={(open) => open && refreshDevices()}>
          <PopoverTrigger asChild>
            <button
              aria-label="Opções de câmera"
              className="h-10 px-1.5 hover:bg-accent border-l border-border/40 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="center"
            className="w-64 p-3 space-y-2"
          >
            <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
              Selecionar Câmera
            </span>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {videoInputs.map((dev) => {
                const isSelected =
                  (audioConfig.videoDeviceId || "default") === dev.deviceId;
                return (
                  <button
                    key={dev.deviceId || dev.label}
                    disabled={cameraBusy}
                    onClick={() => handleSelectVideoInput(dev.deviceId)}
                    className={`w-full px-2 py-1.5 rounded-md text-xs flex items-center justify-between text-left transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <span className="truncate pr-2">
                      {dev.label || `Câmera (${dev.deviceId.slice(0, 5)})`}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
              {videoInputs.length === 0 && (
                <div className="text-xs text-muted-foreground py-2 text-center">
                  Nenhuma câmera detectada
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* 4. Compartilhar Tela [ 🖥️ ] */}
      {!isScreenSharing ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              aria-label="Compartilhar tela"
              disabled={screenBusy || !navigator.mediaDevices?.getDisplayMedia}
              onClick={() =>
                window.cbsHubAPI
                  ? setIsScreenPickerOpen(true)
                  : void webrtcEngine.startScreenShare(
                      "",
                      useHubStore.getState().videoQualityConfig,
                    )
              }
              className="h-10 px-3.5 rounded-xl border border-border/60 hover:bg-accent text-foreground flex items-center gap-1.5 shadow-sm"
            >
              <MonitorUp className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold hidden md:inline">
                Tela
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Compartilhar tela</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-10 px-3.5 rounded-xl bg-success hover:bg-success/90 text-primary-foreground flex items-center gap-1.5 shadow-lg shadow-emerald-600/20">
              <MonitorStop className="w-4 h-4 animate-pulse" />
              <span className="text-xs font-bold">Transmitindo</span>
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="w-48">
            <DropdownMenuItem onClick={() => setIsScreenPickerOpen(true)}>
              Trocar Tela / Resolução
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => webrtcEngine.stopScreenShare()}
              className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
            >
              Parar Transmissão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* 5. Soundboard [ 🔊 ] */}
      <SoundboardPopover
        side="top"
        align="center"
        trigger={
          <Button
            variant="secondary"
            aria-label="Efeitos Sonoros da chamada"
            title="Efeitos Sonoros"
            className="h-10 px-3 rounded-lg border border-border/60"
          >
            <Volume2 className="size-4 text-primary" />
            <span className="sr-only">Efeitos Sonoros</span>
          </Button>
        }
      />

      {/* 6. Botão Desligar Chamada [ 📞 ] */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="destructive"
            aria-label="Desligar voz e manter conversa"
            onClick={() => webrtcEngine.leaveVoiceCall()}
            className="h-10 px-4 rounded-lg font-medium text-xs flex items-center gap-1.5 shadow-none transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
            <span className="hidden sm:inline">Desligar</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Desconectar da voz (mantém o chat aberto)
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
