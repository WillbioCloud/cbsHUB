> Os relatórios de cada fase foram removidos desta árvore; continuam no histórico git (commit `dfa74ba`). Os registros abaixo são históricos.

# Problemas conhecidos

Data: 05/11/2026 (America/Sao_Paulo). Responsável: Codex/OpenAI.
Branch: `audit/cbshub-v2-2026-11-05`. Base auditada: `5deab40aa1629a975dc72588b658569b21494c23`.

P1 = resolver/validar antes de implementar redesign; P2 = corrigir em tarefa delimitada; P3 = melhoria. “Reproduzido” significa executado nesta auditoria; “estático” significa caminho de código identificado, sem teste remoto que comprove o sintoma.

| ID | Prioridade / evidência | Problema, localização e impacto | Próxima validação |
| --- | --- | --- | --- |
| K01 | P1 / reproduzido | `vite.config.ts:35` + merge de `vite-plugin-electron`: formatos ES e CJS escrevem `preload.cjs`. Dev gerou import/export em .cjs e Electron rejeitou. Produção passou em outra execução, portanto build verde não elimina colisão. | Fixar uma única saída CJS por configuração suportada; repetir dev, produção e reload; verificar seis métodos IPC. Não foi corrigido. |
| K02 | P1 / risco estático | `App.tsx:17`, `main.tsx` StrictMode e `webrtcEngine.ts:119,1203`: inicializações assíncronas de sala/microfone sem cancelamento ou identificação de geração. Effects dev repetem, chamadas rápidas podem continuar depois de leaveRoom. | Duplo mount, troca rápida de sala/dispositivo e teardown durante getUserMedia/IndexedDB; contar peers/tracks/contextos. |
| K03 | P1 / estático | `webrtcEngine.ts:553,573,588`: casts de SignalingPacket sem validação runtime; chat_sync_request aceita roomId arbitrário, sem verificar sala da sessão. Pode retornar histórico local de outra sala a um par conectado. Resposta pode substituir o feed ativo sem conferir sala. | Dois perfis/salas, pacote de sala divergente e payload inválido; negar sem ler dados de outra sala. Sem teste de exploração realizado. |
| K04 | P1 / estático | `webrtcEngine.ts:860` cria AudioContext/source locais não registrados na sessão; teardown cancela interval mas não tem referência para fechar esse ctx. `SettingsModal.tsx:76` obtém stream de permissão e não para tracks. | Abrir/fechar modal e entrar/sair de chamadas várias vezes, medir tracks/contexts vivos. |
| K05 | P1 / estático | `setupLocalMicrophone` captura e engole erro; `joinVoiceCall` marca inVoiceCall mesmo sem microfone. `leaveVoiceCall` não encerra captura local/pipeline. Há aquisição automática no App antes de entrar em voz. | Negar permissão e retirar dispositivo; saída da voz deve ter semântica explícita de captura e estado. |
| K06 | P1 / risco estático | `session.webcamCall` e `session.screenCall` guardam um único handle para entrada/saída; `stopScreenShare` fecha handles da sessão sem distinguir direção. Webcam é enviada só a quem está na voz ao ligar; peer_state_sync só reenvia tela, não webcam. | Webcam bidirecional, entrada tardia, dois compartilhamentos simultâneos; encerrar um sem interromper o outro. |
| K07 | P2 / estático | `webrtcEngine.ts:1322` mantém um único timer ABR e o substitui para cada destinatário; receiverStats e telemetry também globais. O último par sobrescreve os demais. | 3 participantes, perdas diferentes e foco alternado; ABR/stats por stream/par. |
| K08 | P2 / estático | `webrtcEngine.ts:799,854,1290` limita HTMLAudioElement.volume a 1; slider/store aceitam 2. Sem GainNode de reprodução, 200% não amplifica além do volume original. | Sinal com mesma entrada em 100% e 200%; reconciliar implementação e contrato sem reintroduzir atraso. |
| K09 | P2 / reproduzido | `SettingsModal.tsx:128` envia peer_state_sync via sendData, mas `webrtcEngine.ts:982` só trata nickname/speaking. Zero broadcasts no probe; cor só muda localmente até outro envio de estado. | Alterar avatar e observar segundo peer sem mudar outra opção. |
| K10 | P2 / reproduzido | `storageDb.ts:346` só alterna favorito se registro já existir. `loadAllClips` não grava defaults nativos. Favorito de som nativo em perfil novo não muda; favorito customizado passou. | Persistir override nativo e testar reload, mantendo presets. |
| K11 | P2 / estático | Sync exclui IDs conhecidos, então não reconcilia reações alteradas offline. Merge de reações usa união sem tombstones; toggle não é idempotente. `saveMessageBatch` limita retorno a 500 mas não apaga registros antigos no banco nesse caminho. | Reconexão após reação/removal, pacote duplicado e batches sucessivos >500. |
| K12 | P2 / estático | Deafen só atualiza elementos de voz. Vídeos de tela em `UserCallCard.tsx:210` e `CallStagePanel.tsx:253` não consultam isDeafened. Sons já iniciados mantêm rota local e preview também ignora deafen (`soundboardEngine.ts:185,210`). | Ativar deafen durante tela com áudio e WAV longo; definir e testar semântica de silenciar toda saída. |
| K13 | P2 / estático | VAD a cada 45ms chama broadcast mesmo sem transição; remoto a 50ms, limiar -42dB, sem hangover. SDD pede -48dB/180ms/speakingLevel/VoiceAvatar, ausentes. Stores amplas + persist podem causar trabalho frequente. | Medir pacotes/renders e calibrar sem prometer “neural”: implementação é gate + noiseSuppression do browser. |
| K14 | P2 / estático | main envia `cbs:window-state-changed`, mas preload não expõe assinatura e TitleBar mantém boolean local. Mudança via SO pode dessincronizar botão maximizar/restaurar. | Maximizar/restaurar por SO e pela UI. |
| K15 | P2 / revisão estática | `sandbox:false`, ausência de CSP explícita, setWindowOpenHandler/will-navigate e validação de origem/argumentos IPC. contextIsolation=true/nodeIntegration=false são preservados. Não é prova de exploração. | Revisar trust boundaries/navegação/permissões antes de distribuição, sem quebrar captura/preload. |
| K16 | P1 para distribuição / audit executado | npm audit: 19 dependências sinalizadas, 1 crítica (tar transitivo), 13 altas, 5 moderadas; diretas incluem Electron, electron-builder e Vite. Nem todo advisory é explorável neste fluxo. | Analisar alcance e preparar atualização aprovada em branch separada, incluindo regressões de mídia e empacotamento. |
| K17 | P2 / ambiente reproduzido | npm ci padrão rejeita resolução de peers do lockfile; --legacy-peer-deps instala sem reescrever. Node/npm não fixados e npmrc ausente. | Formalizar toolchain/opção em tarefa futura; onboarding já salva comando compatível. |
| K18 | P3 / estático | Documentos antigos mencionam tailwind.config.js/tailwindcss-animate, 200% real e conclusão total; pacote diz 1.0.0, UI 2.0. Timer, sidebar toggle e VoiceAvatar pendentes. | Conciliar documentação/versionamento com comportamento verificado; não gerar configuração Tailwind 3. |
| K19 | P2 / revisão estática | Botões sem nome acessível, cards div apenas clicáveis, cores fixas, hsl(var(--primary)) com token HSL completo, tema dark fixo. Avatar/Badge disponíveis não usados. | Auditoria de teclado/contraste/tamanhos; consolidar gradualmente nos primitivos existentes durante redesign. |
| K20 | P2 / risco estático | MAX_ROOM_PEERS limita somente diretório. Conexões duplicadas podem retornar sem fechar conn; eleição/mídia não possuem teste de stress/glare. | 3–6 perfis, 7º membro, entradas simultâneas e queda do beacon. |
| K21 | P2 / observado | Feed oculto offline, mas compositor aceita e salva localmente sem confirmação remota. Um teste de visibilidade expirou embora estado/IndexedDB contivessem a mensagem. | Definir indicação de entrega/offline; preservar histórico e testar retomada de rede. |

