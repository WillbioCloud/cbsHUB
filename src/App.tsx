import { useMediaState } from "./lib/mediaState";
import { BootSplash, ConnectionScreen } from "./components/ConnectionScreen";
import { usePushToTalk } from "./hooks/usePushToTalk";
import { useShallow } from "zustand/react/shallow";
import React, { useEffect, useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { LeftSidebar } from "./components/LeftSidebar";
import { RoomTopBar } from "./components/RoomTopBar";
import { CallStagePanel } from "./components/CallStagePanel";
import { TextChatSection } from "./components/TextChatSection";
import { ScreenPickerModal } from "./components/ScreenPickerModal";
import { SettingsModal } from "./components/SettingsModal";
import { TooltipProvider } from "./components/ui/tooltip";
import { useHubStore } from "./store/useHubStore";
import { webrtcEngine } from "./lib/webrtcEngine";
import { WorkspaceRail } from "./components/WorkspaceRail";
import { MembersPanel } from "./components/MembersPanel";
import { ResizeHandle } from "./components/ui/resize-handle";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "./components/ui/sheet";
import {
  useWorkspaceLayout,
  useMediaQuery,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
} from "./hooks/useWorkspaceLayout";

import { MediaNotice } from "./components/CallStatus";
import { ProfileDialog } from "./profiles/ProfileDialog";

export const App: React.FC = () => {
  usePushToTalk();
  const trayInVoice = useHubStore((s) => s.inVoiceCall),
    trayReconnecting = useMediaState((s) => s.reconnecting);
  useEffect(() => {
    window.cbsHubAPI?.updateTrayState?.({
      inVoiceCall: trayInVoice,
      reconnecting: trayReconnecting,
    });
  }, [trayInVoice, trayReconnecting]);
  const [booting, setBooting] = useState(true);
  const {
    isSettingsOpen,
    isScreenPickerOpen,
    setIsSettingsOpen,
    setIsScreenPickerOpen,
    roomId,
  } = useHubStore(
    useShallow((state) => ({
      isSettingsOpen: state.isSettingsOpen,
      isScreenPickerOpen: state.isScreenPickerOpen,
      setIsSettingsOpen: state.setIsSettingsOpen,
      setIsScreenPickerOpen: state.setIsScreenPickerOpen,
      roomId: state.roomId,
    })),
  );

  const layout = useWorkspaceLayout();
  const compact = useMediaQuery("(max-width: 767px)");
  const membersOverlay = useMediaQuery("(max-width: 1100px)");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [mobileMembersOpen, setMobileMembersOpen] = useState(false);
  const sidebarOpen = compact ? navigationOpen : !layout.sidebarCollapsed;
  const membersOpen = membersOverlay ? mobileMembersOpen : layout.membersOpen;
  const toggleSidebar = () =>
    compact ? setNavigationOpen((open) => !open) : layout.toggleSidebar();
  const toggleMembers = () =>
    membersOverlay
      ? setMobileMembersOpen((open) => !open)
      : layout.toggleMembers();

  // 1. Inicialização do microfone e da sala executada apenas UMA VEZ no mount
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const minimum = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 5000);
    });
    const removed =
      localStorage.getItem("cbshub-room-removed-active") === "1" && !roomId;
    const startup = removed
      ? Promise.resolve()
      : webrtcEngine
          .joinRoom(roomId || "cbs-irmandade", false)
          .catch((err) => console.warn("[App] Inicialização", err));
    void Promise.all([startup, minimum]).then(() => {
      if (active) setBooting(false);
    });
    return () => {
      active = false;
      clearTimeout(timer);
      webrtcEngine.leaveRoom();
    };
  }, []); // Array de dependências vazio estrito

  useEffect(() => {
    const online = () => webrtcEngine.notifyNetwork(true),
      offline = () => webrtcEngine.notifyNetwork(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  // 2. Listener global de teclado (ESC fecha modais ativos)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isScreenPickerOpen) setIsScreenPickerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isSettingsOpen,
    isScreenPickerOpen,
    setIsSettingsOpen,
    setIsScreenPickerOpen,
  ]);

  if (booting)
    return (
      <TooltipProvider>
        <TitleBar />
        <BootSplash />
      </TooltipProvider>
    );
  return (
    <TooltipProvider delayDuration={150}>
      <div className="workspace-root">
        <TitleBar />
        {booting && <BootSplash />}
        <ConnectionScreen />
        <div className="workspace-body">
          <WorkspaceRail
            sidebarOpen={sidebarOpen}
            membersOpen={membersOpen}
            onToggleSidebar={toggleSidebar}
            onToggleMembers={toggleMembers}
          />
          {!compact && sidebarOpen && (
            <div
              className="workspace-sidebar"
              style={{ width: layout.sidebarWidth }}
            >
              <LeftSidebar />
              <ResizeHandle
                value={layout.sidebarWidth}
                min={SIDEBAR_MIN}
                max={SIDEBAR_MAX}
                onChange={layout.setSidebarWidth}
              />
            </div>
          )}
          <main className="workspace-main" id="conversation-workspace">
            <RoomTopBar
              membersOpen={membersOpen}
              onToggleMembers={toggleMembers}
            />
            <div className="workspace-content">
              <div className="workspace-conversation">
                <MediaNotice />
                <CallStagePanel />
                <TextChatSection />
              </div>
              {!membersOverlay && layout.membersOpen && (
                <MembersPanel onClose={layout.toggleMembers} />
              )}
            </div>
          </main>
        </div>
        <Sheet
          open={compact && navigationOpen}
          onOpenChange={setNavigationOpen}
        >
          <SheetContent side="left">
            <SheetTitle className="sr-only">Navegação de salas</SheetTitle>
            <SheetDescription className="sr-only">
              Entre em uma sala ou abra uma conversa recente.
            </SheetDescription>
            <LeftSidebar onNavigate={() => setNavigationOpen(false)} />
          </SheetContent>
        </Sheet>
        <Sheet
          open={membersOverlay && mobileMembersOpen}
          onOpenChange={setMobileMembersOpen}
        >
          <SheetContent side="right">
            <SheetTitle className="sr-only">Membros da sala</SheetTitle>
            <SheetDescription className="sr-only">
              Participantes e controles individuais de áudio.
            </SheetDescription>
            <MembersPanel onClose={() => setMobileMembersOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* 3. Modais do Sistema */}
        <ScreenPickerModal />
        <SettingsModal />

        <ProfileDialog />
      </div>
    </TooltipProvider>
  );
};

export default App;
