import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const enabled = process.env.FLOR_BROWSER_E2E === "1";
const chromePath = process.env.CHROME_PATH || "/tmp/chrome-linux64/chrome";
const extensionId = "bmjkikhmfmaieahonelaljfkeapiflah";

function serve(pages: Record<string, string>): Promise<{ url: (path: string) => string; close: () => void }> {
  const server = createServer((request, response) => {
    const body = pages[request.url ?? "/"] ?? pages["/"];
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ url: (path) => `http://127.0.0.1:${port}${path}`, close: () => server.close() });
    });
  });
}

class Cdp {
  private id = 0;
  private pending = new Map<number, (value: unknown) => void>();
  private sessions = new Map<string, (value: unknown) => void>();

  constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; sessionId?: string; method?: string; params?: { sessionId?: string } };
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

async function connectBrowser(port: number): Promise<Cdp> {
  let browserUrl = "";
  for (let attempt = 0; attempt < 40 && !browserUrl; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      const version = (await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json())) as { webSocketDebuggerUrl: string };
      browserUrl = version.webSocketDebuggerUrl;
    } catch {
      browserUrl = "";
    }
  }
  if (!browserUrl) throw new Error("Chrome debugging port did not open");
  const socket = new WebSocket(browserUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  return new Cdp(socket);
}

function stub(person: { id: string; firstName: string; lastName: string; dateOfBirth: string; mrn: string }): string {
  return `(() => {
    const person = ${JSON.stringify({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      middleName: null,
      name: person.firstName + " " + person.lastName,
      dateOfBirth: person.dateOfBirth,
      sex: null,
      mrn: person.mrn,
      phone: null,
      email: null,
      addressLine1: null,
      city: null,
      state: null,
      postalCode: null,
      insurancePayer: null,
      insuranceMemberId: null,
    })};
    const ws = "11111111-1111-4111-8111-111111111111";
    const ok = (data) => ({ ok: true, data });
    const answer = (message) => {
      if (message.type === "auth:getState") return ok({ phase: "signed_in", user: { id: "33333333-3333-4333-8333-333333333333", email: "synthetic@example.test", name: "Synthetic Clinician" }, error: null });
      if (message.type === "data:bootstrap") return ok({ legal: { complete: true, missing: [] }, workspaces: [{ id: ws, name: "Synthetic workspace", role: "clinician" }], workspaceId: ws });
      if (message.type === "data:appointments") return ok([]);
      if (message.type === "data:people" || message.type === "data:search") return ok({ people: [{ id: person.id, firstName: person.firstName, lastName: person.lastName, name: person.name, dateOfBirth: person.dateOfBirth, sex: person.sex, mrn: person.mrn, appointment: null }], total: 1, offset: 0, limit: 50 });
      if (message.type === "data:patient") return ok({ person, upcoming: [], recent: [] });
      if (message.type === "data:updatePerson") return { ok: false, error: { code: "server", message: "This test does not write to FLOR." } };
      if (message.type === "meta:version") return ok({ version: "2.5.0" });
      return ok(null);
    };
    const install = () => {
      if (!globalThis.chrome?.runtime?.sendMessage || globalThis.chrome.runtime.__florStub) return;
      globalThis.chrome.runtime.__florStub = true;
      globalThis.chrome.runtime.sendMessage = (message) => Promise.resolve(answer(message || {}));
    };
    install();
    document.addEventListener("DOMContentLoaded", install);
  })();`;
}

async function panelText(cdp: Cdp, sessionId: string): Promise<string> {
  const result = await cdp.send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true }, sessionId);
  const value = (result.result as { value?: string } | undefined)?.value;
  return value ?? "";
}

async function clickText(cdp: Cdp, sessionId: string, text: string): Promise<void> {
  const clicked = await cdp.send(
    "Runtime.evaluate",
    {
      expression: `(() => { const button = [...document.querySelectorAll("button")].find((item) => (item.innerText || "").includes(${JSON.stringify(text)})); if (!button) return false; button.click(); return true; })()`,
      returnByValue: true,
    },
    sessionId,
  );
  if (!(clicked.result as { value?: boolean } | undefined)?.value) throw new Error(`Button not found: ${text}`);
}

