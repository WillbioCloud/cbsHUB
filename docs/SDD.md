# SDD (Software Design Document) — cbsHUB v2.0
**Arquitetura P2P Mesh (3–6 Usuários), Interface Estilo Discord Group Call + Minimalismo `shadcn/ui`, Chat de Texto Sincronizado, Emojis & Soundboard Customizável**

---

## 0. Instrução de Papel para o Agente de IA (System Role & Guardrails)

Você está atuando como **Staff Frontend & WebRTC Systems Engineer** e **Principal Product Designer (especialista em `shadcn/ui` e interfaces desktop inspiradas no Discord)** no projeto **cbsHUB** (aplicativo desktop em **Electron 33 + React 18 + TypeScript 5 + Vite 5 + TailwindCSS 3 + Zustand + PeerJS**).

### Regras Inegociáveis de Execução
1. **Fonte Única da Verdade:** Este `SDD.md` define toda a arquitetura visual, contratos de dados, topologia de rede e comportamento de componentes. **Não invente layouts alternativos, cores neon arbitrárias ou fluxos fora desta especificação.**
2. **Preservação do Motor de Mídia Existente:** Você **NÃO DEVE** remover nem regredir funcionalidades críticas já implementadas no código atual:
   - Pipeline de áudio 48 kHz com `KrispLikeNoiseGateProcessor` via `AudioWorklet`, filtro High-Pass 80Hz, Low-Pass 14kHz e Compressor (`src/lib/audioPipeline.ts`).
   - SDP Munging Opus 64kbps (voz com FEC/DTX) e Opus Stereo 256kbps CBR (tela compartilhada) + configuração de `degradationPreference = 'maintain-framerate'` (`src/lib/sdpMunger.ts`).
   - Algoritmo ABR (Adaptive Bitrate) em 720p/1080p/1440p/2160p até 60 FPS e HUD de telemetria (`src/lib/webrtcEngine.ts` e `src/components/VideoStage.tsx`).
   - Ponte IPC do Electron `window.cbsHubAPI` (`src/types/cbshub.d.ts`) — **não altere assinaturas de `window.cbsHubAPI`**, pois o processo principal do Electron depende exatamente delas (`getDesktopSources`, `setCaptureSource`, `minimizeWindow`, `maximizeWindow`, `closeWindow`, `setAlwaysOnTop`).
3. **Design Minimalista `shadcn/ui` Real:** Substitua caixas pesadas, bordas grossas azuladas e `<select>` HTML nativos por componentes reais do padrão **`shadcn/ui` (estilo New York, tema Zinc Dark)** construídos sobre primitivos `@radix-ui/*`.
4. **Execução Incremental por Fases:** Nunca tente reescrever todo o projeto em uma única resposta. Siga estritamente a fase solicitada pelo desenvolvedor, valide a compilação com `npm run build` (`tsc && vite build`) ao final de cada fase e mantenha zero erros de TypeScript.

---

## 1. Diagnóstico da Base Atual vs. Estado Alvo (v2.0)

| Aspecto | Estado Atual (v1.0) | Estado Alvo (v2.0 — Este SDD) |
| :--- | :--- | :--- |
| **Topologia P2P** | Limitada a 1v1 (`remotePeerId` único, `dataConn` único, `remoteAudioElement` único). Se um 3º irmão entra, sobrescreve a conexão. | **Mesh P2P de 3 a 6 participantes simultâneos** com Peer Beacon de descoberta + sessões independentes (`Map<string, PeerSession>`) por participante. |
| **Separação Sala vs. Ligação** | Conectar na sala força chamada imediata; desligar expulsa da sala inteira. | **Estilo Discord Group DM:** entrar na sala conecta imediatamente ao **Chat de Texto + Presença**. Entrar/Sair da **Chamada de Voz/Vídeo** é independente. |
| **Layout Principal** | Sidebar larga (`w-80`) com inputs redundantes ("Seu ID" e "ID do Irmão" editando o mesmo estado), sem chat, e barra inferior ocupando toda a janela. | **Layout Discord DM Call + `shadcn/ui`:** Sidebar enxuta (`240px`) à esquerda + Área Principal dividida entre **Palco Superior de Cards (retrátil/redimensionável, com barra de controles da call integrada)** e **Chat de Texto Completo na parte inferior**. |
| **Seleção de Dispositivos** | Escondida dentro de um modal grande com `<select>` nativo feio. | **Split-Buttons estilo Discord** direto na barra da chamada (`[Mic \| ▾]`, `[Fone \| ▾]`, `[Vídeo \| ▾]`) abrindo `DropdownMenu`/`Popover` do `shadcn/ui` para trocar microfone/saída/câmera em 1 clique + modal completo de estúdio refinado. |
| **Chat de Texto** | Inexistente. | **Chat P2P Completo** com histórico persistido localmente em **IndexedDB** + **Sincronização P2P automática** das últimas mensagens quando um irmão entra na sala, indicador de digitação, links clicáveis e agrupamento por autor. |
| **Emojis** | Inexistente. | **Emoji Picker (`Popover` categorizado com busca e recentes)**, **Jumbo Emojis** (1–3 emojis ficam grandes) e **Reações por mensagem** sincronizadas via P2P. |
| **Soundboard (Efeitos Sonoros)** | Apenas bipes sintetizados de sistema (`sounds.ts`). | **Soundboard Customizável:** efeitos padrão + **upload de áudios próprios (`.mp3`, `.wav`, `.ogg`)** salvos no IndexedDB, mixados direto no grafo WebAudio pós-NoiseGate (todos os irmãos ouvem na hora via WebRTC sem servidor) + animação flutuante no Card de quem tocou. |

