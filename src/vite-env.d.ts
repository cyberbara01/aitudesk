/// <reference types="vite/client" />
declare module "*.svg?raw" {
  const content: string;
  export default content;
}

/** package.json version, set by vite.config.ts. */
declare const __APP_VERSION__: string;
