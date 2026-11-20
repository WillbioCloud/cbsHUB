# Backend próprio — proposta para revisão

05/11/2026 · Codex/OpenAI · pedido do mantenedor: “Propor um backend próprio para revisão”. **Proposta, não serviço implementado ou publicado.** A atualização de segurança independente segue em SECURITY-002.

## Decisão proposta

Adicionar serviço Node.js/TypeScript com PostgreSQL, WebSocket e armazenamento privado de objetos compatível com S3. React, shadcn/ui, Tailwind, Zustand e Electron continuam. Voz/webcam/tela continuam em WebRTC/PeerJS; não reconstruir processamento de mídia. Backend passa a ser autoridade de contas, membros, permissões e dados sincronizados em salas autenticadas.

Serviço HTTP/WebSocket em um processo inicialmente; migrations versionadas; arquivos em bucket privado; rotinas de limpeza fora das requisições. Hospedagem e domínio/TLS ainda precisam ser escolhidos antes de publicação. Docker Compose pode atender desenvolvimento; produção precisa de backups, limites, segredos e monitoramento próprios. Custos e credenciais não são presumidos.

A implementação utilizará bibliotecas mantidas de HTTP, validação, Argon2id, PostgreSQL e WebSocket. A seleção exata e o lockfile serão revisados por compatibilidade/audit; nenhum framework ou serviço foi instalado nesta proposta.

## Modos de operação e migração

1. Preservar modo local/P2P atual, com indicação clara de que não oferece contas ou permissões globais.
2. Adicionar modo de conta autenticada: dados e comandos de sala passam por adaptadores de backend, mantendo componentes de UI/modelos. Não usar P2P como fallback de autorização para salas autenticadas.
3. Primeiro login oferece importar somente perfil e preferências da instalação mediante escolha explícita. Validar no servidor; não sobrescrever tema/perfil local silenciosamente.
4. clientId de instalação não se torna identidade de conta. userId é gerado pelo servidor; dispositivos recebem deviceId próprio, sem escolher userId em payload.
5. Histórico antigo permanece local. Não atribuir ao servidor autoria de mensagens legadas não assinadas. Importação futura será arquivo de histórico identificado como importado, não mensagens publicadas como se tivessem sido autenticadas.
6. Migração reversível por configuração, com backup local; nenhuma exclusão de IndexedDB/localStorage para ativar conta.

## Contas e sessões

- Cadastro/login com nome de usuário normalizado e único no banco; senha com Argon2id e parâmetros aferidos no servidor. E-mail opcional somente se recuperação/verificação for implementada.
- Identificadores UUID; não expor hash de senha, tokens ou identificadores internos em perfis públicos.
- Token de acesso curto e refresh token opaco rotativo, armazenando somente hash no banco. Revogação de sessão/dispositivo e detecção de reutilização de refresh token.
- Desktop: acesso em memória; refresh protegido por cofre do SO quando disponível. Não persistir token em localStorage. Se cofre não estiver disponível, sessão temporária em vez de fallback secreto em texto.
- Navegador: cookie HttpOnly/Secure/SameSite, origens explícitas e proteção CSRF para mutações.
- Rate limits de cadastro/login e erros sem enumeração de usuários. Sem inventar recuperação de senha enquanto e-mail/domínio não estiverem configurados.

## Dados propostos

| Entidade | Campos relevantes / invariantes |
| --- | --- |
| users | id, username_normalized UNIQUE, display_name, password_hash, created_at, disabled_at |
| sessions | id, user_id, device_id, refresh_hash, expires_at, revoked_at, rotation_parent |
| profiles | user_id UNIQUE, bio/status/emoji, appearance JSON validado, visibility e permissões |
| preferences | user_id UNIQUE, revision, active_theme e library JSON com schema versionado |
| rooms | id, slug UNIQUE, owner_id, next_sequence, deleted_at, purge_after |
| room_members | room_id/user_id UNIQUE, role owner/admin/member, joined_at, revoked_at |
| messages | id, room_id, sequence UNIQUE por sala, author_id, client_message_id UNIQUE por autor, content, reply_to, edited_at, deleted_at |
| message_operations | id UNIQUE, room_id, sequence, actor_id, message_id, kind/payload validados |
| reactions | message_id/user_id/emoji UNIQUE; operações set/unset idempotentes |
| files | id, room_id, uploader_id, storage_key privada, size/hash/mime, state quarantine/ready/rejected/deleted |
| folders | id, room_id, parent_id, name; sem caminhos físicos fornecidos pelo cliente |
| blocks | owner_id/blocked_id UNIQUE |
| audit_events | ator/ação/recurso/data; sem senhas/tokens/conteúdo privado desnecessário |

Índices: mensagens por (room_id, sequence), operações por (room_id, sequence), membros ativos por usuário/sala. A sequence é atribuída numa transação pelo servidor e não depende do relógio do dispositivo.

## API inicial

