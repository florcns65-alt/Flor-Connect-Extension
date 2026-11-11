import { useEffect, useMemo, useRef, useState } from "react";
import { CreatePatientFieldsSchema, PeoplePageSchema, PersonChartSchema } from "../shared/messages";
import type { DirectoryPerson } from "../shared/types";
import { fingerprintNewPatientFacts, mapNewPatientFacts, patientNameKey, type NewPatientDraft, type NewPatientField } from "../engine/new-patient";
import { request } from "./bridge";
import { useFlorStore } from "./store";
import { documentAddress, hostPermissionCandidates } from "./tab-bind";
import { chromeFormAccess, lastResolvedHttpTab, readActivePage, watchActiveTab } from "./transfer-tab";

type AddPatientModel =
  | { kind: "ready" }
  | { kind: "scanning" }
  | { kind: "error"; message: string; unsupported?: boolean }
  | { kind: "success"; name: string; mrn: string | null }
  | {
      kind: "review";
      draft: NewPatientDraft;
      evidence: Partial<Record<NewPatientField, string>>;
      warnings: string[];
      duplicates: DirectoryPerson[];
      sourceHost: string;
      sourceTitle: string;
      tabId: number;
      url: string;
      fingerprint: string;
      busy: boolean;
      error: string;
    };

const SUPPORTED_DEMO_ORIGIN = "https://demo.openemr.io";

function isSupportedDemoOrigin(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).origin === SUPPORTED_DEMO_ORIGIN;
  } catch {
    return false;
  }
}

function exactNameMatches(people: DirectoryPerson[], firstName: string, lastName: string): DirectoryPerson[] {
  const key = patientNameKey(firstName, lastName);
  if (!key) return [];
  return people.filter((person) => patientNameKey(person.firstName ?? "", person.lastName ?? "") === key || patientNameKey(person.name ?? "", "") === key);
}

