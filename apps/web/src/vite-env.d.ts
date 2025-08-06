/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_API_KEY: string
  readonly VITE_JUDGE0_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}