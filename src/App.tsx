import React, { useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { LeftSidebar } from './components/LeftSidebar';
import { RoomTopBar } from './components/RoomTopBar';
import { CallStagePanel } from './components/CallStagePanel';
import { TextChatSection } from './components/TextChatSection';
import { ScreenPickerModal } from './components/ScreenPickerModal';
import { SettingsModal } from './components/SettingsModal';
import { TooltipProvider } from './components/ui/tooltip';
import { shallow } from 'zustand/shallow';
import { useHubStore } from './store/useHubStore';
import { webrtcEngine } from './lib/webrtcEngine';

export const App: React.FC = () => {
  // Assinatura mínima: se o App re-renderizar, TODA a árvore re-renderiza.
  // Antes ele assinava a store inteira e isso acontecia a cada nível de microfone
  // (era o que travava a interface durante a chamada).
  const { isSettingsOpen, isScreenPickerOpen, setIsSettingsOpen, setIsScreenPickerOpen, roomId } =
    useHubStore(
      (state) => ({
        isSettingsOpen: state.isSettingsOpen,
        isScreenPickerOpen: state.isScreenPickerOpen,
        setIsSettingsOpen: state.setIsSettingsOpen,
        setIsScreenPickerOpen: state.setIsScreenPickerOpen,
        roomId: state.roomId,
      }),
      shallow
    );
  const bootstrappedRef = useRef(false);

  // 1. Inicialização do microfone e da sala executada apenas UMA VEZ no mount.
  // Guard extra além do React.StrictMode desativado: nunca abrir duas malhas P2P.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const bootstrap = async () => {
      // Microfone primeiro: garante que o pipeline já exista antes de qualquer
      // negociação de voz, evitando entrar na call sem track de áudio.
      try {
        await webrtcEngine.setupLocalMicrophone();
      } catch (err) {
        console.warn('[App] Erro ao inicializar microfone no arranque:', err);
      }

      const initialRoom = roomId || 'cbs-irmandade';
      try {
        await webrtcEngine.joinRoom(initialRoom, false);
      } catch (err) {
        console.warn('[App] Erro ao conectar na sala inicial:', err);
      }
    };

    void bootstrap();
  }, []); // Array de dependências vazio estrito

  // 2. Listener global de teclado (ESC fecha modais ativos)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSettingsOpen) setIsSettingsOpen(false);
        if (isScreenPickerOpen) setIsScreenPickerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen, isScreenPickerOpen, setIsSettingsOpen, setIsScreenPickerOpen]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground font-sans antialiased">
        {/* 1. TitleBar Slim com Controles de Janela Nativos e Status */}
        <TitleBar />

        {/* 2. Área de Trabalho: LeftSidebar (240px) + MainWorkspace */}
        <div className="flex-1 flex overflow-hidden relative">
          <LeftSidebar />

          <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
            {/* TopBar da Sala */}
            <RoomTopBar />

            {/* Palco Superior Retrátil da Ligação (Grid / Spotlight 4K60 / Minimized) */}
            <CallStagePanel />

            {/* Área Inferior Principal: Chat de Texto & Reações P2P Sincronizado */}
            <TextChatSection />
          </main>
        </div>

        {/* 3. Modais do Sistema */}
        <ScreenPickerModal />
        <SettingsModal />
      </div>
    </TooltipProvider>
  );
};

export default App;
