# Plano de Ação SDD — Guia Anti-Alucinação para o Agente de IA (`cbsHUB v2.0`)

Este guia mostra **exatamente como usar o arquivo `SDD.md`** para que o seu Agente de IA (Cursor, Windsurf, Claude Code, Cline, GitHub Copilot Agent, etc.) construa toda a nova versão do **cbsHUB** **sem se perder, sem quebrar o WebRTC que já funciona e sem voltar a fazer design feio**.

---

## Parte 1: Por que o Agente estava errando antes (e como o SDD resolve)

1. **Falta de `shadcn/ui` real no `package.json`:** No seu projeto atual, só existiam `clsx` e `tailwind-merge` (`utils.ts`), mas **nenhum pacote `@radix-ui/*`** nem variáveis CSS do `shadcn` no `index.css`. Por isso a IA improvisava caixas azuladas pesadas (`#12141c`, `#181a26`) e `<select>` nativos feios do Windows.
2. **Motor P2P preso em 1v1:** Seu `webrtcEngine.ts` e `useHubStore.ts` atuais guardavam apenas um único `remotePeerId` e um único `<audio>`. Quando um 3º irmão entrasse, derrubaria o anterior.
3. **Sobrecarga de Contexto:** Pedir chamadas + tela 4K + design Discord + chat + emojis + soundboard em conversas longas faz a IA esquecer partes do código e quebrar tipagens.

---

## Parte 2: Preparação Inicial (2 Minutos Antes de Começar)

### Passo 1 — Coloque o SDD na raiz do seu projeto
Copie o arquivo **`SDD_CBSHUB_V2.md`** para a pasta raiz do seu projeto Electron (ao lado do `package.json`) com o nome exato:
```text
cbsHUB/
├── SDD.md          <-- Cole o conteúdo do SDD_CBSHUB_V2.md aqui
├── PROGRESS.md     <-- Crie este arquivo (modelo abaixo)
├── package.json
└── src/
```

### Passo 2 — Crie o arquivo `PROGRESS.md` na raiz do projeto
Esse arquivo funciona como a **"memória externa"** do Agente. Sempre que você abrir um chat novo para limpar o contexto da IA, ela lê o `SDD.md` + `PROGRESS.md` e sabe exatamente onde parou!

Cole isto no `PROGRESS.md`:

