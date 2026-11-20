# Roadmap técnico e dependências

Data: 05/11/2026 (America/Sao_Paulo). Responsável: Codex/OpenAI.
Branch: `audit/cbshub-v2-2026-11-05`. Base auditada: `5deab40aa1629a975dc72588b658569b21494c23`.

Este roadmap propõe tarefas; não autoriza trocar bibliotecas nem marca trabalho futuro como concluído. Escopos pequenos em branches próprias, com revisão da outra pessoa.

| Etapa | Dependências | Entrega e critério de aceite | Arquivos/área provável |
| --- | --- | --- | --- |
| R0 — Auditoria e proteção | Nenhuma | Concluída nesta fase: nove docs, branch, tag, bundle e evidências locais | docs/ e configuração cloud |
| R1 — Execução reproduzível | R0 | Corrigir K01; uma saída CJS, build e startup dev/produção repetíveis, seis métodos IPC; formalizar versão Node/npm e opção de instalação sem atualização incidental | vite.config.ts, configuração de ambiente; manifests só se aprovados |
| R2a — Baseline de regressão | R1 | Introduzir estratégia/testes versionados de persistência, reação, mixagem/mute/stopAll, lifecycle e erros; fixtures isoladas; testes devem falhar quando contrato quebrar | Infra de testes e testes dedicados, bibliotecas novas mediante aprovação |
| R2b — Correções essenciais | R1 e casos correspondentes de R2a | Resolver K02–K06 e K09/K10; validação runtime/sala, teardown, falha de permissão, mídia bidirecional e late join, favoritos/identidade | webrtcEngine, audioPipeline, storageDb, SettingsModal |
| R2c — Dependências e desktop | R1 | Revisar K16/K15, propor versões compatíveis e obter aprovação; corrigir em mudanças pequenas com build, IPC e mídia. Não usar audit fix force | package/lock, Electron e revisão de políticas |
| R3 — Gate funcional multipar | R2a/R2b; rede compatível e perfis/dispositivos | Demonstrar matriz abaixo; tratar regressões P1 abertas; registrar versão, SO, pares, evidência e limitações; revisar riscos de R2c | Testes funcionais e docs de resultados |
| R4 — Planejamento visual | R0; implementação aguarda R3 | Inventário de tokens/primitivos, proposta de fluxos/estados, acessibilidade e prioridades; aprovação das duas pessoas | Especificação e proposta, sem troca de stack |
| R5 — Redesign incremental | R3 + R4 aprovado | Um grupo de componentes por PR: shell → chat → palco/controles → Soundboard/modais. Regressões essenciais a cada mudança; preservar APIs/estado | components e index.css; motores fora de escopo visual |
| R6 — Performance e consistência | R3, coordenado com R5 | K07/K08/K11–K14/K19/K20: ABR por par, volume real, convergência, VAD, deafen, teclado; métricas antes/depois | Motores e UI em tarefas separadas |
| R7 — Distribuição | R2c + R5/R6 | Empacotar Windows, testar instalação/atualização/desinstalação, permissões, diferentes NATs e hardware; versionamento coerente | electron-builder, release e documentação |

## Matriz mínima de R3

1. Três perfis independentes na mesma sala: descoberta, nickname/cor, chat bidirecional, reações, digitação e histórico tardio; ampliar a seis.
2. Sala de texto sem voz; entrar/sair apenas da voz mantendo chat; trocar de sala sem ressuscitar sessões antigas.
3. Microfone permitido/negado, troca de dispositivos, mute/deafen e volume; nenhum vazamento de tracks após saída.
4. Webcam bidirecional, participante que entra depois e reconexão.
5. Tela com áudio, dois transmissores, foco/grade, stop e fim da fonte; presets e 4K60 medidos em hardware compatível, sem inferir desempenho pelo rótulo.
6. Soundboard nativo e arquivo customizado: retorno local, remoto, mic mudo, deafen, favorito e stopAll; nenhum corte indevido pelo gate.
7. Saída do dono do beacon, perda/retorno da sinalização e entradas simultâneas; nenhuma perda de chamadas remanescentes.
8. Reinício: preferências/histórico/clips persistem; privacidade entre salas e payloads inválidos tratados.

