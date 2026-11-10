/// <reference types="vite/client" />

interface FlorBuildConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  florOrigin: string;
  profile: "preview" | "prod";
}

declare const __FLOR_CONFIG__: FlorBuildConfig;
declare const __FLOR_VERSION__: string;
