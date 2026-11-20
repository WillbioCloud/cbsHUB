> Atualização atual: **AUDIO-008 · 2.0.0-rc.7 · 06/11/2026 (America/Sao_Paulo)**. Leia AUDIO_PEAK_STABILITY. Interrupção de microfone deixa de encerrar a chamada; picos de áudio protegidos. Aceite no hardware afetado continua pendente. Registros abaixo são históricos.

> Estado atual: **DESKTOP-007 · 2.0.0-rc.6 · 06/11/2026 (America/Sao_Paulo)**. Leia DESKTOP_NATIVE. Build, 35 testes e pacote/smoke Linux aprovados; um teste bloqueado por ICE. Registros abaixo são históricos; validações Windows e duas máquinas continuam pendentes.

> Estado atual: **HOTFIX-006 · 2.0.0-rc.5 · 06/11/2026 UTC**. Leia HOTFIX_ACCEPTANCE. Registros anteriores são históricos; testes físicos permanecem pendentes.

> Estado atual: **HOTFIX-005 · 2.0.0-rc.4 · 06/11/2026 UTC**. Leia HOTFIX_STABILITY. Registros anteriores são históricos; candidato para revisão, sem aprovação de produção.

> Atualização atual: **2.0.0-rc.2 / SECURITY-002**. Leia SECURITY_UPDATE. Estados anteriores são históricos.

> Estado atual em 05/11/2026: candidato **2.0.0-rc.1**, estabilização STABILIZE-001. Consulte STABILIZATION. As seções anteriores abaixo são históricas.

# Changelog

## AUDIO-009 — proteção contra picos do soundboard e recuperação resiliente do microfone (rc.7, sem mudança de versão)

- **Sintoma:** barulhos muito altos e efeitos sonoros extremos do Soundboard faziam o interlocutor (irmão) cair da chamada ou perder o áudio da captura.
- **Causa:** o Soundboard era injetado pós-compressor vocal em ganhos de até 200%, passando apenas por um corte seco (hard-clipping) que produzia ondas quadradas com sobremodulação no codec Opus, sobrecarregando o driver de áudio (AEC/WASAPI) de quem escutava e derrubando a captura do interlocutor. Além disso, a recuperação anterior fazia uma única tentativa imediata e ignorava faixas mutadas (`mute`) e `AudioContext` suspenso.
- **Correção:** 
  1. Compressor dinâmico dedicado ao Soundboard no pipeline de áudio (`threshold: -6dB`, `ratio: 8:1`, ataque ultra-rápido de 1ms) e teto de ganho calibrado para evitar estouro de DAC.
  2. `outputPeakGuard` com curva de saturação suave (*soft-knee* senoidal) até 0.98, eliminando harmônicos de onda quadrada e prevenindo *overshoot* de interamostragem no Opus.
  3. Recuperação automática do microfone com retentativas e espera crescente (0, 1, 2.5, 5, 10, 20 s), canceladas ao sair da sala ou trocar dispositivo; contador reinicia após 30 s estável.
  4. Vigia para faixa mutada (`track.onmute`, 2.5 s) e suspensão do `AudioContext` (2 s), com fallback automático para microfone padrão se o ID do dispositivo tiver sumido durante o reset do driver.
- **Diagnóstico:** motivos `microphone_muted` e `audio_context_suspended` no relatório; eventos `microphone_recovery` com tentativa e delay.
- **Teste:** `tests/audio-peak-stability.cjs` atualizado com recuperação repetida, faixa muda e tolerância a falhas.

## UI-009 — refinamento de temas, botões e menus (rc.7, sem mudança de versão)

- **Temas** (exceto Clássico, que não mudou): Sakura Dream com texto e botão mais escuros (contraste do botão 4,8 → 5,9) e barra lateral mais suave; Velvet Nocturne com vinho/dourado menos saturados; OLED Black com barra lateral e hover visíveis sobre o preto; Gamer Neon e Moderno Roxo com hover e bordas mais equilibrados. Todos os pares de texto continuam acima de 4,5:1. Fundo e botão do Moderno Roxo e o fundo do Light Modern foram mantidos porque os testes os fixam.
- **Botões:** transições específicas, estado pressionado, realce interno discreto só nos temas modernos, variante `success`/`destructive` com texto legível (novos tokens `--success-foreground` e ajuste de `--destructive-foreground`; antes era branco sobre fundo claro).
- **Menus e popovers:** sombra segue o controle de sombra do tema, menus longos rolam em vez de serem cortados, margem de colisão com a borda da janela, estado pressionado nos itens.
- **Switch, Input, Tabs:** trilho com contorno visível quando desligado, polegar com contraste, hover e foco com borda de destaque.
- **Não validado aqui:** build e testes Playwright (sem dependências instaladas neste ambiente). Verificados apenas sintaxe TS e contraste dos presets. Revisar visualmente cada tema antes de integrar.

