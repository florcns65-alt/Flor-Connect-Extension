import type { SupabaseClient } from "@supabase/supabase-js";
import { attachListAppointments, toAppointmentSnippet } from "./directory";
import {
  appointmentsForPeopleQuery,
  legalQuery,
  normalizeSearchQuery,
  PEOPLE_PAGE_SIZE,
  peopleByIdsQuery,
  peoplePageQuery,
  peopleSearchQuery,
  personAppointmentsQuery,
  personQuery,
  todayAppointmentsQuery,
  workspacesQuery,
} from "./filters";
import type { FlorApi } from "./flor-api";
import { legalStatus } from "./legal";
import { executeQuery, type QueryClient, type QueryOutcome } from "./query";
import {
  AppointmentRowsSchema,
  LegalRowsSchema,
  PersonRowSchema,
  PersonRowsSchema,
  WorkspaceRowsSchema,
  parseWithSchema,
} from "./schemas";
import { mergeAppointments, toPersonDetail, toPersonSummary, toWorkspace } from "./view";
import type { DayBounds, PeoplePage } from "../shared/types";
import { logger } from "../shared/logger";

async function peoplePage(
  client: QueryClient,
  workspaceId: string,
  offset: number,
  rawQuery?: string,
): Promise<PeoplePage> {
  const outcome: QueryOutcome = await executeQuery(
    client,
    rawQuery ? peopleSearchQuery(workspaceId, rawQuery, offset) : peoplePageQuery(workspaceId, offset),
  );
  const rows = parseWithSchema(PersonRowsSchema, outcome.data ?? []);
  const summaries = rows.map(toPersonSummary);
  const ids = summaries.map((person) => person.id);
  const nowIso = new Date().toISOString();
  const upcomingData = ids.length
    ? (await executeQuery(client, appointmentsForPeopleQuery(workspaceId, ids, "upcoming", nowIso))).data
    : [];
  const recentData = ids.length
    ? (await executeQuery(client, appointmentsForPeopleQuery(workspaceId, ids, "recent", nowIso))).data
    : [];
  const people = attachListAppointments(
    summaries,
    parseWithSchema(AppointmentRowsSchema, upcomingData ?? []),
    parseWithSchema(AppointmentRowsSchema, recentData ?? []),
  );
  logger.info("Loaded patients", { count: people.length, offset });
  return {
    people,
    total: outcome.count ?? offset + people.length,
    offset,
    limit: PEOPLE_PAGE_SIZE,
  };
}

export function asQueryClient(client: SupabaseClient): QueryClient {
  return client as unknown as QueryClient;
}

export function createSupabaseFlorApi(client: QueryClient): FlorApi {
  return {
    async getLegalStatus(userId) {
      const outcome = await executeQuery(client, legalQuery(userId));
      const rows = parseWithSchema(LegalRowsSchema, outcome.data ?? []);
      return legalStatus(rows);
    },
    async listWorkspaces(userId) {
      const outcome = await executeQuery(client, workspacesQuery(userId));
      const rows = parseWithSchema(WorkspaceRowsSchema, outcome.data ?? []);
      return rows
        .map(toWorkspace)
        .filter((workspace): workspace is NonNullable<typeof workspace> => workspace !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async listTodayAppointments(workspaceId, bounds: DayBounds) {
      const outcome = await executeQuery(client, todayAppointmentsQuery(workspaceId, bounds));
      const appointments = parseWithSchema(AppointmentRowsSchema, outcome.data ?? []);
      const ids = [...new Set(appointments.flatMap((row) => (row.person_id ? [row.person_id] : [])))];
      const peopleOutcome = ids.length ? await executeQuery(client, peopleByIdsQuery(ids)) : { data: [], count: 0 };
      const people = parseWithSchema(PersonRowsSchema, peopleOutcome.data ?? []);
      logger.info("Loaded today's appointments", { count: appointments.length });
      return mergeAppointments(appointments, people);
    },
    async listPeople(workspaceId, offset) {
      return peoplePage(client, workspaceId, offset);
    },
    async searchPeople(workspaceId, rawQuery, offset = 0) {
      const query = normalizeSearchQuery(rawQuery);
      if (!query) return { people: [], total: 0, offset: 0, limit: PEOPLE_PAGE_SIZE };
      return peoplePage(client, workspaceId, offset, query);
    },
    async getPersonChart(workspaceId, personId, nowIso) {
      const outcome = await executeQuery(client, personQuery(personId));
      const person = toPersonDetail(parseWithSchema(PersonRowSchema, outcome.data));
      const upcomingOutcome = await executeQuery(client, personAppointmentsQuery(workspaceId, personId, "upcoming", nowIso));
      const recentOutcome = await executeQuery(client, personAppointmentsQuery(workspaceId, personId, "recent", nowIso));
      const upcoming = parseWithSchema(AppointmentRowsSchema, upcomingOutcome.data ?? []).flatMap((row) => {
        const snippet = toAppointmentSnippet(row);
        return snippet ? [snippet] : [];
      });
      const recent = parseWithSchema(AppointmentRowsSchema, recentOutcome.data ?? []).flatMap((row) => {
        const snippet = toAppointmentSnippet(row);
        return snippet ? [snippet] : [];
      });
      return { person, upcoming, recent };
    },
  };
}
