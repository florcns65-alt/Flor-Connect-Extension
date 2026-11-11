import type { PersonDetail } from "../shared/types";
import { formatDob } from "../shared/format";
import { classifyHint, fieldLabel, florValues, type DemographicKey, type MappedField } from "./map";
import type { PageFact } from "./read";

export interface DetectedPerson {
  regionId: string;
  name: string;
  mrn: string;
}

export interface LayoutAnchor {
  key: DemographicKey;
  label: string;
  name: string;
  id: string;
  evidenceKind: string;
  regionId: string;
}

export interface LayoutMemory {
  version: 1;
  workspaceId: string;
  origin: string;
  path: string;
  signature: string;
  anchors: LayoutAnchor[];
}

const PHI_VALUE = /@|\b\d{3}[-.\s]\d{3}|\d{5,}/;

export function dateCertainty(value: string): "iso" | "named" | "unambiguous" | "ambiguous" | "no" {
  const text = value.trim();
  if (!text) return "no";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "iso";
  if (/^\d{1,2}[.\s]+[A-Za-z]{3,}[.\s]+\d{4}$/.test(text)) return "named";
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
  if (!numeric) return "no";
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  if (first > 12 && second <= 12) return "unambiguous";
  if (second > 12 && first <= 12) return "unambiguous";
  return "ambiguous";
}

