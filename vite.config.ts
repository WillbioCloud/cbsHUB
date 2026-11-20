import {productionCsp} from './electron/security.ts';
import { defineConfig } from 'vite';
import {fileURLToPath} from 'node:url';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    {name:"cbshub-production-csp",apply:"build",transformIndexHtml(){return [{tag:"meta",attrs:{"http-equiv":"Content-Security-Policy",content:productionCsp},injectTo:"head-prepend"}];}},
    tailwindcss(),
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            // Disable the plugin's ES library default instead of merging format arrays.
            lib: false,
            rollupOptions: {
              input: "electron/preload.ts",
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                exports: 'auto',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
