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
}

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
  if (!numeric) return { value: "", warning: value ? "Date of birth needs review; enter it as YYYY-MM-DD or an unambiguous date." : "" };
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  if (first <= 12 && second <= 12) return { value: "", warning: "Date of birth is ambiguous; enter it as YYYY-MM-DD." };
  const day = first > 12 ? first : second;
  const month = first > 12 ? second : first;
  const normalized = realDate(Number(numeric[3]), month, day);
  return normalized ? { value: normalized, warning: "" } : { value: "", warning: "Enter a valid date of birth." };
}

export function mapNewPatientFacts(facts: PageFact[]): NewPatientMapping {
  const draft = EMPTY_DRAFT();
  const evidence: Partial<Record<NewPatientField, string>> = {};
  const warnings: string[] = [];
  const candidates = new Map<NewPatientField, PageFact[]>();

  for (const fact of facts) {
    if (!fact.writable) continue;
    const match = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
    if (!match || !("key" in match) || match.key === "mrn") continue;
    const key = match.key as NewPatientField;
    if (!NEW_PATIENT_FIELDS.includes(key)) continue;
    candidates.set(key, [...(candidates.get(key) ?? []), fact]);
  }

  for (const [key, matches] of candidates) {
    if (matches.length !== 1) {
      warnings.push(`${FIELD_LABELS[key]} appears more than once; enter it manually.`);
      continue;
    }
    const fact = matches[0];
    if (key === "date_of_birth") {
      const normalized = normalizePatientDob(fact.value);
      draft[key] = normalized.value;
      if (normalized.warning) warnings.push(normalized.warning);
    } else {
      draft[key] = fact.value.trim();
    }
    evidence[key] = fact.label;
  }

  if (!draft.first_name) warnings.push("First name is required.");
  if (!draft.last_name) warnings.push("Last name is required.");
  return { draft, evidence, warnings: [...new Set(warnings)] };
}

/** In-memory fingerprint for checking that reviewed source fields have not changed. */
export function fingerprintNewPatientFacts(facts: PageFact[]): string {
  const mapped = facts.flatMap((fact) => {
    if (!fact.writable) return [];
    const match = classifyHint(`${fact.label} ${fact.controlName} ${fact.controlId}`);
    if (!match || !("key" in match) || match.key === "mrn" || !NEW_PATIENT_FIELDS.includes(match.key as NewPatientField)) return [];
    return [{ key: match.key, label: fact.label, value: fact.value.trim(), controlId: fact.controlId, controlName: fact.controlName }];
  });
  mapped.sort((a, b) => `${a.key}|${a.controlId}|${a.controlName}`.localeCompare(`${b.key}|${b.controlId}|${b.controlName}`));
  return JSON.stringify(mapped);
}

export function patientNameKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}
