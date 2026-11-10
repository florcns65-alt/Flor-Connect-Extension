import { useEffect } from "react";
import { z } from "zod";
import { normalizeSearchQuery } from "../api/filters";
import { FlorError } from "../shared/errors";
import {
  AppointmentsSchema,
  AuthStateSchema,
  BootstrapSchema,
  PeoplePageSchema,
  PersonChartSchema,
} from "../shared/messages";
import { request } from "./bridge";
import { useFlorStore } from "./store";
import { useDebouncedValue } from "./use-debounced";

function noteFailure(error: unknown): void {
  const mapped = error instanceof FlorError ? error : new FlorError("server", "Something went wrong. Please try again.");
  if (mapped.code === "signed_out") {
    useFlorStore.getState().applyAuth({ phase: "signed_out", user: null, error: mapped.message });
    return;
  }
  useFlorStore.getState().setLoadError(mapped);
}

export function useFlorSession(): void {
  const phase = useFlorStore((state) => state.auth.phase);
  const ready = useFlorStore((state) => state.ready);
  const legal = useFlorStore((state) => state.legal);
  const workspaceId = useFlorStore((state) => state.workspaceId);
  const query = useFlorStore((state) => state.query);
  const reloadKey = useFlorStore((state) => state.reloadKey);
  const debouncedQuery = useDebouncedValue(query, 250);

  useEffect(() => {
    const onAuth = (message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message)) return;
      if ((message as { type?: string }).type !== "auth:changed") return;
      const parsed = AuthStateSchema.safeParse({
        phase: (message as { phase?: unknown }).phase,
        user: (message as { user?: unknown }).user,
        error: (message as { error?: unknown }).error ?? null,
      });
      if (parsed.success) useFlorStore.getState().applyAuth(parsed.data);
    };
    chrome.runtime.onMessage.addListener(onAuth);
    return () => chrome.runtime.onMessage.removeListener(onAuth);
  }, []);

  useEffect(() => {
    const onOnline = () => useFlorStore.getState().setOffline(false);
    const onOffline = () => useFlorStore.getState().setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    useFlorStore.getState().setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void request(AuthStateSchema, { type: "auth:getState" })
      .then((auth) => {
        if (!cancelled) useFlorStore.getState().applyAuth(auth);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof FlorError ? error.message : "FLOR Connect couldn't start. Try again.";
        useFlorStore.getState().applyAuth({ phase: "signed_out", user: null, error: message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || phase !== "signed_in") return;
    let cancelled = false;
    useFlorStore.getState().setBootLoading(true);
    void request(BootstrapSchema, { type: "data:bootstrap" })
      .then((data) => {
        if (cancelled) return;
        useFlorStore.getState().setBoot({
          legal: data.legal.complete ? "ok" : "required",
          missingLegal: data.legal.missing,
          workspaces: data.workspaces,
          workspaceId: data.workspaceId,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) noteFailure(error);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, phase, reloadKey]);

  useEffect(() => {
    if (legal !== "ok" || !workspaceId) return;
    let cancelled = false;
    useFlorStore.getState().setAppointmentsLoading(true);
    void request(AppointmentsSchema, { type: "data:appointments", workspaceId })
      .then((rows) => {
        if (!cancelled) useFlorStore.getState().setAppointments(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) noteFailure(error);
      });
    return () => {
      cancelled = true;
    };
  }, [legal, workspaceId, reloadKey]);

  useEffect(() => {
    if (legal !== "ok" || !workspaceId) return;
    const search = normalizeSearchQuery(debouncedQuery);
    let cancelled = false;
    useFlorStore.getState().setDirectoryLoading(true);
    if (search) useFlorStore.getState().setSearchLoading(true);
    const message = search
      ? ({ type: "data:search", workspaceId, query: search, offset: 0 } as const)
      : ({ type: "data:people", workspaceId, offset: 0 } as const);
    void request(PeoplePageSchema, message)
      .then((page) => {
        if (!cancelled) useFlorStore.getState().setDirectory(page, Boolean(search));
      })
      .catch((error: unknown) => {
        if (!cancelled) noteDirectoryFailure(error);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, legal, workspaceId, reloadKey]);
}

function noteDirectoryFailure(error: unknown): void {
  const mapped = error instanceof FlorError ? error : new FlorError("server", "Something went wrong. Please try again.");
  if (mapped.code === "signed_out") {
    noteFailure(error);
    return;
  }
  useFlorStore.getState().setDirectoryError(mapped);
}

let lastPersonId: string | null = null;

const OpenedSchema = z.object({ opened: z.boolean() }).strict();
const WorkspaceSetSchema = z.object({ workspaceId: z.string().uuid() }).strict();

export async function signIn(): Promise<void> {
  useFlorStore.getState().applyAuth({ phase: "signing_in", user: null, error: null });
  try {
    const auth = await request(AuthStateSchema, { type: "auth:signIn" });
    useFlorStore.getState().applyAuth(auth);
  } catch (error) {
    noteFailure(error);
  }
}

export async function signOut(): Promise<void> {
  try {
    const auth = await request(AuthStateSchema, { type: "auth:signOut" });
    useFlorStore.getState().applyAuth(auth);
  } catch (error) {
    noteFailure(error);
  }
}

export async function selectWorkspace(workspaceId: string): Promise<void> {
  try {
    await request(WorkspaceSetSchema, { type: "workspace:set", workspaceId });
    useFlorStore.getState().selectWorkspace(workspaceId);
  } catch (error) {
    noteFailure(error);
  }
}

export function retryPatient(): void {
  if (lastPersonId) void openPatient(lastPersonId);
}

export async function loadMorePatients(): Promise<void> {
  const state = useFlorStore.getState();
  if (!state.workspaceId || state.directoryLoading || state.directoryLoadingMore) return;
  if (state.directory && state.directoryTotal !== null && state.directory.length >= state.directoryTotal) return;
  const search = normalizeSearchQuery(state.query);
  const offset = state.directoryOffset;
  state.setDirectoryLoadingMore(true);
  try {
    const page = await request(
      PeoplePageSchema,
      search
        ? { type: "data:search", workspaceId: state.workspaceId, query: search, offset }
        : { type: "data:people", workspaceId: state.workspaceId, offset },
    );
    useFlorStore.getState().appendDirectory(page);
  } catch (error) {
    useFlorStore.getState().setDirectoryLoadingMore(false);
    noteDirectoryFailure(error);
  }
}

export async function openPatient(personId: string): Promise<void> {
  const workspaceId = useFlorStore.getState().workspaceId;
  if (!workspaceId) return;
  lastPersonId = personId;
  useFlorStore.getState().setRoute("patient");
  useFlorStore.getState().setPatientLoading(true);
  try {
    const chart = await request(PersonChartSchema, { type: "data:patient", workspaceId, personId });
    useFlorStore.getState().setPatient(chart);
  } catch (error) {
    useFlorStore.getState().setPatientLoading(false);
    noteFailure(error);
  }
}

export async function openFlor(): Promise<void> {
  try {
    await request(OpenedSchema, { type: "flor:open" });
  } catch (error) {
    noteFailure(error);
  }
}
