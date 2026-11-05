/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_METERED_TURN_URL?: string;
  readonly VITE_METERED_TURNS_URL?: string;
  readonly VITE_METERED_USERNAME?: string;
  readonly VITE_METERED_CREDENTIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

