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
  | { ok: false; reason: "no-window" | "url-hidden" | "focused-not-web"; webTabs: number; windows: number };

/** Chrome omits tab.url until the extension may see that site. An empty address is not proof of a browser page. */
export function classifyTabUrl(url: string | undefined): "web" | "hidden" | "non-web" {
  if (!url) return "hidden";
  if (url.startsWith("https://") || url.startsWith("http://")) return "web";
  return "non-web";
}

/** The read target is only the active tab of the focused normal window. Another window's tab is never substituted. */
export function bindFocusedHttpTab(windows: WindowSnap[]): TabBinding {
  const webTabs = windows.filter((windowSnap) => classifyTabUrl(windowSnap.activeTab?.url) === "web").length;
  const focused = windows.find((windowSnap) => windowSnap.focused);
  if (!focused) return { ok: false, reason: "no-window", webTabs, windows: windows.length };
  const kind = classifyTabUrl(focused.activeTab?.url);
  if (!focused.activeTab || kind === "hidden") return { ok: false, reason: "url-hidden", webTabs, windows: windows.length };
  if (kind === "non-web") return { ok: false, reason: "focused-not-web", webTabs, windows: windows.length };
  return { ok: true, tab: focused.activeTab, windowId: focused.id, webTabs, windows: windows.length };
}

/** Host permission for the active tab only. Never a wildcard over every website. */
export function originPermission(url: string): string | null {
  const patterns = hostPermissionCandidates(url);
  return patterns[0] ?? null;
}

export function hostPermissionCandidates(url: string): string[] {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return [];
    const exact = `${parsed.origin}/*`;
    const anyPort = `${parsed.protocol}//${parsed.hostname}/*`;
    return exact === anyPort ? [exact] : [exact, anyPort];
  } catch {
    return [];
  }
}

export function documentAddress(url: string): { host: string; path: string } | null {
  try {
    const parsed = new URL(url);
    if (classifyTabUrl(url) !== "web") return null;
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
