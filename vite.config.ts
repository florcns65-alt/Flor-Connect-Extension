import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import preview from "./config/preview.json";
import prod from "./config/prod.json";
import { buildManifest } from "./src/shared/manifest";

const PLACEHOLDER = "__SUPABASE_PUBLISHABLE_KEY__";

interface ProfileFile {
  supabaseUrl: string;
  supabasePublishableKey: string;
  florOrigin: string;
}

function assertPublishableKey(key: string): void {
  if (key.includes("service_role")) {
    throw new Error(
      "FLOR_SUPABASE_PUBLISHABLE_KEY looks like a service-role key. Use the Supabase publishable (anon) key.",
    );
  }
  const parts = key.split(".");
  if (parts.length !== 3) return;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
    if (payload.role === "service_role") {
      throw new Error(
        "FLOR_SUPABASE_PUBLISHABLE_KEY is a service-role key. Use the Supabase publishable (anon) key.",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("service-role")) throw error;
  }
}

function loadProfile(profile: "preview" | "prod"): FlorBuildConfig {
  const file = (profile === "prod" ? prod : preview) as ProfileFile;
  if (file.supabasePublishableKey !== PLACEHOLDER) {
    throw new Error(
      `config/${profile}.json must keep supabasePublishableKey set to ${PLACEHOLDER}. The real key is injected from FLOR_SUPABASE_PUBLISHABLE_KEY.`,
    );
  }
  const key = process.env.FLOR_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing FLOR_SUPABASE_PUBLISHABLE_KEY. Set it to the Supabase publishable (anon) key before building. Do not use a service-role key.",
    );
  }
  assertPublishableKey(key);
  return {
    supabaseUrl: file.supabaseUrl,
    supabasePublishableKey: key,
    florOrigin: file.florOrigin,
    profile,
  };
}

function florExtension(options: { config: FlorBuildConfig; version: string; store: boolean }): Plugin {
  return {
    name: "flor-extension",
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(?:="[^"]*")?/g, "");
    },
    generateBundle(_outputOptions, bundle) {
      const html = Object.values(bundle).find((item) => item.type === "asset" && item.fileName.endsWith(".html"));
      const sidePanelPath = html && html.type === "asset" ? html.fileName : "src/ui/sidepanel.html";
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(
          buildManifest({
            version: options.version,
            store: options.store,
            supabaseUrl: options.config.supabaseUrl,
            florOrigin: options.config.florOrigin,
            sidePanelPath,
          }),
          null,
          2,
        ),
      });
      for (const item of Object.values(bundle)) {
        const source = item.type === "chunk" ? item.code : typeof item.source === "string" ? item.source : "";
        if (source.includes(PLACEHOLDER)) {
          this.error("Build output still contains the publishable-key placeholder.");
        }
      }
    },
  };
}

const testConfig: FlorBuildConfig = {
  supabaseUrl: "https://wbxzevwfxizfjtxrarjq.supabase.co",
  supabasePublishableKey: "test-publishable-key",
  florOrigin: "https://florcns-preview-onbk3fadxa-ue.a.run.app",
  profile: "preview",
};

export default defineConfig(({ mode }) => {
  const isTest = mode === "test" || Boolean(process.env.VITEST);
  if (isTest) {
    return {
      plugins: [react()],
      define: {
        __FLOR_CONFIG__: JSON.stringify(testConfig),
        __FLOR_VERSION__: JSON.stringify("2.7.0"),
      },
      test: {
        environment: "jsdom",
        setupFiles: ["./tests/setup.ts"],
      },
    };
  }

  const store = mode === "store";
  const profile = process.env.FLOR_PROFILE === "prod" ? "prod" : "preview";
  const config = loadProfile(profile);
  const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string })
    .version;

  return {
    mode: store ? "production" : mode,
    base: "./",
    publicDir: "public",
    plugins: [react(), florExtension({ config, version, store })],
    define: {
      __FLOR_CONFIG__: JSON.stringify(config),
      __FLOR_VERSION__: JSON.stringify(version),
      global: "globalThis",
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      modulePreload: false,
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, "src/ui/sidepanel.html"),
          background: resolve(__dirname, "src/background/index.ts"),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