| Método/rota | Comportamento |
| --- | --- |
| POST /v1/auth/register, /login, /refresh | Identidade e sessões; limites por origem/conta |
| POST /v1/auth/logout | Revogar sessão atual |
| GET/DELETE /v1/sessions/:id | Listar/revogar dispositivos do próprio usuário |
| GET/PATCH /v1/me/profile | Perfil completo do próprio usuário, validação e revisão |
| GET /v1/users/:id/profile | Projeção pública conforme bloqueio/visibilidade |
| GET/PUT /v1/me/preferences | Snapshot versionado, If-Match/revision para evitar perda concorrente |
| POST /v1/rooms | Criar sala e membership owner na mesma transação |
| GET /v1/rooms | Somente salas acessíveis ao usuário |
| DELETE /v1/rooms/:id | Owner/admin autorizado; exclusão lógica e evento após commit |
| POST /v1/rooms/:id/restore | Owner autorizado dentro do período de recuperação |
| GET /v1/rooms/:id/messages?before=seq&limit=50 | Histórico paginado, cursor e limite máximo |
| POST /v1/rooms/:id/messages | Idempotência por client_message_id e ACK após commit |
| PATCH/DELETE /v1/messages/:id | Autor ou moderação explicitamente autorizada; nunca confiar em author_id enviado |
| PUT/DELETE /v1/messages/:id/reactions/:emoji | Set/unset idempotente, membership e bloqueios |
| POST /v1/rooms/:id/uploads | Criar upload limitado, escopo e quota verificados |
| POST /v1/uploads/:id/complete | Conferir tamanho/hash/tipo e liberar após validação |
| GET /v1/files/:id/download | Revalidar acesso antes de emitir URL privada curta ou stream |

WebSocket autenticado publica message.created/updated/deleted, reaction.changed, member.changed, room.deleted/restored e preferences.changed. Cada evento tem id, roomId quando aplicável e sequence/revision. Reconexão apresenta último cursor; servidor envia delta ou exige nova página. Eventos somente depois de commit; duplicações toleradas no cliente.

## Permissões e exclusão de salas

- Validar sessão e membership em toda rota, inclusive download e assinatura WebSocket.
- Owner gerencia sala; admin tem somente poderes concedidos; membro não exclui sala.
- Sala excluída logicamente recusa mensagens/mídia novas; notifica participantes, fecha assinatura e UI sai para seleção segura.
- Período inicial proposto de recuperação: 30 dias. Não apagar mensagens/arquivos automaticamente até o mantenedor aprovar política de retenção e backup.
- Recriar mesmo slug não deve reabrir referências antigas: IDs imutáveis de sala e membership.
- Eventos de Soundboard ficam fora de messages; apresentação/atividade transitória é independente do áudio. Permissão de uso por sala pode controlar novos disparos nos clientes atualizados, mas cliente modificado ainda pode injetar áudio no próprio microfone. Não prometer filtragem separada na faixa compartilhada.

## Voz/vídeo preservados

Backend fornece tickets curtos de participação assinados e presença autorizada; pares de salas autenticadas verificam ticket, userId/roomId/peerId e expiração antes de aceitar mídia. Renovação e revogação exigem regra explícita de desconexão. Credenciais TURN temporárias são emitidas pelo servidor quando houver infraestrutura, nunca hardcoded no frontend.

Primeira integração não substitui PeerJS nem move áudio para o servidor. SFU para salas maiores será decisão futura baseada em medição de 3–6 participantes. ABR/telemetria por par continua melhoria independente.

## Arquivos e pastas

Implementar somente depois de contas/membership e quotas. Transferência em blocos retomável, consentimento antes de download, limite inicial proposto 25 MB por arquivo e quota por sala/usuário. Limites são proposta ajustável, não suporte já entregue.

Armazenamento não usa nomes originais como caminho. Bloquear travessia, nomes absolutos, symlinks e referências a outra sala. Pastas são hierarquia virtual; manifest tem profundidade/quantidade limitadas. Exportar ZIP em job com orçamento de memória/tempo; não extrair ZIP arbitrário no servidor. Arquivo enviado é tratado como bytes, sem execução ou renderização ativa; PDFs/HTML/SVG não entram em iframe privilegiado. URL de download deve forçar attachment e tipo seguro.

## GIFs

Proposta inicial: upload de GIF com limites de dimensões, frames e duração, sem provedor externo obrigatório. Exibir parado por padrão quando houver movimento reduzido e oferecer reproduzir/pausar. Decoder/transformação no servidor isolado e com orçamento. Um catálogo externo futuro exige revisão de privacidade, chave e termos; não colocar segredo de API no renderer.

## Testes de aceite antes de integrar

1. Dois usuários e dois dispositivos por usuário; sessões independentes, rotação/revogação e falhas de rede.
2. Nome duplicado em cadastro concorrente; senha incorreta; tokens expirados/reutilizados; usuário bloqueado/desabilitado.
3. Cliente envia userId/roomId/authorId de terceiro: negar leitura, escrita e download. Negar subscrição em sala sem membership.
4. Edição/exclusão/reação duplicadas, ACK após commit, ordenação e recuperação de cursor após restart do servidor.
5. Temas/perfis editados em dois dispositivos com conflito de revisão; nenhuma perda silenciosa.
6. Exclusão/restauração de sala conectada: clientes saem, histórico preservado, referências não atravessam salas.
7. Upload cancelado, retomado, quota, MIME falso, caminho malicioso, GIF excessivo e links expirados; nenhum arquivo público por padrão.
8. Chamadas existentes e Soundboard mantêm fluxo; recusar ticket de sala/ator incorretos; testar mic mudo/deafen e revogação.
9. Migrations/backup/restore e logs sem segredos. CI de API com PostgreSQL isolado; matriz física continua separada.

## Ordem de implementação após revisão

A. Serviço/DB/migrations/saúde e testes isolados → B. Contas/sessões → C. Perfis/preferências e migração opt-in → D. Salas/membership/WebSocket → E. Chat autorizado/cursor/idempotência → F. Tickets de mídia/TURN → G. Arquivos/pastas → H. GIFs → I. Validação física e release.

Esta proposta permite revisar os contratos antes de instalar infraestrutura ou vincular dados locais a contas. Publicação exigirá domínio, hospedagem, segredos e autorização de deploy; nenhuma credencial precisa ser enviada nesta etapa de revisão.
