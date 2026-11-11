import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDecision,
  duplicateCandidates,
  fingerprintNewPatientFacts,
  readNewPatient,
  retryWouldDuplicate,
  type NewPatientDraft,
  type NewPatientField,
} from "../engine/new-patient";
import { FlorError } from "../shared/errors";
import { CreatePatientFieldsSchema, PeoplePageSchema, PersonChartSchema } from "../shared/messages";
import type { DirectoryPerson } from "../shared/types";
import { request } from "./bridge";
import { useFlorStore } from "./store";
import { documentAddress } from "./tab-bind";
import { chromeFormAccess, readActivePage, watchActiveTab } from "./transfer-tab";

const CANNOT_READ = "No patient on this page.";
const STALE = "This page changed. Read it again.";

type SourceBits = { host: string; title: string };

type ReviewState = SourceBits & {
  kind: "review";
  draft: NewPatientDraft;
  evidence: Partial<Record<NewPatientField, string>>;
  warnings: string[];
  duplicates: DirectoryPerson[];
  tabId: number;
  url: string;
  fingerprint: string;
  personName: string;
  busy: boolean;
  error: string;
  editing: boolean;
  holdWrite: boolean;
};

type DuplicateState = Omit<ReviewState, "kind" | "editing"> & { kind: "duplicate" };

type AddPatientModel =
  | ({ kind: "ready" } & SourceBits)
  | ({ kind: "scanning" } & SourceBits)
  | { kind: "error"; message: string }
  | ReviewState
  | DuplicateState
  | { kind: "success"; name: string; mrn: string | null };

const FIELD_WARNING: Partial<Record<NewPatientField, string>> = {
  first_name: "First name",
  last_name: "Last name",
  date_of_birth: "Date of birth",
  sex: "Sex",
  phone: "Phone",
  email: "Email",
  address_line1: "Street address",
  city: "City",
  state: "State",
  postal_code: "Postal code",
};

