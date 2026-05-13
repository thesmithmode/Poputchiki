/// <reference types="vite/client" />

// biome-ignore lint/correctness/noUnusedVariables: Vite env var type augmentation
interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

declare module "*.md?raw" {
  const content: string;
  export default content;
}
