# cbsHUB

Aplicativo desktop (Electron) de voz, webcam, compartilhamento de tela e chat, estilo Discord, em comunicação P2P. Feito com React, TypeScript, Tailwind 4, shadcn/Radix, Zustand e PeerJS/WebRTC.

Versão: **2.0.0-rc.7** (candidato de revisão, sem aprovação para produção).

## Começando

Requer Node >= 22.12.

```sh
npm ci --legacy-peer-deps
node node_modules/electron/install.js
npm run dev
```

O lockfile atual exige `--legacy-peer-deps`. Em ambiente com proxy, use `ELECTRON_GET_USE_PROXY=1` antes do `install.js`. `npm run dev` precisa de sessão gráfica.

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Abre o app em modo desenvolvimento |
| `npm run build` | `tsc` + build do renderer (`dist/`) e do main/preload (`dist-electron/`) |
| `npm run package` | Gera os instaladores Windows (NSIS e portable) |
| `npm test` | Roda os testes de `tests/` (veja [tests/README.md](tests/README.md)) |

Pacote Linux para revisão: `npm run build && npx --no-install electron-builder --linux --dir -c.electronDist=node_modules/electron/dist` (saída em `dist-package/linux-unpacked/`).

## Como funciona

- **Sinalização:** PeerJS Cloud. **Mídia e chat:** direto entre os usuários (WebRTC). Redes com NAT restritivo podem precisar de TURN; configure em `.env` a partir de `.env.example` e nunca versione credenciais.
- **Sem backend:** não há contas, permissões nem sincronização global. A sala é só um slug.
- **Dados locais:** histórico e sons em IndexedDB; temas, perfis e preferências em localStorage.
- **Ainda não existe:** DM, anexos/pastas, GIFs, sincronização entre dispositivos, notificações do SO para mensagens e PTT global.

## Estrutura

```
src/          app React (components, chat, profiles, studio, store, lib/ com os motores)
electron/     processo main, preload, segurança e notificações
tests/        testes de regressão (.cjs)
scripts/      runner de testes, servidor do renderer e exportador de marca
public/brand/ logo e ícones oficiais
docs/         documentação (abaixo)
```

## Documentação

| Arquivo | Conteúdo |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Componentes, fluxos, persistência e contratos a preservar |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Problemas conhecidos e limitações |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Etapas planejadas |
| [docs/BACKEND_PROPOSAL.md](docs/BACKEND_PROPOSAL.md) | Proposta de backend (não implementado) |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens e componentes visuais |
| [docs/STUDIO.md](docs/STUDIO.md) | Editor de temas e formato JSON |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Histórico de mudanças |
| [docs/VERSIONING.md](docs/VERSIONING.md) | Política de versões |
| [docs/SDD.md](docs/SDD.md) | Especificação original do produto |

Os relatórios detalhados de cada fase de desenvolvimento foram removidos da árvore; continuam no histórico do git (commit `dfa74ba`).
