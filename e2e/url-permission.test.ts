import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const enabled = process.env.FLOR_BROWSER_E2E === "1";
const chromePath = process.env.CHROME_PATH || "/tmp/chrome-linux64/chrome";
const extensionId = "bmjkikhmfmaieahonelaljfkeapiflah";

class Cdp {
  private id = 0;
  private pending = new Map<number, (value: unknown) => void>();
  constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
      if (message.id && this.pending.has(message.id)) this.pending.get(message.id)?.(message.result);
    });
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, (value) => resolve((value ?? {}) as Record<string, unknown>));
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

async function connect(port: number): Promise<Cdp> {
  let url = "";
  for (let attempt = 0; attempt < 40 && !url; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      url = ((await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json())) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
    } catch {
      url = "";
    }
  }
  if (!url) throw new Error("Chrome debugging port did not open");
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  return new Cdp(socket);
}

describe.skipIf(!enabled)("real Chrome tab address permission", () => {
  it("does not call a hidden address a non-web page, and shows the panel build", async () => {
    const extensionDir = mkdtempSync(join(tmpdir(), "flor-ext-"));
    cpSync("dist", extensionDir, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(extensionDir, "manifest.json"), "utf8")) as {
      version: string;
      host_permissions?: string[];
      optional_host_permissions?: string[];
    };
    expect(manifest.version).toBe("2.6.0");
    expect(manifest.host_permissions?.some((item) => item.includes("127.0.0.1"))).toBe(false);
    expect(manifest.optional_host_permissions).toEqual(expect.arrayContaining(["https://*/*", "http://*/*"]));
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<!doctype html><h1>John Sánchez</h1><p>18 Jul 1980</p>");
    });
    const site = await new Promise<{ url: string; close: () => void }>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
      });
    });
    const profile = mkdtempSync(join(tmpdir(), "flor-profile-"));
    const chrome: ChildProcess = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-allow-origins=*", "--remote-debugging-port=9335", `--user-data-dir=${profile}`, `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, site.url], { stdio: "ignore" });
    try {
      const cdp = await connect(9335);
      const listed = (await fetch("http://127.0.0.1:9335/json/list").then((response) => response.json())) as Array<{ id: string; url: string; type: string }>;
      const siteTarget = listed.find((target) => target.url.startsWith(site.url));
      expect(siteTarget?.id).toBeTruthy();
      const worker = listed.find((target) => target.type === "service_worker");
      expect(worker?.id).toBeTruthy();
      const workerSession = String((await cdp.send("Target.attachToTarget", { targetId: worker!.id, flatten: true })).sessionId);
      await cdp.send("Runtime.enable", {}, workerSession);
      const workerProbe = await cdp.send("Runtime.evaluate", {
        expression: `chrome.tabs.query({}).then((tabs) => ({ httpWithUrl: tabs.filter((tab) => typeof tab.url === "string" && tab.url.startsWith("http")).length, missingUrl: tabs.filter((tab) => !Object.prototype.hasOwnProperty.call(tab, "url")).length }))`,
        awaitPromise: true,
        returnByValue: true,
      }, workerSession);
      const workerTabs = (workerProbe.result as { value?: { httpWithUrl: number; missingUrl: number } } | undefined)?.value;
      expect(workerTabs?.missingUrl).toBeGreaterThan(0);
      expect(workerTabs?.httpWithUrl).toBe(0);
      const panel = await cdp.send("Target.createTarget", { url: "about:blank" });
      const session = String((await cdp.send("Target.attachToTarget", { targetId: panel.targetId, flatten: true })).sessionId);
      await cdp.send("Page.enable", {}, session);
      await cdp.send("Runtime.enable", {}, session);
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => {
          const person = { id: "22222222-2222-4222-8222-222222222222", firstName: "Test", lastName: "Synthetic", middleName: null, name: "Test Synthetic", dateOfBirth: "2020-01-01", sex: null, mrn: "MRN-TEST", phone: null, email: null, addressLine1: null, city: null, state: null, postalCode: null, insurancePayer: null, insuranceMemberId: null };
          const ws = "11111111-1111-4111-8111-111111111111";
          const ok = (data) => ({ ok: true, data });
          const answer = (message) => {
            if (!message || !message.type) return ok(null);
            if (message.type === "auth:getState") return ok({ phase: "signed_in", user: { id: "33333333-3333-4333-8333-333333333333", email: "synthetic@example.test", name: "Synthetic Clinician" }, error: null });
            if (message.type === "data:bootstrap") return ok({ legal: { complete: true, missing: [] }, workspaces: [{ id: ws, name: "Synthetic workspace", role: "clinician" }], workspaceId: ws });
            if (message.type === "data:appointments") return ok([]);
            if (message.type === "data:people" || message.type === "data:search") return ok({ people: [{ id: person.id, firstName: person.firstName, lastName: person.lastName, name: person.name, dateOfBirth: person.dateOfBirth, sex: null, mrn: person.mrn, appointment: null }], total: 1, offset: 0, limit: 50 });
            if (message.type === "data:patient") return ok({ person, upcoming: [], recent: [] });
            if (message.type === "meta:version") return ok({ version: "2.6.0" });
            if (message.type === "data:updatePerson") return { ok: false, error: { code: "server", message: "no write" } };
            return ok(null);
          };
          const install = () => {
            if (!globalThis.chrome?.runtime?.sendMessage || globalThis.chrome.runtime.__florStub) return;
            const real = globalThis.chrome.runtime.sendMessage.bind(globalThis.chrome.runtime);
            globalThis.chrome.runtime.__florStub = true;
            globalThis.chrome.runtime.sendMessage = (message, ...rest) => message && message.type ? Promise.resolve(answer(message)) : real(message, ...rest);
          };
          install();
        })();`,
      }, session);
      await cdp.send("Page.navigate", { url: `chrome-extension://${extensionId}/src/ui/sidepanel.html` }, session);
      let text = "";
      for (let attempt = 0; attempt < 30 && !text.includes("Panel 2.6.0"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        text = String(((await cdp.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true }, session)).result as { value?: string } | undefined)?.value ?? "");
      }
      expect(text).toContain("Panel 2.6.0");
      expect(text).toContain("Installed 2.6.0");
      await cdp.send("Target.activateTarget", { targetId: siteTarget!.id });
      const clicked = await cdp.send("Runtime.evaluate", {
        expression: `(() => { const button = [...document.querySelectorAll("button")].find((item) => (item.innerText || "").includes("Patients")); if (!button) return false; button.click(); return true; })()`,
        returnByValue: true,
      }, session);
      expect((clicked.result as { value?: boolean } | undefined)?.value).toBe(true);
      for (let attempt = 0; attempt < 30 && !text.includes("Test Synthetic"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        text = String(((await cdp.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true }, session)).result as { value?: string } | undefined)?.value ?? "");
      }
      await cdp.send("Runtime.evaluate", {
        expression: `(() => { const button = [...document.querySelectorAll("button")].find((item) => (item.innerText || "").includes("Test Synthetic")); button.click(); })()`,
        returnByValue: true,
      }, session);
      for (let attempt = 0; attempt < 30 && !text.includes("Save this page to FLOR"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        text = String(((await cdp.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true }, session)).result as { value?: string } | undefined)?.value ?? "");
      }
      expect(text).toContain("Panel 2.6.0");
      await cdp.send("Runtime.evaluate", {
        expression: `(() => { const button = [...document.querySelectorAll("button")].find((item) => (item.innerText || "").includes("Save this page to FLOR")); button.click(); })()`,
        returnByValue: true,
      }, session);
      let result = "";
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        result = String(((await cdp.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true }, session)).result as { value?: string } | undefined)?.value ?? "");
        if (result.includes("did not share") || result.includes("Sánchez") || result.includes("John")) break;
      }
      expect(result).not.toContain("not a website");
      expect(result.includes("did not share the active tab") || result.includes("Sánchez") || result.includes("John")).toBe(true);
    } finally {
      chrome.kill();
      site.close();
    }
  }, 45000);
});
