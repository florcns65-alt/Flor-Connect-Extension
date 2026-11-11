import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyLayout,
  confirmRegion,
  identityFor,
  layoutDrifted,
  mapPageFacts,
  rememberLayout,
  sessionLayoutsStore,
} from "../engine/facts";
import {
  allowlistedUpdate,
  instructionsFor,
  locksMatch,
  saveFieldsFrom,
  selectedFill,
  summarizeFill,
  type MappedField,
  type SaveField,
  type TransferLock,
} from "../engine/map";
import { canUndo } from "../engine/map";
import { readablePageLabel, type FillWriteResult } from "../engine/page";
import type { FieldPick, PageFact } from "../engine/read";
import { PersonChartSchema } from "../shared/messages";
import type { PersonDetail } from "../shared/types";
import { request } from "./bridge";
import { useFlorStore } from "./store";
import { acceptScan, documentAddress, hostPermissionCandidates } from "./tab-bind";
import { chromeFormAccess, lastResolvedHttpTab, readActivePage, watchActiveTab } from "./transfer-tab";

type PageContext = {
  facts: PageFact[];
  fields: MappedField[];
  lock: TransferLock;
  host: string;
  pageTitle: string;
  frameNote: string;
  layoutNote: string;
};

export type TransferModel =
  | { kind: "scanning" }
  | { kind: "no-form"; message: string }
  | { kind: "cant-read"; message: string; counts: string }
  | ({ kind: "chart"; identity: string; blocked: boolean } & PageContext)
  | ({ kind: "mapping"; direction: "fill" | "save"; remember: boolean; blocked: boolean; identity: string } & PageContext)
  | ({ kind: "multi"; direction: "fill" | "save"; people: Array<{ name: string; mrn: string }>; error: string } & PageContext)
  | ({ kind: "pick"; purpose: "field" | "region"; direction: "fill" | "save"; targetIndex: number; lookingFor: string; picked: FieldPick | null; returnKind: "mapping" | "preview" | "chart" } & PageContext)
  | ({ kind: "preview"; blocked: boolean; identity: string } & PageContext)
  | ({ kind: "conflicts" } & PageContext)
  | { kind: "result"; filled: number; skipped: string[]; site: string; undo: FillWriteResult[]; lock: TransferLock }
  | { kind: "save"; fields: SaveField[]; identity: string; blocked: boolean; lock: TransferLock; host: string; pageTitle: string; busy: boolean; error: string; facts: PageFact[]; sourceFields: MappedField[] }
  | { kind: "saved" };

function samePatient(lock: TransferLock): boolean {
  const state = useFlorStore.getState();
  return Boolean(state.patient && state.workspaceId && state.patient.id === lock.patientId && state.workspaceId === lock.workspaceId);
}

function notesFor(frameErrors: number, closedControls: number): string {
  const notes = [];
  if (frameErrors) notes.push("Some frames on the page could not be read.");
  if (closedControls) notes.push(`${closedControls} closed boxes were left unread.`);
  return notes.join(" ");
}