## Ordem para duas pessoas/IAs

Pessoa A pode assumir R1/motores e Pessoa B R4/documentação após registro explícito em ACTIVE_WORK. Isso é sugestão, não atribuição ativa. Evitar edição concorrente de store, contratos, webrtcEngine, App, CSS global, manifesto/lockfile e arquivos compartilhados. R2a e R2b precisam combinar casos e contratos antes de dividir arquivos. Design visual só começa após o aceite de R3, sem reescrever o aplicativo.

## Atualização de escopo pelo mantenedor

Em 05/11/2026 o mantenedor solicitou explicitamente a implementação do redesign. R4/R5 foram executados com regressões locais nesta branch; R3 continua pendente e é requisito de validação para integração segura, não um resultado já obtido. A etapa seguinte não é personalização. Ver REDESIGN_REVIEW.


## Atualização — STUDIO-001 — 05/11/2026

STUDIO-001 implementado por nova autorização do mantenedor após redesign integrado. Antes de integrar, revisar presets e testes descritos em STUDIO.md. Sync remoto depende de backend autenticado ainda inexistente; perfis não iniciados. R1/R2/R3 e defeitos anteriores continuam pendentes.


## Atualização — PROFILE-001 — 05/11/2026

PROFILE-001 implementado no escopo local/P2P aprovado. Próximos passos: revisão multipar real, identidade/autorização de backend quando definido e reserva global de username. Não anunciar conta autenticada/sync remoto com base em clientId local. Ver PROFILES.


## Atualização — CHAT-002 — 05/11/2026

CHAT-002 implementado no escopo local/P2P; próxima revisão deve validar compatibilidade multipar real, ledger/retention e migração para ACL/backend quando existir. Não anunciar histórico offline global ou exclusão de cópias remotas. CHAT_2 contém requisitos pendentes.


## Atualização — MEDIA-001 — 05/11/2026

1. Revisão de MEDIA-001 sobre 6a72051, com comparação de lifecycle e chamadas bidirecionais; depende desta entrega e dos testes locais registrados.
2. Executar matriz física de MEDIA_EXPERIENCE em dois dispositivos e depois três: depende de dispositivos/permissões e sinalização/ICE acessível; incluir queda/restauração de rede, mídia simultânea e Soundboard. É gate de integração de mídia, não tarefa já concluída.
3. Delimitar correção K07 (ABR e stats de tela por par) após baseline físico, mantendo seletores de foco e compatibilidade.
4. Resolver K01/preload e planejar atualização de dependências K16 antes de distribuição; dependem de revisão e testes Electron/Windows.
5. Backend/autenticação e permissões administrativas de sala permanecem etapa separada conforme escolha local/P2P. Não introduzir ACL global de Soundboard sem essa base.


## STABILIZE-001 — 05/11/2026

Próximo gate: revisão do candidato 2.0.0-rc.1, plano de atualização das 19 vulnerabilidades, matriz física em 2 e depois 3–6 dispositivos, ABR/telemetria por par, acessibilidade completa e instaladores na plataforma-alvo. Cada etapa depende de evidência própria. 2.0.0 estável somente após revisão/autorização; backend e recursos ausentes exigem escopo separado.


## SECURITY-002 — 05/11/2026

Após SECURITY-002, revisar BACKEND_PROPOSAL antes de implementar contas e infraestrutura. Sequência proposta: serviço/DB → sessões → perfis/preferências/migração → salas/WebSocket/chat → tickets de mídia → arquivos/pastas → GIFs. Em paralelo, ABR por par e matriz de mídia física, acessibilidade completa, EXIF/memória e instaladores na plataforma-alvo. Audit 0 não substitui testes de release.


## Após WORKSPACE-3 — 05/11/2026

