import { fillDocument, scanDocument, type FillInstruction, type FillWriteResult, type ScannedControl } from "../engine/page";
import { cancelFieldPicker, installFieldPicker, readDocument, takeFieldPick, type FieldPick, type PageFact } from "../engine/read";

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
  queryTab: () => Promise<ActiveTab | null>;
  hasPermission: (originPattern: string) => Promise<boolean>;
  requestPermission: (originPattern: string) => Promise<boolean>;
  read: (tabId: number) => Promise<{ facts: PageFact[]; frameErrors: number; closedControls: number; unlabeledControls: number; injectionFailed: boolean }>;
}): Promise<
  | { ok: true; tab: ActiveTab; facts: PageFact[]; frameErrors: number; closedControls: number; unlabeledControls: number }
  | { ok: false; reason: "no-tab" | "unsupported" | "permission" | "injection" | "frames" | "unlabeled" | "empty"; message: string; counts: string }
> {
  const tab = await deps.queryTab();
  if (!tab?.id || !tab.url) return { ok: false, reason: "no-tab", message: "The EHR tab was not the active tab. Open that tab, then try again.", counts: "" };
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
  const counts = `${read.facts.length} labeled fields, ${read.unlabeledControls} unlabeled boxes, ${read.closedControls} closed boxes, ${read.frameErrors} unreadable frames.`;
  if (read.injectionFailed) return { ok: false, reason: "injection", message: "The reader could not run in this tab. Nothing was typed or saved.", counts };
  if (read.facts.length === 0 && read.frameErrors > 0) return { ok: false, reason: "frames", message: "A frame on this page could not be read, and no labeled demographics were found outside it.", counts };
  if (read.facts.length === 0 && read.unlabeledControls > 0) return { ok: false, reason: "unlabeled", message: "This page has boxes, but their labels could not be read.", counts };
  if (read.facts.length === 0) return { ok: false, reason: "empty", message: "This tab doesn't have text or boxes we can use.", counts };
  return { ok: true, tab, facts: read.facts, frameErrors: read.frameErrors, closedControls: read.closedControls, unlabeledControls: read.unlabeledControls };
}

let cachedTab: ActiveTab | null = null;
let watchingTabs = false;

export function cachedActiveTab(): ActiveTab | null {
  return cachedTab;
}

export function watchActiveTab(): void {
  const refresh = () => {
    void chrome.windows.getLastFocused({ windowTypes: ["normal"] }).then(async (win) => {
      if (!win.id) return;
      const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) return;
      cachedTab = { id: tab.id, url: tab.url, title: tab.title ?? "" };
    });
  };
  if (!watchingTabs) {
    watchingTabs = true;
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    chrome.windows.onFocusChanged.addListener(refresh);
  }
  refresh();
}

export function chromeFormAccess() {
  return {
    queryTab: async (): Promise<ActiveTab | null> => {
      const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      if (win.id) {
        const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
        if (tab?.id && tab.url && /^https?:/.test(tab.url)) {
          cachedTab = { id: tab.id, url: tab.url, title: tab.title ?? "" };
          return cachedTab;
        }
      }
      return cachedTab;
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
      const empty = { facts: [] as PageFact[], frameErrors: 0, closedControls: 0, unlabeledControls: 0, injectionFailed: true };
      try {
        const frames = await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          func: readDocument,
        });
        const facts: PageFact[] = [];
        let frameErrors = 0;
        let closedControls = 0;
        let unlabeledControls = 0;
        for (const frame of frames ?? []) {
          const result = frame.result;
          if (!result || !Array.isArray(result.facts)) {
            frameErrors += 1;
            continue;
          }
          closedControls += result.closedControls ?? 0;
          unlabeledControls += result.unlabeledControls ?? 0;
          facts.push(...result.facts.map((fact) => ({ ...fact, frameId: frame.frameId })));
        }
        return { facts, frameErrors, closedControls, unlabeledControls, injectionFailed: false };
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