## Bloqueios do ambiente, separados de defeitos

- E01: `0.peerjs.com:443` retornou CONNECT 403; domínio salvo no rascunho, ainda não aplicado/publicado. HTTP permitido não basta para mídia P2P/STUN/TURN.
- E02: não há DISPLAY nem dispositivos físicos de teste. Electron/Chromium headless funcionaram; voz real, loopback, GPU/4K60 e Windows não foram verificados.
- E03: TURN opcional ausente; placeholders de `.env.example` não são credenciais. Não é requisito para build ou smoke local.

Nenhum desses problemas foi corrigido em código nesta fase. Não usar `npm audit fix --force`, remover asserts, ocultar erros ou substituir bibliotecas para produzir um status verde.

## Atualização — REDESIGN-001

K21 parcialmente tratado na apresentação: histórico local agora permanece visível offline, com aviso no compositor; entrega remota continua sem confirmação. K19 recebeu foco/nomes/teclado e tokens na camada visual, mas auditoria completa de acessibilidade ainda não foi executada. Demais problemas de motor/build/dependências permanecem. CPU/GPU explicitamente indisponíveis na telemetria; não há coleta ou valores simulados.


## Atualização — STUDIO-001 — 05/11/2026

Studio: sem backend de sincronização; transferir JSON manualmente. LocalStorage pode exceder quota com imagens; gravação falha com aviso e export continua disponível. Cálculo AA cobre pares sólidos, não certifica fundos compostos. Dados locais inválidos usam padrão seguro. Sem validação completa de leitor de tela/Windows/mídia real. Aviso de bundle >500kB e K01 permanecem.