function blockedMessage(reason: string): string {
  if (reason === "permission") return "Allow this site, then try again.";
  if (reason === "wrong-document") return "The page changed. Try again.";
  return CANNOT_READ;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function sourceFrom(current: AddPatientModel | null): SourceBits {
  if (current && "host" in current) return { host: current.host, title: current.title };
  return { host: "", title: "" };
}

export function useAddPatient(workspaceId: string | null, enabled = true) {
  const [model, setModel] = useState<AddPatientModel | null>(null);
  const access = useMemo(() => chromeFormAccess(), []);
  const requestId = useRef(0);
  const creating = useRef(false);
  const panelBuild = __FLOR_VERSION__;

  useEffect(() => {
    if (enabled) return;
    requestId.current += 1;
    creating.current = false;
    setModel(null);
  }, [enabled]);

  useEffect(() => {
    requestId.current += 1;
    creating.current = false;
    setModel(null);
  }, [workspaceId]);

  useEffect(() => watchActiveTab(() => {
    setModel((current) => {
      if (!current || (current.kind !== "review" && current.kind !== "duplicate")) return current;
      requestId.current += 1;
      creating.current = false;
      return { kind: "error", message: STALE };
    });
  }), []);

  async function findDuplicates(draft: NewPatientDraft): Promise<DirectoryPerson[]> {
    if (!workspaceId || !draft.first_name.trim() || !draft.last_name.trim()) return [];
    const query = `${draft.first_name.trim()} ${draft.last_name.trim()}`;
    const page = await request(PeoplePageSchema, { type: "data:search", workspaceId, query, offset: 0 });
    return duplicateCandidates(page.people, draft);
  }

  async function rememberSource(token: number): Promise<void> {
    const binding = await access.queryTab();
    if (token !== requestId.current || !binding.ok) return;
    setModel((current) => {
      if (!current || (current.kind !== "ready" && current.kind !== "scanning")) return current;
      return { ...current, host: hostOf(binding.tab.url), title: binding.tab.title };
    });
  }

  async function scan(): Promise<void> {
    if (!workspaceId) return;
    const token = ++requestId.current;
    creating.current = false;
    setModel((current) => ({ kind: "scanning", ...sourceFrom(current) }));
    void rememberSource(token);
    try {
      const result = await readActivePage({
        queryTab: access.queryTab,
        hasPermission: access.hasPermission,
        requestPermission: access.requestPermission,
        read: access.read,
      });
      if (token !== requestId.current) return;
      if (!result.ok) {
        setModel({ kind: "error", message: blockedMessage(result.reason) });
        return;
      }
      const active = await access.queryTab();
      if (!active.ok || active.tab.id !== result.tab.id || active.tab.url !== result.tab.url) {
        setModel({ kind: "error", message: STALE });
        return;
      }
      const read = readNewPatient(result.facts);
      if (!read.ok) {
        setModel({ kind: "error", message: read.message });
        return;
      }
      let duplicates: DirectoryPerson[] = [];
      let duplicateError = "";
      try {
        duplicates = await findDuplicates(read.draft);
      } catch (error) {
        duplicateError = error instanceof Error ? error.message : "Couldn’t check for an existing patient.";
      }
      if (token !== requestId.current) return;
      const address = documentAddress(result.tab.url);
      setModel({
        kind: "review",
        draft: read.draft,
        evidence: read.evidence,
        warnings: read.warnings,
        duplicates,
        host: address?.host ?? hostOf(result.tab.url),
        title: result.tab.title,
        tabId: result.tab.id,
        url: result.tab.url,
        fingerprint: fingerprintNewPatientFacts(result.facts),
        personName: read.personName,
        busy: false,
        error: duplicateError,
        editing: false,
        holdWrite: false,
      });
    } catch (error) {
      if (token !== requestId.current) return;
      setModel({ kind: "error", message: error instanceof Error ? error.message : CANNOT_READ });
    }
  }

  async function sourceStillMatches(current: ReviewState | DuplicateState): Promise<boolean> {
    const binding = await access.queryTab();
    if (!binding.ok || binding.tab.id !== current.tabId || binding.tab.url !== current.url) return false;
    const fresh = await access.read(current.tabId);
    const address = documentAddress(binding.tab.url);
    if (fresh.injectionFailed || fresh.build !== panelBuild || !address || fresh.host !== address.host || fresh.path !== address.path) return false;
    return fingerprintNewPatientFacts(fresh.facts) === current.fingerprint;
  }

  async function create(allowPossibleDuplicate: boolean): Promise<void> {
    if (!model || (model.kind !== "review" && model.kind !== "duplicate") || model.busy || model.holdWrite || !workspaceId || creating.current) return;
    const current = model;
    const token = requestId.current;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(current.draft)) if (value.trim()) fields[key] = value.trim();
    const parsed = CreatePatientFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      setModel({ ...current, busy: false, error: parsed.error.issues[0]?.message ?? "Check the patient details and try again." });
      return;
    }
    creating.current = true;
    setModel({ ...current, busy: true, error: "" });
    try {
      if (token !== requestId.current || !(await sourceStillMatches(current))) {
        if (token === requestId.current) setModel({ kind: "error", message: STALE });
        return;
      }
      const latestDuplicates = await findDuplicates(current.draft);
      if (token !== requestId.current) return;
      if (createDecision(latestDuplicates.length, allowPossibleDuplicate) === "review-duplicates") {
        setModel({ ...current, kind: "duplicate", duplicates: latestDuplicates, busy: false, error: "", holdWrite: false });
        return;
      }
      if (token !== requestId.current || !(await sourceStillMatches(current))) {
        if (token === requestId.current) setModel({ kind: "error", message: STALE });
        return;
      }
      const chart = await request(PersonChartSchema, { type: "data:createPatient", workspaceId, fields: parsed.data });
      if (token !== requestId.current) return;
      const created = chart.person;
      setModel({ kind: "success", name: `${created.firstName ?? ""} ${created.lastName ?? ""}`.trim() || current.personName, mrn: created.mrn });
      const state = useFlorStore.getState();
      state.setPatient(chart);
      state.retry();
    } catch (error) {
      if (token !== requestId.current) return;
      let duplicates: DirectoryPerson[] = [];
      let searchFailed = false;
      try {
        duplicates = await findDuplicates(current.draft);
      } catch {
        searchFailed = true;
        duplicates = [];
      }
      const code = error instanceof FlorError ? error.code : null;
      if (retryWouldDuplicate(code, duplicates.length)) {
        setModel({
          ...current,
          kind: "duplicate",
          duplicates,
          busy: false,
          holdWrite: true,
          error: "This name is already in FLOR.",
        });
        return;
      }
      if (searchFailed && retryWouldDuplicate(code, 1)) {
        setModel({
          ...current,
          busy: false,
          holdWrite: true,
          error: "Couldn’t confirm this was added. Check the patient list.",
        });
        return;
      }
      setModel({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : "Couldn’t add this patient.",
      });
    } finally {
      creating.current = false;
    }
  }

  return {
    model,
    start: () => {
      const token = ++requestId.current;
      creating.current = false;
      setModel({ kind: "ready", host: "", title: "" });
      void rememberSource(token);
    },
    close: () => {
      requestId.current += 1;
      creating.current = false;
      setModel(null);
    },
    back: () => {
      const current = model;
      if (current?.kind === "duplicate" && !current.holdWrite) {
        setModel({ ...current, kind: "review", editing: false, busy: false, error: "" });
        return;
      }
      requestId.current += 1;
      creating.current = false;
      if (current?.kind === "review" || (current?.kind === "duplicate" && current.holdWrite)) {
        setModel({ kind: "ready", host: current.host, title: current.title });
        return;
      }
      setModel(null);
    },
    edit: () => setModel((current) => (current?.kind === "review" ? { ...current, editing: !current.editing, error: "" } : current)),
    setField: (field: NewPatientField, value: string) => setModel((current) => {
      if (!current || current.kind !== "review") return current;
      const warningPrefix = FIELD_WARNING[field];
      return {
        ...current,
        draft: { ...current.draft, [field]: value },
        warnings: warningPrefix ? current.warnings.filter((warning) => !warning.startsWith(warningPrefix)) : current.warnings,
        error: "",
      };
    }),
    create: () => void create(false),
    createAnyway: () => void create(true),
    retry: () => void scan(),
  };
}

export type { AddPatientModel };
