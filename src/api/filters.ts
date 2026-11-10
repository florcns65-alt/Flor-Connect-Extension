import type { DayBounds } from "../shared/types";

export const APPOINTMENT_COLUMNS =
  "id, person_id, start_time, end_time, status, appointment_type, reason";
export const PERSON_SUMMARY_COLUMNS =
  "id, first_name, last_name, name, date_of_birth, sex, mrn";
export const PERSON_DETAIL_COLUMNS =
  "id, first_name, last_name, middle_name, name, date_of_birth, sex, mrn, phone, email, address_line1, city, state, postal_code, insurance_payer, insurance_member_id";
export const WORKSPACE_COLUMNS = "workspace_id, role, workspaces:workspace_id(id, name)";
export const LEGAL_COLUMNS = "kind, version";
export const PEOPLE_PAGE_SIZE = 50;
export const SEARCH_MIN_LENGTH = 2;

export type QueryFilter =
  | { op: "eq"; column: string; value: string }
  | { op: "gte"; column: string; value: string }
  | { op: "lt"; column: string; value: string }
  | { op: "in"; column: string; values: string[] }
  | { op: "or"; expression: string };

export interface QueryOrder {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

export interface SelectQuery {
  table: string;
  columns: string;
  filters: QueryFilter[];
  order?: QueryOrder;
  orders?: QueryOrder[];
  limit?: number;
  range?: { from: number; to: number };
  count?: "exact";
  single?: boolean;
}

/** Escape the PostgREST `or` reserved characters the brief names, plus backslash. */
export function escapePostgrestOrValue(raw: string): string {
  return raw.replace(/[,()%\\]/g, (character) => `\\${character}`);
}

export function normalizeSearchQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) return null;
  return trimmed.slice(0, 80);
}