## Atualização — PROFILE-001 — 05/11/2026

Perfis: username só verifica participantes conhecidos, sem reserva global; data é de perfil local; presença manual/invisível não esconde transporte P2P. Sem autorização/criptografia de servidor; bloqueio por clientId pode ser evadido recriando identidade. Campos já compartilhados não podem ser retirados de outros clientes. Teste remoto de perfis usou ponte local, sem ICE real. Quota local e riscos K01 etc permanecem. Novo editor atualiza cor via refreshLocalProfile; helper legado sendData(peer_state_sync) continua ignorando esse formato.


## Atualização — CHAT-002 — 05/11/2026

Chat 2.0: sem backend para ACL/autenticação; histórico relay não assinado, autor pode precisar estar online para recuperar mutações desconhecidas. Journal limitado a 5000 operações/sala; esgotamento dá erro, não limpa silenciosamente. Tombstone é exclusão lógica, sem apagar texto de versões do journal. Markdown é subconjunto seguro; preview não carrega OpenGraph. Retenção/busca local 500 mensagens; clientes antigos não aplicam mutações v2. K01 e demais limitações de mídia permanecem.


## Atualização — MEDIA-001 — 05/11/2026

K04/K05 receberam correções locais: VAD remoto fecha contexto, configurações não capturam para enumerar, mic sob demanda, falha de permissão não entra na voz e saída encerra tracks. K06 recebeu separação entrada/saída e câmera para entrada tardia, testadas com adapters e captura sintética; matriz física pendente. K08: faixa UI/store alinhada à reprodução de 0–100%, sem amplificação 200%. K10: defaults nativos persistidos e favoritos/edição verificados após reload. K12: tela e retorno Soundboard respeitam deafen inclusive durante som; sinalização de sistema não foi redesenhada. K13: pacotes de fala só nas transições e sustentação 180 ms, sem benchmark multipar. K02 mitigado por gerações/cleanup; não declarar concorrência integralmente resolvida.

