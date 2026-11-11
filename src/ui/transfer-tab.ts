import { fillDocument, scanDocument, type FillInstruction, type FillWriteResult, type ScannedControl } from "../engine/page";

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

export function chromeFormAccess() {
  return {
    queryTab: async (): Promise<ActiveTab | null> => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || !tab.url) return null;
      return { id: tab.id, url: tab.url, title: tab.title ?? "" };
    },
    hasPermission: (originPattern: string) => chrome.permissions.contains({ origins: [originPattern] }),
    requestPermission: (originPattern: string) => chrome.permissions.request({ origins: [originPattern] }),
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
    currentTab: async (tabId: number): Promise<ActiveTab | null> => {
      const tab = await chrome.tabs.get(tabId);
      if (!tab?.id || !tab.url) return null;
      return { id: tab.id, url: tab.url, title: tab.title ?? "" };
    },
  };
}