```markdown
# Progresso de Implementação — cbsHUB v2.0 (SDD)

- [ ] **Fase 0:** Design System `shadcn/ui` Real (Pacotes Radix, Tokens CSS Zinc Dark, Primitivos em `src/components/ui/*`)
- [ ] **Fase 1:** Contratos TypeScript (`cbshub.d.ts`), Banco Local `IndexedDB` (`storageDb.ts`) e Novo `useHubStore.ts` Multi-Peer
- [ ] **Fase 2:** Motor WebRTC Mesh (3–6 irmãos simultâneos, Sala vs. Voz independente) + Mixagem WebAudio do Soundboard no `audioPipeline.ts`
- [ ] **Fase 3:** Shell do Layout Estilo Discord (`TitleBar` slim, `LeftSidebar` com Salas/Membros/Volume individual, `UserStatusPod` e `RoomTopBar`)
- [ ] **Fase 4:** Palco Superior Retrátil (`CallStagePanel`, `UserCallCard` dinâmico, `CallControlDock` com Split-Buttons de Mic/Fone/Câmera e Foco 4K60)
- [ ] **Fase 5:** Chat de Texto P2P Sincronizado + `EmojiPickerPopover` + Jumbo Emojis + Reações em Tempo Real
- [ ] **Fase 6:** Soundboard Customizável (`SoundboardPopover` + `AddSoundDialog` com upload `.mp3/.wav/.ogg` + animações nos Cards) & Refino Final dos Modais
```

### Passo 3 — As 5 Regras de Ouro durante o uso com o Agente
1. **1 Fase = 1 Prompt:** Nunca peça duas fases juntas.
2. **Trava de Compilação (`npm run build`):** Só avance para a próxima fase quando o comando `npm run build` terminar com **zero erros**. Se der erro de TypeScript, mande o erro para o Agente corrigir na mesma fase antes de avançar.
3. **Limpeza de Chat a cada 1 ou 2 Fases (Segredo Profissional!):** Assim que uma fase terminar e compilar sem erros, **abra uma NOVA conversa (New Chat)** no seu editor antes de colar o prompt da próxima fase. Isso mantém a janela de contexto da IA limpa, rápida e 100% focada!
4. **Commit Git a cada Fase Concluída:** Faça `git add . && git commit -m "feat: conclui fase X do SDD"` ao fim de cada fase. Se a IA errar algo na Fase 4, você nunca perde as Fases 0–3!
5. **Teste Rápido com 2 ou 3 Abas:** Como você usa Vite + Electron (`npm run dev`), você pode abrir a janela do Electron + 2 abas do Chrome no endereço local do Vite (`http://localhost:5173`) usando a mesma sala `#cbs-irmandade` para simular **3 irmãos conectados ao mesmo tempo** na sua própria máquina!

---

## Parte 3: Sequência de Prompts Prontos (Copie e Cole Fase por Fase)

---

### 🟢 FASE 0 — Fundação Visual & Instalação Real do `shadcn/ui`

> **Quando usar:** Primeira mensagem (em um chat limpo).
> **Objetivo:** Instalar os pacotes `@radix-ui/*`, configurar o tema Zinc Dark minimalista no Tailwind/`index.css` e criar todos os primitivos reais em `src/components/ui/` antes de mexer nas telas.

```markdown
Leia atentamente o arquivo `SDD.md` (especialmente as Seções 0, 2.1, 2.2 e 2.3) e o arquivo `PROGRESS.md` na raiz do projeto.

Sua tarefa AGORA é executar **APENAS a Fase 0 (Design System `shadcn/ui` Real)**:

1. Atualize o `package.json` e instale as dependências listadas na Seção 2.3 do `SDD.md` (`@radix-ui/react-avatar`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `class-variance-authority`, `tailwindcss-animate`). Mantenha todas as dependências existentes intactas.
2. Atualize `tailwind.config.js` (ou `.ts`) e `src/index.css` com os tokens HSL Zinc Dark / Onyx da Seção 2.2 do `SDD.md`, mantendo também aliases compatíveis temporários (`blurple`, `emerald`, `coral`) caso arquivos antigos ainda os referenciem até serem refatorados nas próximas fases, além das classes `.drag-region`, `.no-drag` e scrollbars minimalistas.
3. Crie em `src/components/ui/` os componentes primitivos reais, limpos e bem tipados do `shadcn/ui` (estilo New York):
   - `button.tsx`, `badge.tsx`, `avatar.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `scroll-area.tsx`, `slider.tsx`, `switch.tsx`, `tabs.tsx`, `input.tsx`, `separator.tsx`.
4. NÃO altere ainda a lógica de `webrtcEngine.ts` nem quebre a renderização atual do `App.tsx` (apenas envolva o app com `<TooltipProvider delayDuration={150}>` se necessário).
5. Rode `npm run build` para garantir 0 erros de TypeScript/Vite e marque a **Fase 0** como `[x]` no `PROGRESS.md`.
```

---

### 🟢 FASE 1 — Contratos de Dados, Banco Local `IndexedDB` e Zustand Multi-Peer

> **Quando usar:** Após a Fase 0 compilar sem erros (recomendado abrir Novo Chat).
> **Objetivo:** Preparar tipos, banco local `IndexedDB` (mensagens + soundboard) e o estado global Zustand para múltiplos irmãos, salas recentes, chat e volumes individuais.

```markdown
Leia `SDD.md` (Seções 0, 4 e 5.2) e `PROGRESS.md`. Veja também os arquivos atuais `src/types/cbshub.d.ts` e `src/store/useHubStore.ts`.

Sua tarefa AGORA é executar **APENAS a Fase 1 (Tipagens, IndexedDB e Store Multi-Peer)**:

1. Atualize `src/types/cbshub.d.ts` adicionando `Participant`, `ChatReaction`, `ChatMessage`, `SoundboardClip` e `SignalingPacket` conforme a Seção 4 do `SDD.md`. **REGRA CRÍTICA:** Mantenha `CbsHubElectronAPI` e `window.cbsHubAPI` 100% intactos!
2. Crie `src/lib/storageDb.ts` implementando o banco local tipado sobre `window.indexedDB` (`cbshub_local_db`) conforme a Seção 5.2 do `SDD.md`:
   - Store `messages`: salvar mensagem, salvar lote sincronizado (merge idempotente por `id` ordenado por `createdAt`, limite de 500 por `roomId`), listar mensagens por `roomId`, alternar reação em uma mensagem.
   - Store `soundboard_clips`: listar clipes customizados, adicionar clipe com `Blob` de áudio (validando até 5MB), favoritar/desfavoritar e remover clipe.
3. Expanda `src/store/useHubStore.ts` para suportar a nova arquitetura v2.0 (mantendo compatibilidade temporária com propriedades legadas usadas pelos componentes atuais até a Fase 3/4 para o projeto continuar compilando!):
   - `clientId` persistente (UUID gerado uma vez e salvo no `persist`), `avatarColor`, `recentRooms: string[]` (iniciando com `['cbs-irmandade']`).
   - `inVoiceCall: boolean`, `callStageMode: 'hidden' | 'grid' | 'spotlight' | 'minimized'`, `focusedPeerStreamKey: string | null`, `callStageHeight: number`.
   - `participants: Record<string, Participant>` (mapa dinâmico para 3–6 irmãos simultâneos), `peerVolumes: Record<string, number>` (0 a 2.0 por `clientId`, persistido!).
   - `remoteStreams: Record<string, { voice?: MediaStream; webcam?: MediaStream; screen?: MediaStream }>`.
   - Estado de chat: `messages: ChatMessage[]`, `typingUsers: Record<string, { nickname: string; expiresAt: number }>`, `unreadCount: number`.
   - Estado de soundboard: `soundboardClips: SoundboardClip[]`, `soundboardVolume: number`.
4. Rode `npm run build` garantindo 0 erros de compilação e marque a **Fase 1** como `[x]` no `PROGRESS.md`.
```

---

### 🟢 FASE 2 — Motor WebRTC Mesh (3–6 Irmãos) + Mixagem WebAudio do Soundboard

> **Quando usar:** Após a Fase 1 compilar sem erros (abra Novo Chat!).
> **Objetivo:** O coração técnico! Transformar o `webrtcEngine.ts` em Mesh 3–6 pessoas (separando Sala de Texto vs. Chamada de Voz) e criar o `soundboardEngine.ts` plugado pós-NoiseGate no `audioPipeline.ts`.

```markdown
Leia `SDD.md` (Seções 0, 4, 5.1, 5.2 e 5.3) e `PROGRESS.md`. Analise `src/lib/audioPipeline.ts`, `src/lib/sdpMunger.ts`, `src/lib/sounds.ts` e `src/lib/webrtcEngine.ts`.

Sua tarefa AGORA é executar **APENAS a Fase 2 (WebRTC Mesh Multi-Peer + Grafo de Áudio do Soundboard)**:

1. Em `src/lib/audioPipeline.ts` (Seção 5.3 do `SDD.md`):
   - Preserve integralmente o filtro High-Pass 80Hz, Low-Pass 14kHz, `KrispLikeNoiseGateProcessor` (AudioWorklet) e Compressor.
   - Adicione um `micMuteNode: GainNode` na saída da cadeia do microfone (para que mutar o microfone zere apenas a voz do usuário sem cortar o `destinationNode`) e crie um `soundboardInputNode: GainNode` conectado diretamente ao `destinationNode` (pós-NoiseGate!).
   - Exponha métodos públicos seguros: `setMicMuted(muted: boolean)`, `getAudioContext(): AudioContext | null` e `getSoundboardInputNode(): GainNode | null`.
2. Crie `src/lib/soundboardEngine.ts` (Seção 5.3 do `SDD.md`):
   - Implemente os 8 efeitos embutidos sintetizados via Web Audio API (`airhorn`, `vineboom`, `tada`, `cricket`, `sad_trombone`, `coin`, `drumroll`, `bruh`) + reprodução de `Blob`/`ArrayBuffer` decodificados via `decodeAudioData` para arquivos customizados do IndexedDB.
   - Roteie o áudio simultaneamente para os fones locais (respeitando `isDeafened` e `soundboardVolume`) E para o `soundboardInputNode` do `VoiceAudioPipeline` quando o usuário estiver em chamada de voz, para que todos os irmãos ouçam em tempo real via WebRTC!
   - Inclua `stopAll()` para interromper sons longos imediatamente.
3. Refatore `src/lib/webrtcEngine.ts` para a **Arquitetura Beacon + Full Mesh (3 a 6 irmãos)** conforme a Seção 5.1 do `SDD.md`:
   - Separe `joinRoom(slug)` (conecta imediatamente à malha de `DataConnection` para presença + sincronização automática de histórico do chat via `storageDb.ts`) de `joinVoiceCall()` / `leaveVoiceCall()` (inicia/encerra streams `voice`, `webcam` e `screen` apenas entre quem está com `inVoiceCall === true`).
   - Implemente `sessions: Map<string, PeerMediaSession>` com `<audio>` individual por irmão (suportando volume individual `0–200%` via `peerVolumes[clientId]`, `setSinkId` e `isDeafened`).
   - Implemente o auto-heal do `beaconPeer` (`cbshub-v2-${slug}-beacon`) separado do `localPeer`, para que se o primeiro irmão fechar o app, a chamada entre os demais irmãos NÃO caia.
   - Preserve 100% do `enhanceOpusSdp`, `configureVideoSender`, loop ABR 4K60 e integração `window.cbsHubAPI.setCaptureSource`.
   - Adicione métodos públicos claros para UI: `joinRoom`, `leaveRoom`, `joinVoiceCall`, `leaveVoiceCall`, `sendChatMessage`, `toggleMessageReaction`, `sendTypingState`, `triggerSoundboardClip`, `setPeerVolume`, `toggleWebcam`, `startScreenShare`, `stopScreenShare`.
4. Rode `npm run build` até ter 0 erros e marque a **Fase 2** como `[x]` no `PROGRESS.md`.
```

---

### 🟢 FASE 3 — Shell do Layout Discord + `TitleBar` Slim + `LeftSidebar` + `RoomTopBar`

> **Quando usar:** Após a Fase 2 compilar sem erros (abra Novo Chat!).
> **Objetivo:** Montar toda a moldura limpa estilo Discord Group DM + `shadcn/ui`: barra de título discreta, sidebar de 240px com salas recentes, lista de irmãos com Popover de volume individual (0–200%), User Pod no canto inferior esquerdo e barra de topo da sala.

```markdown
Leia `SDD.md` (Seções 2, 3, 6.1, 6.2 e 6.3) e `PROGRESS.md`.

Sua tarefa AGORA é executar **APENAS a Fase 3 (Shell Espacial Estilo Discord + Correção IPC TitleBar + Feedback de Voz Real-Time nos Avatares + Sidebar + TopBar)**:

1. **Correção Definitiva dos Botões Minimizar/Maximizar/Fechar (`electron/main.ts`, `electron/preload.*`, `src/index.css` e `src/components/TitleBar.tsx`):**
   - Em `electron/main.ts`: adicione `sandbox: false` em `webPreferences` (mantendo `contextIsolation: true` e `nodeIntegration: false`) para que o preload `.mjs` sempre exponha `window.cbsHubAPI` no Electron 33; no Windows/Linux remova `titleBarStyle: 'hidden'` deixando apenas `frame: false` (ou restrinja `titleBarStyle` a `process.platform === 'darwin'`); nos handlers `cbs:minimize`, `cbs:maximize` e `cbs:close`, resolva a janela com `BrowserWindow.fromWebContents(event.sender) || mainWindow`.
   - Em `src/index.css`: garanta `.no-drag, .drag-region button, .drag-region a, .drag-region input, .drag-region [role="button"] { -webkit-app-region: no-drag; }`.
   - Refatore `src/components/TitleBar.tsx` (`h-9` / `36px`, `bg-zinc-950 border-b border-border`): visual minimalista `shadcn/ui`, pílula central discreta de status da malha/ping e botões `Always on Top`, `Minimize`, `Maximize/Restore` e `Close` 100% funcionais.
2. **Feedback de Voz em Tempo Real nos Ícones de Perfil (`src/components/VoiceAvatar.tsx` + ajuste fino em `audioPipeline.ts` e `webrtcEngine.ts`):**
   - Adicione `speakingLevel?: number` em `Participant` (`src/types/cbshub.d.ts`).
   - Em `audioPipeline.ts` e `webrtcEngine.ts`: ajuste o limiar de fala para `-48 dB` com **hold/hangover de `180ms`** (evita piscar entre sílabas); em `webrtcEngine.ts`, reutilize `session.voiceAudioCtx` e `session.voiceSourceNode` já ativos em `setupPeerVoiceAudio` (conectando o `AnalyserNode` antes do `voiceGainNode`, com `ctx.resume()`), atualizando `isSpeaking` e `speakingLevel` (0–100) em tempo real para cada irmão, e enviando pacotes `speaking` na rede **apenas quando `isSpeaking` mudar de valor** (evitando flood de 22 pacotes/s no DataChannel).
   - Crie `src/components/VoiceAvatar.tsx` reutilizável em toda a UI: renderiza o `Avatar` com anel `ring-2 ring-emerald-500` instantâneo + halo dinâmico (`boxShadow`) proporcional ao `speakingLevel` quando `isSpeaking && !isMuted`.
3. Crie `src/components/LeftSidebar.tsx` (`w-60`, `bg-[#111114] border-r border-border flex flex-col`) conforme Seção 6.2 do `SDD.md`:
   - Seletor/Input limpo de Sala (`#slug`) + botão copiar convite + lista de **Salas Recentes** com troca em 1 clique.
   - Lista em tempo real **`NA SALA — N`** usando `ScrollArea` e `VoiceAvatar`: exibe você e todos os irmãos conectados (com resposta de voz em tempo real no avatar, indicadores de online, na call de voz, mutado, ou badge `AO VIVO`). Ao clicar em um irmão, abre um `Popover` do `shadcn/ui` com **`Slider` de Volume Individual (0% a 200%)** conectado ao `webrtcEngine.setPeerVolume`.
   - Rodapé **`UserStatusPod`** (`h-14 bg-[#0c0c0f] border-t border-border`): seu `VoiceAvatar` (reagindo em tempo real à sua voz!), apelido editável rápido via `Popover`, e botões com `Tooltip` para Mute (`webrtcEngine.toggleMute()`), Deafen (`webrtcEngine.toggleDeafen()`) e Configurações (`⚙️`).
4. Crie `src/components/RoomTopBar.tsx` (`h-12 border-b border-border px-4 flex items-center justify-between`) conforme Seção 6.3 do `SDD.md`:
   - `# nome-da-sala`, contador de irmãos online, botão verde **`Entrar na Chamada`** quando `inVoiceCall === false` (ou controles de expandir/minimizar palco + timer quando `inVoiceCall === true`), atalho de Configurações e toggle da sidebar em telas menores.
5. Atualize `src/App.tsx` organizando a estrutura principal (`TitleBar` no topo; abaixo `LeftSidebar` na esquerda + `MainWorkspace` na direita com `RoomTopBar` no topo e área central mantendo temporariamente `VideoStage` até a Fase 4). Auto-conecte na `roomId` salva (`webrtcEngine.joinRoom(roomId)`) no `useEffect` inicial!
6. Rode `npm run build` garantindo 0 erros e marque a **Fase 3** como `[x]` no `PROGRESS.md`.
```

---

### 🟢 FASE 4 — Palco Superior de Chamada (`CallStagePanel`), Cards dos Irmãos & Split-Buttons

> **Quando usar:** Após a Fase 3 compilar sem erros (abra Novo Chat!).
> **Objetivo:** Construir a área superior estilo chamada de grupo do Discord (acima do chat), com os Cards de cada irmão, modo foco de tela 4K60, redimensionamento de altura e os **Split-Buttons `[Mic | ▾]`, `[Fone | ▾]`, `[Vídeo | ▾]`** para trocar microfone/fone em 1 clique!

```markdown
Leia `SDD.md` (Seções 3 e 6.4) e `PROGRESS.md`. Consulte também `src/components/VideoStage.tsx` e `src/components/ControlBar.tsx` antigos para preservar toda a lógica de Fullscreen e HUD de telemetria 4K60.

Sua tarefa AGORA é executar **APENAS a Fase 4 (Palco Superior de Cards + Split-Buttons de Dispositivos + Modo Foco 4K60)**:

1. Crie `src/components/UserCallCard.tsx` conforme Seção 6.4 do `SDD.md`:
   - Card minimalista (`rounded-xl bg-zinc-900 border`) para cada irmão em `inVoiceCall`, exibindo `VoiceAvatar` centralizado com resposta de voz em tempo real (`isSpeaking` + `speakingLevel`) e borda esmeralda suave no card ao falar, vídeo de webcam quando ativo, indicadores de `MicOff`/`Deafen`, e pílula flutuante animada quando `activeSoundEffect` estiver ativo.
   - Gere também Cards dedicados de **Transmissão de Tela** (`Tela de {nickname}` com preview ao vivo e badge `AO VIVO • {resolution}`), que ao clicar ativam o modo `'spotlight'`.
2. Crie `src/components/CallControlDock.tsx` (Seção 3 do `SDD.md`) posicionado na base central do `CallStagePanel`:
   - Implemente os **Split-Buttons reais com `DropdownMenu` / `Popover` do `shadcn/ui`**:
     - `[ 🎤 | ▾ ]`: Clique muta/desmuta; seta `▾` lista todos os microfones (`enumerateDevices`), `Slider` rápido de ganho do microfone (0–200%), mini VU meter e `Switch` do Krisp Noise Gate!
     - `[ 🎧 | ▾ ]`: Clique alterna Deafen; seta `▾` lista todas as saídas de áudio (`audiooutput`) + `Slider` de volume geral.
     - `[ 📷 | ▾ ]`: Clique liga/desliga webcam; seta `▾` escolhe qual câmera usar.
     - `[ 🖥️ Compartilhar Tela ]`: Abre `ScreenPickerModal` ou menu rápido para trocar/encerrar transmissão.
     - `[ 🔊 Soundboard ]`: Botão preparado para abrir o `SoundboardPopover` (que será completado na Fase 6, pode abrir um placeholder limpo por enquanto).
     - `[ 📞 Desligar ]`: Botão vermelho que executa `webrtcEngine.leaveVoiceCall()` mantendo o usuário conectado no chat de texto!
3. Crie `src/components/CallStagePanel.tsx` integrando os modos `'hidden'` (com faixa convite esmeralda caso haja irmãos em call na sala!), `'grid'`, `'spotlight'` (com HUD de Telemetria ABR, duplo clique para Fullscreen, mute do stream e tira horizontal de mini-cards dos irmãos!) e `'minimized'`, além da barra `StageResizeHandle` na borda inferior para o usuário arrastar e ajustar a altura livremente.
4. Conecte o `CallStagePanel` na parte superior do `MainWorkspace` em `src/App.tsx` e remova os antigos `ParticipantSidebar.tsx`, `VideoStage.tsx`, `ControlBar.tsx` e `RoomHeader.tsx` se já não forem mais importados.
5. Rode `npm run build` garantindo 0 erros e marque a **Fase 4** como `[x]` no `PROGRESS.md`.
```

---

### 🟢 FASE 5 — Chat de Texto P2P Sincronizado + Emojis + Reações

> **Quando usar:** Após a Fase 4 compilar sem erros (abra Novo Chat!).
> **Objetivo:** Construir toda a metade inferior da tela principal: o Chat de Texto estilo Discord minimalista com histórico sincronizado entre os irmãos, Emoji Picker categorizado, Jumbo Emojis e reações clicáveis.

```markdown
Leia `SDD.md` (Seções 3, 4, 5.2 e 6.5) e `PROGRESS.md`.

Sua tarefa AGORA é executar **APENAS a Fase 5 (Chat de Texto Completo + Emoji Picker + Reações P2P)**:

1. Crie `src/components/EmojiPickerPopover.tsx` (Seção 6.5 do `SDD.md`):
   - Construído com `Popover`, `Input` de busca (português/inglês), `Tabs` de categorias (`Recentes`, `Rostos & Emoções`, `Gestos & Pessoas`, `Jogos & Atividades`, `Comida`, `Símbolos & Fogos`) e `ScrollArea` do `shadcn/ui`, com pelo menos ~250 emojis populares bem organizados e persistência dos emojis recentes no `localStorage`.
2. Crie `src/components/TextChatSection.tsx` ocupando a metade inferior (`flex-1 min-h-[200px] flex flex-col bg-background`) do `MainWorkspace`:
   - **Lista de Mensagens (`ScrollArea`):**
     - Estado vazio elegante quando a sala ainda não tem mensagens (*"Bem-vindo à sala #{roomId}! As mensagens são sincronizadas P2P entre você e seus irmãos."*).
     - Agrupamento estilo Discord: mensagens seguidas do mesmo autor em menos de 5 minutos ficam agrupadas sem repetir Avatar/Nome (mostrando hora discreta no hover).
     - Separadores sutis de data quando muda o dia.
     - **Jumbo Emojis:** quando a mensagem tiver apenas de 1 a 3 emojis e nenhum texto comum, renderize em `text-4xl`.
     - **Links clicáveis** (`http/https`) seguros e suporte a quebra de linha (`Shift+Enter`).
     - **Mensagens de sistema / soundboard** sutis e elegantes.
     - **Hover Action Bar & Reações:** ao passar o mouse numa mensagem, exibe barra flutuante minimalista no canto superior direito com 4 reações rápidas (`👍`, `😂`, `🔥`, `❤️`) + botão `+` abrindo `EmojiPickerPopover`. Renderize abaixo da mensagem as pílulas de reações ativas (`[ 😂 2 ]`) clicáveis via `webrtcEngine.toggleMessageReaction`.
     - Auto-scroll inteligente com botão flutuante `"⬇ Novas mensagens"` quando o usuário estiver lendo mensagens antigas lá em cima.
   - **Indicador de Digitação (`TypingIndicator`):** exibe `"Irmão X está digitando..."` com debounce automático de 2.5s conectado a `webrtcEngine.sendTypingState`.
   - **Barra de Composição (`ChatComposer`):** textarea auto-expansível (`Enter` envia, `Shift+Enter` pula linha), atalho para Soundboard, `EmojiPickerPopover` (insere emoji na posição do cursor!) e botão Enviar.
3. Integre `TextChatSection` em `src/App.tsx` logo abaixo do `CallStagePanel`.
4. Rode `npm run build` garantindo 0 erros e marque a **Fase 5** como `[x]` no `PROGRESS.md`.
```

---

### 🟢 FASE 6 — Soundboard Customizável (`.mp3/.wav/.ogg`) & Polimento Final `shadcn/ui`

> **Quando usar:** Após a Fase 5 compilar sem erros (abra Novo Chat!).
> **Objetivo:** Finalizar o Soundboard estilo Discord (com importação de áudios próprios dos irmãos!), refatorar `SettingsModal` e `ScreenPickerModal` para `Dialog` do `shadcn/ui`, e fazer a revisão geral de acabamento.

```markdown
Leia `SDD.md` (Seções 5.3, 6.6, 6.7 e 7) e `PROGRESS.md`.

Sua tarefa AGORA é executar **a Fase 6 Final (Soundboard Customizável + Refatoração `shadcn/ui` dos Modais + Polimento)**:

1. Crie `src/components/AddSoundDialog.tsx` (`Dialog` do `shadcn/ui` conforme Seção 6.6 do `SDD.md`):
   - Upload de arquivo de áudio local (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.webm` até 5MB), seletor de Emoji usando `EmojiPickerPopover`, input de Nome do Efeito, `Slider` de volume padrão do som e botão **`Ouvir Preview`** antes de salvar no `storageDb` (`IndexedDB`) e atualizar a store.
2. Crie `src/components/SoundboardPopover.tsx` conforme Seção 6.6 do `SDD.md`:
   - Conecte-o tanto ao botão `[ 🔊 Soundboard ]` do `CallControlDock` quanto ao botão de Soundboard rápido do `RoomTopBar` / `ChatComposer`.
   - Exiba busca instantânea, `Slider` de volume do Soundboard, botão `Parar Sons` (`soundboardEngine.stopAll()`), grade `grid-cols-3` com os 8 efeitos nativos + todos os efeitos customizados salvos pelo usuário (com opção de favoritar `⭐` e excluir `🗑️` os customizados), e botão **`+ Adicionar Efeito Sonoro`** abrindo o `AddSoundDialog`.
   - Ao clicar em um som, dispare `webrtcEngine.triggerSoundboardClip(clip)` para tocar localmente, mixar no WebRTC para todos os irmãos na chamada e disparar a animação visual no `UserCallCard` + registro opcional no chat!
3. Refatore `src/components/SettingsModal.tsx` e `src/components/ScreenPickerModal.tsx` (Seção 6.7 do `SDD.md`):
   - Substitua os overlays manuais e `<select>` HTML antigos por `Dialog`, `Tabs`, `DropdownMenu`, `Slider`, `Switch` e `Button` do `shadcn/ui`, mantendo 100% das configurações de estúdio (Krisp Worklet, High-Pass 80Hz, AGC, Echo, 720p–4K, 24–60 FPS, Áudio do Sistema Estéreo 256kbps e seletor de cor do Avatar).
4. Faça uma revisão final contra todos os **7 Critérios de Aceite da Seção 7 do `SDD.md`**, remova qualquer código morto ou import não utilizado, rode `npm run build` garantindo **0 erros** e marque a **Fase 6** como `[x]` no `PROGRESS.md`.
```

---

## Parte 4: Dica Extra se o Agente Travar ou Desviar no Meio do Caminho

Se em qualquer momento você notar que o Agente inventou alguma cor estranha, colocou um `<select>` feio ou esqueceu algum comportamento, basta mandar esta frase curta:

> *"Pare e releia a Seção [X] do `SDD.md`. Seu código violou o padrão `shadcn/ui` Zinc Dark / contrato definido lá. Ajuste apenas este ponto seguindo estritamente o `SDD.md` e rode `npm run build`."*

Como o `SDD.md` está salvo dentro do projeto com todos os contratos de rede, cores, wireframes e regras de mixagem de áudio documentados, essa frase corrige o rumo do Agente imediatamente!
