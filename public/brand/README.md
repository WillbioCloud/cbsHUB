# Identidade oficial cbsHUB — marca atual

A marca atual é o símbolo em duas partes fornecido pelo mantenedor e confirmado como nova logo oficial em 05/11/2026. Ela substitui a marca circular anterior. Cores originais: azul-marinho `#29256B` e turquesa `#12C9BD`.

`logo.svg` preserva o SVG fornecido: viewBox 1000 × 1000, os dois paths e as cores. O fundo é transparente. SHA-256 do arquivo: `6ecb64a39d9cc15049018e1aa5ded72230f19329bc3220ff5fa3bf5cda3356c7`.

`mark.svg` deriva do original ajustando somente o viewBox às margens transparentes, com 4% de respiro para ícones. Não altera paths, cores ou proporções. É usado na titlebar e na navegação para tornar o símbolo legível em 20px.

`logo-N.png`: exportações transparentes quadradas em 16, 20, 24, 32, 48, 64, 128, 256 e 512 px. `app.ico`: frames PNG RGBA de 16/24/32/48/64/128/256 px. `manifest.json` registra hash, viewBoxes e resoluções.

Regenerar na raiz: `node scripts/export-brand.cjs`. Requer Playwright e Chromium no host, sem dependência nova no aplicativo. Conversão por SVG/canvas, sem redesenho ou geração de imagem.

Integração: OfficialLogo usa mark.svg; BrowserWindow usa PNG256; electron-builder Windows usa ICO e Linux usa PNG512. Não existe Tray ativo. O ICO está disponível para eventual implementação, sem declarar bandeja ou instalador Windows testados.
