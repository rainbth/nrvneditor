/// <reference types="vite/client" />

import type { NrvnBridge } from "../electron/types";

declare global {
  interface Window {
    nrvn?: NrvnBridge;
  }

  interface ImportMetaEnv {
    readonly VITE_MOCK_BRIDGE?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
