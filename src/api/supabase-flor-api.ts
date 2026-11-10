import type { SupabaseClient } from "@supabase/supabase-js";
import {
  legalQuery,
  normalizeSearchQuery,
  peopleByIdsQuery,
  peopleSearchQuery,
  personQuery,
  todayAppointmentsQuery,
  workspacesQuery,
} from "./filters";
import type { FlorApi } from "./flor-api";
import { legalStatus } from "./legal";
import { executeQuery, type QueryClient } from "./query";
import {
  AppointmentRowsSchema,
  LegalRowsSchema,
  PersonRowSchema,
  PersonRowsSchema,
  WorkspaceRowsSchema,
  parseWithSchema,
} from "./schemas";
import { mergeAppointments, toPersonDetail, toPersonSummary, toWorkspace } from "./view";
import type { DayBounds } from "../shared/types";
import { logger } from "../shared/logger";

export function asQueryClient(client: SupabaseClient): QueryClient {
  return client as unknown as QueryClient;
}

export function createSupabaseFlorApi(client: QueryClient): FlorApi {
  return {
    async getLegalStatus(userId) {
      const data = await executeQuery(client, legalQuery(userId));
      const rows = parseWithSchema(LegalRowsSchema, data ?? []);
      return legalStatus(rows);
    },
    async listWorkspaces(userId) {
      const data = await executeQuery(client, workspacesQuery(userId));
      const rows = parseWithSchema(WorkspaceRowsSchema, data ?? []);
      return rows
        .map(toWorkspace)
        .filter((workspace): workspace is NonNullable<typeof workspace> => workspace !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async listTodayAppointments(workspaceId, bounds: DayBounds) {
      const data = await executeQuery(client, todayAppointmentsQuery(workspaceId, bounds));
      const appointments = parseWithSchema(AppointmentRowsSchema, data ?? []);
      const ids = [...new Set(appointments.flatMap((row) => (row.person_id ? [row.person_id] : [])))];
      const peopleData = ids.length ? await executeQuery(client, peopleByIdsQuery(ids)) : [];
      const people = parseWithSchema(PersonRowsSchema, peopleData ?? []);
      logger.info("Loaded today's appointments", { count: appointments.length });
      return mergeAppointments(appointments, people);
    },
    async searchPeople(workspaceId, rawQuery) {
      const query = normalizeSearchQuery(rawQuery);
      if (!query) return [];
      const data = await executeQuery(client, peopleSearchQuery(workspaceId, query));
      const rows = parseWithSchema(PersonRowsSchema, data ?? []);
      logger.info("Searched patients", { length: query.length, count: rows.length });
      return rows.map(toPersonSummary);
    },
    async getPerson(personId) {
      const data = await executeQuery(client, personQuery(personId));
      const row = parseWithSchema(PersonRowSchema, data);
      return toPersonDetail(row);
    },
  };
}
