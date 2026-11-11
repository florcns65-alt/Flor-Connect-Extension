import type { CreatePatientFields } from "../shared/messages";
import type { DirectoryPerson } from "../shared/types";
import { detectPeople } from "./facts";
import { classifyHint } from "./map";
import type { PageFact } from "./read";

export const NEW_PATIENT_FIELDS = [
  "first_name",
  "last_name",
  "date_of_birth",
  "sex",
  "phone",
  "email",
  "address_line1",
  "city",
  "state",
  "postal_code",
] as const;

export type NewPatientField = (typeof NEW_PATIENT_FIELDS)[number];
export type NewPatientDraft = Record<NewPatientField, string>;

const FIELD_LABELS: Record<NewPatientField, string> = {
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

export interface NewPatientMapping {
  draft: NewPatientDraft;
  evidence: Partial<Record<NewPatientField, string>>;
  warnings: string[];
  personName: string;
}

export type NewPatientRead =
  | ({ ok: true } & NewPatientMapping)
  | { ok: false; reason: "unreadable" | "ambiguous"; message: string };

const EMPTY_DRAFT = (): NewPatientDraft => ({
  first_name: "",
  last_name: "",
  date_of_birth: "",
  sex: "",
  phone: "",
  email: "",
  address_line1: "",
  city: "",
  state: "",
  postal_code: "",
});

const UNREADABLE = "No patient on this page.";
const AMBIGUOUS = "More than one patient on this page.";

function realDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizePatientDob(raw: string): { value: string; warning: string } {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const normalized = realDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return normalized ? { value: normalized, warning: "" } : { value: "", warning: "Enter a valid date of birth." };
  }
  const named = /^(\d{1,2})[.\s]+([A-Za-z]+)[,.\s]+(\d{4})$/.exec(value);
  if (named) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    const normalized = month ? realDate(Number(named[3]), month, Number(named[1])) : "";
    return normalized ? { value: normalized, warning: "" } : { value: "", warning: "Enter a valid date of birth." };
  }
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (!numeric) return { value: "", warning: value ? "Check the date of birth." : "" };
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  if (first <= 12 && second <= 12) return { value: "", warning: "Check the date of birth." };
  const day = first > 12 ? first : second;
  const month = first > 12 ? second : first;
  const normalized = realDate(Number(numeric[3]), month, day);
  return normalized ? { value: normalized, warning: "" } : { value: "", warning: "Enter a valid date of birth." };
}

export function patientNameKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

