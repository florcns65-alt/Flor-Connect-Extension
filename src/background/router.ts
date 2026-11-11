import type { FlorApi } from "../api/flor-api";
import { FlorError, mapUnknownError } from "../shared/errors";
import { localDayBounds } from "../shared/format";
import { logger } from "../shared/logger";
import {
  AppointmentsSchema,
  AuthStateSchema,
  BootstrapSchema,
  ClientMessageSchema,
  PeoplePageSchema,
  PersonChartSchema,
  fail,
  ok,
  type AuthStateMessage,
  type Envelope,
} from "../shared/messages";
import type { PublicUser, Workspace } from "../shared/types";

export interface WorkerContext {
  getAuth(): AuthStateMessage;
  signIn(): Promise<AuthStateMessage>;
  signOut(): Promise<AuthStateMessage>;
  invalidateSession(): Promise<void>;
  getWorkspaceId(): Promise<string | null>;
  setWorkspaceId(id: string): Promise<void>;
  openFlor(): Promise<void>;
  api: FlorApi;
  requireUser(): PublicUser;
}

async function chooseWorkspace(ctx: WorkerContext, workspaces: Workspace[]): Promise<string | null> {
  const saved = await ctx.getWorkspaceId();
  if (saved && workspaces.some((workspace) => workspace.id === saved)) return saved;
  if (workspaces.length === 1) {
    await ctx.setWorkspaceId(workspaces[0].id);
    return workspaces[0].id;
  }
  return null;
}

export async function handleMessage(ctx: WorkerContext, raw: unknown): Promise<Envelope> {
  const parsed = ClientMessageSchema.safeParse(raw);
  if (!parsed.success) return fail("validation", "That request wasn't understood.");

  try {
    switch (parsed.data.type) {
      case "auth:getState":
        return ok(ctx.getAuth());
      case "meta:version":
        return ok({ version: __FLOR_VERSION__ });
      case "auth:signIn":
        return ok(await ctx.signIn());
      case "auth:signOut":
        return ok(await ctx.signOut());
      case "flor:open":
        await ctx.openFlor();
        return ok({ opened: true });
      case "workspace:set":
        ctx.requireUser();
        await ctx.setWorkspaceId(parsed.data.workspaceId);
        return ok({ workspaceId: parsed.data.workspaceId });
      case "data:bootstrap": {
        const user = ctx.requireUser();
        const legal = await ctx.api.getLegalStatus(user.id);
        if (!legal.complete) {
          return ok(BootstrapSchema.parse({ legal, workspaces: [], workspaceId: null }));
        }
        const workspaces = await ctx.api.listWorkspaces(user.id);
        const workspaceId = await chooseWorkspace(ctx, workspaces);
        return ok(BootstrapSchema.parse({ legal, workspaces, workspaceId }));
      }
      case "data:appointments": {
        ctx.requireUser();
        const rows = await ctx.api.listTodayAppointments(parsed.data.workspaceId, localDayBounds());
        return ok(AppointmentsSchema.parse(rows));
      }
      case "data:people": {
        ctx.requireUser();
        const page = await ctx.api.listPeople(parsed.data.workspaceId, parsed.data.offset ?? 0);
        return ok(PeoplePageSchema.parse(page));
      }
      case "data:search": {
        ctx.requireUser();
        const page = await ctx.api.searchPeople(parsed.data.workspaceId, parsed.data.query, parsed.data.offset ?? 0);
        return ok(PeoplePageSchema.parse(page));
      }
      case "data:patient": {
        ctx.requireUser();
        const chart = await ctx.api.getPersonChart(parsed.data.workspaceId, parsed.data.personId, new Date().toISOString());
        return ok(PersonChartSchema.parse(chart));
      }
      case "data:updatePerson": {
        ctx.requireUser();
        const result = await ctx.api.updatePersonDemographics(
          parsed.data.workspaceId,
          parsed.data.personId,
          parsed.data.fields,
          new Date().toISOString(),
        );
        return ok(PersonChartSchema.parse(result.chart));
      }
      default:
        return fail("validation", "That request wasn't understood.");
    }
  } catch (error) {
    const mapped = error instanceof FlorError ? error : mapUnknownError(error);
    if (mapped.code === "signed_out") {
      await ctx.invalidateSession();
    }
    logger.warn("Request failed", { code: mapped.code });
    return fail(mapped.code, mapped.message);
  }
}

export function readAuthState(input: AuthStateMessage): AuthStateMessage {
  const parsed = AuthStateSchema.safeParse(input);
  if (!parsed.success) {
    return { phase: "signed_out", user: null, error: "Please sign in again." };
  }
  return parsed.data;
}
