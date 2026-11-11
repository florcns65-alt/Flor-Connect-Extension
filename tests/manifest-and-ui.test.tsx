import { createHash } from "node:crypto";
import { act, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EXTENSION_ID, EXTENSION_PUBLIC_KEY } from "../config/extension-key";
import { buildManifest } from "../src/shared/manifest";
import { useDebouncedValue } from "../src/ui/use-debounced";
import { HomeScreen } from "../src/ui/screens/HomeScreen";
import { SetupScreen } from "../src/ui/screens/SetupScreen";
import { WelcomeScreen } from "../src/ui/screens/WelcomeScreen";

function extensionIdFromKey(base64Key: string): string {
  const digest = createHash("sha256").update(Buffer.from(base64Key, "base64")).digest();
  let id = "";
  for (const byte of digest.subarray(0, 16)) {
    id += String.fromCharCode("a".charCodeAt(0) + (byte >> 4));
    id += String.fromCharCode("a".charCodeAt(0) + (byte & 0x0f));
  }
  return id;
}

describe("manifest", () => {
  const input = {
    version: "2.0.0",
    store: false,
    supabaseUrl: "https://wbxzevwfxizfjtxrarjq.supabase.co",
    florOrigin: "https://florcns-preview-onbk3fadxa-ue.a.run.app",
    sidePanelPath: "src/ui/sidepanel.html",
  };

  it("derives the unpacked extension id from the public key", () => {
    expect(extensionIdFromKey(EXTENSION_PUBLIC_KEY)).toBe(EXTENSION_ID);
    expect(EXTENSION_ID).toBe("bmjkikhmfmaieahonelaljfkeapiflah");
  });

  it("matches the Milestone 1 manifest and omits the key for a store build", () => {
    const manifest = buildManifest(input);
    expect(manifest).toMatchObject({
      manifest_version: 3,
      name: "FLOR Connect",
      version: "2.0.0",
      minimum_chrome_version: "116",
      permissions: ["sidePanel", "storage", "identity", "scripting", "activeTab", "alarms", "tabs"],
      host_permissions: [
        "https://wbxzevwfxizfjtxrarjq.supabase.co/*",
        "https://florcns-preview-onbk3fadxa-ue.a.run.app/*",
      ],
      optional_host_permissions: ["https://*/*", "http://*/*"],
      content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
    });
    expect(manifest.key).toBe(EXTENSION_PUBLIC_KEY);
    const background = manifest.background as { service_worker: string; type: string };
    expect(background).toEqual({ service_worker: "background.js", type: "module" });
    expect(buildManifest({ ...input, store: true }).key).toBeUndefined();
  });
});

describe("screens", () => {
  it("shows the welcome sign-in and the saved-with-you line", () => {
    const onSignIn = vi.fn();
    render(<WelcomeScreen busy={false} error={null} onSignIn={onSignIn} />);
    screen.getByRole("button", { name: /continue with google/i }).click();
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(screen.getByText("Nothing is saved without you.")).toBeInTheDocument();
    expect(screen.getByText(/ask your clinic admin for an invite/i)).toBeInTheDocument();
  });

  it("shows an empty today list and a disabled fill action", () => {
    render(
      <HomeScreen
        greeting="Good afternoon, Chioma"
        initials="CO"
        workspaceName="Worcester P&N"
        workspaces={[{ id: "11111111-1111-4111-8111-111111111111", name: "Worcester P&N", role: "clinician" }]}
        workspaceId="11111111-1111-4111-8111-111111111111"
        onSelectWorkspace={() => undefined}
        onOpenSettings={() => undefined}
        onSeeAll={() => undefined}
        query=""
        onQuery={() => undefined}
        appointments={[]}
        appointmentsLoading={false}
        searchResults={null}
        searchLoading={false}
        error={null}
        offline={false}
        onRetry={() => undefined}
        onOpenPatient={() => undefined}
        route="home"
        onNavigate={() => undefined}
      />,
    );
    expect(screen.getByText("No appointments today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fill this page/i })).toBeDisabled();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByLabelText("Who are you seeing?")).toBeInTheDocument();
  });

  it("shows the setup checklist when legal acceptance is missing", () => {
    render(<SetupScreen missing={["hipaa", "privacy"]} onOpenFlor={() => undefined} onRecheck={() => undefined} busy={false} />);
    expect(screen.getByRole("heading", { name: "Finish your FLOR setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish your FLOR setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /i've done it/i })).toBeInTheDocument();
    expect(screen.getByText("HIPAA notice")).toBeInTheDocument();
  });
});

describe("search debounce", () => {
  it("waits 250ms before publishing a query", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: "" },
    });
    rerender({ value: "ja" });
    expect(result.current).toBe("");
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe("");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("ja");
    vi.useRealTimers();
  });
});