const MONTH_NUMBERS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function isoDate(year: string, month: string, day: string): string | null {
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Turn a birthday-shaped query into PostgREST date_of_birth clauses. Name and MRN stay ilike. */
export function birthdaySearchClauses(query: string): string[] {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(query);
  if (iso) {
    const exact = isoDate(iso[1], iso[2], iso[3]);
    return exact ? [`date_of_birth.eq.${exact}`] : [];
  }
  if (/^\d{4}$/.test(query)) return [`date_of_birth.ilike.${query}-%`];
  const dayMonthYear = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(query);
  if (dayMonthYear) {
    const month = MONTH_NUMBERS[dayMonthYear[2].toLowerCase()];
    const exact = month ? isoDate(dayMonthYear[3], month, dayMonthYear[1]) : null;
    return exact ? [`date_of_birth.eq.${exact}`] : [];
  }
  const monthYear = /^([A-Za-z]+)\s+(\d{4})$/.exec(query);
  if (monthYear && MONTH_NUMBERS[monthYear[1].toLowerCase()]) {
    return [`date_of_birth.ilike.${monthYear[2]}-${MONTH_NUMBERS[monthYear[1].toLowerCase()]}-%`];
  }
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(query);
  if (!slash) return [];
  const first = Number(slash[1]);
  const second = Number(slash[2]);
  const year = slash[3];
  const candidates = new Set<string>();
  if (second >= 1 && second <= 12) {
    const dayFirst = isoDate(year, String(second), String(first));
    if (dayFirst) candidates.add(dayFirst);
  }
  if (first >= 1 && first <= 12) {
    const monthFirst = isoDate(year, String(first), String(second));
    if (monthFirst) candidates.add(monthFirst);
  }
  return [...candidates].map((value) => `date_of_birth.eq.${value}`);
}

export function peopleSearchExpression(query: string): string {
  const escaped = escapePostgrestOrValue(query);
  const clauses = [
    `first_name.ilike.%${escaped}%`,
    `last_name.ilike.%${escaped}%`,
    `mrn.ilike.%${escaped}%`,
  ];
  const words = query
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z'-]/g, ""))
    .filter((token) => token.length >= 2);
  if (words.length === 2) {
    const first = escapePostgrestOrValue(words[0]);
    const second = escapePostgrestOrValue(words[1]);
    clauses.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${second}%)`);
    clauses.push(`and(first_name.ilike.%${second}%,last_name.ilike.%${first}%)`);
  }
  clauses.push(...birthdaySearchClauses(query));
  return clauses.join(",");
}

export function legalQuery(userId: string): SelectQuery {
  return {
    table: "legal_acceptances",
    columns: LEGAL_COLUMNS,
    filters: [{ op: "eq", column: "user_id", value: userId }],
  };
}

export function workspacesQuery(userId: string): SelectQuery {
  return {
    table: "workspace_members",
    columns: WORKSPACE_COLUMNS,
    filters: [{ op: "eq", column: "user_id", value: userId }],
  };
}

export function todayAppointmentsQuery(workspaceId: string, bounds: DayBounds): SelectQuery {
  return {
    table: "appointments",
    columns: APPOINTMENT_COLUMNS,
    filters: [
      { op: "eq", column: "workspace_id", value: workspaceId },
      { op: "gte", column: "start_time", value: bounds.startUtc },
      { op: "lt", column: "start_time", value: bounds.endUtc },
    ],
    order: { column: "start_time", ascending: true },
  };
}

export function peoplePageQuery(workspaceId: string, offset: number, expression?: string): SelectQuery {
  const filters: QueryFilter[] = [{ op: "eq", column: "workspace_id", value: workspaceId }];
  if (expression) filters.push({ op: "or", expression });
  const from = Math.max(0, offset);
  return {
    table: "people",
    columns: PERSON_SUMMARY_COLUMNS,
    filters,
    orders: [
      { column: "last_name", ascending: true, nullsFirst: false },
      { column: "first_name", ascending: true, nullsFirst: false },
    ],
    range: { from, to: from + PEOPLE_PAGE_SIZE - 1 },
    count: "exact",
  };
}

export function appointmentsForPeopleQuery(
  workspaceId: string,
  personIds: string[],
  when: "upcoming" | "recent",
  nowIso: string,
): SelectQuery {
  return {
    table: "appointments",
    columns: "id, person_id, start_time, end_time, status, appointment_type",
    filters: [
      { op: "eq", column: "workspace_id", value: workspaceId },
      { op: "in", column: "person_id", values: personIds },
      when === "upcoming"
        ? { op: "gte", column: "start_time", value: nowIso }
        : { op: "lt", column: "start_time", value: nowIso },
    ],
    order: { column: "start_time", ascending: when === "upcoming" },
    limit: 200,
  };
}

export function personAppointmentsQuery(
  workspaceId: string,
  personId: string,
  when: "upcoming" | "recent",
  nowIso: string,
): SelectQuery {
  return {
    table: "appointments",
    columns: APPOINTMENT_COLUMNS,
    filters: [
      { op: "eq", column: "workspace_id", value: workspaceId },
      { op: "eq", column: "person_id", value: personId },
      when === "upcoming"
        ? { op: "gte", column: "start_time", value: nowIso }
        : { op: "lt", column: "start_time", value: nowIso },
    ],
    order: { column: "start_time", ascending: when === "upcoming" },
    limit: 8,
  };
}

export function peopleByIdsQuery(ids: string[]): SelectQuery {
  return {
    table: "people",
    columns: PERSON_SUMMARY_COLUMNS,
    filters: [{ op: "in", column: "id", values: ids }],
  };
}

export function peopleSearchQuery(workspaceId: string, query: string, offset = 0): SelectQuery {
  return peoplePageQuery(workspaceId, offset, peopleSearchExpression(query));
}

export function personQuery(personId: string): SelectQuery {
  return {
    table: "people",
    columns: PERSON_DETAIL_COLUMNS,
    filters: [{ op: "eq", column: "id", value: personId }],
    single: true,
  };
}
