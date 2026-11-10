import { describe, expect, it } from "vitest";
import {
  assertWorkspaceId,
  clearAllStorage,
  createMemoryArea,
  createStorageAdapter,
  readWorkspaceId,
  writeWorkspaceId,
  WORKSPACE_KEY,
} from "../src/auth/storage";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";

describe("chrome storage adapter", () => {
  it("round-trips strings and ignores non-strings", async () => {
    const area = createMemoryArea();
    const storage = createStorageAdapter(area);
    expect(await storage.getItem("missing")).toBeNull();
    await storage.setItem("sb-auth", "{\"access_token\":\"stored-by-supabase\"}");
    expect(await storage.getItem("sb-auth")).toBe("{\"access_token\":\"stored-by-supabase\"}");
    await storage.removeItem("sb-auth");
    expect(await storage.getItem("sb-auth")).toBeNull();
    area.snapshot();
    await area.set({ weird: "1" });
    const bag = createMemoryArea({ weird: "1" });
    await bag.set({ weird: "1" });
    (bag.snapshot() as Record<string, unknown>).weird = 12;
  });

  it("returns null when a stored value is not a string", async () => {
    const area = createMemoryArea();
    const loose = area as unknown as { setRaw(key: string, value: unknown): void; data: Record<string, unknown> };
    const data = area.snapshot() as Record<string, unknown>;
    data.token = { access_token: "nope" };
    expect(await createStorageAdapter({ ...area, async get() { return data; } }).getItem("token")).toBeNull();
    expect(loose).toBeTruthy();
  });
});

describe("workspace id storage", () => {
  it("stores the id only and refuses patient-shaped values", async () => {
    const area = createMemoryArea();
    await writeWorkspaceId(area, WORKSPACE);
    expect(area.snapshot()).toEqual({ [WORKSPACE_KEY]: WORKSPACE });
    expect(await readWorkspaceId(area)).toBe(WORKSPACE);
    await expect(writeWorkspaceId(area, "Worcester P&N")).rejects.toThrow(/not an id/);
    await expect(writeWorkspaceId(area, JSON.stringify({ first_name: "Jane", mrn: "100" }))).rejects.toThrow(/not an id/);
    expect(() => assertWorkspaceId({ name: "Jane Doe", date_of_birth: "1984-03-12" })).toThrow(/not an id/);
    expect(area.snapshot()).toEqual({ [WORKSPACE_KEY]: WORKSPACE });
  });

  it("clears local and session storage on sign-out", async () => {
    const local = createMemoryArea({ [WORKSPACE_KEY]: WORKSPACE, "sb-auth": "session" });
    const session = createMemoryArea({ draft: "transient" });
    await clearAllStorage(local, session);
    expect(local.snapshot()).toEqual({});
    expect(session.snapshot()).toEqual({});
  });
});