describe.skipIf(!enabled)("installed side panel chain", () => {
  it("clicks Save in the panel, injects into the fixture tab, and previews the read", async () => {
    const extensionDir = mkdtempSync(join(tmpdir(), "flor-ext-"));
    cpSync("dist", extensionDir, { recursive: true });
    const manifestPath = join(extensionDir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { version: string; key?: string; host_permissions?: string[]; optional_host_permissions?: string[] };
    expect(manifest.version).toBe("2.5.0");
    expect(manifest.key).toBeTruthy();
    manifest.host_permissions = [...(manifest.host_permissions ?? []), "http://127.0.0.1/*"];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const site = await serve({
      "/openemr": `<!doctype html><header><h1>Phil Belford (1)</h1><p>DOB: 1972-02-09</p></header><section id="who"><table><tr><td>Name</td><td>Phil</td><td>Belford</td></tr><tr><td>DOB</td><td>1972-02-09</td></tr></table></section>`,
      "/openmrs": `<!doctype html><form><div><label>Given (required)</label><input value="John"></div><div><label>Family Name (required)</label><input value="Sánchez"></div><div><label>Birthdate</label><input value="1980-07-18"></div></form>`,
    });
    const profile = mkdtempSync(join(tmpdir(), "flor-profile-"));
    const chrome: ChildProcess = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-allow-origins=*", `--remote-debugging-port=9334`, `--user-data-dir=${profile}`, `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, site.url("/openemr")], { stdio: "ignore" });
    try {
      const cdp = await connectBrowser(9334);
      const openemr = await cdp.send("Target.createTarget", { url: site.url("/openemr") });
      const openmrs = await cdp.send("Target.createTarget", { url: site.url("/openmrs") });
      const panel = await cdp.send("Target.createTarget", { url: "about:blank" });
      const panelSession = String((await cdp.send("Target.attachToTarget", { targetId: panel.targetId, flatten: true })).sessionId);
      await cdp.send("Page.enable", {}, panelSession);
      await cdp.send("Runtime.enable", {}, panelSession);
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: stub({ id: "22222222-2222-4222-8222-222222222222", firstName: "Test", lastName: "Synthetic", dateOfBirth: "2020-01-01", mrn: "MRN-TEST" }) }, panelSession);
      await cdp.send("Page.navigate", { url: `chrome-extension://${extensionId}/src/ui/sidepanel.html` }, panelSession);
      let text = "";
      for (let attempt = 0; attempt < 30 && !text.includes("Patients"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        text = await panelText(cdp, panelSession);
      }
      expect(text).toContain("Patients");
      await clickText(cdp, panelSession, "Patients");
      for (let attempt = 0; attempt < 30 && !text.includes("Test Synthetic"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        text = await panelText(cdp, panelSession);
      }
      expect(text).toContain("Test Synthetic");
      await clickText(cdp, panelSession, "Test Synthetic");
      for (let attempt = 0; attempt < 30 && !text.includes("Save this page to FLOR"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        text = await panelText(cdp, panelSession);
      }
      expect(text).toContain("Save this page to FLOR");
      await cdp.send("Target.activateTarget", { targetId: openmrs.targetId });
      await new Promise((resolve) => setTimeout(resolve, 400));
      await clickText(cdp, panelSession, "Save this page to FLOR");
      for (let attempt = 0; attempt < 40 && !text.includes("Sánchez") && !text.includes("John") && !text.includes("We can't read"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        text = await panelText(cdp, panelSession);
      }
      expect(text).not.toContain("Belford Belford");
      expect(text).not.toContain("More than one person");
      expect(text).toMatch(/Sánchez|John/);
      await cdp.send("Target.activateTarget", { targetId: openemr.targetId });
      for (let attempt = 0; attempt < 20 && !(await panelText(cdp, panelSession)).includes("Save this page to FLOR"); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await clickText(cdp, panelSession, "Save this page to FLOR");
      let philText = "";
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        philText = await panelText(cdp, panelSession);
        if (philText.includes("Belford") || philText.includes("We can't read")) break;
      }
      expect(philText).not.toContain("Sánchez");
      expect(philText).not.toContain("Belford Belford");
      expect(philText).toContain("Belford");
    } finally {
      chrome.kill();
      site.close();
    }
  }, 45000);
});
