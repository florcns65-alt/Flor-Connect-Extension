import type { PersonDetail } from "../shared/types";
import { formatDob } from "../shared/format";
import type { FillInstruction, FillWriteResult, ScannedControl } from "./page";

export const DEMOGRAPHIC_KEYS = [
  "first_name",
  "last_name",
  "date_of_birth",
  "sex",
  "mrn",
  "phone",
  "email",
  "address_line1",
  "city",
  "state",
  "postal_code",
] as const;

export type DemographicKey = (typeof DEMOGRAPHIC_KEYS)[number];

const LABELS: Record<DemographicKey, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  date_of_birth: "Date of Birth",
  sex: "Sex",
  mrn: "External ID",
  phone: "Home Phone",
  email: "Email",
  address_line1: "Address",
  city: "City",
  state: "State",
  postal_code: "Postal code",
};

const SYNONYMS: Record<DemographicKey, string[]> = {
  first_name: ["first name", "given name", "given", "forename", "fname", "form fname", "patient first name"],
  last_name: ["last name", "family name", "surname", "lname", "form lname"],
  date_of_birth: ["date of birth", "birth date", "birthdate", "dob", "born", "form dob", "bday"],
  sex: ["sex", "gender", "administrative sex", "birth sex", "form sex"],
  mrn: ["mrn", "medical record number", "medical record", "external id", "pubpid", "form pubpid"],
  phone: ["home phone", "phone", "telephone", "mobile phone", "phone number", "form phone home", "tel"],
  email: ["email", "e-mail", "email address", "form email"],
  address_line1: ["address", "street", "address line 1", "address 1", "street address"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  postal_code: ["postal code", "zip", "zip code", "postcode"],
};

export interface MappedField {
  control: ScannedControl | null;
  key: DemographicKey | null;
  fieldLabel: string;
  florValue: string;
  pageValue: string;
  status: "matched" | "unmatched" | "ambiguous" | "no_value";
  note: string;
  occupied: boolean;
  selected: boolean;
  evidence?: string;
  regionId?: string;
  writable?: boolean;
  controlId?: string;
  controlName?: string;
  controlTag?: "input" | "textarea" | "select" | "radio" | "text";
}

export interface TransferLock {
  tabId: number;
  url: string;
  patientId: string;
  workspaceId: string;
  regionId?: string;
}

export function fieldLabel(key: DemographicKey): string {
  return LABELS[key];
}

export function florValues(person: PersonDetail): Record<DemographicKey, string> {
  return {
    first_name: person.firstName ?? "",
    last_name: person.lastName ?? "",
    date_of_birth: formatDob(person.dateOfBirth),
    sex: displaySex(person.sex),
    mrn: person.mrn ?? "",
    phone: person.phone ?? "",
    email: person.email ?? "",
    address_line1: person.addressLine1 ?? "",
    city: person.city ?? "",
    state: person.state ?? "",
    postal_code: person.postalCode ?? "",
  };
}

function displaySex(value: string | null): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "f" || normalized === "female") return "Female";
  if (normalized === "m" || normalized === "male") return "Male";
  return value?.trim() ?? "";
}

