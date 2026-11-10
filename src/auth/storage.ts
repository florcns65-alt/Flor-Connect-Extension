import type { SupportedStorage } from "@supabase/supabase-js";

export const WORKSPACE_KEY = "flor.workspaceId";

const WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, string>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  clear(): Promise<void>;
}

export interface MemoryArea extends StorageArea {
  snapshot(): Record<string, string>;
}

export function createMemoryArea(initial: Record<string, string> = {}): MemoryArea {
  const data: Record<string, string> = { ...initial };
  return {
    async get(keys) {
      const result: Record<string, string> = {};
      for (const key of keys) {
        if (key in data) result[key] = data[key];
      }
      return result;
    },
    async set(items) {
      for (const [key, value] of Object.entries(items)) {
        if (typeof value !== "string") {
          throw new Error("Refusing to store a non-string value.");
        }
        data[key] = value;
      }
    },
    async remove(keys) {
      for (const key of keys) delete data[key];
    },
    async clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
    snapshot() {
      return { ...data };
    },
  };
}

function chromeCallback<T>(invoke: (done: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    invoke((value) => {
      const message = chrome.runtime.lastError?.message;
      if (message) reject(new Error(message));
      else resolve(value);
    });
  });
}

export function chromeLocalArea(): StorageArea {
  return {
    get: (keys) => chromeCallback((done) => chrome.storage.local.get(keys, done)),
    set: (items) => chromeCallback((done) => chrome.storage.local.set(items, () => done(undefined))),
    remove: (keys) => chromeCallback((done) => chrome.storage.local.remove(keys, () => done(undefined))),
    clear: () => chromeCallback((done) => chrome.storage.local.clear(() => done(undefined))),
  };
}

export function chromeSessionArea(): StorageArea {
  return {
    get: (keys) => chromeCallback((done) => chrome.storage.session.get(keys, done)),
    set: (items) => chromeCallback((done) => chrome.storage.session.set(items, () => done(undefined))),
    remove: (keys) => chromeCallback((done) => chrome.storage.session.remove(keys, () => done(undefined))),
    clear: () => chromeCallback((done) => chrome.storage.session.clear(() => done(undefined))),
  };
}

export function createStorageAdapter(area: StorageArea): SupportedStorage {
  return {
    async getItem(key) {
      const bag = await area.get([key]);
      const value = bag[key];
      return typeof value === "string" ? value : null;
    },
    async setItem(key, value) {
      if (typeof value !== "string") {
        throw new Error("Refusing to store a non-string value.");
      }
      await area.set({ [key]: value });
    },
    async removeItem(key) {
      await area.remove([key]);
    },
  };
}

export function assertWorkspaceId(value: unknown): string {
  if (typeof value !== "string" || !WORKSPACE_ID.test(value)) {
    throw new Error("Refusing to store a workspace value that is not an id.");
  }
  return value;
}

export async function readWorkspaceId(area: StorageArea): Promise<string | null> {
  const bag = await area.get([WORKSPACE_KEY]);
  const value = bag[WORKSPACE_KEY];
  if (typeof value !== "string" || !WORKSPACE_ID.test(value)) return null;
  return value;
}

export async function writeWorkspaceId(area: StorageArea, id: string): Promise<void> {
  const clean = assertWorkspaceId(id);
  await area.set({ [WORKSPACE_KEY]: clean });
}

export async function clearAllStorage(local: StorageArea, session: StorageArea): Promise<void> {
  await local.clear();
  await session.clear();
}