---

## 2. Design System: `shadcn/ui` Minimalista + Ergonomia Discord

### 2.1 Filosofia Visual
O visual deve unir **a organização espacial familiar do Discord (Chamada de Grupo / DM)** com **a estética limpa, sóbria e minimalista do `shadcn/ui` (estilo New York / Zinc Dark)**:
- **PROIBIDO:** Fundos azul-marinho saturados (`#12141c`, `#181a26`), sombras neon exageradas, gradientes chamativos, bordas de `2px` desnecessárias, `<select>` ou `<input type="range">` HTML puros sem estilização Radix, textos caixa-alta excessivos em todo lugar.
- **OBRIGATÓRIO:** Paleta neutra **Zinc/Onyx** de altíssimo contraste sutil, bordas de `1px` translúcidas (`border-white/[0.07]` / `hsl(var(--border))`), cantos consistentes (`rounded-lg` e `rounded-xl`), ícones `lucide-react` com `strokeWidth={1.75}` (`w-4 h-4`), `Tooltip` instantâneo (`delayDuration={150}`) em todos os botões de ícone e transições suaves (`150ms cubic-bezier`).

### 2.2 Tokens CSS (`src/index.css`) e Tailwind (`tailwind.config.js`)
Configure as variáveis CSS oficiais do `shadcn/ui` no `:root` / `.dark` em `src/index.css`:

```css
@layer base {
  :root {
    --background: 240 10% 6%;          /* #0e0e11 - Fundo principal do Chat */
    --foreground: 240 5% 96%;          /* #f4f4f6 - Texto primário */

    --card: 240 8% 9%;                 /* #151518 - Cards de usuário / superfícies */
    --card-foreground: 240 5% 96%;

    --popover: 240 9% 10%;             /* #17171c - Menus, Emoji Picker, Soundboard */
    --popover-foreground: 240 5% 96%;

    --primary: 235 86% 65%;            /* #5865F2 - Blurple refinado para ações de call/live */
    --primary-foreground: 0 0% 100%;

    --secondary: 240 6% 14%;           /* #212126 - Botões secundários / controles neutros */
    --secondary-foreground: 240 5% 90%;

    --muted: 240 6% 13%;               /* #1f1f24 */
    --muted-foreground: 240 5% 60%;    /* #94949e - Timestamps, legendas */

    --accent: 240 6% 16%;              /* #26262c - Hover em itens de menu/lista */
    --accent-foreground: 240 5% 98%;

    --destructive: 358 85% 60%;        /* #f23f43 - Mute ativo, Desligar chamada */
    --destructive-foreground: 0 0% 100%;

    --success: 145 65% 42%;            /* #25b05c - Anel de fala, Entrar na call, Ping bom */
    --warning: 38 92% 50%;             /* #f59e0b - ABR throttled / reconexão */

    --border: 240 6% 15%;              /* #242429 - Divisor 1px discreto */
    --input: 240 6% 15%;
    --ring: 235 86% 65%;
    --radius: 0.625rem;                /* 10px */
  }
}
```

Superfícies semânticas da janela (hierarquia estilo Discord Onyx):
- **TitleBar & Palco Superior de Chamada (`CallStagePanel`):** `#09090b` (`bg-zinc-950`) — destaca os cards de vídeo/usuários com profundidade.
- **Sidebar Esquerda (`LeftSidebar`):** `#111114` com `border-r border-border`.
- **Área do Chat (`TextChatSection`):** `#16161a` (`bg-background`).
- **User Pod (Rodapé da Sidebar):** `#0c0c0f` com `border-t border-border`.