## Não lançado — 05/11/2026

Responsável: Codex/OpenAI. Branch `audit/cbshub-v2-2026-11-05`.
Base: `5deab40aa1629a975dc72588b658569b21494c23`. Commit de documentação: `724abeaec50df76bffecb3dcd5e48a8ad6d163ba`.

### Adicionado

- Auditoria técnica de arquitetura, tecnologias, shadcn/ui, estilos, funcionalidades, Git e dependências.
- Oito documentos de desenvolvimento para estado, atividades, mudanças, roadmap, arquitetura, problemas, passagem entre IAs e reserva de tarefas.
- Branch e tag de recuperação locais; backup Git externo verificado.
- Instruções reutilizáveis de instalação e startup headless salvas na configuração cloud, com domínio PeerJS no rascunho.

### Verificado

Build e comportamento local de renderer, chat/IndexedDB, reações, Dialog e Soundboard com sinal sintético. Electron abriu em produção e com helper dev; colisão de outputs do preload no fluxo padrão foi diagnosticada. Npm audit retornou 19 dependências sinalizadas. Detalhes e falhas em ACTIVITY_LOG/PROJECT_AUDIT.

### Limitações

Sem alterações de funcionalidade ou visual; sem substituição/atualização de bibliotecas. Redesign e correções permanecem pendentes de tarefas próprias. Chamadas reais, 4K60, beacon failover e release Windows não foram validados. Documentação anterior preservada. Nenhum release ou push publicado.

## Não lançado — REDESIGN-001 — 05/11/2026

Codex/OpenAI · feat/workspace-redesign-2026-11-05 · a29e4ca. Novo workspace, sidebar ajustável/recolhível, membros opcionais, chat refinado, menus/foco, controle de voz identificado e diagnóstico organizado. Tokens grafite/verde-água e responsividade. Primitivos shadcn/Radix e Tailwind preservados, sem bibliotecas novas. Build e regressões locais passaram; mídia entre máquinas pendente. Detalhes em REDESIGN_REVIEW.


## Atualização — STUDIO-001 — 05/11/2026

STUDIO-001 · Codex/OpenAI · feat/cbshub-studio-2026-11-05 · 19d316f. Adicionados presets/editor/preview/library/JSON v1, imagens raster locais, layout e contraste. Slider com nome no Thumb; foco inicial de Sheet ajustado. Sem dependências novas, perfis ou backend de sincronização. Detalhes e testes em STUDIO.md.


## Atualização — PROFILE-001 — 05/11/2026

PROFILE-001 · Codex/OpenAI · feat/user-profiles-2026-11-05 · 7a88783. Perfis locais completos/editáveis, avatar/banner, status, temas de cartão, privacidade e bloqueios; projeção pública e integração P2P validadas. Sem mudança de autenticação nem dependências. Detalhes/testes/limites em PROFILES.


## Atualização — CHAT-002 — 05/11/2026

CHAT-002 · Codex/OpenAI · feat/chat-v2-2026-11-05 · b74272e. Chat com edição/exclusão/resposta/pin, reações idempotentes, Markdown/código/links seguros, drafts, ACK, reconciliação lógica, busca/janela limitada e três modos de eventos Soundboard. Sem dependências novas. Resultados/limites em CHAT_2.


## Atualização — MEDIA-001 — 05/11/2026

Controles de mídia com estados/erros e painel expandido; RTT/perda por participante; aquisição sob demanda, encerramento/rollback de capturas, handles separados de câmera/tela e reconexão com backoff. Soundboard com categorias, edição/ordem, favoritos nativos persistentes, preview isolado e preferência de eventos compartilhada com chat. Deafen aplicado às telas e sons ativos. Limite de volume individual corrigido para 100%. Sem dependências novas. Detalhes e limites em MEDIA_EXPERIENCE.