export function isoDate(value: string): string {
  const certainty = dateCertainty(value);
  if (certainty === "ambiguous" || certainty === "no") return "";
  if (certainty === "iso") return value.trim();
  if (certainty === "named") {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const named = /^(\d{1,2})[.\s]+([A-Za-z]+)[.\s]+(\d{4})$/.exec(value.trim());
    if (!named) return "";
    const month = months.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month < 0) return "";
    return `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(value.trim());
  if (!numeric) return "";
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  const year = numeric[3].length === 2 ? `19${numeric[3]}` : numeric[3];
  const day = first > 12 ? first : second;
  const month = first > 12 ? second : first;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function sameText(left: string, right: string): boolean {
  const norm = (value: string) => value.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
  return norm(left) === norm(right);
}

function evidenceLine(fact: PageFact): string {
  if (fact.evidenceKind === "heading") return `From the heading "${fact.evidenceText}"`;
  if (fact.evidenceKind === "autocomplete") return `From autocomplete "${fact.evidenceText}"`;
  if (fact.evidenceKind === "aria-label" || fact.evidenceKind === "aria-labelledby") return `From the accessible name "${fact.evidenceText}"`;
  return `From the label "${fact.evidenceText || fact.label}"`;
}

function nameTokens(value: string): string[] {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*$/g, "")
    .replace(/[^\p{L}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function displayName(value: string): string {
  return value.normalize("NFC").replace(/\s*\(\d+\)\s*$/g, "").replace(/\s+/g, " ").trim();
}

function joinName(first: string, last: string): string {
  const given = displayName(first);
  const family = displayName(last);
  if (!given) return family;
  if (!family) return given;
  const givenTokens = nameTokens(given);
  const familyTokens = nameTokens(family);
  const tail = givenTokens.slice(-familyTokens.length).join(" ");
  if (tail === familyTokens.join(" ")) return given;
  return `${given} ${family}`;
}

function samePersonName(left: string, right: string): boolean {
  const a = nameTokens(left);
  const b = nameTokens(right);
  if (a.length === 0 || b.length === 0) return false;
  const shrink = (tokens: string[]) => {
    const copy = [...tokens];
    while (copy.length >= 2 && copy[copy.length - 1] === copy[copy.length - 2]) copy.pop();
    return copy.join(" ");
  };
  return shrink(a) === shrink(b);
}

function usableRecordId(value: string): string {
  const text = value.trim();
  if (/^\d{1,3}$/.test(text)) return "";
  return text;
}

export function detectPeople(facts: PageFact[]): { people: DetectedPerson[]; mixed: boolean } {
  const byRegion = new Map<string, PageFact[]>();
  for (const fact of facts) {
    const list = byRegion.get(fact.regionId) ?? [];
    list.push(fact);
    byRegion.set(fact.regionId, list);
  }
  const found: Array<DetectedPerson & { dob: string }> = [];
  for (const [regionId, group] of byRegion) {
    const named = group.filter((fact) => /^(name|patient|patient name)$/i.test(fact.label)).map((fact) => fact.value);
    const firstFact = group.find((fact) => {
      const match = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
      return match && "key" in match && match.key === "first_name";
    });
    const lastFact = group.find((fact) => {
      const match = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
      return match && "key" in match && match.key === "last_name";
    });
    const dobFact = group.find((fact) => {
      const match = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
      return match && "key" in match && match.key === "date_of_birth";
    });
    const mrnFact = group.find((fact) => {
      const match = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
      return match && "key" in match && match.key === "mrn";
    });
    const assembled = firstFact || lastFact ? joinName(firstFact?.value ?? "", lastFact?.value ?? "") : "";
    const full = named[0] ? displayName(named[0]) : "";
    const name = full && assembled && samePersonName(full, assembled) ? (nameTokens(full).length <= nameTokens(assembled).length ? full : assembled) : full || assembled;
    if (!name) continue;
    found.push({ regionId, name, mrn: usableRecordId(mrnFact?.value ?? ""), dob: dobFact?.value ?? "" });
  }
  const clusters: Array<DetectedPerson & { dob: string }> = [];
  for (const person of found) {
    const match = clusters.find((other) => {
      if (!samePersonName(other.name, person.name)) return false;
      const dobConflict = other.dob && person.dob && isoDate(other.dob) !== isoDate(person.dob);
      const mrnConflict = other.mrn && person.mrn && other.mrn.toLowerCase() !== person.mrn.toLowerCase();
      if (dobConflict || mrnConflict) return false;
      const otherKnown = Boolean(other.dob || other.mrn);
      const personKnown = Boolean(person.dob || person.mrn);
      return otherKnown || personKnown || samePersonName(other.name, person.name) && other.regionId === person.regionId;
    });
    if (!match) clusters.push({ ...person });
    else if (nameTokens(person.name).length < nameTokens(match.name).length) match.name = person.name;
  }
  const people = clusters.map(({ regionId, name, mrn }) => ({ regionId, name, mrn }));
  return { people, mixed: people.length > 1 };
}

export function confirmRegion(facts: PageFact[], regionId: string, person: PersonDetail): { ok: boolean; reason: string; facts: PageFact[] } {
  const subset = facts.filter((fact) => fact.regionId === regionId);
  if (subset.length === 0) return { ok: false, reason: "That part of the page has no patient details.", facts: [] };
  const detected = detectPeople(subset);
  if (detected.mixed || detected.people.length !== 1) {
    return { ok: false, reason: "That section still includes more than one person.", facts: [] };
  }
  const identity = identityFor(mapPageFacts(subset, person).fields, person);
  if (identity.blockSave || !identity.matches) {
    return { ok: false, reason: "That section does not match the selected patient.", facts: [] };
  }
  return { ok: true, reason: identity.summary, facts: subset };
}

/** A checkbox, or any confirmation that skips the region read, cannot unlock mixed facts. */
export function mixedFactsUnlocked(_confirmed: boolean, regionOk: boolean): boolean {
  return regionOk;
}

export function mapPageFacts(facts: PageFact[], person: PersonDetail): { fields: MappedField[]; writable: number; mixed: boolean; people: DetectedPerson[] } {
  const values = florValues(person);
  const detected = detectPeople(facts);
  const fields: MappedField[] = [];
  const used = new Set<DemographicKey>();
  const fullName = [person.firstName, person.lastName].filter(Boolean).join(" ");

  const push = (field: MappedField) => {
    if (field.key) used.add(field.key);
    fields.push(field);
  };

  for (const fact of facts) {
    if (/^(name|patient|patient name)$/i.test(fact.label) && sameText(fact.value, fullName) && person.firstName && person.lastName) {
      push(fieldFrom(fact, "first_name", person.firstName, values.first_name));
      push(fieldFrom(fact, "last_name", person.lastName, values.last_name));
      continue;
    }
    const classified = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
    if (!classified) continue;
    if ("ambiguous" in classified) {
      push({
        control: null,
        key: null,
        fieldLabel: fact.label,
        florValue: "",
        pageValue: fact.value,
        status: "ambiguous",
        note: "More than one field looks like this.",
        occupied: true,
        selected: false,
        evidence: evidenceLine(fact),
        regionId: fact.regionId,
        writable: fact.writable,
      });
      continue;
    }
    const key = classified.key;
    if (key === "mrn" && !usableRecordId(fact.value)) continue;
    const ambiguousDate = key === "date_of_birth" && dateCertainty(fact.value) === "ambiguous";
    const duplicate = fields.some((field) => field.key === key && field.status === "matched");
    const occupied = Boolean(fact.value) && fact.writable;
    const selected = !ambiguousDate && !duplicate && (fact.writable ? !occupied && Boolean(values[key]) : Boolean(fact.value));
    push({
      control: null,
      key,
      fieldLabel: fieldLabel(key),
      florValue: values[key],
      pageValue: fact.value,
      status: ambiguousDate || duplicate ? "ambiguous" : values[key] || fact.value ? "matched" : "no_value",
      note: ambiguousDate ? "This date could be read two ways, so it will not be saved." : duplicate ? "More than one box looks like this." : fact.value ? "" : "No FLOR value to fill",
      occupied,
      selected,
      evidence: evidenceLine(fact),
      regionId: fact.regionId,
      writable: fact.writable,
      controlId: fact.controlId,
      controlName: fact.controlName,
      controlTag: fact.tag,
    });
  }

  for (const key of Object.keys(values) as DemographicKey[]) {
    if (used.has(key) || !values[key]) continue;
    if (facts.some((fact) => fact.writable)) {
      push({
        control: null,
        key,
        fieldLabel: fieldLabel(key),
        florValue: values[key],
        pageValue: "",
        status: "unmatched",
        note: "Pick this on the page",
        occupied: false,
        selected: false,
        writable: true,
      });
    }
  }
  return { fields, writable: facts.filter((fact) => fact.writable).length, mixed: detected.mixed, people: detected.people };
}

function fieldFrom(fact: PageFact, key: DemographicKey, pageValue: string, florValue: string): MappedField {
  return {
    control: null,
    key,
    fieldLabel: fieldLabel(key),
    florValue,
    pageValue,
    status: "matched",
    note: "",
    occupied: false,
    selected: true,
    evidence: evidenceLine(fact),
    regionId: fact.regionId,
    writable: fact.writable,
    controlId: fact.controlId,
    controlName: fact.controlName,
    controlTag: fact.tag,
  };
}

export function identityFor(fields: MappedField[], person: PersonDetail): { matches: boolean; blockSave: boolean; summary: string; kind: "match" | "mismatch" | "unknown" } {
  const read = (key: DemographicKey) => fields.find((field) => field.key === key && field.status === "matched")?.pageValue ?? "";
  const first = read("first_name");
  const last = read("last_name");
  const dob = read("date_of_birth");
  const mrn = usableRecordId(read("mrn"));
  const dobAmbiguous = !dob && fields.some((field) => field.key === "date_of_birth" && field.status === "ambiguous");
  if (!first && !last && !dob) {
    return { matches: false, blockSave: true, kind: "unknown", summary: "This page does not show a name or date of birth, so it cannot be checked against the selected patient." };
  }
  const nameOk = (!first || sameText(first, person.firstName ?? "")) && (!last || sameText(last, person.lastName ?? ""));
  const dobOk = !dob || sameText(dob, formatDob(person.dateOfBirth)) || sameText(dob, person.dateOfBirth ?? "") || isoDate(dob) === (person.dateOfBirth ?? "").slice(0, 10);
  const mrnOk = !mrn || sameText(mrn, person.mrn ?? "");
  if ((first || last) && !nameOk) {
    return { matches: false, blockSave: true, kind: "mismatch", summary: "This page does not match the selected patient. Choosing a different box cannot override that." };
  }
  if (dob && (!dobOk || dobAmbiguous)) {
    return { matches: false, blockSave: true, kind: dobAmbiguous ? "unknown" : "mismatch", summary: dobAmbiguous ? "The date of birth on this page could be read two ways, so nothing will be saved." : "The date of birth on this page does not match the selected patient, so nothing will be saved." };
  }
  if (mrn && !mrnOk) {
    return { matches: false, blockSave: true, kind: "mismatch", summary: "The medical record number on this page does not match the selected patient." };
  }
  if (!dob) {
    return { matches: false, blockSave: true, kind: "unknown", summary: "The name matches, but this page has no date of birth, so nothing will be saved." };
  }
  return { matches: true, blockSave: false, kind: "match", summary: `Name and date of birth match ${[person.firstName, person.lastName].filter(Boolean).join(" ")}.` };
}

export function pageSignature(facts: PageFact[]): string {
  return facts
    .map((fact) => [fact.regionId, fact.label, fact.controlName, fact.controlId, fact.evidenceKind].join("~"))
    .sort()
    .join("|");
}

export function safePageAddress(url: string): { origin: string; path: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password || parsed.search) return null;
    return { origin: parsed.origin, path: parsed.pathname };
  } catch {
    return null;
  }
}

export function rememberLayout(input: { workspaceId: string; url: string; facts: PageFact[]; fields: MappedField[] }): LayoutMemory | null {
  const address = safePageAddress(input.url);
  if (!address) return null;
  const anchors: LayoutAnchor[] = [];
  for (const field of input.fields) {
    if (!field.key || field.status !== "matched") continue;
    const fact = input.facts.find((item) => item.regionId === field.regionId && (item.label === field.fieldLabel || item.value === field.pageValue));
    const label = fact?.label || field.fieldLabel;
    const name = fact?.controlName || "";
    const id = fact?.controlId || "";
    if (PHI_VALUE.test(label) || PHI_VALUE.test(name) || PHI_VALUE.test(id)) return null;
    anchors.push({ key: field.key, label, name, id, evidenceKind: fact?.evidenceKind || "label", regionId: field.regionId || fact?.regionId || "page" });
  }
  if (anchors.length === 0) return null;
  return { version: 1, workspaceId: input.workspaceId, origin: address.origin, path: address.path, signature: pageSignature(input.facts), anchors };
}

export function layoutDrifted(memory: LayoutMemory, facts: PageFact[]): boolean {
  return memory.signature !== pageSignature(facts);
}

export function applyLayout(memory: LayoutMemory, facts: PageFact[], fields: MappedField[]): MappedField[] {
  if (layoutDrifted(memory, facts)) return fields;
  return fields.map((field) => {
    const anchor = memory.anchors.find((item) => item.key === field.key);
    if (!anchor) return field;
    const fact = facts.find((item) => item.regionId === anchor.regionId && item.label === anchor.label && item.controlName === anchor.name && item.controlId === anchor.id);
    if (!fact) return field;
    const classified = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
    if (classified && "key" in classified && classified.key !== anchor.key) return field;
    if (dateCertainty(fact.value) === "ambiguous" && anchor.key === "date_of_birth") return field;
    return { ...field, pageValue: fact.value, status: "matched" as const, selected: Boolean(fact.value), evidence: evidenceLine(fact), regionId: fact.regionId };
  });
}

const sessionLayouts = new Map<string, LayoutMemory>();

export function sessionLayoutsStore() {
  return {
    key(workspaceId: string, url: string) {
      const address = safePageAddress(url);
      return address ? `${workspaceId}|${address.origin}|${address.path}` : "";
    },
    get(workspaceId: string, url: string) {
      const key = this.key(workspaceId, url);
      return key ? sessionLayouts.get(key) ?? null : null;
    },
    set(memory: LayoutMemory) {
      sessionLayouts.set(`${memory.workspaceId}|${memory.origin}|${memory.path}`, memory);
    },
    clear() {
      sessionLayouts.clear();
    },
  };
}