function tokens(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_./:-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreKey(hint: string, key: DemographicKey): number {
  const text = tokens(hint);
  if (!text) return 0;
  let best = 0;
  for (const synonym of SYNONYMS[key]) {
    if (text === synonym) best = Math.max(best, 100);
    else if (text.split(" ").join(" ").includes(synonym)) best = Math.max(best, 80);
  }
  return best;
}

export function classifyHint(hint: string): { key: DemographicKey } | { ambiguous: true } | null {
  let winner: { key: DemographicKey; score: number } | null = null;
  let runner = 0;
  const normalized = tokens(hint);
  if (/\b(?:date of birth|birth date|birthdate|dob)\b/.test(normalized) && /\b(?:month|day|year)\b/.test(normalized)) return { ambiguous: true };
  for (const key of DEMOGRAPHIC_KEYS) {
    const score = scoreKey(hint, key);
    if (!winner || score > winner.score) {
      runner = winner?.score ?? 0;
      winner = { key, score };
    } else if (score > runner) runner = score;
  }
  if (!winner || winner.score < 80) return null;
  if (runner >= winner.score - 10 && runner >= 80) return { ambiguous: true };
  return { key: winner.key };
}

function bestKey(control: ScannedControl): { key: DemographicKey; score: number } | null {
  const hint = `${control.label} ${control.name} ${control.id}`;
  const classified = classifyHint(hint);
  if (!classified || "ambiguous" in classified) return null;
  return { key: classified.key, score: 100 };
}

export function mapControls(controls: ScannedControl[], person: PersonDetail): MappedField[] {
  const values = florValues(person);
  const assigned = new Map<DemographicKey, ScannedControl[]>();
  const scored = controls.map((control) => ({ control, match: bestKey(control) }));
  for (const row of scored) {
    if (!row.match) continue;
    const list = assigned.get(row.match.key) ?? [];
    list.push(row.control);
    assigned.set(row.match.key, list);
  }
  const ambiguousKeys = new Set<DemographicKey>();
  for (const [key, list] of assigned) {
    if (list.length > 1) ambiguousKeys.add(key);
  }
  const fields: MappedField[] = [];
  const used = new Set<DemographicKey>();
  for (const row of scored) {
    if (!row.match) {
      if (!row.control.label) continue;
      fields.push({
        control: row.control,
        key: null,
        fieldLabel: row.control.label,
        florValue: "",
        pageValue: row.control.currentValue,
        status: "no_value",
        note: "No FLOR value to fill",
        occupied: !row.control.empty,
        selected: false,
      });
      continue;
    }
    const key = row.match.key;
    used.add(key);
    const florValue = values[key];
    const ambiguous = ambiguousKeys.has(key);
    const occupied = !row.control.empty;
    let status: MappedField["status"] = "matched";
    let note = "";
    if (ambiguous) {
      status = "ambiguous";
      note = "More than one box looks like this.";
    } else if (!florValue) {
      status = "no_value";
      note = "No FLOR value to fill";
    }
    fields.push({
      control: row.control,
      key,
      fieldLabel: LABELS[key],
      florValue,
      pageValue: row.control.currentValue,
      status,
      note,
      occupied,
      selected: status === "matched" && !occupied,
    });
  }
  for (const key of DEMOGRAPHIC_KEYS) {
    if (used.has(key) || !values[key]) continue;
    fields.push({
      control: null,
      key,
      fieldLabel: LABELS[key],
      florValue: values[key],
      pageValue: "",
      status: "unmatched",
      note: `No ${LABELS[key]} box on this page`,
      occupied: false,
      selected: false,
    });
  }
  return fields;
}

export function selectedFill(fields: MappedField[]): MappedField[] {
  return fields.filter((field) => field.selected && field.control && field.florValue && field.status === "matched");
}

export function instructionsFor(fields: MappedField[]): FillInstruction[] {
  return fields.flatMap((field) => {
    if (!field.selected || field.status !== "matched" || !field.florValue) return [];
    if (!field.writable && !field.control) return [];
    const tag = field.control?.tag || (field.controlTag && field.controlTag !== "text" ? field.controlTag : "input");
    const id = field.control?.id || field.controlId || "";
    const name = field.control?.name || field.controlName || "";
    if (!id && !name) return [];
    return [{ id, name, label: field.fieldLabel, tag, value: field.florValue }];
  });
}

export function summarizeFill(results: FillWriteResult[], fields: MappedField[]): { filled: number; skipped: string[] } {
  const filledIds = new Set(results.filter((result) => result.changed).map((result) => result.id || result.name));
  const skipped = fields
    .filter((field) => field.occupied && !field.selected && field.status === "matched")
    .map((field) => field.fieldLabel);
  const failed = results.filter((result) => !result.changed).map((result) => result.label);
  return { filled: filledIds.size, skipped: [...skipped, ...failed] };
}

export interface SaveField {
  key: DemographicKey;
  label: string;
  value: string;
  selected: boolean;
}

export interface IdentityCheck {
  matches: boolean;
  summary: string;
  blockSave: boolean;
}

function sameText(left: string, right: string): boolean {
  return left.trim().toLowerCase().replace(/\s+/g, " ") === right.trim().toLowerCase().replace(/\s+/g, " ");
}

export function pageValueFor(fields: MappedField[], key: DemographicKey): string {
  return fields.find((field) => field.key === key && field.control)?.pageValue ?? "";
}

export function checkIdentity(fields: MappedField[], person: PersonDetail): IdentityCheck {
  const first = pageValueFor(fields, "first_name");
  const last = pageValueFor(fields, "last_name");
  const dob = pageValueFor(fields, "date_of_birth");
  const mrn = pageValueFor(fields, "mrn");
  if (!first && !last && !dob && !mrn) {
    return { matches: false, blockSave: true, summary: "This page does not show a name or date of birth, so it cannot be checked against the selected patient." };
  }
  const nameOk = (!first || sameText(first, person.firstName ?? "")) && (!last || sameText(last, person.lastName ?? ""));
  const dobOk = !dob || sameText(dob, formatDob(person.dateOfBirth)) || sameText(dob, person.dateOfBirth ?? "");
  const mrnOk = !mrn || sameText(mrn, person.mrn ?? "");
  if (nameOk && dobOk && mrnOk) {
    const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
    return { matches: true, blockSave: false, summary: `Name and date of birth match ${name}.` };
  }
  return {
    matches: false,
    blockSave: true,
    summary: "This page does not match the selected patient. Go back and choose the right person. A new patient is not created from this page.",
  };
}

export function saveFieldsFrom(fields: MappedField[]): SaveField[] {
  return fields
    .filter((field): field is MappedField & { key: DemographicKey } => Boolean(field.key && field.pageValue && field.status === "matched"))
    .map((field) => ({ key: field.key, label: field.fieldLabel, value: field.pageValue, selected: true }));
}

const COLUMN: Record<DemographicKey, string> = {
  first_name: "first_name",
  last_name: "last_name",
  date_of_birth: "date_of_birth",
  sex: "sex",
  mrn: "mrn",
  phone: "phone",
  email: "email",
  address_line1: "address_line1",
  city: "city",
  state: "state",
  postal_code: "postal_code",
};

export function allowlistedUpdate(fields: SaveField[]): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of fields) {
    if (!field.selected) continue;
    if (field.key === "date_of_birth") {
      const iso = toIso(field.value);
      if (iso) payload.date_of_birth = iso;
      continue;
    }
    if (field.key === "sex") {
      payload.sex = normalizeSex(field.value);
      continue;
    }
    payload[COLUMN[field.key]] = field.value.trim();
  }
  return payload;
}

