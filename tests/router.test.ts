import { describe, expect, it, vi } from "vitest";
import { handleMessage, type WorkerContext } from "../src/background/router";
import type { FlorApi } from "../src/api/flor-api";
import type { PublicUser } from "../src/shared/types";

const user: PublicUser = {
  id: "44444444-4444-4444-8444-444444444444",
  email: "clinician@example.com",
  name: "Chioma Okoli",
};

const workspaceId = "11111111-1111-4111-8111-111111111111";

function context(api: Partial<FlorApi>, extra: Partial<WorkerContext> = {}): WorkerContext {
  return {
    getAuth: () => ({ phase: "signed_in", user, error: null }),
    signIn: async () => ({ phase: "signed_in", user, error: null }),
    signOut: async () => ({ phase: "signed_out", user: null, error: null }),
    invalidateSession: vi.fn(async () => undefined),
    getWorkspaceId: async () => null,
    setWorkspaceId: vi.fn(async () => undefined),
    openFlor: vi.fn(async () => undefined),
    requireUser: () => user,
    api: {
      getLegalStatus: async () => ({ complete: true, missing: [] }),
      listWorkspaces: async () => [{ id: workspaceId, name: "Worcester P&N", role: "clinician" }],
      listTodayAppointments: async () => [],
      listPeople: async () => ({ people: [], total: 0, offset: 0, limit: 50 }),
      searchPeople: async () => ({ people: [], total: 0, offset: 0, limit: 50 }),
      getPersonChart: async () => {
        throw new Error("unused");
      },
      ...api,
    },
    ...extra,
  };
}

describe("message router", () => {
  it("stops at the legal gate and does not load workspaces", async () => {
    const listWorkspaces = vi.fn(async () => []);
    const ctx = context({
      getLegalStatus: async () => ({ complete: false, missing: ["hipaa"] }),
      listWorkspaces,
    });
    const response = await handleMessage(ctx, { type: "data:bootstrap" });
    expect(response).toEqual({
      ok: true,
      data: { legal: { complete: false, missing: ["hipaa"] }, workspaces: [], workspaceId: null },
    });
    expect(listWorkspaces).not.toHaveBeenCalled();
  });

  it("remembers a single workspace id", async () => {
    const setWorkspaceId = vi.fn(async () => undefined);
    const ctx = context({}, { setWorkspaceId, getWorkspaceId: async () => null });
    const response = await handleMessage(ctx, { type: "data:bootstrap" });
    expect(response.ok).toBe(true);
    if (response.ok) expect(response.data).toMatchObject({ workspaceId });
    expect(setWorkspaceId).toHaveBeenCalledWith(workspaceId);
  });

  it("signs the panel out when a data call reports a dead session", async () => {
    const invalidateSession = vi.fn(async () => undefined);
    const ctx = context(
      {
        searchPeople: async () => {
          const { FlorError } = await import("../src/shared/errors");
          throw new FlorError("signed_out", "Your session ended. Please sign in again.");
        },
      },
      { invalidateSession },
    );
    const response = await handleMessage(ctx, { type: "data:search", workspaceId, query: "Jane" });
    expect(response).toEqual({
      ok: false,
      error: { code: "signed_out", message: "Your session ended. Please sign in again." },
    });
    expect(invalidateSession).toHaveBeenCalledOnce();
  });

  it("rejects a request the panel should not send", async () => {
    const response = await handleMessage(context({}), { type: "data:search", query: "Jane Doe", mrn: "10428" });
    expect(response.ok).toBe(false);
  });
});
