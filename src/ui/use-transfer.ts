import { useState } from "react";
import {
  allowlistedUpdate,
  checkIdentity,
  instructionsFor,
  locksMatch,
  mapControls,
  saveFieldsFrom,
  selectedFill,
  summarizeFill,
  type MappedField,
  type SaveField,
  type TransferLock,
} from "../engine/map";
import { canUndo } from "../engine/map";
import { readablePageLabel, type FillWriteResult } from "../engine/page";
import { PersonChartSchema } from "../shared/messages";
import type { PersonDetail } from "../shared/types";
import { request } from "./bridge";
import { useFlorStore } from "./store";
import { chromeFormAccess, readActiveForm } from "./transfer-tab";

export type TransferModel =
  | { kind: "scanning" }
  | { kind: "no-form"; message: string }
  | { kind: "preview"; fields: MappedField[]; lock: TransferLock; host: string; pageTitle: string; frameErrors: number }
  | { kind: "conflicts"; fields: MappedField[]; lock: TransferLock; host: string; pageTitle: string }
  | { kind: "result"; filled: number; skipped: string[]; site: string; undo: FillWriteResult[]; lock: TransferLock }
  | { kind: "save"; fields: SaveField[]; identity: string; lock: TransferLock; host: string; pageTitle: string; busy: boolean; error: string }
  | { kind: "saved" };

function samePatient(lock: TransferLock): boolean {
  const state = useFlorStore.getState();
  return Boolean(state.patient && state.workspaceId && state.patient.id === lock.patientId && state.workspaceId === lock.workspaceId);
}

export function useTransfer(person: PersonDetail | null, workspaceId: string | null) {
  const [model, setModel] = useState<TransferModel | null>(null);
  const access = chromeFormAccess();

  async function scan(direction: "fill" | "save"): Promise<void> {
    if (!person || !workspaceId) return;
    setModel({ kind: "scanning" });
    const result = await readActiveForm({
      queryTab: access.queryTab,
      hasPermission: access.hasPermission,
      requestPermission: access.requestPermission,
      scan: access.scan,
    });
    if (!result.ok || !person) {
      setModel({ kind: "no-form", message: result.ok ? "No form on this page" : result.message });
      return;
    }
    const fields = mapControls(result.controls, person);
    const page = readablePageLabel(result.tab.url, result.tab.title);
    const lock = { tabId: result.tab.id, url: result.tab.url, patientId: person.id, workspaceId };
    if (direction === "save") {
      const identity = checkIdentity(fields, person);
      setModel({
        kind: "save",
        fields: saveFieldsFrom(fields),
        identity: identity.summary,
        lock,
        host: page.host,
        pageTitle: page.title,
        busy: false,
        error: "",
      });
      return;
    }
    setModel({ kind: "preview", fields, lock, host: page.host, pageTitle: page.title, frameErrors: result.frameErrors });
  }

  async function confirmFill(fields: MappedField[], lock: TransferLock, host: string): Promise<void> {
    const current = await access.currentTab(lock.tabId);
    if (!current || !samePatient(lock) || !locksMatch(lock, { ...lock, tabId: current.id, url: current.url })) {
      setModel({ kind: "no-form", message: "The tab or patient changed. Nothing was typed." });
      return;
    }
    const results = await access.fill(lock.tabId, instructionsFor(fields));
    const summary = summarizeFill(results, fields);
    setModel({ kind: "result", filled: summary.filled, skipped: summary.skipped, site: host, undo: results, lock });
  }

  return {
    model,
    close: () => setModel(null),
    startFill: () => void scan("fill"),
    startSave: () => void scan("save"),
    retry: () => void scan("fill"),
    toggle(index: number) {
      setModel((current) => {
        if (!current || (current.kind !== "preview" && current.kind !== "conflicts")) return current;
        const fields = current.fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, selected: !field.selected } : field));
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
    continueFill() {
      if (!model || model.kind !== "preview") return;
      const occupied = model.fields.some((field) => field.occupied && field.status === "matched");
      if (occupied) setModel({ kind: "conflicts", fields: model.fields, lock: model.lock, host: model.host, pageTitle: model.pageTitle });
      else void confirmFill(model.fields, model.lock, model.host);
    },
    fillConflicts() {
      if (!model || model.kind !== "conflicts") return;
      void confirmFill(model.fields, model.lock, model.host);
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
      if (!samePatient(model.lock)) {
        setModel({ ...model, error: "The selected patient changed. Nothing was saved." });
        return;
      }
      const current = await access.currentTab(model.lock.tabId);
      if (!current || current.url !== model.lock.url) {
        setModel({ ...model, error: "The EHR tab changed. Nothing was saved." });
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
