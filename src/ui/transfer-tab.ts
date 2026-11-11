import { fillDocument, scanDocument, type FillInstruction, type FillWriteResult, type ScannedControl } from "../engine/page";
import { cancelFieldPicker, installFieldPicker, readDocument, takeFieldPick, type FieldPick, type PageFact } from "../engine/read";
import { bindFocusedHttpTab, documentAddress, type TabBinding } from "./tab-bind";

export interface ActiveTab {
  id: number;
  url: string;
  title: string;
}

export type TabAccess =
  | { ok: true; tab: ActiveTab; controls: ScannedControl[]; frameErrors: number }
  | { ok: false; reason: "no-tab" | "unsupported" | "permission" | "no-form"; message: string };

export async function readActiveForm(deps: {
  queryTab: () => Promise<ActiveTab | null>;
  hasPermission: (originPattern: string) => Promise<boolean>;
  requestPermission: (originPattern: string) => Promise<boolean>;
  scan: (tabId: number) => Promise<{ controls: ScannedControl[]; frameErrors: number }>;
}): Promise<TabAccess> {
  const tab = await deps.queryTab();
  if (!tab?.id || !tab.url) return { ok: false, reason: "no-tab", message: "Open the EHR form in the active tab, then try again." };
  let parsed: URL;
  try {
    parsed = new URL(tab.url);
  } catch {
    return { ok: false, reason: "unsupported", message: "This tab does not have a form FLOR Connect can read." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "unsupported", message: "Open the EHR page in a normal browser tab, then try again." };
  }
  const pattern = `${parsed.origin}/*`;
  const allowed = (await deps.hasPermission(pattern)) || (await deps.requestPermission(pattern));
  if (!allowed) return { ok: false, reason: "permission", message: "FLOR Connect needs permission for this site before it can read the form." };
  const scanned = await deps.scan(tab.id);
  if (scanned.controls.length === 0) return { ok: false, reason: "no-form", message: "No form on this page" };
  return { ok: true, tab, controls: scanned.controls, frameErrors: scanned.frameErrors };
}

export async function readActivePage(deps: {
  hasPermission: (originPattern: string) => Promise<boolean>;
  requestPermission: (originPattern: string) => Promise<boolean>;
  queryTab: () => Promise<TabBinding>;
  read: (tabId: number) => Promise<{ facts: PageFact[]; frameErrors: number; closedControls: number; unlabeledControls: number; injectionFailed: boolean; host: string; path: string; build: string }>;
}): Promise<
  | { ok: true; tab: ActiveTab; facts: PageFact[]; frameErrors: number; closedControls: number; unlabeledControls: number; host: string; path: string; build: string; webTabs: number; windows: number }
  | { ok: false; reason: "no-tab" | "unsupported" | "permission" | "injection" | "frames" | "unlabeled" | "empty" | "wrong-document" | "stale-reader"; message: string; counts: string }
> {
  const binding = await deps.queryTab();
  if (!binding.ok) {
    const counts = `${binding.windows} normal windows. Active tab address: ${binding.reason === "url-hidden" ? "hidden" : binding.reason === "focused-not-web" ? "not a website" : "no focused window"}.`;
    const message = binding.reason === "url-hidden"
      ? "Chrome did not share the active tab's address, so nothing was read. Allow site access for FLOR Connect, then try again. This was not treated as a browser page."
      : binding.reason === "focused-not-web"
        ? "The active tab is a browser page, not a website. Open the EHR tab, then try again."
        : "No normal browser window was focused, so no page was read.";
    return { ok: false, reason: binding.reason === "url-hidden" ? "permission" : "no-tab", message, counts };
  }
  const tab = binding.tab;
  let parsed: URL;
  try {
    parsed = new URL(tab.url);
  } catch {
    return { ok: false, reason: "unsupported", message: "This tab isn't a web page FLOR Connect can read.", counts: "" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "unsupported", message: "This tab isn't a web page. Files, pictures, and desktop programs can't be read this way.", counts: "" };
  }
  const pattern = `${parsed.origin}/*`;
  const allowed = (await deps.hasPermission(pattern)) || (await deps.requestPermission(pattern));
  if (!allowed) return { ok: false, reason: "permission", message: "Permission for this site was not granted. Try again and allow it. Nothing was read.", counts: "" };
  const read = await deps.read(tab.id);
  const counts = `${read.facts.length} labeled fields, ${read.unlabeledControls} unlabeled boxes, ${read.closedControls} closed boxes, ${read.frameErrors} unreadable frames. Reader ${read.build || "unknown"}. Windows ${binding.windows}. Web tabs ${binding.webTabs}.`;
  if (read.injectionFailed) return { ok: false, reason: "injection", message: "The reader could not run in this tab. Nothing was typed or saved.", counts };
  const tabAddress = documentAddress(tab.url);
  if (read.host && tabAddress && read.host !== tabAddress.host) {
    return { ok: false, reason: "wrong-document", message: "The document that answered is not the active tab. Those fields were discarded.", counts: `${counts} Active host ${tabAddress.host}. Document host ${read.host}.` };
  }
  if (read.path && tabAddress && read.path !== tabAddress.path) {
    return { ok: false, reason: "wrong-document", message: "The document that answered is a different page in that tab. Those fields were discarded.", counts };
  }
  if (read.facts.length === 0 && read.frameErrors > 0) return { ok: false, reason: "frames", message: "A frame on this page could not be read, and no labeled demographics were found outside it.", counts };
  if (read.facts.length === 0 && read.unlabeledControls > 0) return { ok: false, reason: "unlabeled", message: "This page has boxes, but their labels could not be read.", counts };
  if (read.facts.length === 0) return { ok: false, reason: "empty", message: "This tab doesn't have text or boxes we can use.", counts };
  return { ok: true, tab, facts: read.facts, frameErrors: read.frameErrors, closedControls: read.closedControls, unlabeledControls: read.unlabeledControls, host: read.host, path: read.path, build: read.build, webTabs: binding.webTabs, windows: binding.windows };
}