function nameTokens(value: string): string[] {
  return value
    .normalize("NFC")
    .replace(/\s*\(\d+\)\s*$/g, "")
    .replace(/[^\p{L}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function samePersonName(left: string, right: string): boolean {
  const a = nameTokens(left);
  const b = nameTokens(right);
  return a.length > 0 && a.join(" ").toLowerCase() === b.join(" ").toLowerCase();
}

function splitName(value: string): { first: string; last: string } | null {
  const parts = nameTokens(value);
  if (parts.length < 2) return null;
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.normalize("NFC").replace(/\s+/g, " ").trim();
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.set(key, trimmed);
  }
  return [...seen.values()];
}

function evidenceFor(fact: PageFact): string {
  const quoted = `“${fact.evidenceText || fact.label}”`;
  if (fact.evidenceKind === "heading") return `From the heading ${quoted}`;
  if (fact.evidenceKind === "aria-label" || fact.evidenceKind === "aria-labelledby") return `From the accessible name ${quoted}`;
  if (fact.evidenceKind === "autocomplete") return `From autocomplete ${quoted}`;
  return `From the label ${quoted}`;
}

function fieldOf(fact: PageFact): NewPatientField | "name" | "mrn" | null {
  if (/^(name|patient|patient name)$/i.test(fact.label)) return "name";
  const match = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
  if (!match || !("key" in match)) return null;
  if (match.key === "mrn") return "mrn";
  return NEW_PATIENT_FIELDS.includes(match.key as NewPatientField) ? (match.key as NewPatientField) : null;
}

function displaySex(value: string): string {
  const text = value.trim().toLowerCase();
  if (text === "f" || text === "female") return "Female";
  if (text === "m" || text === "male") return "Male";
  return value.trim();
}

export function readNewPatient(facts: PageFact[]): NewPatientRead {
  const detected = detectPeople(facts);
  if (detected.mixed || detected.people.length > 1) return { ok: false, reason: "ambiguous", message: AMBIGUOUS };
  const grouped = new Map<NewPatientField | "name", PageFact[]>();
  for (const fact of facts) {
    if (!fact.value.trim()) continue;
    const key = fieldOf(fact);
    if (!key || key === "mrn") continue;
    grouped.set(key, [...(grouped.get(key) ?? []), fact]);
  }
  const person = detected.people[0];
  const nameFacts = (grouped.get("name") ?? []).filter((fact) => !person || samePersonName(fact.value, person.name));
  const nameValues = uniqueTexts(nameFacts.map((fact) => fact.value));
  if (!person && nameValues.length > 1) return { ok: false, reason: "ambiguous", message: AMBIGUOUS };
  const personName = person?.name || nameValues[0] || "";
  const split = splitName(personName);

  const draft = EMPTY_DRAFT();
  const evidence: Partial<Record<NewPatientField, string>> = {};
  const warnings: string[] = [];

  const take = (key: NewPatientField, factsForKey: PageFact[], value: string) => {
    draft[key] = key === "sex" ? displaySex(value) : value;
    const source = factsForKey.find((fact) => fact.value.trim().toLowerCase() === value.trim().toLowerCase()) ?? factsForKey[0];
    if (source) evidence[key] = evidenceFor(source);
  };

  const firstFacts = grouped.get("first_name") ?? [];
  const lastFacts = grouped.get("last_name") ?? [];
  const firstValues = uniqueTexts(firstFacts.map((fact) => fact.value));
  const lastValues = uniqueTexts(lastFacts.map((fact) => fact.value));
  if (firstValues.length > 1 || lastValues.length > 1) return { ok: false, reason: "ambiguous", message: AMBIGUOUS };
  if (firstValues[0]) take("first_name", firstFacts, firstValues[0]);
  if (lastValues[0]) take("last_name", lastFacts, lastValues[0]);
  if (!draft.first_name && !draft.last_name && split) {
    draft.first_name = split.first;
    draft.last_name = split.last;
    const source = nameFacts[0];
    if (source) {
      evidence.first_name = evidenceFor(source);
      evidence.last_name = evidenceFor(source);
    }
  } else if (split) {
    if (draft.first_name && !samePersonName(draft.first_name, split.first) && !personName.toLowerCase().startsWith(draft.first_name.toLowerCase())) {
      return { ok: false, reason: "ambiguous", message: AMBIGUOUS };
    }
    if (draft.last_name && !samePersonName(draft.last_name, split.last) && !personName.toLowerCase().endsWith(draft.last_name.toLowerCase())) {
      return { ok: false, reason: "ambiguous", message: AMBIGUOUS };
    }
    if (!draft.first_name) {
      draft.first_name = split.first;
      if (nameFacts[0]) evidence.first_name = evidenceFor(nameFacts[0]);
    }
    if (!draft.last_name) {
      draft.last_name = split.last;
      if (nameFacts[0]) evidence.last_name = evidenceFor(nameFacts[0]);
    }
  }

  if (!draft.first_name || !draft.last_name) return { ok: false, reason: "unreadable", message: UNREADABLE };
  const assembled = `${draft.first_name} ${draft.last_name}`.trim();
  if (person && !samePersonName(assembled, person.name) && !samePersonName(person.name, assembled)) {
    const personParts = nameTokens(person.name);
    const assembledParts = nameTokens(assembled);
    const overlaps = assembledParts.every((part) => personParts.some((other) => other.toLowerCase() === part.toLowerCase()));
    if (!overlaps) return { ok: false, reason: "ambiguous", message: AMBIGUOUS };
  }

  const dobFacts = grouped.get("date_of_birth") ?? [];
  const dobValues = uniqueTexts(dobFacts.map((fact) => fact.value));
  const normalizedDobs = uniqueTexts(dobValues.flatMap((value) => {
    const normalized = normalizePatientDob(value);
    return normalized.value ? [normalized.value] : [];
  }));
  if (normalizedDobs.length > 1) return { ok: false, reason: "ambiguous", message: AMBIGUOUS };
  if (normalizedDobs[0]) {
    draft.date_of_birth = normalizedDobs[0];
    const source = dobFacts.find((fact) => normalizePatientDob(fact.value).value === normalizedDobs[0]) ?? dobFacts[0];
    if (source) evidence.date_of_birth = evidenceFor(source);
  } else if (dobValues.length > 0) {
    warnings.push(normalizePatientDob(dobValues[0]).warning || "Check the date of birth.");
  }

  for (const key of ["sex", "phone", "email", "address_line1", "city", "state", "postal_code"] as const) {
    const matches = grouped.get(key) ?? [];
    const values = uniqueTexts(matches.map((fact) => fact.value));
    if (values.length > 1) {
      warnings.push(`${FIELD_LABELS[key]} was left blank.`);
      continue;
    }
    if (values[0]) take(key, matches, values[0]);
  }

  return { ok: true, draft, evidence, warnings: [...new Set(warnings)], personName: assembled };
}

/** @deprecated Use readNewPatient. Kept so older call sites keep a draft shape. */
export function mapNewPatientFacts(facts: PageFact[]): NewPatientMapping {
  const read = readNewPatient(facts);
  if (!read.ok) return { draft: EMPTY_DRAFT(), evidence: {}, warnings: [read.message], personName: "" };
  return read;
}

/** In-memory fingerprint for checking that the reviewed source has not changed. */
export function fingerprintNewPatientFacts(facts: PageFact[]): string {
  const read = readNewPatient(facts);
  if (!read.ok) return JSON.stringify({ blocked: read.reason });
  return JSON.stringify({ name: read.personName, draft: read.draft, evidence: read.evidence });
}

export function duplicateCandidates(people: DirectoryPerson[], draft: Pick<NewPatientDraft, "first_name" | "last_name">): DirectoryPerson[] {
  const key = patientNameKey(draft.first_name, draft.last_name);
  if (!key) return [];
  return people.filter((person) => patientNameKey(person.firstName ?? "", person.lastName ?? "") === key || patientNameKey(person.name ?? "", "") === key);
}

export function createDecision(duplicates: number, allowDuplicate: boolean): "insert" | "review-duplicates" {
  if (duplicates > 0 && !allowDuplicate) return "review-duplicates";
  return "insert";
}

/** A failed write may already have created the row. Do not send another insert when a match is now present. */
export function retryWouldDuplicate(errorCode: string | null, matchesAfterFailure: number): boolean {
  if (matchesAfterFailure <= 0) return false;
  return errorCode === null || errorCode === "network" || errorCode === "server" || errorCode === "validation";
}

/** Rows sent to FLOR. The source chart's MRN is never included; FLOR assigns one. */
export function patientInsertPayload(workspaceId: string, userId: string, fields: CreatePatientFields): Record<string, string> {
  const firstName = fields.first_name.trim();
  const lastName = fields.last_name.trim();
  const payload: Record<string, string> = {
    name: `${firstName} ${lastName}`.trim(),
    first_name: firstName,
    last_name: lastName,
    workspace_id: workspaceId,
    user_id: userId,
  };
  const optional = ["date_of_birth", "sex", "phone", "email", "address_line1", "city", "state", "postal_code"] as const;
  for (const key of optional) {
    const value = fields[key]?.trim();
    if (value) payload[key] = value;
  }
  return payload;
}
