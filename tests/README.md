# Testes

Os testes são scripts `tests/*.cjs`. A maioria usa Playwright e Chromium (`/usr/bin/chromium`) instalados no host, que **não** são dependências do app. Em outro ambiente, instale-os ou adapte os caminhos.

## Como rodar

```sh
npm run build
npm run dev:renderer   # em um terminal; mantenha aberto
npm test               # em outro terminal
```

Um teste isolado: `node tests/<nome>.cjs`.

- `npm test` descobre todos os `.cjs`, grava logs em `build/test-logs/` e o resultado em `build/test-results.json`.
- Teste `BLOCKED` (ambiente impedido de rodá-lo) também sai com código 1 e **nunca** significa aprovado.
- Não edite o código enquanto os testes rodam e reinicie o renderer depois de mexer em módulos centrais (store/motor): o hot reload duplica singletons usados pelos imports dinâmicos.
- Os testes Electron headless usam `--no-sandbox` só dentro do container de teste; o app mantém `sandbox: true`. `CBSHUB_TEST_EXECUTABLE` permite validar o pacote Linux.
- Electron 45 baixa o runtime sob demanda: rode `node node_modules/electron/install.js` antes (em cloud com proxy, `ELECTRON_GET_USE_PROXY=1`).

## Grupos

| Área | Testes |
| --- | --- |
| Interface e layout | `redesign-smoke`, `compact-bars`, `hotfix-layout`, `workspace-sidebar`, `desktop-refinement`, `visual-fixes`, `stabilization-a11y` |
| Temas (Studio) | `theme-validation` (sem navegador), `studio-smoke`, `boot-theme` |
| Perfis | `profile-validation` (sem navegador), `profile-smoke` |
| Chat | `chat-model` (sem navegador), `chat-smoke`, `chat-drafts`, `chat-toolbar`, `message-identity` |
| Voz, vídeo e Soundboard | `media-smoke`, `media-engine`, `media-transport`, `audio-tools`, `audio-trim`, `audio-peak-stability`, `stream-telemetry` |
| Conexão e recuperação | `call-recovery`, `hotfix-recovery`, `signaling-validation` |
| Electron e desktop | `electron-smoke`, `desktop-security`, `window-controls`, `tray-lifecycle`, `background-notice`, `native-notifications`, `notification-ipc`, `desktop7` |
| Marca | `official-logo` |
| Outros | `acceptance-gaps` |

## Limites importantes

- Os testes usam perfis efêmeros, mídia sintética e bloqueiam destinos externos. Nenhum comprova comunicação real entre dois dispositivos.
- `media-transport` tenta conexões WebRTC locais e falha explicitamente se o Chromium não oferecer candidatos ICE. Está **BLOCKED** no ambiente cloud (política administrada do Chromium); não use como evidência de dois dispositivos físicos.
- Sem teste de hardware de áudio, bandeja do Windows, instalador Windows ou atalho global.
- Não há CI configurado ainda.