function toIso(value: string): string {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const named = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (named) {
    const month = months.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month < 0) return "";
    return `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (!numeric) return "";
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  if (first <= 12 && second <= 12) return "";
  const day = first > 12 ? first : second;
  const month = first > 12 ? second : first;
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${numeric[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeSex(value: string): string {
  const text = value.trim().toLowerCase();
  if (text === "f" || text === "female") return "female";
  if (text === "m" || text === "male") return "male";
  return value.trim();
}

export function valuesMatchUpdate(payload: Record<string, string>, person: PersonDetail): boolean {
  const current: Record<string, string> = {
    first_name: person.firstName ?? "",
    last_name: person.lastName ?? "",
    date_of_birth: (person.dateOfBirth ?? "").slice(0, 10),
    sex: (person.sex ?? "").toLowerCase(),
    mrn: person.mrn ?? "",
    phone: person.phone ?? "",
    email: person.email ?? "",
    address_line1: person.addressLine1 ?? "",
    city: person.city ?? "",
    state: person.state ?? "",
    postal_code: person.postalCode ?? "",
  };
  return Object.entries(payload).every(([key, value]) => (current[key] ?? "").trim().toLowerCase() === value.trim().toLowerCase());
}

export function locksMatch(expected: TransferLock, current: TransferLock): boolean {
  return expected.tabId === current.tabId && expected.url === current.url && expected.patientId === current.patientId && expected.workspaceId === current.workspaceId && (expected.regionId ?? "") === (current.regionId ?? "");
}

export function canUndo(written: string, current: string): boolean {
  return written.trim() === current.trim();
}
