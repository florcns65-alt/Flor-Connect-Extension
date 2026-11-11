import { EXTENSION_PUBLIC_KEY } from "../../config/extension-key";

export interface ManifestInput {
  version: string;
  store: boolean;
  supabaseUrl: string;
  florOrigin: string;
  sidePanelPath: string;
}

export function buildManifest(input: ManifestInput): Record<string, unknown> {
  const supabaseHost = new URL(input.supabaseUrl).origin;
  const florHost = new URL(input.florOrigin).origin;
  const manifest: Record<string, unknown> = {
    manifest_version: 3,
    name: "FLOR Connect",
    version: input.version,
    minimum_chrome_version: "116",
    description: "Sign in to FLOR and see today's patients.",
    action: {
      default_title: "FLOR Connect",
      default_icon: {
        "16": "icons/icon-16.png",
        "32": "icons/icon-32.png",
        "48": "icons/icon-48.png",
      },
    },
    icons: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    background: {
      service_worker: "background.js",
      type: "module",
    },
    side_panel: {
      default_path: input.sidePanelPath,
    },
    permissions: ["sidePanel", "storage", "identity", "scripting", "activeTab", "alarms", "tabs"],
    host_permissions: [`${supabaseHost}/*`, `${florHost}/*`],
    optional_host_permissions: ["https://*/*", "http://*/*"],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  };
  if (!input.store) manifest.key = EXTENSION_PUBLIC_KEY;
  return manifest;
}
