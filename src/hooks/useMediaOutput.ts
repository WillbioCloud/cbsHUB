import { useEffect, type RefObject } from "react";
import { useHubStore } from "../store/useHubStore";
import { mediaError } from "../lib/mediaState";

export function useMediaOutput(
  ref: RefObject<HTMLVideoElement>,
  clientId: string,
  stream: MediaStream | null | undefined,
) {
  const output = useHubStore((s) => s.audioConfig.outputDeviceId);
  const master = useHubStore((s) => s.audioConfig.remoteStreamVolume);
  const volume = useHubStore((s) => s.peerVolumes[clientId] ?? 1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.volume = Math.max(0, Math.min(1, volume) * master);
    if ("setSinkId" in element)
      (element as HTMLVideoElement & { setSinkId(id: string): Promise<void> })
        .setSinkId(output)
        .catch((error) => mediaError("Saída de áudio da tela", error));
  }, [ref, stream, output, master, volume]);
}
