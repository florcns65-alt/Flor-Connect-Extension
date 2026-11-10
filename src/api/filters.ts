import type { DayBounds } from "../shared/types";

export const APPOINTMENT_COLUMNS =
  "id, person_id, start_time, end_time, status, appointment_type, reason";
export const PERSON_SUMMARY_COLUMNS =
  "id, first_name, last_name, name, date_of_birth, sex, mrn";
export const PERSON_DETAIL_COLUMNS =
  "id, first_name, last_name, middle_name, name, date_of_birth, sex, mrn, phone, email, address_line1, city, state, postal_code, insurance_payer, insurance_member_id";
export const WORKSPACE_COLUMNS = "workspace_id, role, workspaces:workspace_id(id, name)";
export const LEGAL_COLUMNS = "kind, version";
export const SEARCH_LIMIT = 25;
export const SEARCH_MIN_LENGTH = 2;

export type QueryFilter =
  | { op: "eq"; column: string; value: string }
  | { op: "gte"; column: string; value: string }
  | { op: "lt"; column: string; value: string }
  | { op: "in"; column: string; values: string[] }
  | { op: "or"; expression: string };

export interface SelectQuery {
  table: string;
  columns: string;
  filters: QueryFilter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
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

export function peopleSearchExpression(query: string): string {
  const escaped = escapePostgrestOrValue(query);
  return `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,mrn.ilike.%${escaped}%`;
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

export function peopleByIdsQuery(ids: string[]): SelectQuery {
  return {
    table: "people",
    columns: PERSON_SUMMARY_COLUMNS,
    filters: [{ op: "in", column: "id", values: ids }],
  };
}

export function peopleSearchQuery(workspaceId: string, query: string): SelectQuery {
  return {
    table: "people",
    columns: PERSON_SUMMARY_COLUMNS,
    filters: [
      { op: "eq", column: "workspace_id", value: workspaceId },
      { op: "or", expression: peopleSearchExpression(query) },
    ],
    limit: SEARCH_LIMIT,
  };
}

export function personQuery(personId: string): SelectQuery {
  return {
    table: "people",
    columns: PERSON_DETAIL_COLUMNS,
    filters: [{ op: "eq", column: "id", value: personId }],
    single: true,
  };
}
