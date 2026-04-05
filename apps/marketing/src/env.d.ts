/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_IOS_WAITLIST_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