## VISUAL-002 — 05/11/2026 — Codex/OpenAI

Branch feat/visual-fixes-2026-11-05, base d046d66 (mídia integrada PR #5). Recuperação recovery/pre-visual-fixes-2026-11-05. Referências recebidas: Clássico preto/compacto/sidebar tradicional e Moderno com navegação e membros; Moderno agora roxo. Preservados shadcn/Radix e Tailwind, sem bibliotecas novas.

Alterações: src/chat/activities.ts separa últimos 50 eventos em memória por sala; webrtcEngine não grava nem envia ChatMessage de reprodução, ignora novos eventos de clientes antigos no recebimento de chat/sync; ChatPanel filtra registros antigos por type sem apagá-los e mostra atividades separadas. Áudio/metadata P2P preservados. Temas Clássico e Moderno Roxo em theme.ts, seleção persistente nas configurações e CSS compacto; temas salvos antigos permanecem até seleção explícita. Sidebar com controles por ícone, participantes no Clássico e remoção local confirmada/recuperável. Remoção local aprovada explicitamente pelo mantenedor; não afeta outros participantes, mensagens ou arquivos. Ao remover sala ativa, captura é encerrada e o app não retorna automaticamente à sala no reinício; entrada explícita libera essa pausa. AlertDialog local composto dos primitivos shadcn/Radix Dialog existentes, role alertdialog e foco inicial em cancelar.

AvatarCrop integra seleção de PNG/JPEG/WebP até 20 MB, verificação de assinatura e decodificação, limites de 40 MP/10000 px por lado após decodificar, enquadramento quadrado com zoom e eixos, saída 512px WebP com redução automática de qualidade até limite existente de 100000 caracteres. Bitmap/URL liberados. Banner mantém processamento anterior (2 MB). Sem upload remoto ou validação de backend: infraestrutura segue ausente conforme autorização local/P2P. Decodificação depende do navegador; não há medição de pico de memória ou teste EXIF em celulares físicos.

Testes executados: npm run build e tsc passaram (avisos de bundle e preload permanecem); theme-validation 8 grupos, visual-fixes (temas/persistência/sem registros Soundboard/remoção local após reload), profile-smoke (inclui recorte/persistência), media-engine (WebAudio real sintético e adapters), studio-smoke, redesign-smoke, chat-smoke, chat-drafts e chat-model passaram. Testes atualizados para novos presets/recorte e ausência de eventos na conversa; ambiguidades de seletores corrigidas. Tentativas iniciais falharam por índices de preset/expectativa de cor e dupla submissão do recorte; corrigidas e reexecutadas.

Pendências: validação visual fina contra as capturas, acessibilidade completa, imagens de celulares com EXIF e memória sob carga; chamadas, som e tela entre dois dispositivos físicos continuam NÃO testados nesta instância (ICE/rede cloud já bloqueados na fase anterior). Não declarar reprodução remota, captura real do SO, exclusão global ou autorização no servidor como aprovadas. Exclusão global depende de backend autenticado e política de retenção. Documentação de fases anteriores é histórica: modos normal/compacto não recolocam eventos no histórico nesta fase. Atividades transitórias não persistem; eventos antigos permanecem intactos no banco. Reserva liberada para revisão ao concluir. Nenhum push/merge nesta tarefa.


## STABILIZE-001 — 05/11/2026

Candidato 2.0.0-rc.1: preload CJS único; sandbox/IPC/navegação/captura reforçados; agrupamento linear no journal; liberação imediata de bitmap rejeitado; servidor renderer e runner de regressão versionados. Nenhuma biblioteca substituída ou atualizada. Build e pacote Linux passaram; 14 testes passaram, 1 bloqueado. Não é release de produção.


## SECURITY-002 — 05/11/2026

SECURITY-002: Electron 45.2.3, builder 26.18.0, Vite 8.3.6 e plugins compatíveis; esbuild explícito e override restrito de minimatch. CSP de produção, allowlist de capacidades, captura fail-closed e validação de presença. Novo teste de sinalização, Electron smoke ampliado e teste de rascunho desambiguado. Proposta de backend próprio adicionada. Ver SECURITY_UPDATE para justificativas e limites.


## BRAND-001 — 05/11/2026 — Codex/OpenAI

Branch feat/compact-bars-logo-2026-11-05, base cb7b93f. Barras compactadas (32px titlebar, 60/56px sala, ~32px chamada); subtítulo removido e estado de maximização sincronizado com Electron. Build e testes compact-bars/window-controls/desktop-security/electron-smoke/redesign-smoke/media-smoke passaram localmente. Arraste e aparência real maximizada/restaurada exigem desktop gráfico. Logo/PNG/ICO ainda pendentes do arquivo original solicitado: tentativa generativa alterou arte e não foi integrada. Ler COMPACT_BARS para arquivos, evidências e retomada. Trabalho das barras pronto para revisão; não declarar integração da logo concluída. Reserva da identidade permanece aguardando entrada, sem mudanças de motores/backend. Sem push/merge.


## BRAND-002 — 05/11/2026 — Codex/OpenAI

Branch feat/official-logo-2026-11-05, base 9b58863. SVG oficial recebido e preservado byte a byte; fundo já transparente, branco central faz parte da arte. Exportados nove PNGs e ICO multiresolução; integrados à titlebar/rail, BrowserWindow e builder Windows/Linux. Build, official-logo, compact-bars, window-controls, electron-smoke e empacotamento Linux passaram localmente; logo também carregou no executável Linux. Windows/tray/arraste físico não aprovados. Detalhes/arquivos em OFFICIAL_LOGO. Pendência de arquivo de BRAND-001 resolvida; reserva liberada ao concluir revisão local. Sem push/merge nesta etapa.

## CHAT-UI-003 — 05/11/2026

Removida a barra redundante “Conversa”, pesquisa permanente e controles duplicados. Pesquisa no cabeçalho; pins e atividades no menu da sala; densidade em Aparência com persistência. Conteúdo numérico legítimo preservado. Sem alteração do motor WebRTC nesta etapa.


## BRAND-003 — nova logo oficial — 05/11/2026

Codex/OpenAI · branch feat/workspace-3-2026-11-05 · base eb8f1fc. O mantenedor confirmou o SVG de duas partes como a nova logo oficial, substituindo a marca circular anterior. Fonte preservada em public/brand/logo.svg, azul-marinho #29256B e turquesa #12C9BD. mark.svg ajusta somente margens transparentes para leitura em 20px; paths e cores idênticos. Exportador gera nove PNGs transparentes e ICO com sete resoluções. Integração anterior BrowserWindow/builder preservada, sem instalar biblioteca.

Arquivos: public/brand/*, scripts/export-brand.cjs, src/components/OfficialLogo.tsx, tests/official-logo.cjs, tests/electron-smoke.cjs e documentação. Testes executados: tsc, npm run build, official-logo, compact-bars e electron-smoke passaram. Verificados hash/fidelidade dos paths/cores, transparência e tamanhos PNG, frames PNG do ICO, renderização 20px nos temas Clássico/Moderno Roxo e build Electron. Uma primeira comparação de tags falhou por serialização equivalente <path/> versus <path></path>; teste normalizado e reexecutado com passe.

Limitações: instalador/ícone do Windows, bandeja e arraste físico não testados; Tray não implementado. A marca anterior está no histórico Git. A versão 2.0.0-rc.2 continua inalterada. Esta entrega de identidade não conclui a estabilização de voz ou as demais fases WORKSPACE-3; alterações em andamento preservadas separadamente. Sem push/merge.


## WORKSPACE-3 A/B/F — 05/11/2026 — Codex/OpenAI

Branch feat/workspace-3-2026-11-05, base 8cd3dff. Diagnóstico estruturado local e limitado, relatório sem conteúdo/IDs/endereço, recuperação limitada/cancelável e preservação da voz durante perda isolada do DataConnection. Correções baseadas em caminho reproduzível, sem afirmar causa das quedas do usuário. Push-to-talk opcional com foco (F8/F9/F10), teste local de microfone e limpeza de recursos; stack/mixagem/Soundboard preservados. Arquivos/limites e critérios em VOICE_RECOVERY. Testes call-recovery, audio-tools, media-engine e build/tsc passaram nas execuções iniciais; suíte final ainda em execução ao registrar esta fase. Hardware/ICE/TURN e atalho global não aprovados. Sem backend ou mudança de versão; commit de conteúdo será registrado no fechamento.


## WORKSPACE-3 C/D/E — 05/11/2026 — Codex/OpenAI

Branch feat/workspace-3-2026-11-05, sobre ac501cc. Sidebar existente refinada, sem recriar aplicativo: pesquisa, favoritas locais/recentes separados, indicador real de não lidas da sala ativa, painel compacto de voz e rodapé de perfil em uma linha com tooltips/estados reais. Resize/collapse/Sheets, temas e opções detalhadas do dock preservados. useShallow evita subscrição do sidebar a micLevel e outros estados sem uso. Arquivos: LeftSidebar.tsx, index.css e workspace-sidebar.cjs; documentação em WORKSPACE_3_STATUS. workspace-sidebar passou localmente, incluindo teclado/mobile/persistência/temas. Sem contadores de outras salas ou DM falsos. Demais dependências externas estão explicitadas no status.


## WORKSPACE-3 — fechamento local — 05/11/2026 — Codex/OpenAI

Branch feat/workspace-3-2026-11-05. Commits de conteúdo: eb8f1fc (limpeza do chat, sem motor), 8cd3dff (nova logo oficial), ac501cc (diagnóstico/recuperação/áudio), bed3859 (sidebar/painel/rodapé). Fonte, PNGs/ICO, componentes, testes e limites por fase em WORKSPACE_3_STATUS e VOICE_RECOVERY. main não alterada; nenhum push/merge nesta tarefa. Tags locais de recuperação preservadas. Reservas liberadas para revisão.

Resultado final EXECUTADO: npm run build e tsc passaram; npm test executou 23 scripts, 22 passaram e media-transport ficou BLOCKED por ausência de candidatos ICE locais. O runner terminou exit 1 pelo bloqueio, sem falhas funcionais restantes nessa execução. Logs em build/test-logs e resumo em build/test-results.json são artefatos locais ignorados. A primeira suíte teve uma falha no fixture de call-recovery: a reconstrução esgotada removia sessões antigas como esperado e o cenário seguinte presumiu que havia um canal de chat. Fixture passou a estabelecer novo canal antes de verificar saída independente da voz; teste isolado e suíte completa repetidos com passe. A comparação de tags SVG também foi normalizada/reexecutada conforme BRAND-003. Não omitir essas tentativas na retomada.

Pacote Linux local preparado com electron-builder --linux --dir e Electron45 instalado. Executável dist-package/linux-unpacked/cbshub abriu/recarregou e passou electron-smoke com logo, CSP, preload sandboxed e captura sintética. Pacote não publicado/assinado. Avisos preexistentes: customResolver/freeze, bundle JS ~695,75kB (gzip ~204,73kB), metadata author e referências repetidas no empacotamento; sem alteração de dependências nesta entrega. Não foi reexecutado npm audit: a última auditoria zero é evidência da fase SECURITY-002, não uma nova execução.

Pendente/manual: chamadas reais em dois computadores/redes e vários participantes, ICE/STUN/TURN, suspensão/recuperação real, dispositivos físicos, vídeo/tela/Soundboard simultâneos, consumo de CPU/memória sob carga, Windows/ícones/arraste físicos, leitor de tela e revisão fina de contraste. Não declarar que todas as quedas foram corrigidas ou que o aplicativo está pronto para produção. Versão de desenvolvimento permanece 2.0.0-rc.2; selecionar próximo rc conforme VERSIONING.md antes de distribuir novo candidato. Backend próprio continua proposta para revisão; contas, ACL/salas globais, sincronização entre dispositivos, DM, anexos/pastas/GIFs e notificações do SO não implementados nesta entrega. Sem interfaces falsas.

Próximo responsável: revisar os commits separados, coletar relatório Configurações > Diagnóstico durante uma queda real e executar os gates da matriz de WORKSPACE_3_STATUS. No PTT usar F8/F9/F10 com foco; não confundir com atalho global. Favoritos/remoção/restauração de salas são locais; dados históricos existentes preservados.


## DESKTOP-004 — entrega de revisão — 05/11/2026 — Codex/OpenAI

Branch feat/desktop-refinement-2026-11-05, base 29e60c1 (PR #11 integrado). Candidato **2.0.0-rc.3**, package/lock consistentes; nenhuma dependência nova/substituída. Código até f9c5513, seguido deste fechamento de testes/versão/docs. Escopo/arquivos/limites em DESKTOP_REFINEMENT. Commits: cf21349 (abertura real/reconexão), 7a408f6 (Tray/processo), c2264b3 (identidade local antes de open), 4e1c735 (cards), 322c5c0 (configurações/temas), 8274ad9 (logo/loading), 5a749f6 (corte de efeitos), c5994f2 (navegação), 9a5164a (controles/seletores) e f9c5513 (origem de telemetria).

EXECUTADO: npm run build/tsc passaram; npm test executou **27 scripts: 26 PASSED, 1 BLOCKED (media-transport, ausência de candidatos ICE locais)**. Exit 1 do runner corresponde ao bloqueio, não a um passe de transporte nem a falha funcional restante nessa execução. npm audit executado nesta revisão: zero ocorrências. Empacotamento Linux final e electron-smoke com executável dist-package/linux-unpacked/cbshub passaram (startup/reload, logo, CSP, preload isolado e captura sintética). Build JS ~708,58kB/gzip ~209,73kB; avisos preexistentes de customResolver/freeze/bundle e author/referências do builder permanecem. Logs/resumo/pacote são artefatos locais ignorados, não instalador Windows publicado. npm ci não foi repetido porque a resolução de dependências não mudou. Empacotar depois de parar renderer: HTML gerado em dist-package pode provocar reload do Vite e interferir nos testes.

Regressões cobrem temas/contraste/persistência/cancelar, editores dentro de um Dialog, avatar/banner e privacidade local/P2P, chat/drafts/CRUD/sync por ponte, áudio sintético/efeitos/PTT/dispositivos, captura e streams, cards/spotlight, controles mobile/recolhidos, backoff e geração de sessão, processo/segunda instância/fallback desktop, telemetria sem números presumidos e origem do enlace. Testes entre computadores reais NÃO foram executados. As tentativas com falha e correções de fixtures/código estão nos registros acima; não apresentar somente uma compilação como evidência de reconexão real.

Pendências: ICE/STUN/TURN e áudio/vídeo depois de queda em duas máquinas/redes; suspensão e troca física de dispositivos; bandeja/menu/ícone Windows e janelas físicas; leitor de tela/contraste completo e benchmark de CPU/GPU/memória sob carga. ABR independente por todos os pares continua pendente; origem do HUD/foco e ausência de medição já foram corrigidas. Backend/contas/ACL/salas globais, DM/anexos/arquivos/pastas/GIFs continuam dependentes de revisão/infraestrutura. Notificações de mensagens do SO também permanecem pendentes. Remoção/restauração/favoritos de salas são locais por decisão anterior. Fallback de memória de banco indisponível não é durabilidade após reinício. Não declarar produção pronta.

Para outra IA: ler DESKTOP_REFINEMENT antes de editar. Studio.begin e ProfileProvider.edit abrem abas de configurações; não remontar StudioDialog global ou recriar os editores. API preload tem 9 métodos, getter getDesktopState restrito ao renderer principal. X preserva renderer/captura; before-quit libera encerramento. PTT continua com foco e ganho antes da entrada de efeitos. originalAudioBlob é aditivo/local e não deve ser descartado silenciosamente. Telemetria precisa de sourcePeerId/direction/observedLinkPeerId/flags; não reintroduzir FPS/RTT defaults nem publicar resultado de PC antigo. Medidor é isolado; não voltar a assinar micLevel nos editores/header. Preservar logo nova e mensagem numérica legítima. Próximo gate: revisão da branch e matriz física, sem merge automático.

## HOTFIX-005 — 2.0.0-rc.4 — não lançado — 06/11/2026 UTC

Codex/OpenAI · hotfix/stability-desktop-2026-11-05 · base b8983d6. Corrigidos confirmação prematura de recuperação, beacon desconectado, consultas sem prazo e mídia sem novos pacotes; rede e UI em commits distintos. Cards passam a caber no palco sem piso fixo; estados/RTT são do enlace observado. Bandeja ganha mostrar/ocultar, estado e aviso inicial persistido. Configurações conservam rascunhos entre abas e confirmam descarte inline; temas ficam em Aparência. Corte conserva intervalo e exige reaplicar antes de salvar. Splash aplica cores validadas antes do React e pausa completa de 364 ms. Nenhuma dependência, banco ou logo substituído. Escopo/arquivos, resultados e limitações: HOTFIX_STABILITY. Sem merge/release automática.

## HOTFIX-006 — 06/11/2026 UTC — Codex/OpenAI

Branch fix/hotfix-acceptance-gaps-2026-11-06, base 16afa14 (PR #13 já integrado). Candidato rc.5; conteúdo b527927 e a544853, seguido do fechamento documental. Corrigidas lacunas reais: identidade das mensagens em Aparência com persistência e contraste, estado de sinalização/presença local no próprio card/sidebar, miniaturas spotlight proporcionais e pausa conjunta de 364 ms da logo. Motor de rede, bancos, IPC, arte e stack preservados. Relatório por requisito/arquivos: HOTFIX_ACCEPTANCE.

EXECUTADO: build/tsc PASSED; suíte 33 scripts, 32 PASSED/1 BLOCKED por ICE (exit 1); zero falhas restantes. Teste integrado adicional dos controles compactos PASSED. Pacote e smoke Linux rc.5 PASSED. Evidências em hotfix-006-results.json. Windows, audição bidirecional em dispositivos físicos após queda e revisão assistiva não executados. Sem produção aprovada ou merge automático.


## 2.0.0-rc.6 — DESKTOP-007 — 06/11/2026
- Splash mínima de cinco segundos antes de montar o workspace; titlebar acessível.
- Controles de chamada sempre expostos e centralizados; diagnóstico movido para ícone na titlebar.
- Notificações nativas de texto e convites para voz na sala, com ação Atender e validação de contexto/IPC.
- Clique na sala atual preserva sessão; áudio validado/decodificado fora do contexto da chamada, com limites de memória e concorrência.
- Três novos scripts de regressão, fixtures atualizadas, versão/relatório de entrega. Sem novas dependências.
- Build e pacote/smoke Linux aprovados; 35 testes aprovados e um bloqueado (ICE). Windows e mídia real ainda exigem aceite manual.


## 2.0.0-rc.7 — AUDIO-008 — 06/11/2026
- Microfone interrompido deixa de expulsar usuário da voz; readquire captura/substitui trilha quando possível, sem fechar pares, com tentativas limitadas e erro acionável se falhar.
- Proteção final de picos na soma de microfone/efeitos e no retorno local, validação de ganhos e canais/amostras do gate.
- Fallback de falha do processador preserva stream/mute; novos eventos de diagnóstico sem registrar áudio.
- Regressão de áudio forte/agudo, falhas de captura/processador e cancelamento durante saída. Sem novas dependências. Causa física do relato ainda exige validação no dispositivo afetado.


## UI-009 — validação posterior do patch — 06/11/2026 — Codex/OpenAI

Patch original aplicado sem conflitos em `7959e31`, mantendo autoria e conteúdo, na branch `feat/ui-theme-refinement-2026-11-06`, base `b3721dd`. Ponto de recuperação `recovery/pre-ui-theme-refinement-2026-11-06`; principal preservada. Esta validação complementa a observação de testes não executados pelo autor do patch.

EXECUTADO: `npm run build` aprovado; nove scripts existentes aprovados (`theme-validation`, `boot-theme`, `studio-smoke`, `redesign-smoke`, `visual-fixes`, `stabilization-a11y`, `media-smoke`, `chat-toolbar`, `compact-bars`, via `node tests/<nome>.cjs`). No navegador, prévia dos nove presets e contraste dos pares de texto avaliados por contrastChecks e dos tokens success/destructive >= 4,5:1. Capturas de Moderno Roxo e Sakura inspecionadas. Sem novos testes permanentes, bibliotecas, alterações de versão ou de motor WebRTC/áudio. Não foi executada a suíte inteira, matriz física entre dispositivos, empacotamento ou validação nativa Windows nesta aplicação de patch. Não equivale a certificação de acessibilidade de todos os estados de interação nem aprovação de produção.