export function useAddPatient(workspaceId: string | null) {
  const [model, setModel] = useState<AddPatientModel | null>(null);
  const access = useMemo(() => chromeFormAccess(), []);
  const requestId = useRef(0);
  const panelBuild = __FLOR_VERSION__;

  useEffect(() => watchActiveTab(() => {
    if (model?.kind !== "review") return;
    requestId.current += 1;
    setModel({ kind: "error", message: "The active tab changed. Read the registration form again." });
  }), [model?.kind]);

  useEffect(() => {
    requestId.current += 1;
    setModel(null);
  }, [workspaceId]);

  async function findDuplicates(draft: NewPatientDraft): Promise<DirectoryPerson[]> {
    if (!workspaceId || !draft.first_name.trim() || !draft.last_name.trim()) return [];
    const query = `${draft.first_name.trim()} ${draft.last_name.trim()}`;
    const page = await request(PeoplePageSchema, { type: "data:search", workspaceId, query, offset: 0 });
    return exactNameMatches(page.people, draft.first_name, draft.last_name);
  }

  async function scan(): Promise<void> {
    if (!workspaceId) return;
    const token = ++requestId.current;
    setModel({ kind: "scanning" });
    const remembered = lastResolvedHttpTab();
    const pattern = remembered ? hostPermissionCandidates(remembered.url)[0] : undefined;
    if (!remembered || !pattern) {
      setModel({ kind: "error", message: "Open the demo patient registration form in a browser tab, then try again." });
      return;
    }
    if (!isSupportedDemoOrigin(remembered.url)) {
        setModel({ kind: "error", unsupported: true, message: "Open the New Patient registration form in the demo site, then try again. An existing chart isn't enough." });
      return;
    }
    try {
      const hasPermission = await access.hasPermission(pattern);
      if (token !== requestId.current) return;
      if (!hasPermission) {
        const granted = await access.requestPermission(pattern);
        if (token !== requestId.current) return;
        if (!granted) {
          setModel({ kind: "error", message: "Site access wasn't granted, so nothing was read." });
          return;
        }
      }
      const result = await readActivePage({
        queryTab: access.queryTab,
        hasPermission: access.hasPermission,
        requestPermission: access.requestPermission,
        read: access.read,
      });
      if (token !== requestId.current) return;
      if (!result.ok) {
        setModel({ kind: "error", message: result.message });
        return;
      }
      if (!result.registrationForm) {
        setModel({ kind: "error", unsupported: true, message: "Open the New Patient registration form in this tab, then try again. An existing chart isn't enough." });
        return;
      }
      if (result.frameErrors > 0) {
        setModel({ kind: "error", message: "A part of this form couldn't be read. Check the registration form and try again." });
        return;
      }
      const active = await access.queryTab();
      if (!active.ok || active.tab.id !== result.tab.id || active.tab.url !== result.tab.url) {
        setModel({ kind: "error", message: "The active tab changed while the form was being read. Nothing was saved." });
        return;
      }
      const address = documentAddress(result.tab.url);
      const mapped = mapNewPatientFacts(result.facts);
      const duplicates = await findDuplicates(mapped.draft);
      if (token !== requestId.current) return;
      setModel({
        kind: "review",
        draft: mapped.draft,
        evidence: mapped.evidence,
        warnings: mapped.warnings,
        duplicates,
        sourceHost: address?.host ?? "",
        sourceTitle: result.tab.title,
        tabId: result.tab.id,
        url: result.tab.url,
        fingerprint: fingerprintNewPatientFacts(result.facts),
        busy: false,
        error: "",
      });
    } catch (error) {
      if (token !== requestId.current) return;
      setModel({ kind: "error", message: error instanceof Error ? error.message : "The form couldn't be read. Try again." });
    }
  }

  async function create(allowPossibleDuplicate = false): Promise<void> {
    if (!model || model.kind !== "review" || model.busy || !workspaceId) return;
    const { draft } = model;
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(draft)) if (value.trim()) fields[key] = value.trim();
    const parsed = CreatePatientFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      setModel({ ...model, error: parsed.error.issues[0]?.message ?? "Check the patient details and try again." });
      return;
    }

    setModel({ ...model, busy: true, error: "" });
    const binding = await access.queryTab();
    if (!binding.ok || binding.tab.id !== model.tabId || binding.tab.url !== model.url) {
      setModel({ kind: "error", message: "The active tab changed. Read the registration form again." });
      return;
    }
    const fresh = await access.read(model.tabId);
    const address = documentAddress(binding.tab.url);
    if (fresh.injectionFailed || fresh.build !== panelBuild || !fresh.registrationForm || !address || fresh.host !== address.host || fresh.path !== address.path) {
      setModel({ kind: "error", message: "The registration form changed or couldn't be checked again. Nothing was saved." });
      return;
    }
    if (fingerprintNewPatientFacts(fresh.facts) !== model.fingerprint) {
      setModel({ kind: "error", message: "The registration details changed after review. Read the form again." });
      return;
    }
    const latestDuplicates = await findDuplicates(draft);
    if (latestDuplicates.length > 0 && !allowPossibleDuplicate) {
      setModel({ ...model, duplicates: latestDuplicates, busy: false, error: "A patient with this name is already in FLOR. Open the existing record to review it." });
      return;
    }
    const finalBinding = await access.queryTab();
    if (!finalBinding.ok || finalBinding.tab.id !== model.tabId || finalBinding.tab.url !== model.url) {
      setModel({ kind: "error", message: "The active tab changed. Read the registration form again." });
      return;
    }
    const finalRead = await access.read(model.tabId);
    const finalAddress = documentAddress(finalBinding.tab.url);
    if (finalRead.injectionFailed || finalRead.build !== panelBuild || !finalRead.registrationForm || !finalAddress || finalRead.host !== finalAddress.host || finalRead.path !== finalAddress.path || fingerprintNewPatientFacts(finalRead.facts) !== model.fingerprint) {
      setModel({ kind: "error", message: "The registration form changed after review. Read the form again." });
      return;
    }
    try {
      const chart = await request(PersonChartSchema, { type: "data:createPatient", workspaceId, fields: parsed.data });
      const created = chart.person;
      setModel({ kind: "success", name: `${created.firstName ?? ""} ${created.lastName ?? ""}`.trim(), mrn: created.mrn });
      const state = useFlorStore.getState();
      state.setPatient(chart);
      state.retry();
    } catch (error) {
      let duplicates: DirectoryPerson[] = [];
      try {
        duplicates = await findDuplicates(draft);
      } catch {
        // Keep the original failure. A retry always repeats the duplicate check before creating.
      }
      setModel({
        ...model,
        duplicates,
        busy: false,
        error: duplicates.length
          ? "A matching patient is now in FLOR. Open that record instead of creating another."
          : error instanceof Error
            ? error.message
            : "FLOR couldn't confirm creation. Search the patient list before trying again.",
      });
    }
  }

  return {
    model,
    start: () => setModel({ kind: "ready" }),
    close: () => { requestId.current += 1; setModel(null); },
    setField: (field: NewPatientField, value: string) => setModel((current) => {
      if (!current || current.kind !== "review") return current;
      const warningPrefix = field === "date_of_birth"
        ? "Date of birth"
        : field === "first_name"
          ? "First name"
          : field === "last_name"
            ? "Last name"
            : "";
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