MEDIA-001: teste WebRTC local não recebeu candidatos ICE e NÃO passou. Sem confirmação em duas máquinas, hotplug físico, saída real de áudio, Electron picker/loopback, rede externa/TURN ou 3–6 pares. K07 continua (ABR/telemetria de tela globais), K01/K16 permanecem. Soundboard mistura efeitos e voz: não há mute independente dos efeitos recebidos, nem ACL de servidor. setSinkId de WebAudio depende do runtime. Ver MEDIA_EXPERIENCE.

## VISUAL-002 — 05/11/2026 — Codex/OpenAI

Branch feat/visual-fixes-2026-11-05, base d046d66 (mídia integrada PR #5). Recuperação recovery/pre-visual-fixes-2026-11-05. Referências recebidas: Clássico preto/compacto/sidebar tradicional e Moderno com navegação e membros; Moderno agora roxo. Preservados shadcn/Radix e Tailwind, sem bibliotecas novas.

Alterações: src/chat/activities.ts separa últimos 50 eventos em memória por sala; webrtcEngine não grava nem envia ChatMessage de reprodução, ignora novos eventos de clientes antigos no recebimento de chat/sync; ChatPanel filtra registros antigos por type sem apagá-los e mostra atividades separadas. Áudio/metadata P2P preservados. Temas Clássico e Moderno Roxo em theme.ts, seleção persistente nas configurações e CSS compacto; temas salvos antigos permanecem até seleção explícita. Sidebar com controles por ícone, participantes no Clássico e remoção local confirmada/recuperável. Remoção local aprovada explicitamente pelo mantenedor; não afeta outros participantes, mensagens ou arquivos. Ao remover sala ativa, captura é encerrada e o app não retorna automaticamente à sala no reinício; entrada explícita libera essa pausa. AlertDialog local composto dos primitivos shadcn/Radix Dialog existentes, role alertdialog e foco inicial em cancelar.

AvatarCrop integra seleção de PNG/JPEG/WebP até 20 MB, verificação de assinatura e decodificação, limites de 40 MP/10000 px por lado após decodificar, enquadramento quadrado com zoom e eixos, saída 512px WebP com redução automática de qualidade até limite existente de 100000 caracteres. Bitmap/URL liberados. Banner mantém processamento anterior (2 MB). Sem upload remoto ou validação de backend: infraestrutura segue ausente conforme autorização local/P2P. Decodificação depende do navegador; não há medição de pico de memória ou teste EXIF em celulares físicos.

Testes executados: npm run build e tsc passaram (avisos de bundle e preload permanecem); theme-validation 8 grupos, visual-fixes (temas/persistência/sem registros Soundboard/remoção local após reload), profile-smoke (inclui recorte/persistência), media-engine (WebAudio real sintético e adapters), studio-smoke, redesign-smoke, chat-smoke, chat-drafts e chat-model passaram. Testes atualizados para novos presets/recorte e ausência de eventos na conversa; ambiguidades de seletores corrigidas. Tentativas iniciais falharam por índices de preset/expectativa de cor e dupla submissão do recorte; corrigidas e reexecutadas.

Pendências: validação visual fina contra as capturas, acessibilidade completa, imagens de celulares com EXIF e memória sob carga; chamadas, som e tela entre dois dispositivos físicos continuam NÃO testados nesta instância (ICE/rede cloud já bloqueados na fase anterior). Não declarar reprodução remota, captura real do SO, exclusão global ou autorização no servidor como aprovadas. Exclusão global depende de backend autenticado e política de retenção. Documentação de fases anteriores é histórica: modos normal/compacto não recolocam eventos no histórico nesta fase. Atividades transitórias não persistem; eventos antigos permanecem intactos no banco. Reserva liberada para revisão ao concluir. Nenhum push/merge nesta tarefa.


## STABILIZE-001 — 05/11/2026

K01 corrigido nesta revisão: emissão CJS única e startup/reload verificados em Electron e pacote Linux. K15 parcialmente mitigado por sandbox, navegação e IPC; CSP/permissões completas e dependências vulneráveis continuam pendentes. npm audit: 19 (1 crítica/13 altas/5 moderadas). K07/telemetria de tela global e trust de contas/histórico P2P permanecem. Sem arquivos/pastas/GIFs compartilhados; sem teste real entre duas máquinas. Não anunciar 2.0.0 estável. Lista e evidências em STABILIZATION.


## SECURITY-002 — 05/11/2026

As 19 vulnerabilidades conhecidas anteriores foram eliminadas nesta árvore (npm audit final zero), sem garantia de ausência de vulnerabilidades futuras. Plugin renderer mantém avisos customResolver/freeze no Vite 8; bundle >500 kB continua. ICE/matriz física, ABR/stats por par, Windows/macOS, EXIF/memória e leitor de tela pendentes. Backend é apenas proposta. As seções antigas descrevem estados históricos.


## BRAND-001 — 05/11/2026 — Codex/OpenAI

Branch feat/compact-bars-logo-2026-11-05, base cb7b93f. Barras compactadas (32px titlebar, 60/56px sala, ~32px chamada); subtítulo removido e estado de maximização sincronizado com Electron. Build e testes compact-bars/window-controls/desktop-security/electron-smoke/redesign-smoke/media-smoke passaram localmente. Arraste e aparência real maximizada/restaurada exigem desktop gráfico. Logo/PNG/ICO ainda pendentes do arquivo original solicitado: tentativa generativa alterou arte e não foi integrada. Ler COMPACT_BARS para arquivos, evidências e retomada. Trabalho das barras pronto para revisão; não declarar integração da logo concluída. Reserva da identidade permanece aguardando entrada, sem mudanças de motores/backend. Sem push/merge.


## WORKSPACE-3 — 05/11/2026 — estado atual

- Corrigido caminho de fechamento prematuro de voz por DataConnection.close e sessão de dados substituta; regressões controladas passaram. A causa das quedas no computador do usuário ainda precisa ser correlacionada com o novo relatório. Não considerar todas as quedas resolvidas.
- media-transport continua BLOCKED: Chromium não oferece candidatos ICE locais; não houve validação entre dois dispositivos reais. Recobro sem sinalização/TURN acessível não é garantido.
- Backend/contas/ACL, nomes globais, salas/sync entre dispositivos, DM, arquivos/pastas/GIFs e notificações do SO continuam ausentes. Presença e dados locais/P2P não são autorização autenticada.
- Atalho PTT global não implementado; funciona apenas com foco e fora de campos de edição. Sem benchmarks de CPU/memória, matriz física ou verificação Windows/macOS.
- Favoritos e remoção/restauração de recentes são locais. Unread da sidebar só representa a sala ativa; não simula múltiplas salas conectadas em segundo plano.
- Diagnóstico é memória limitada e não sobrevive a restart; deve ser copiado antes de fechar o app. Logs de console antigos do motor não são o relatório sanitizado; não compartilhá-los como se tivessem a mesma política de campos.
- Permanecem ABR/stats de tela por par, avisos Vite/bundle, suspensão real e testes prolongados. Ver WORKSPACE_3_STATUS para dependências e evidências.


## DESKTOP-004 — 05/11/2026

Corrigidos: espera de Peer.open/reconstrução travada, identidade local antes do ID remoto, cards fixos, editores encadeados, nome que sobrevivia ao Cancelar, defaults fictícios FPS/RTT e atribuição errada de snapshot de tela/foco. Telemetria de recepção acompanha foco e ignora resultados antigos; ABR por todos os pares ainda não foi implementado.

BLOCKED permanece media-transport sem ICE; sem validação física de reconexão, áudio/vídeo/suspensão ou Windows/Tray. Headless usa minimizar como fallback de bandeja e não comprova clique nativo. Backend/ACL/DM/anexos/sync global e notificações de mensagens do SO continuam ausentes. Corte de waveform refere-se a arquivos importados; sintetizadores mantêm metadados e reprodução. Não há benchmark físico CPU/GPU/memória. Persistem avisos do bundler e limitações anteriores de armazenamento/EXIF/plataformas. Relatório detalhado em DESKTOP_REFINEMENT.

## HOTFIX-005 — limites atuais — 06/11/2026 UTC

Caminhos de recuperação prematura/beacon obsoleto corrigidos no código e cobertos por testes controlados. Não declarar todas as quedas reais resolvidas: continua pendente ouvir áudio nos dois sentidos entre computadores após perda de rede, teste ICE/STUN/TURN, webcam/tela restauradas e carga com vários participantes. Chromium deste ambiente não fornece candidatos ICE locais; media-transport é BLOCKED, não PASSED.

Windows: ícone/menu da bandeja, aviso inicial, captura em segundo plano e ciclo X/restaurar/encerrar exigem teste físico. Linux headless usa fallback minimizar; teste de processo não é teste da bandeja Windows. Contraste/leitor de tela, primeira pintura e dispositivos físicos permanecem na matriz manual. Bundle principal >500 kB e avisos customResolver/freeze persistem; boot-theme.js clássico é intencionalmente copiado de public, sem bundling, para rodar antes do renderer. Sem dependências novas.

Arquitetura continua sem servidor autenticado/ACL global; backend próprio é proposta. Notificações do SO, DM/anexos/pastas/GIFs e garantia de durabilidade quando IndexedDB indisponível permanecem fora deste hotfix. Cards extremadamente pequenos conservam identificadores acessíveis/title, mas reduzem texto/controles visuais. Detalhes/evidências em HOTFIX_STABILITY.

## HOTFIX-006 — limites confirmados — 06/11/2026 UTC
Cards locais sem indicador, identidade das mensagens ausente, miniaturas fixas/sem espaço mobile e pausa compartilhada curta foram corrigidos e testados. Mantêm-se os gates físicos do HOTFIX-005. Chromium tem política administrada WebRtcIPHandling=disable_non_proxied_udp; não contornar para forçar passe ICE. Contraste de nomes é validado contra cor sólida das mensagens, não certifica legibilidade sobre qualquer wallpaper/hover; fallback semântico e opção de desativar cores disponíveis. Nenhum ping independente da internet de cada usuário é alegado. Detalhes e testes em HOTFIX_ACCEPTANCE.


## Gates DESKTOP-007 — 06/11/2026
1. Toasts Windows e botão Atender implementados, mas apresentação/ativação nativa precisam de teste em instalação Windows com identificação/atalho correto. Teste IPC simula a apresentação do SO; DND e configurações locais podem suprimir alertas. Sem suporte a iniciar com Windows nesta fase.
2. A queda relatada com determinados efeitos não foi reproduzida com o arquivo original. Decodificação isolada, limites e rejeição segura foram testados localmente; falta audição bidirecional e carga real em dois dispositivos. Sons antigos acima dos limites são recusados, preservando o original salvo.
3. `media-transport.cjs` permanece BLOCKED: sem candidatos ICE devido à política administrada. Não é falha funcional comprovada nem teste aprovado.
4. Convites nativos indicam entrada em voz na sala atual; não são chamadas diretas entre contas. Alertas têm limite de frequência/expiração e requerem processo em execução. Nenhuma garantia de entrega push fora do Electron.


## AUDIO-008 — limite do aceite
O caminho onended→leaveVoiceCall foi removido e verificado com interrupção controlada. Ainda não há evidência de que o grito/efeito cause onended no driver do usuário: reprodução física/arquivo original/relatório do incidente continuam necessários. Proteção de picos limita amostras e pode distorcer sinais extremos; não normaliza volume percebido. Se o dispositivo não puder ser readquirido, a chamada permanece ativa recebendo áudio, com aviso para selecionar o microfone. Fallback do gate preserva voz mas desativa esse processador até reconstruir o pipeline. ICE/Windows físico seguem pendentes.
