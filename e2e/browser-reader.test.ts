import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { mapPageFacts } from "../src/engine/facts";
import { SYNTHETIC_PATIENT } from "../src/engine/fixtures";
import { fillDocument } from "../src/engine/page";
import { readDocument } from "../src/engine/read";

const enabled = process.env.FLOR_BROWSER_E2E === "1";
const chromePath = process.env.CHROME_PATH || "/tmp/chrome-linux64/chrome";

function listen(html: string): Promise<{ url: string; close: () => void }> {
  const server = createServer((_req, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
    });
  });
}

async function withPage<T>(url: string, run: (evaluate: (expression: string) => Promise<unknown>) => Promise<T>): Promise<T> {
  const profile = mkdtempSync(join(tmpdir(), "flor-chrome-"));
  const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-allow-origins=*", `--user-data-dir=${profile}`, "--remote-debugging-port=9333", url], { stdio: "ignore" });
  try {
    let socketUrl = "";
    for (let attempt = 0; attempt < 40 && !socketUrl; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      try {
        const tabs = (await fetch("http://127.0.0.1:9333/json/list").then((response) => response.json())) as Array<{ url: string; webSocketDebuggerUrl: string; type: string }>;
        socketUrl = tabs.find((tab) => tab.type === "page" && tab.url.startsWith(url))?.webSocketDebuggerUrl ?? "";
      } catch {
        socketUrl = "";
      }
    }
    if (!socketUrl) throw new Error("Chrome did not open the fixture page");
    const socket = new WebSocket(socketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve);
      socket.addEventListener("error", reject);
    });
    let id = 0;
    const pending = new Map<number, (value: unknown) => void>();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } } };
      if (message.id && pending.has(message.id)) pending.get(message.id)?.(message.result?.result?.value);
    });
    const evaluate = (expression: string) =>
      new Promise<unknown>((resolve) => {
        const call = ++id;
        pending.set(call, resolve);
        socket.send(JSON.stringify({ id: call, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
      });
    return await run(evaluate);
  } finally {
    chrome.kill();
  }
}

describe.skipIf(!enabled)("Chromium page reader", () => {
  it("reads a chart and fills a controlled input in real Chrome", async () => {
    const page = await listen(`<!doctype html><article id="summary"><dl>
      <dt>Name</dt><dd>Jane Doe</dd>
      <dt>DOB</dt><dd>12 Mar 1984</dd>
      <dt>External ID</dt><dd>100245</dd>
    </dl>
    <label for="fn">First Name</label><input id="fn" value="">
    <label for="dob">Date of Birth</label><input id="dob" value="12 Mar 1984">
    </article>`);
    try {
      await withPage(page.url, async (evaluate) => {
        const facts = await evaluate(`(${readDocument.toString()})()`);
        const mapped = mapPageFacts((facts as { facts: never[] }).facts as never, SYNTHETIC_PATIENT);
        expect(mapped.fields.find((field) => field.key === "first_name")?.pageValue).toBe("Jane");
        const filled = await evaluate(`(() => {
          let state = "";
          const input = document.getElementById("fn");
          input.addEventListener("input", () => { state = input.value; });
          const written = (${fillDocument.toString()})(document, [{ id: "fn", name: "", label: "First Name", tag: "input", value: "Jane" }]);
          return { state, changed: written[0].changed };
        })()`);
        expect(filled).toMatchObject({ state: "Jane", changed: true });
      });
    } finally {
      page.close();
    }
  }, 20000);
});