1. Revisão dos commits eb8f1fc/8cd3dff/ac501cc/bed3859 e relatório de queda real → depende desta branch e de reprodução com usuário. Sem merge automático.
2. Matriz física de mídia/rede/TURN/suspensão/dispositivos → depende de dois computadores e infraestrutura acessível; depois carga com 3–6 participantes. É gate de estabilização, não teste já concluído.
3. Windows/ícones/instalação/janelas reais, leitor de tela/contraste e carga prolongada → depende de plataforma e medição. Selecionar novo rc antes de distribuir candidato.
4. Revisar BACKEND_PROPOSAL → serviço/sessões/migração de identidades → perfis/preferências/salas/chat/ACL → DM/notificações/arquivos/pastas/GIFs. Não criar servidor paralelo ou UI falsa antes dos contratos aprovados.
5. ABR/telemetria de tela por par e dividir bundle → depende de baseline físico e perfis CPU/memória para decidir mudanças mensuráveis.


## Após DESKTOP-004 / rc.3 — 05/11/2026

1. Revisar commits da branch desktop-refinement, incluindo contratos de fechamento/editores/telemetria. Depende desta entrega; não fazer merge sem autorização.
2. Executar matriz física em 2 e depois 3–6 máquinas, redes diferentes, TURN/STUN, queda/restauração, suspensão, câmera/tela/efeitos simultâneos e troca de dispositivo. Depende de hardware/rede acessível. É gate de estabilidade.
3. Windows/Tray/ícones/janelas/instalação, acessibilidade com leitor de tela e carga prolongada. Depende de plataforma/medição; não inferir aprovação de headless.
4. ABR/telemetria simultânea de todos os pares e otimização do bundle com perfis CPU/memória. Depende de baseline físico; dados sem amostra continuam indisponíveis.
5. Revisar BACKEND_PROPOSAL antes de contas/ACL/salas globais/DM/anexos/sync. Planejar migração sem perder identidades/dados locais. Notificações de mensagens do SO exigem escopo/permissões/testes próprios, sem depender obrigatoriamente de backend para o caso local.

## Próximos gates após HOTFIX-005 — 06/11/2026 UTC

1. Revisar separadamente os commits de rede, Electron e UI do rc.4. Dependência: resultados e arquivos de HOTFIX_STABILITY.
2. Validar áudio bidirecional físico após queda curta/prolongada, perda ICE e falha de sinalização, cancelamento/saída e bandeja; validar webcam/tela/efeitos simultâneos. Dependência: dois computadores/redes, sinalização e ICE/STUN/TURN disponíveis. Coletar diagnóstico por peerId.
3. Validar bandeja/ícones/primeiro aviso/encerramento, dispositivos, janelas e acessibilidade no Windows. Dependência: desktop gráfico e artefato de teste Windows; Linux headless não aprova esse gate.
4. Medir CPU/memória/GPU com vários participantes e revisar contraste/leitor de tela. Dependência: cenários físicos dos itens 2–3.
5. Só então decidir release estável/assinatura/distribuição com revisão e autorização. Backend/contas/ACL/sincronização exigem aprovação da proposta e infraestrutura; não são dependência oculta deste hotfix nem suporte já entregue.

HOTFIX-006 / rc.5 substitui rc.4 como candidato de revisão. Lacunas de interface descritas em HOTFIX_ACCEPTANCE corrigidas e verificadas. Próximo gate permanece a matriz física/Windows e revisão dos commits; backend e novas funcionalidades não foram iniciados. A aprovação da implementação não aprova transporte real nem release estável.


## Próximos passos após DESKTOP-007
1. Revisar rc.6 e integrar apenas após aprovação do mantenedor.
2. Em instalação Windows, validar toasts de mensagem/voz e botão Atender, foco/segundo plano, expiração e mudança de sala; depende de ambiente Windows com notificações habilitadas.
3. Reproduzir o problema de efeitos com arquivo original e duas máquinas; verificar áudio nos dois sentidos, memória e reconexão. Depende de mídia física/rede de teste autorizada com ICE disponível.
4. Somente após os gates anteriores avaliar promoção de release. Inicialização com Windows continua fora desta entrega.


## Prioridade após AUDIO-008
Validar rc.7 no hardware afetado com o arquivo original, recepção/envio, mute/deafen, câmera e tela. Se houver nova queda, obter diagnóstico exportado e distinguir microphone_interrupted/audio_processor_error de media_timeout/media_failed/sinalização. Corrigir o gatilho comprovado antes de promover release; não tentar contornar política ICE do ambiente cloud.
