export interface TabSnap {
  id: number;
  url: string;
  title: string;
}

export interface WindowSnap {
  id: number;
  focused: boolean;
  activeTab: TabSnap | null;
}

export type TabBinding =
  | { ok: true; tab: TabSnap; windowId: number; webTabs: number; windows: number }
  | { ok: false; reason: "no-window" | "focused-not-web"; webTabs: number; windows: number };

function isWeb(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

/** The read target is only the active tab of the focused normal window. Another window's tab is never substituted. */
export function bindFocusedHttpTab(windows: WindowSnap[]): TabBinding {
  const webTabs = windows.filter((windowSnap) => windowSnap.activeTab && isWeb(windowSnap.activeTab.url)).length;
  const focused = windows.find((windowSnap) => windowSnap.focused);
  if (!focused) return { ok: false, reason: "no-window", webTabs, windows: windows.length };
  const tab = focused.activeTab;
  if (!tab || !isWeb(tab.url)) return { ok: false, reason: "focused-not-web", webTabs, windows: windows.length };
  return { ok: true, tab, windowId: focused.id, webTabs, windows: windows.length };
}

export function documentAddress(url: string): { host: string; path: string } | null {
  try {
    const parsed = new URL(url);
    if (!isWeb(url)) return null;
    return { host: parsed.host, path: parsed.pathname };
  } catch {
    return null;
  }
}

export function acceptScan(input: {
  requestId: number;
  currentId: number;
  tabId: number;
  currentTabId: number;
  tabHost: string;
  tabPath: string;
  documentHost: string;
  documentPath: string;
  readerBuild: string;
  panelBuild: string;
}): "ok" | "stale-request" | "wrong-tab" | "wrong-document" | "stale-reader" {
  if (input.requestId !== input.currentId) return "stale-request";
  if (input.tabId !== input.currentTabId) return "wrong-tab";
  if (input.readerBuild && input.readerBuild !== input.panelBuild) return "stale-reader";
  if (input.documentHost && input.documentHost !== input.tabHost) return "wrong-document";
  if (input.documentPath && input.tabPath && input.documentPath !== input.tabPath) return "wrong-document";
  return "ok";
}

export function provenanceLine(input: { panel: string; installed: string; worker: string; reader: string }): { stale: boolean; text: string } {
  const stale = Boolean(input.installed) && input.panel !== input.installed;
  const worker = input.worker && input.worker !== input.panel ? `worker ${input.worker}` : `worker ${input.worker || "unknown"}`;
  const reader = input.reader ? `reader ${input.reader}` : "reader not run";
  const text = stale
    ? `This side panel is build ${input.panel} but the installed extension is ${input.installed}. Close the panel and open it again before reading a page.`
    : `Panel ${input.panel}. Installed ${input.installed || "unknown"}. ${worker}. ${reader}.`;
  return { stale, text };
}
