# cbsHUB Studio — STUDIO-001

05/11/2026 · Codex/OpenAI · branch `feat/cbshub-studio-2026-11-05` · base `08f0c51`.

## Uso e comportamento

O botão de paleta na navegação abre o Studio. Escolha Dark Modern, Light Modern, OLED Black, Minimal, Gamer Neon ou Custom. Cores possuem seletor nativo, entrada HEX e amostra. Abas Fundo e Layout controlam cenário, densidade, medidas e acessibilidade. A amostra e a interface atrás do diálogo mudam em tempo real. Cancelar, Escape, fechar ou clicar fora restauram o tema anteriormente salvo. O editor mantém uma paleta legível própria para permitir recuperação mesmo de temas com contraste ruim.

Salvar tema aplica e persiste a configuração; editar um item da biblioteca atualiza esse item. Presets iniciais são imutáveis: salvá-los cria um tema do usuário. Biblioteca local de até 20 temas: selecionar, duplicar, renomear (campo seguido de Tab/blur), exportar e excluir. Excluir uma entrada não apaga a aparência ativa, que pode ser salva novamente. Restaurar padrões prepara Dark Modern em prévia; salvar confirma e cancelar desfaz. Não apaga a biblioteca.

Ajustes: fundos principal/sidebar/feed/editor; botão/texto do botão; texto principal/secundário; destaque; borda; hover; foco. Fundo sólido, gradiente (duas cores e ângulo) ou imagem raster incorporada, opacidade e desfoque. Layout: largura 224–360px, navegação recolhida, membros visíveis, densidade, avatar, fonte, escala tipográfica, arredondamento, espaçamento, sombras, opacidade e animações/movimento reduzido. A escala ajusta fonte-base/rem; não altera pixels de vídeo nem aplica zoom a capturas de tela. Alguns estilos de mídia/perfil possuem cores próprias e não são substituídos pelo tema.

## Arquitetura

- `src/studio/theme.ts`: modelo de dados, seis presets, validação estrita, serialização e cálculo de contraste WCAG.
- `StudioProvider.tsx`: tema salvo e rascunho separados, biblioteca, aplicação de propriedades CSS permitidas, persistência atômica em localStorage `cbshub-studio-v1`. Falhas de gravação são exibidas; a versão salva não é substituída em memória se o armazenamento falhar. Dados locais inválidos usam padrões seguros no carregamento.
- `StudioDialog.tsx`: editor shadcn/Radix com abas, sliders, switches, importação/exportação e amostra.
- `main.tsx` instala o provider sem remontar os motores. App acrescenta o diálogo; rail acrescenta o botão. `useWorkspaceLayout` usa a configuração visual do Studio e migra as três preferências antigas quando ainda não existe Studio salvo.
- `index.css` recebe variáveis de cor/dimensões, camada de wallpaper isolada do texto e regra de movimento reduzido. Não se injeta stylesheet textual.
- Primitivo Slider encaminha nome acessível ao Thumb. Sheet recebe foco inicial no contêiner rotulado, evitando tooltip automático do primeiro botão interceptar Escape; Tab continua percorrendo controles.

Nenhuma alteração em motores WebRTC/áudio/chat, banco de mensagens, Zustand de comunicação, contratos de rede, Electron, manifesto ou lockfile. Nenhuma biblioteca instalada. Temas não são enviados a outros participantes. Não há backend de conta/sincronização de temas; persistência é local. Transferência entre dispositivos usa export/import manual. Não há sincronização automática ou perfis nesta etapa.

## Formato JSON v1

Envelope: `{ "format": "cbshub-studio", "version": 1, "theme": { ... } }`.
Exemplo completo em `docs/themes/dark-modern.cbshub.json`, gerado pelo serializador real.

`theme`: `name` (1–60 caracteres), `mode` (dark/light), `colors`, `background`, `layout`. Todos os campos são obrigatórios; campos extras, versões desconhecidas, tipos incorretos e medidas fora das faixas são rejeitados. `colors` aceita somente HEX #RRGGBB, com as chaves declaradas em COLOR_LABELS. `background` aceita kind solid/gradient/image, from/to HEX, angle 0–360, opacity 0–1, blur 0–30 e image vazia ou data URL raster. As faixas de layout estão declaradas e testadas no validador; booleanos não aceitam strings.

Não há campos CSS, HTML, scripts, seletores, fontes externas ou URLs remotas. Imagens: PNG/JPEG/WebP até 1 MB; importação e upload decodificam e reencodam em canvas (até 1600px no maior lado), rejeitam dimensões acima de 8192px e limitam saída. SVG é proibido. O JSON inteiro tem limite de 1,5 MB. Imagens são incorporadas na exportação; nenhuma busca externa é feita para renderizar fundos. O parser valida o formato; a UI valida/normaliza o conteúdo raster antes de aplicá-lo.

## Acessibilidade

Seis pares de texto/superfície mostram razão de contraste e referência AA 4,5:1. Avisos orientam o usuário; temas de baixo contraste podem ser experimentados/salvos. A checagem não certifica acessibilidade de toda a aplicação: texto sobre imagens/gradientes e composição com transparência precisam de revisão visual. Foco é configurável; manter contraste adequado do anel. O sistema operacional sempre prevalece quando pede movimento reduzido. Desativar animações ou ativar movimento reduzido no Studio reduz transições/animações.

## Validação e limitações

Comandos: `npm run build`, `node tests/theme-validation.cjs`, `node tests/studio-smoke.cjs`, `node tests/redesign-smoke.cjs`. Os dois smoke tests requerem Playwright/Chromium disponíveis no host e renderer em 127.0.0.1:5173; ver tests/README.md. Probes de core permanecem em /workspace/cbshub-onboarding/audit-smoke.cjs.

Validação unitária: 8 grupos cobrindo presets/roundtrip, contraste conhecido, versões, injeções CSS/JS, campos/protótipo, imagens proibidas, tipos/faixas e limites de nome/arquivo. Smoke Studio: prévia/cancelamento, salvar/reload, biblioteca, download, importação inválida/válida, HEX, gradiente/raster, largura, movimento reduzido, defaults/cancelamento, móvel/Escape e ausência de pageerror. Regressão geral: layout, compositor/IndexedDB/reações, modal, WAV/mixagem/stopAll e API Electron. Dados e mídia sintéticos; não comprova chamadas remotas.

O teste inicial do slider falhou por nome acessível no contêiner, corrigido no Thumb. O teste de Escape da gaveta revelou tooltip autoaberto no foco inicial; corrigido com foco inicial no painel. Não foram contados como passes antes dos ajustes. A compilação mantém aviso de bundle >500kB e K01 do preload. Defeitos prévios de favoritos nativos/propagação de avatar e validação real multipar/Windows permanecem. Limite/quota do localStorage pode restringir biblioteca com muitas imagens; exportação permite preservar o tema quando uma gravação falha. Não há teste completo de leitor de tela, todos os GPUs/SOs ou sincronização entre máquinas.