export function useTransfer(person: PersonDetail | null, workspaceId: string | null) {
  const [model, setModel] = useState<TransferModel | null>(null);
  const access = useMemo(() => chromeFormAccess(), []);
  const memory = sessionLayoutsStore();
  const requestId = useRef(0);
  const holdInvalidation = useRef(false);
  const panelBuild = __FLOR_VERSION__;
  const installedBuild = typeof chrome !== "undefined" && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : panelBuild;
  useEffect(() => watchActiveTab(() => {
    if (holdInvalidation.current) return;
    requestId.current += 1;
    setModel(null);
  }), []);
  useEffect(() => {
    requestId.current += 1;
    setModel(null);
  }, [person?.id, workspaceId]);
  const pickTabId = model?.kind === "pick" ? model.lock.tabId : 0;

  useEffect(() => {
    if (!pickTabId) return;
    const tabId = pickTabId;
    let alive = true;
    void access.armPicker(tabId);
    const timer = window.setInterval(() => {
      void access.takePick(tabId).then((pick) => {
        if (!alive || !pick) return;
        setModel((current) => (current && current.kind === "pick" ? { ...current, picked: pick } : current));
      });
    }, 400);
    return () => {
      alive = false;
      window.clearInterval(timer);
      void access.disarmPicker(tabId);
    };
  }, [access, pickTabId]);

  async function openMapped(direction: "fill" | "save", context: PageContext, facts: PageFact[]) {
    if (!person || !workspaceId) return;
    const detected = mapPageFacts(facts, person);
    if (detected.mixed) {
      setModel({ ...context, kind: "multi", direction, people: detected.people, error: "", fields: detected.fields, facts });
      return;
    }
    const identity = identityFor(detected.fields, person, facts);
    const stored = memory.get(workspaceId, context.lock.url);
    let fields = detected.fields;
    let layoutNote = "";
    if (stored) {
      if (layoutDrifted(stored, facts)) layoutNote = "The page layout changed, so the remembered match was not used.";
      else fields = applyLayout(stored, facts, fields);
    }
    const page: PageContext = { ...context, facts, fields, layoutNote, frameNote: context.frameNote };
    if (direction === "fill") {
      if (detected.writable === 0) {
        setModel({ kind: "no-form", message: "No form on this page" });
        return;
      }
      setModel({ ...page, kind: "preview", blocked: identity.blockSave, identity: identity.summary });
      return;
    }
    if (detected.writable === 0) {
      setModel({ ...page, kind: "chart", identity: identity.summary, blocked: identity.blockSave });
      return;
    }
    setModel({ ...page, kind: "mapping", direction, remember: false, blocked: identity.blockSave, identity: identity.summary });
  }

  function begin(direction: "fill" | "save"): void {
    if (installedBuild && panelBuild !== installedBuild) {
      setModel({ kind: "cant-read", message: "Close and reopen FLOR Connect before trying again. Nothing was read.", counts: "" });
      return;
    }
    const remembered = lastResolvedHttpTab();
    const candidates = remembered ? hostPermissionCandidates(remembered.url) : [];
    const pattern = candidates[0];
    if (!pattern || !remembered) {
      setModel({ kind: "cant-read", message: "The active tab's address is not ready. Press the button again.", counts: "" });
      return;
    }
    const host = new URL(remembered.url).host;
    holdInvalidation.current = true;
    const finish = () => {
      holdInvalidation.current = false;
    };
    const denied = () => {
      setModel({
        kind: "cant-read",
        message: `Site access for ${host} was denied, so nothing was read. The request was only for that site.`,
        counts: `Permission request: ${pattern}`,
      });
    };
    void Promise.all(candidates.map((item) => chrome.permissions.contains({ origins: [item] }))).then(async (answers) => {
      if (!answers.some(Boolean)) {
        try {
          const granted = await chrome.permissions.request({ origins: [pattern] });
          if (!granted) {
            denied();
            return;
          }
        } catch {
          setModel({
            kind: "cant-read",
            message: `Chrome did not show a site prompt for ${host}. Nothing was read.`,
            counts: `Permission request: ${pattern}`,
          });
          return;
        }
      }
      await scan(direction);
    }).finally(finish);
  }

  async function scan(direction: "fill" | "save"): Promise<void> {
    if (!person || !workspaceId) return;
    const token = ++requestId.current;
    setModel({ kind: "scanning" });
    const result = await readActivePage({
      queryTab: access.queryTab,
      hasPermission: access.hasPermission,
      requestPermission: access.requestPermission,
      read: access.read,
    });
    if (token !== requestId.current) return;
    if (!result.ok || !person) {
      setModel({ kind: "cant-read", message: result.ok ? "This page could not be checked." : result.message, counts: result.ok ? "" : result.counts });
      return;
    }
    const active = await access.queryTab();
    if (!active.ok || active.tab.id !== result.tab.id || active.tab.url !== result.tab.url) {
      setModel({ kind: "cant-read", message: "The active tab changed while the page was being checked. Those fields were discarded.", counts: "" });
      return;
    }
    const tabAddress = documentAddress(result.tab.url);
    const decision = acceptScan({
      requestId: token,
      currentId: requestId.current,
      tabId: result.tab.id,
      currentTabId: result.tab.id,
      tabHost: tabAddress?.host ?? "",
      tabPath: tabAddress?.path ?? "",
      documentHost: result.host,
      documentPath: result.path,
      readerBuild: result.build,
      panelBuild,
    });
    if (decision === "stale-reader") {
      setModel({ kind: "cant-read", message: `The reader that ran is ${result.build || "unknown"} but this panel is ${panelBuild}. Close the side panel and open it again. The fields were discarded.`, counts: "" });
      return;
    }
    const page = readablePageLabel(result.tab.url, result.tab.title);
    const lock = { tabId: result.tab.id, url: result.tab.url, patientId: person.id, workspaceId, regionId: "" };
    const context: PageContext = {
      facts: result.facts,
      fields: [],
      lock,
      host: page.host,
      pageTitle: page.title,
      frameNote: `Read ${page.host}. Reader ${result.build || "unknown"}. ${notesFor(result.frameErrors, result.closedControls)}`.trim(),
      layoutNote: "",
    };
    if (result.facts.length === 0) {
      setModel({ kind: "cant-read", message: "This tab doesn't have text or boxes we can use.", counts: "" });
      return;
    }
    await openMapped(direction, context, result.facts);
  }

  async function confirmFill(fields: MappedField[], lock: TransferLock, host: string): Promise<void> {
    if (!person || !samePatient(lock)) {
      setModel({ kind: "cant-read", message: "The selected patient or workspace changed. Nothing was typed.", counts: "" });
      return;
    }
    const binding = await access.queryTab();
    if (!binding.ok || binding.tab.id !== lock.tabId || !locksMatch(lock, { ...lock, tabId: binding.tab.id, url: binding.tab.url })) {
      setModel({ kind: "cant-read", message: "The active tab changed. Nothing was typed.", counts: "" });
      return;
    }
    const fresh = await access.read(lock.tabId);
    const address = documentAddress(binding.tab.url);
    if (fresh.injectionFailed || fresh.build !== panelBuild || !address || fresh.host !== address.host || fresh.path !== address.path) {
      setModel({ kind: "cant-read", message: "The page changed or could not be checked again. Nothing was typed.", counts: "" });
      return;
    }
    const freshMapped = mapPageFacts(fresh.facts, person);
    const currentIdentity = identityFor(freshMapped.fields, person, fresh.facts);
    if (freshMapped.mixed || currentIdentity.blockSave) {
      const message = freshMapped.mixed ? "This page still includes more than one person. Nothing was typed." : currentIdentity.summary;
      setModel({ kind: "cant-read", message, counts: "Nothing was typed." });
      return;
    }
    const selectedDrifted = fields.some((field) => {
      if (!field.selected || !field.key) return false;
      const match = freshMapped.fields.filter((item) => item.key === field.key && item.status === "matched");
      return match.length !== 1 || match[0].pageValue !== field.pageValue || match[0].controlId !== field.controlId || match[0].controlName !== field.controlName || match[0].regionId !== field.regionId;
    });
    if (selectedDrifted) {
      setModel({ kind: "cant-read", message: "The form changed after review. Nothing was typed.", counts: "" });
      return;
    }
    const finalTab = await access.queryTab();
    if (!samePatient(lock) || !finalTab.ok || finalTab.tab.id !== lock.tabId || finalTab.tab.url !== lock.url) {
      setModel({ kind: "cant-read", message: "The patient, workspace, or active tab changed. Nothing was typed.", counts: "" });
      return;
    }
    const current = await access.currentTab(lock.tabId);
    if (!current || !samePatient(lock) || !locksMatch(lock, { ...lock, tabId: current.id, url: current.url })) {
      setModel({ kind: "cant-read", message: "The tab or patient changed. Nothing was typed.", counts: "" });
      return;
    }
    const results = await access.fill(lock.tabId, instructionsFor(fields));
    const summary = summarizeFill(results, fields);
    setModel({ kind: "result", filled: summary.filled, skipped: summary.skipped, site: host, undo: results, lock });
  }

  return {
    model,
    close: () => setModel(null),
    startFill: () => begin("fill"),
    startSave: () => begin("save"),
    retry: () => begin(model && "direction" in model ? model.direction : "save"),
    toggle(index: number) {
      setModel((current) => {
        if (!current || (current.kind !== "preview" && current.kind !== "conflicts" && current.kind !== "mapping" && current.kind !== "chart")) return current;
        const fields = current.fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, selected: !field.selected, status: field.selected ? "unmatched" as const : field.status } : field));
        const identity = person ? identityFor(fields, person, current.facts) : { summary: "", blockSave: true };
        if (current.kind === "mapping" || current.kind === "chart") return { ...current, fields, blocked: identity.blockSave, identity: identity.summary };
        return { ...current, fields };
      });
    },
    toggleSave(index: number) {
      setModel((current) => {
        if (!current || current.kind !== "save") return current;
        const fields = current.fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, selected: !field.selected } : field));
        return { ...current, fields };
      });
    },
    toggleRemember() {
      setModel((current) => (current && current.kind === "mapping" ? { ...current, remember: !current.remember } : current));
    },
    continueFill() {
      if (!model || model.kind !== "preview") return;
      if (model.blocked) return;
      const occupied = model.fields.some((field) => field.occupied && field.status === "matched");
      if (occupied) setModel({ ...model, kind: "conflicts" });
      else void confirmFill(model.fields, model.lock, model.host);
    },
    fillConflicts() {
      if (!model || model.kind !== "conflicts") return;
      void confirmFill(model.fields, model.lock, model.host);
    },
    reviewSave() {
      if (!model || !person || (model.kind !== "chart" && model.kind !== "mapping")) return;
      const identity = identityFor(model.fields, person, model.facts);
      if (model.kind === "chart") {
        setModel({ ...model, kind: "mapping", direction: "save", remember: false, blocked: identity.blockSave, identity: identity.summary });
        return;
      }
      if (identity.blockSave) return;
      let layoutNote = model.layoutNote;
      if (model.remember && workspaceId) {
        const stored = rememberLayout({ workspaceId, url: model.lock.url, facts: model.facts, fields: model.fields });
        if (stored) memory.set(stored);
        else layoutNote = "This page address has a query string, so the layout was not remembered.";
      }
      setModel({
        kind: "save",
        fields: saveFieldsFrom(model.fields),
        identity: identity.summary,
        blocked: identity.blockSave,
        lock: model.lock,
        host: model.host,
        pageTitle: model.pageTitle,
        busy: false,
        error: layoutNote,
        facts: model.facts,
        sourceFields: model.fields,
      });
    },
    pickField(index: number) {
      if (!model || !person || (model.kind !== "mapping" && model.kind !== "preview")) return;
      const field = model.fields[index];
      setModel({
        ...model,
        kind: "pick",
        purpose: "field",
        direction: model.kind === "preview" ? "fill" : model.direction,
        targetIndex: index,
        lookingFor: field?.fieldLabel || "this field",
        picked: null,
        returnKind: model.kind === "preview" ? "preview" : "mapping",
      });
    },
    isolatePatient() {
      if (!model || model.kind !== "multi" || !person) return;
      setModel({
        ...model,
        kind: "pick",
        purpose: "region",
        targetIndex: -1,
        lookingFor: [person.firstName, person.lastName].filter(Boolean).join(" "),
        picked: null,
        returnKind: "chart",
      });
    },
    acceptPick() {
      if (!model || model.kind !== "pick" || !model.picked || !person) return;
      if (model.purpose === "region") {
        const check = confirmRegion(model.facts, model.picked.regionId, person);
        if (!check.ok) {
          const detected = mapPageFacts(model.facts, person);
          setModel({ ...model, kind: "multi", people: detected.people, error: check.reason, direction: model.direction });
          return;
        }
        const mapped = mapPageFacts(check.facts, person);
        const identity = identityFor(mapped.fields, person, check.facts);
        const next = { ...model, facts: check.facts, fields: mapped.fields, lock: { ...model.lock, regionId: model.picked.regionId }, blocked: identity.blockSave, identity: identity.summary };
        setModel(mapped.writable === 0 ? { ...next, kind: "chart" } : { ...next, kind: "mapping", direction: "save", remember: false });
        return;
      }
      const picked = model.picked;
      const fields = model.fields.map((field, index) =>
        index === model.targetIndex
          ? { ...field, pageValue: picked.value, status: "matched" as const, selected: Boolean(picked.value), note: "", evidence: `From the label "${picked.evidenceText || picked.label}"`, regionId: picked.regionId, writable: picked.writable }
          : field,
      );
      const identity = identityFor(fields, person, model.facts);
      if (model.returnKind === "preview") setModel({ ...model, kind: "preview", fields, blocked: identity.blockSave, identity: identity.summary });
      else if (model.returnKind === "chart") setModel({ ...model, kind: "chart", fields, identity: identity.summary, blocked: identity.blockSave });
      else setModel({ ...model, kind: "mapping", fields, identity: identity.summary, blocked: identity.blockSave, direction: model.direction, remember: false });
    },
    async undo() {
      if (!model || model.kind !== "result") return;
      const scanned = await access.scan(model.lock.tabId);
      const plans = model.undo.filter((result) => {
        const control = scanned.controls.find((item) => item.id === result.id || item.name === result.name);
        return control ? canUndo(result.readBack, control.currentValue) : false;
      });
      if (plans.length) {
        await access.fill(
          model.lock.tabId,
          plans.map((result) => ({ id: result.id, name: result.name, label: result.label, tag: "input" as const, value: result.previousValue })),
        );
      }
      setModel(null);
    },
    async save() {
      if (!model || model.kind !== "save" || !person || !workspaceId) return;
      if (model.blocked || !samePatient(model.lock)) {
        setModel({ ...model, error: "The selected patient changed, or the page does not match them. Nothing was saved." });
        return;
      }
      const current = await access.currentTab(model.lock.tabId);
      const active = await access.queryTab();
      if (!current || !active.ok || active.tab.id !== model.lock.tabId || !locksMatch(model.lock, { ...model.lock, tabId: current.id, url: current.url })) {
        setModel({ ...model, error: "The EHR tab changed. Nothing was saved." });
        return;
      }
      const fresh = await access.read(model.lock.tabId);
      const freshAddress = documentAddress(current.url);
      if (fresh.injectionFailed || !freshAddress || fresh.host !== freshAddress.host || fresh.path !== freshAddress.path || fresh.build !== panelBuild) {
        setModel({ ...model, blocked: true, identity: "The page could not be verified again. Nothing was saved.", error: "Close the panel and reopen it before trying again." });
        return;
      }
      const scoped = model.lock.regionId ? fresh.facts.filter((fact) => fact.regionId === model.lock.regionId) : fresh.facts;
      if (model.lock.regionId) {
        const check = confirmRegion(fresh.facts, model.lock.regionId, person);
        if (!check.ok) {
          setModel({ ...model, error: check.reason });
          return;
        }
      }
      const freshFields = mapPageFacts(scoped, person).fields;
      const freshPeople = mapPageFacts(scoped, person);
      if (freshPeople.mixed) {
        setModel({ ...model, blocked: true, identity: "This page still includes more than one person.", error: "Nothing was saved." });
        return;
      }
      const freshIdentity = identityFor(freshFields, person, scoped);
      if (freshIdentity.blockSave) {
        setModel({ ...model, blocked: true, identity: freshIdentity.summary, error: freshIdentity.summary });
        return;
      }
      const drifted = model.fields.some((field) => {
        if (!field.selected) return false;
        const again = freshFields.find((item) => item.key === field.key);
        return !again || again.pageValue !== field.value;
      });
      if (drifted) {
        setModel({ ...model, error: "The page changed after the review. Nothing was saved." });
        return;
      }
      const finalTab = await access.queryTab();
      if (!samePatient(model.lock) || !finalTab.ok || finalTab.tab.id !== model.lock.tabId || finalTab.tab.url !== model.lock.url) {
        setModel({ ...model, blocked: true, error: "The patient, workspace, or active tab changed. Nothing was saved." });
        return;
      }
      setModel({ ...model, busy: true, error: "" });
      try {
        const chart = await request(PersonChartSchema, {
          type: "data:updatePerson",
          workspaceId,
          personId: person.id,
          fields: allowlistedUpdate(model.fields),
        });
        useFlorStore.getState().setPatient(chart);
        setModel({ kind: "saved" });
      } catch (error) {
        setModel({ ...model, busy: false, error: error instanceof Error ? error.message : "FLOR did not save those fields." });
      }
    },
  };
}

export function emptySelectedCount(fields: MappedField[]): number {
  return selectedFill(fields).filter((field) => !field.occupied).length;
}