### 2.3 Dependências Necessárias (`package.json`)
Instalar os pacotes oficiais para suportar os componentes `src/components/ui/*` do `shadcn/ui`:
- `@radix-ui/react-avatar`
- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-popover`
- `@radix-ui/react-scroll-area`
- `@radix-ui/react-separator`
- `@radix-ui/react-slider`
- `@radix-ui/react-slot`
- `@radix-ui/react-switch`
- `@radix-ui/react-tabs`
- `@radix-ui/react-tooltip`
- `class-variance-authority`
- `tailwindcss-animate`

Crie em `src/components/ui/` os primitivos limpos e reutilizáveis do `shadcn/ui`:
`button.tsx`, `badge.tsx`, `avatar.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`, `scroll-area.tsx`, `slider.tsx`, `switch.tsx`, `tabs.tsx`, `input.tsx`, `separator.tsx`.

---

## 3. Arquitetura Espacial da Interface (Layout Discord DM Call)

```text
+--------------------------------------------------------------------------------------------------+
| [=] cbsHUB                        [● Sala #irmandade • 18ms]                    [📌] [—] [□] [✕] | <- TitleBar (36px)
+------------------------+-------------------------------------------------------------------------+
| SALA ATUAL             | # cbs-irmandade   [3 online]          [📞 Ligar/Na Call] [🔊] [📊] [👥] | <- RoomTopBar (48px)
| [# cbs-irmandade  📋]  +-------------------------------------------------------------------------+
| [Trocar / Nova Sala ]  |                                                                         |
|                        |   +---------------+   +---------------+   +------------------------+    |
| SALAS RECENTES         |   |    (Avatar)   |   |   (Webcam)    |   | 🔴 AO VIVO 1080p 60FPS |    | <- CallStagePanel
|  # cbs-irmandade    ●  |   |     Will      |   |    Irmão 1    |   |    Tela de Irmão 2     |    |    (Topo Retrátil &
|  # gameplay-4k         |   |  🟢 Falando   |   |               |   |   [🔍 Expandir Foco]   |    |     Redimensionável)
|  # cinema              |   +---------------+   +---------------+   +------------------------+    |
|                        |                                                                         |
| NA SALA — 3            |        [🎤|▾]  [🎧|▾]  [📷|▾]  [🖥️ Tela]  [🔊 Sons]  [📞 Sair]          | <- CallControlDock
|  🟢 Will (Você)    🎤  +-------------------------------------------------------------------------+ <- ResizeHandle / Collapse
|  🟢 Irmão 1        🎤  |  Hoje às 21:14                                                          |
|  🟢 Irmão 2      🔴📺  |  (W) Will  21:14                                                        |
|  (Clique -> Volume %)  |      Bora entrar na call, abri o jogo aqui!                             | <- TextChatSection
|                        |      [🔥 2] [😂 1]                                                      |    (Parte Inferior
|                        |                                                                         |     Sempre Visível)
|                        |  (I) Irmão 1  21:15                                                     |
|                        |      🚀🚀                                           (Jumbo Emojis 36px) |
|                        |                                                                         |
|                        |  🔊 Irmão 2 tocou " 😂 Risada " no Soundboard — 21:16                   |
|                        |                                                                         |
+------------------------+  💬 Irmão 1 está digitando...                                           |
| (W) Will     [🎤][🎧][⚙]|  [ Conversar em #cbs-irmandade...                    [🔊] [😀] [➤] ]   | <- ChatComposer
+------------------------+-------------------------------------------------------------------------+
  LeftSidebar (240px)                       MainWorkspace (flex-1 min-w-0)
```

### Comportamento Responsivo dos Painéis
1. **`LeftSidebar` (`w-60` / `240px`, colapsável em telas `< 900px`):**
   - **Seção 1 — Conexão Rápida de Sala:** Input compacto com `#slug-da-sala`, botão `Conectar/Trocar` e botão `Copiar Nome da Sala` com feedback `Check`.
   - **Seção 2 — Salas Favoritas / Recentes:** Lista salva no `localStorage` com as últimas salas usadas pelos irmãos (troca com 1 clique).
   - **Seção 3 — Membros na Sala (`NA SALA — N`):** Lista em tempo real de todos conectados na sala (mesmo quem está só no chat e quem está na call). Clicar em qualquer irmão abre um **`Popover` de Perfil Rápido** contendo:
     - Nome, Ping/Status, badge se está transmitindo tela.
     - **`Slider` de Volume Individual (`0%` a `200%`, padrão `100%`)** exclusivo daquele irmão + botão `Mutar localmente`.
   - **Rodapé — `UserStatusPod` (`h-14`):** Igual ao canto inferior esquerdo do Discord: `Avatar` com bolinha de status e anel verde ao falar, `nickname` (clique abre edição rápida de apelido), e 3 `Button variant="ghost" size="icon"` compactos: `Mute`, `Deafen` e `SettingsModal` (`⚙️`).

2. **`CallStagePanel` (Região Superior da Área Principal — acima do Chat):**
   - **Estados de Exibição (`callStageMode`):**
     - `'hidden'`: Quando ninguém na sala está em chamada de voz e o usuário fechou o painel (apenas o `RoomTopBar` fica no topo com o botão verde **`Ligar / Entrar na Voz`**; se algum irmão iniciar chamada na sala, aparece uma faixa sutil esmeralda no topo: *"2 irmãos estão na chamada de voz — [Entrar na Chamada]"*).
     - `'grid'` (Padrão ao entrar na call — altura inicial `280px`, redimensionável arrastando a borda inferior entre `180px` e `75vh`): Exibe os **Cards de cada Usuário (`UserCallCard`)** lado a lado em grid responsivo centralizado (`grid-cols-2`, `grid-cols-3`, etc.).
     - `'spotlight'` (Modo Foco 4K60 — altura padrão `58vh` ou Tela Cheia com duplo clique): Ativado ao clicar em qualquer card de **Transmissão de Tela** ou **Webcam**. O stream focado ocupa o palco principal com o HUD de Telemetria opcional (`1080p/4K • 60 FPS • Mbps • RTT • ABR`), e logo abaixo do vídeo aparece uma **tira horizontal compacta (`h-20`)** com os mini-cards dos irmãos (para continuar vendo quem está falando!).
     - `'minimized'` (`h-12`): Barra compacta no topo quando o usuário quer ler bastante texto sem sair da ligação, exibindo mini-avatares de quem está falando + mini botões `[Mic] [Deafen] [Expandir] [Desligar]`.

3. **`CallControlDock` (Barra de Controles da Ligação — dentro do `CallStagePanel`, centralizada na base):**
   Deve usar o padrão **Split-Button do Discord** (`bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-1.5 shadow-xl flex items-center gap-1.5`):
   - **1. Split-Button Microfone `[ 🎤 | ▾ ]`:**
     - Botão principal: alterna `isMuted` (`bg-secondary` normal, `bg-destructive text-white` quando mutado).
     - Botão `▾` (`DropdownMenu` / `Popover` `shadcn`):
       - Lista de **Dispositivos de Entrada (`audioinput`)** com `Check` no selecionado (troca em tempo real sem fechar a call).
       - `Slider` rápido de **Ganho do Microfone (`0% – 200%`)** + mini barra de VU Meter ao vivo.
       - `Switch` rápido: **Supressão Neural de Ruído (Krisp Worklet)**.
   - **2. Split-Button Áudio / Fone `[ 🎧 | ▾ ]`:**
     - Botão principal: alterna `isDeafened` (ao ativar Deafen, silencia todo áudio recebido e força `isMuted` visualmente ou restaura estado anterior ao desativar, igual ao Discord).
     - Botão `▾`: Lista de **Dispositivos de Saída (`audiooutput` via `setSinkId`)** + `Slider` de **Volume Mestre da Call (`0% – 100%`)**.
   - **3. Split-Button Câmera `[ 📷 | ▾ ]`:**
     - Botão principal: liga/desliga Webcam (`webrtcEngine.toggleWebcam()`).
     - Botão `▾`: Lista de **Webcams (`videoinput`)**.
   - **4. Botão Compartilhar Tela `[ 🖥️ Tela ]`:**
     - Se inativo: abre o `ScreenPickerModal` (refatorado com `Dialog` e `Tabs` do `shadcn/ui`).
     - Se ativo (`isScreenSharing === true`): botão fica destacado com dropdown rápido: `Trocar Tela / Resolução` ou `Parar Transmissão`.
   - **5. Botão Soundboard `[ 🔊 Efeitos ]`:**
     - Abre o `SoundboardPopover` flutuante logo acima do botão (grade de efeitos sonoros, busca, favoritos, volume dos efeitos e botão `+ Adicionar Som`).
   - **6. Botão de Ligação `[ 📞 Desligar ]` / `[ 📞 Entrar ]`:**
     - Se `inVoiceCall === true`: botão `variant="destructive"` desconecta **apenas da voz/vídeo**, mantendo o usuário conectado na sala de texto!
     - Se `inVoiceCall === false`: botão verde esmeralda conecta a voz/vídeo imediatamente.

---

## 4. Contratos de Dados e Interfaces TypeScript (`src/types/cbshub.d.ts`)

Adicione/atualize as interfaces abaixo mantendo 100% intacta a interface `CbsHubElectronAPI`:

```typescript
export interface Participant {
  peerId: string;
  clientId: string;          // UUID persistente por instalação no localStorage (para manter avatar/volume/autoria)
  nickname: string;
  avatarColor: string;       // Cor HSL/Hex consistente gerada ou escolhida pelo usuário
  isLocal: boolean;
  inVoiceCall: boolean;      // true = está com voz ativa no CallStagePanel; false = apenas na sala de texto
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  speakingLevel?: number;    // 0 a 100 em tempo real para modular o halo verde dos avatares
  isWebcamActive: boolean;
  isScreenSharing: boolean;
  screenQualityLabel?: string; // Ex: "1080p 60FPS"
  rttMs?: number;
  activeSoundEffect?: {      // Para exibir animação flutuante no UserCallCard quando tocar Soundboard
    emoji: string;
    name: string;
    expiresAt: number;
  } | null;
}

export interface ChatReaction {
  emoji: string;
  reactorClientIds: string[]; // Lista de clientIds que reagiram com este emoji
  reactorNicknames: Record<string, string>;
}

export interface ChatMessage {
  id: string;                 // UUID v4 único para deduplicação P2P
  roomId: string;
  type: 'user' | 'system' | 'soundboard';
  authorClientId: string;
  authorNickname: string;
  authorAvatarColor: string;
  content: string;
  createdAt: number;          // Epoch ms
  reactions: Record<string, ChatReaction>; // chave = emoji
  soundMeta?: {
    emoji: string;
    soundName: string;
  };
}

export interface SoundboardClip {
  id: string;
  name: string;
  emoji: string;
  isBuiltIn: boolean;         // true = som sintetizado/embutido; false = arquivo importado pelo usuário
  audioBlob?: Blob;           // Armazenado no IndexedDB para clipes customizados (.mp3, .wav, .ogg)
  synthPreset?: 'airhorn' | 'vineboom' | 'cricket' | 'tada' | 'sad_trombone' | 'coin' | 'drumroll' | 'bruh';
  volume: number;             // 0.0 a 1.5 (padrão 0.85)
  isFavorite: boolean;
  createdAt: number;
}
```

### Protocolo de Mensagens P2P via `DataConnection` (`SignalingPacket`)
União discriminada estrita trafegada em JSON/binário pelo PeerJS `DataConnection`:

```typescript
export type SignalingPacket =
  // Descoberta & Presença Mesh
  | { type: 'directory_request'; peerInfo: Omit<Participant, 'isLocal'> }
  | { type: 'directory_response'; peers: Array<Omit<Participant, 'isLocal'>> }
  | { type: 'peer_state_sync'; state: Omit<Participant, 'isLocal'> }
  | { type: 'speaking'; peerId: string; isSpeaking: boolean }
  | { type: 'screen_stopped'; peerId: string }

  // Chat de Texto & Sincronização P2P (IndexedDB)
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'chat_reaction_toggle'; messageId: string; emoji: string; clientId: string; nickname: string }
  | { type: 'chat_typing'; clientId: string; nickname: string; isTyping: boolean }
  | { type: 'chat_sync_request'; roomId: string; sinceTimestamp: number; knownIds: string[] }
  | { type: 'chat_sync_response'; roomId: string; messages: ChatMessage[] }

  // Soundboard Visual Event
  | { type: 'soundboard_triggered'; peerId: string; clientId: string; nickname: string; emoji: string; soundName: string };
```

---

## 5. Arquitetura Técnica dos Motores Core

### 5.1 Topologia Mesh P2P para 3 a 6 Irmãos (`src/lib/webrtcEngine.ts`)
Refatore `WebRTCEngine` para eliminar o acoplamento 1v1, adotando **Beacon de Descoberta + Malha Direta (`Full Mesh`)**:

1. **Separação `beaconPeer` vs. `localPeer` (Zero Queda na Migração de Host):**
   - Todo cliente cria seu próprio `localPeer` com ID estável na sessão: `cbshub-v2-${slug}-p-${shortId}`. Todas as chamadas de mídia (`voice`, `screen`, `webcam`) e `DataConnection` de chat ocorrem entre `localPeer`s!
   - Paralelamente, o cliente tenta alocar `beaconPeer = new Peer('cbshub-v2-' + slug + '-beacon', PEER_CONFIG)`:
     - **Se conseguir abrir:** este cliente atua silenciosamente como **Diretório da Sala**, mantendo a lista de `peerId`s ativos (máximo 6 peers). Quando um novo irmão consulta o beacon via `directory_request`, o beacon devolve `directory_response` com todos os `localPeer` IDs presentes na sala.
     - **Se receber `unavailable-id`:** já existe um irmão com o beacon! O cliente conecta temporariamente ao `cbshub-v2-${slug}-beacon`, recebe a lista `peers` e abre `DataConnection` direta (`localPeer.connect(remotePeerId)`) para **cada irmão da lista**.
     - **Auto-Heal do Beacon:** se o irmão que segurava o beacon sair da sala, após um backoff determinístico baseado na ordenação alfabética dos `clientId`s restantes (`index * 400ms`), o próximo irmão assume `cbshub-v2-${slug}-beacon` em background **sem interromper nenhuma chamada de voz ou tela ativa**!

2. **Sessões Isoladas por Participante (`Map<string, PeerMediaSession>`):**
   Cada irmão conectado possui sua própria instância em `sessions: Map<string, PeerMediaSession>` contendo:
   - `dataConn: DataConnection`
   - `voiceCall: MediaConnection | null`
   - `webcamCall: MediaConnection | null`
   - `screenCall: MediaConnection | null`
   - `voiceAudioEl: HTMLAudioElement` (individual! Permite controlar `volume` por irmão `0.0–1.0` + `GainNode` se `> 100%` até `200%`, além de `setSinkId(outputDeviceId)` e `muted = isDeafened`).
   - `remoteVoiceDetector` (ou recepção de pacotes `speaking` com debounce de 150ms).

3. **Canais de Mídia (`call.metadata.channel`):**
   - `channel: 'voice'` -> Usa `enhanceOpusSdp(sdp, false)` (Opus 64kbps mono, FEC, DTX). Iniciado para todos os peers que também estão com `inVoiceCall === true`.
   - `channel: 'webcam'` -> Stream 720p@30fps exibido dentro do `UserCallCard` daquele irmão.
   - `channel: 'screen'` -> Usa `enhanceOpusSdp(sdp, true)` (Opus Stereo 256kbps CBR + Vídeo até 4K60 com `configureVideoSender` e loop ABR de `webrtcEngine.ts`). Quando um irmão inicia transmissão de tela, ele abre chamadas `channel: 'screen'` para cada irmão que está na call de voz (e se um novo irmão entrar na call depois, recebe automaticamente a chamada `screen` ativa!).

### 5.2 Persistência Local IndexedDB + Sync P2P (`src/lib/storageDb.ts`)
Crie um módulo leve e tipado sobre `window.indexedDB` (banco `cbshub_local_db`, versão `1`), sem dependências externas pesadas:
- **Store `messages`:** `keyPath: 'id'`, índice `by_room_time: ['roomId', 'createdAt']`.
  - Mantém até 500 mensagens por `roomId`.
  - **Fluxo de Sincronização P2P ao Conectar:**
    1. Ao abrir `DataConnection` com um irmão, o cliente carrega do seu IndexedDB as mensagens locais da `roomId` atual e envia `chat_sync_request` com os últimos `knownIds` (últimas 100 mensagens).
    2. O par responde com `chat_sync_response` contendo quaisquer mensagens das últimas 100 daquela `roomId` que não constem em `knownIds`.
    3. O receptor faz merge idempotente por `message.id`, ordena por `createdAt ASC` e persiste no IndexedDB local.
- **Store `soundboard_clips`:** `keyPath: 'id'`, armazena metadados + `audioBlob: Blob` dos arquivos `.mp3`, `.wav`, `.ogg` adicionados pelo usuário (limite de validação: 5 MB e até 15 segundos por efeito sonoro para evitar travamentos).

### 5.3 Mixagem WebAudio do Soundboard em Tempo Real (`src/lib/audioPipeline.ts` + `src/lib/soundboardEngine.ts`)
**Detalhe Arquitetural Crítico (Não erre isso!):**
Para que qualquer efeito sonoro customizado (`.mp3`/`.wav`/`.ogg`) adicionado por um irmão seja ouvido **instantaneamente e com qualidade limpa** por todos os outros irmãos na call sem precisar enviar arquivos pela rede:

1. No `VoiceAudioPipeline` (`src/lib/audioPipeline.ts`):
   - Separe o controle de **Mute do Microfone** do `destinationNode`! Quando `isMuted === true`, zere o ganho de `this.micMuteGainNode` (ou desabilite apenas a entrada de voz antes do `destinationNode`), **NÃO desabilite `processedStream.getAudioTracks()[0].enabled`** enquanto um som do Soundboard estiver tocando (ou crie um `soundboardInputNode: GainNode` conectado diretamente em `this.destinationNode` **após** o `KrispLikeNoiseGateProcessor` e os filtros High-Pass/Low-Pass, para que graves e caudas dos efeitos sonoros não sejam cortados pelo Noise Gate!).
   ```text
   [Microfone] -> HighPass(80Hz) -> LowPass(14kHz) -> KrispWorklet -> Compressor -> MicGain -> MicMuteNode --+
                                                                                                             |--> [destinationNode (WebRTC)]
   [SoundboardEngine (BufferSource / Synth)] -> SoundboardGainNode ------------------------------------------+
                                                      |
                                                      +--> [audioCtx.destination (Retorno Local nos Fones)]
   ```
2. Crie `src/lib/soundboardEngine.ts`:
   - Reutiliza o `AudioContext` (48 kHz) do `VoiceAudioPipeline` quando ativo (ou contexto local se fora da call).
   - Suporta **8 efeitos embutidos** gerados via Web Audio síntese rica (`airhorn`, `vineboom`, `tada`, `cricket`, `sad_trombone`, `coin`, `drumroll`, `bruh`) para funcionar de fábrica no primeiro segundo + **quantos efeitos customizados o usuário adicionar** via upload de arquivo (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.webm`).
   - Possui botão `Parar Todos os Sons` (`stopAll()`) caso alguém toque um áudio longo.
   - Ao tocar um efeito, dispara simultaneamente `webrtcEngine.broadcast({ type: 'soundboard_triggered', ... })` para:
     1. Mostrar um badge flutuante animado (`animate-bounce` / `fade-in`) no `UserCallCard` de quem tocou por 3 segundos (`🔊 🎺 Corneta`).
     2. Opcionalmente registrar um item compacto `type: 'soundboard'` no feed do chat.

---

## 6. Especificação Detalhada dos Componentes Novos / Refatorados

### 6.1 `TitleBar.tsx` + Correção IPC Electron Nativa (Refatorar — `h-9` / `36px`)
- Mais fina e elegante (`h-9 bg-zinc-950 border-b border-border px-3`).
- Esquerda: Ícone minimalista + `cbsHUB` (`font-semibold text-xs tracking-tight`).
- Centro: Pílula discreta mostrando `#roomId` + status da malha (`3 conectados • 16ms` com ponto `bg-emerald-500`, ou `Modo Offline` se desconectado).
- Direita: Botão `Always on Top` (`Pin` com `Tooltip`) + divisória + botões nativos `Minimize`, `Maximize/Restore`, `Close` chamando `window.cbsHubAPI`.
- **Correção Obrigatória de Janela Frameless no Electron (`electron/main.ts`, `electron/preload.ts` e `src/index.css`):**
  1. Em `electron/main.ts`, na criação da `BrowserWindow`:
     - Defina explicitamente `sandbox: false` dentro de `webPreferences` (mantendo `contextIsolation: true` e `nodeIntegration: false`), pois no Electron 33 com `"type": "module"` o preload `.mjs` em modo sandboxed falha silenciosamente e deixa `window.cbsHubAPI` indefinido!
     - No Windows/Linux, use apenas `frame: false` (**remova `titleBarStyle: 'hidden'` fora do macOS**, pois no Windows a combinação `frame: false` + `titleBarStyle: 'hidden'` quebra o `maximize()`/`minimize()` e intercepta cliques no canto superior direito).
     - Garanta que `ipcMain.on('cbs:minimize')`, `ipcMain.on('cbs:maximize')` e `ipcMain.on('cbs:close')` usem `BrowserWindow.fromWebContents(event.sender) || mainWindow` para nunca perder a referência da janela.
  2. Em `src/index.css`, garanta que qualquer botão/interativo dentro de `.drag-region` force `-webkit-app-region: no-drag`:
     ```css
     .drag-region { -webkit-app-region: drag; }
     .no-drag, .drag-region button, .drag-region a, .drag-region input, .drag-region [role="button"] {
       -webkit-app-region: no-drag;
     }
     ```

### 6.1.B `VoiceAvatar.tsx` — Feedback de Voz em Tempo Real nos Ícones de Perfil
- Crie um componente reutilizável `src/components/VoiceAvatar.tsx` usado em **todos** os avatares de usuário da interface (`UserStatusPod` no rodapé esquerdo, lista `NA SALA` na `LeftSidebar`, `UserCallCard` no `CallStagePanel` e barra minimizada).
- **Resposta Visual Instantânea (60fps / Baixa Latência):**
  - Quando `isSpeaking === true` (e `!isMuted`): exibe anel nítido `ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-950` + halo dinâmico em `box-shadow` cuja opacidade/raio reage em tempo real ao `speakingLevel` (`0` a `100`) da voz do participante!
  - **Calibração VAD Realista (`audioPipeline.ts` & `webrtcEngine.ts`):**
    - Limiar de ativação em `-48 dB` (para captar fala natural sem precisar gritar) + **Hold/Hangover de `180ms`** (mantém `isSpeaking = true` por 180ms após o último pico acima do limiar, evitando que o anel verde pisque freneticamente entre sílabas, idêntico ao Discord).
    - No `webrtcEngine.ts`: reutilize o `session.voiceAudioCtx` e `session.voiceSourceNode` já ativos em `setupPeerVoiceAudio` (conectando o `AnalyserNode` **antes** do `voiceGainNode`, garantindo `ctx.resume()`) e atualize `speakingLevel` + `isSpeaking` de cada irmão localmente a ~30fps, além de emitir pacotes `speaking` na rede **apenas quando `isSpeaking` mudar de estado** (transição `false -> true` ou `true -> false`, nunca 22x por segundo sem mudança!).

### 6.2 `LeftSidebar.tsx` (Substitui `ParticipantSidebar.tsx` — `w-60`)
- **Bloco Sala:** `Input` shadcn com prefixo `#`, botão de ação rápida (Conectar / Trocar Sala) e botão `Copy` para copiar o código da sala.
- **Salas Recentes:** Lista clicável das salas salvas (`cbs-irmandade` como default). Botão `+` para criar/entrar em nova sala rapidamente.
- **Lista `NA SALA — N` (`ScrollArea`):**
  - Cada linha exibe `Avatar` (iniciais + cor do participante + indicador verde de presença), `nickname`, badges à direita (`MicOff`, `HeadphoneOff`, badge vermelho `LIVE` se transmitindo tela).
  - Clicar em um irmão abre `Popover` minimalista com `Slider` de **Volume Individual (0% a 200%)** e indicador de latência.
- **`UserStatusPod` no rodapé:** Avatar local, apelido, status `"Na chamada"` ou `"No chat"`, botões `Mute`, `Deafen` e `Settings`.

### 6.3 `RoomTopBar.tsx` (Substitui `RoomHeader.tsx` — `h-12`)
- Fica no topo da coluna direita (`MainWorkspace`).
- Esquerda: Ícone `Hash` + nome da sala em destaque (`font-semibold text-sm`), `Separator orientation="vertical"`, contagem de online.
- Direita:
  - Se `inVoiceCall === false`: Botão **`Entrar na Chamada`** (`bg-emerald-600 hover:bg-emerald-500 text-white h-8 px-3 text-xs font-medium rounded-lg` com ícone `PhoneCall`).
  - Se `inVoiceCall === true`: Botão para alternar modo do palco (`Grid` / `Minimizar Palco`) + badge de tempo de chamada (`04:12`).
  - Botão `Soundboard` rápido, botão `Configurações` (`SlidersHorizontal`) e toggle da Sidebar em janelas menores.

### 6.4 `CallStagePanel.tsx` + `UserCallCard.tsx` + `CallControlDock.tsx` (Substitui `VideoStage.tsx` + `ControlBar.tsx`)
- Renderizado diretamente **acima** do `TextChatSection`!
- **`UserCallCard.tsx`:**
  - Proporção fluida (`aspect-video` com `max-h-52` no modo grid).
  - Borda dinâmica: `border-emerald-500 ring-2 ring-emerald-500/30` suave quando `participant.isSpeaking === true`, caso contrário `border-white/[0.07]`.
  - Se `isWebcamActive`: renderiza `<video>` da webcam do participante.
  - Se `isScreenSharing`: gera um **Card de Transmissão separado** (`Tela de {nickname}`) com preview do vídeo ao vivo, badge `AO VIVO • {resolution}` no canto superior direito, e overlay no hover `"Assistir Transmissão"` que ativa o modo `'spotlight'`.
  - No modo `'spotlight'`: mantém 100% dos recursos do antigo `VideoStage.tsx` (duplo clique para Fullscreen nativo, botão de ocultar/exibir HUD de Telemetria ABR, controle de volume/mute da stream de tela, e botão `"Voltar para Grade"`), adicionando a faixa inferior de mini-cards dos irmãos.
  - Overlay de Soundboard: quando `participant.activeSoundEffect` existe, renderiza pílula flutuante animada no topo do card com o emoji e nome do som.
- ** Divisor Redimensionável (`StageResizeHandle`):**
  - Barra horizontal de `4px` (`cursor-row-resize hover:bg-primary/50 transition-colors`) entre o `CallStagePanel` e o `TextChatSection` para o usuário ajustar livremente quanto espaço quer dar para os cards/vídeo vs. texto!

### 6.5 `TextChatSection.tsx` + `EmojiPickerPopover.tsx`
- **Feed de Mensagens (`ScrollArea`):**
  - Auto-scroll inteligente: rola automaticamente para o fim ao receber nova mensagem **apenas se** o usuário já estiver próximo do final (`< 120px` do fundo). Caso tenha subido para ler histórico, mostra pílula flutuante `"⬇ Novas mensagens não lidas"`.
  - Agrupamento estilo Discord: mensagens consecutivas do mesmo `authorClientId` enviadas em intervalo `< 5 minutos` ficam compactas (sem repetir avatar e nome; exibem hora `21:14` discreta à esquerda no hover).
  - **Detecção de Jumbo Emoji:** regex Unicode que detecta se `content.trim()` possui de 1 a 3 emojis puros e zero caracteres alfanuméricos -> aplica `text-4xl leading-tight py-1`.
  - **URLs clicáveis:** links `http://` ou `https://` renderizados com `text-primary hover:underline` abrindo com segurança (`target="_blank" rel="noopener noreferrer"`).
  - **Barra de Ação por Mensagem (Hover):** aparece no canto superior direito da linha da mensagem com reações rápidas (`👍`, `😂`, `🔥`, `❤️`) + botão `SmilePlus` abrindo `EmojiPickerPopover` para reagir com qualquer emoji.
- **`EmojiPickerPopover.tsx`:**
  - Construído com `Popover`, `Input` (busca em português/inglês), `Tabs` de categorias (`Recentes`, `Rostos`, `Gestos`, `Jogos & Objetos`, `Símbolos`, `Comida`) e `ScrollArea`. Zero travamento e 100% integrado ao tema `shadcn/ui`.

### 6.6 `SoundboardPopover.tsx` + `AddSoundDialog.tsx`
- **`SoundboardPopover.tsx`:**
  - Input de busca `"Buscar efeito sonoro..."` + `Slider` de volume do Soundboard + botão `Square` (`Parar som atual`).
  - Grade `grid-cols-3 gap-2` de botões compactos (`rounded-lg border border-border bg-secondary/50 hover:bg-accent p-2.5 flex flex-col items-center gap-1 text-center`): Emoji em `text-xl` + nome truncado em `text-[11px] font-medium`.
  - Ícone de estrela no hover para favoritar e ícone de lixeira nos sons customizados para excluir do IndexedDB.
  - Botão de destaque no rodapé: **`+ Adicionar Efeito Sonoro`**.
- **`AddSoundDialog.tsx` (`Dialog` shadcn):**
  - Seletor de arquivo de áudio (`accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4"`), validando tamanho `<= 5MB`.
  - Botão **`Testar Som`** (toca preview local antes de salvar).
  - Escolhedor de Emoji (usa `EmojiPickerPopover`), campo `Nome do Efeito` (ex: `"Cavalo"`, `"Headshot"`) e `Slider` de volume padrão daquele clipe.
  - Ao salvar, grava o `Blob` no IndexedDB (`soundboard_clips`) e atualiza imediatamente o Soundboard.

### 6.7 Modais Existentes Refatorados (`SettingsModal.tsx` e `ScreenPickerModal.tsx`)
- Refatore ambos para usar `Dialog`, `Tabs`, `Switch`, `Slider` e `Button` do `shadcn/ui`, removendo os `<select>` HTML brutos e mantendo todas as opções técnicas existentes (Krisp Worklet, High-Pass 80Hz, AGC, Echo Cancellation, 720p/1080p/1440p/4K, 24/25/30/60 FPS, Loopback System Audio Stereo 256kbps).

---

## 7. Critérios de Aceite (Definition of Done)

1. **Build Limpo:** `npm run build` (`tsc && vite build`) executa com **0 erros** de TypeScript e **0 imports quebrados**.
2. **Design `shadcn/ui` Autêntico:** Todas as superfícies usam tokens Zinc Dark neutros, bordas `1px` sutis, `DropdownMenu`/`Popover`/`Dialog`/`Slider`/`Switch`/`Tooltip`/`ScrollArea` do Radix/shadcn. Nenhum `<select>` nativo feio remanescente.
3. **Multi-Peer Real (3–6 Irmãos):** Três ou mais instâncias conectadas na mesma sala se enxergam na lista `NA SALA`, conversam por texto simultaneamente, ouvem uns aos outros na chamada de voz e veem os cards individuais no `CallStagePanel`.
4. **Independência Sala vs. Voz:** Usuário consegue entrar na sala e conversar por texto sem estar na call de voz, entrar na call clicando em `Ligar / Entrar na Chamada`, e sair apenas da call clicando no botão vermelho `Desligar` sem perder o chat de texto.
5. **Split-Buttons na Call:** Os botões de Microfone, Fone e Câmera na parte superior possuem seta `▾` funcional que lista e troca dispositivos de hardware em tempo real.
6. **Chat + Emojis + Sync P2P:** Mensagens enviadas persistem ao recarregar o app (IndexedDB), sincronizam automaticamente quando um irmão entra depois, suportam Jumbo Emojis e reações em tempo real.
7. **Soundboard Customizável:** Usuário consegue importar um arquivo `.mp3`/`.wav`/`.ogg` do PC, escolher emoji e nome, tocar na call, ouvir localmente, fazer todos os irmãos na chamada ouvirem via WebRTC pós-NoiseGate e exibir animação visual no card de quem disparou.