export function watchActiveTab(onChange: () => void): () => void {
  const onActivated = () => onChange();
  const onUpdated = (_tabId: number, info: { url?: string; status?: string }) => {
    if (info.url || info.status === "loading") onChange();
  };
  const onFocus = () => onChange();
  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.windows.onFocusChanged.addListener(onFocus);
  return () => {
    chrome.tabs.onActivated.removeListener(onActivated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.windows.onFocusChanged.removeListener(onFocus);
  };
}

export function chromeFormAccess() {
  return {
    queryTab: async (): Promise<TabBinding> => {
      const focused = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
      const snaps = windows.map((windowSnap) => {
        const active = windowSnap.tabs?.find((tab) => tab.active);
        return {
          id: windowSnap.id ?? 0,
          focused: windowSnap.id === focused.id,
          activeTab: active?.id && active.url ? { id: active.id, url: active.url, title: active.title ?? "" } : null,
        };
      });
      return bindFocusedHttpTab(snaps);
    },
    hasPermission: (originPattern: string) => chrome.permissions.contains({ origins: [originPattern] }),
    requestPermission: async (originPattern: string) => {
      try {
        return await chrome.permissions.request({ origins: [originPattern] });
      } catch {
        return false;
      }
    },
    scan: async (tabId: number) => {
      const frames = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: scanDocument,
      });
      const controls: ScannedControl[] = [];
      let frameErrors = 0;
      for (const frame of frames ?? []) {
        if (!Array.isArray(frame.result)) {
          frameErrors += 1;
          continue;
        }
        controls.push(...frame.result.map((control) => ({ ...control, frameId: frame.frameId })));
      }
      return { controls, frameErrors };
    },
    fill: async (tabId: number, instructions: FillInstruction[]): Promise<FillWriteResult[]> => {
      const frames = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (plans: FillInstruction[]) => fillDocument(undefined, plans),
        args: [instructions],
      });
      const merged = new Map<string, FillWriteResult>();
      for (const frame of frames ?? []) {
        const rows = Array.isArray(frame.result) ? (frame.result as FillWriteResult[]) : [];
        for (const row of rows) {
          const key = row.id || row.name;
          const existing = merged.get(key);
          if (!existing || row.changed) merged.set(key, row);
        }
      }
      return [...merged.values()];
    },
    read: async (tabId: number) => {
      const empty = { facts: [] as PageFact[], frameErrors: 0, closedControls: 0, unlabeledControls: 0, injectionFailed: true, host: "", path: "", build: "" };
      try {
        const frames = await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: readDocument,
        });
        const facts: PageFact[] = [];
        let frameErrors = 0;
        let closedControls = 0;
        let unlabeledControls = 0;
        let host = "";
        let path = "";
        let build = "";
        for (const frame of frames ?? []) {
          const result = frame.result;
          if (!result || !Array.isArray(result.facts)) {
            frameErrors += 1;
            continue;
          }
          if (frame.frameId === 0) {
            host = result.host ?? "";
            path = result.path ?? "";
            build = result.build ?? "";
          }
          if (host && result.host && result.host !== host) {
            frameErrors += 1;
            continue;
          }
          closedControls += result.closedControls ?? 0;
          unlabeledControls += result.unlabeledControls ?? 0;
          facts.push(...result.facts.map((fact) => ({ ...fact, frameId: frame.frameId })));
        }
        return { facts, frameErrors, closedControls, unlabeledControls, injectionFailed: false, host, path, build };
      } catch {
        return empty;
      }
    },
    armPicker: async (tabId: number) => {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: installFieldPicker });
    },
    takePick: async (tabId: number): Promise<FieldPick | null> => {
      const frames = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: takeFieldPick });
      for (const frame of frames ?? []) {
        if (frame.result) return frame.result as FieldPick;
      }
      return null;
    },
    disarmPicker: async (tabId: number) => {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: cancelFieldPicker });
    },
    currentTab: async (tabId: number): Promise<ActiveTab | null> => {
      const tab = await chrome.tabs.get(tabId);
      if (!tab?.id || !tab.url) return null;
      return { id: tab.id, url: tab.url, title: tab.title ?? "" };
    },
  };
}
