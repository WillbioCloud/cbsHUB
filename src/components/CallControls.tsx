import { CallControlDock } from "./CallControlDock";
export function CallControls({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex justify-center min-w-0 w-full">
      <CallControlDock />
    </div>
  );
}
