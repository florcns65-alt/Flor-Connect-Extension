import type { SupabaseClient } from "@supabase/supabase-js";
import { attachListAppointments, toAppointmentSnippet } from "./directory";
import { PERSON_DETAIL_COLUMNS } from "./filters";
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
import type { FlorApi, PersonMutation } from "./flor-api";
import { FlorError } from "../shared/errors";
import { valuesMatchUpdate } from "../engine/map";
import { patientInsertPayload } from "../engine/new-patient";
import type { CreatePatientFields } from "../shared/messages";
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

const WRITABLE_COLUMNS = new Set([
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
]);

const CREATE_COLUMNS = new Set([
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
]);

export function createSupabasePersonMutation(client: SupabaseClient): PersonMutation {
  return {
    async update(workspaceId, personId, fields) {
      const payload: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (WRITABLE_COLUMNS.has(key)) payload[key] = value;
      }
      const { data, error } = await client
        .from("people")
        .update(payload)
        .eq("id", personId)
        .eq("workspace_id", workspaceId)
        .select(PERSON_DETAIL_COLUMNS)
        .maybeSingle();
      return { data, error: error ? { message: error.message, code: error.code } : null };
    },
    async create(workspaceId, userId, fields) {
      const payload = patientInsertPayload(workspaceId, userId, {
        first_name: fields.first_name ?? "",
        last_name: fields.last_name ?? "",
        date_of_birth: fields.date_of_birth,
        sex: fields.sex,
        phone: fields.phone,
        email: fields.email,
        address_line1: fields.address_line1,
        city: fields.city,
        state: fields.state,
        postal_code: fields.postal_code,
      });
      const { data, error } = await client
        .from("people")
        .insert(payload)
        .select(PERSON_DETAIL_COLUMNS)
        .single();
      return { data, error: error ? { message: error.message, code: error.code } : null };
    },
  };
}

export function createSupabaseFlorApi(client: QueryClient, mutation?: PersonMutation): FlorApi {
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
    async updatePersonDemographics(workspaceId, personId, fields, nowIso) {
      if (!mutation) throw new FlorError("server", "Saving to FLOR is not available in this build.");
      const payload: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (WRITABLE_COLUMNS.has(key) && value.trim()) payload[key] = value.trim();
      }
      if (Object.keys(payload).length === 0) throw new FlorError("validation", "Choose at least one field to save.");
      const { data, error } = await mutation.update(workspaceId, personId, payload);
      if (error || !data) {
        throw new FlorError("server", "FLOR did not save those fields. This account may not be allowed to edit that patient.");
      }
      const person = toPersonDetail(parseWithSchema(PersonRowSchema, data));
      if (!valuesMatchUpdate(payload, person)) {
        throw new FlorError("server", "FLOR did not confirm the saved fields.");
      }
      logger.info("Updated patient demographics", { count: Object.keys(payload).length });
      const chart = await createSupabaseFlorApi(client, mutation).getPersonChart(workspaceId, personId, nowIso);
      return { chart, saved: Object.keys(payload) };
    },
    async createPerson(workspaceId: string, userId: string, fields: CreatePatientFields) {
      if (!mutation?.create) throw new FlorError("server", "Adding patients isn't available in this build.");
      const payload: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (CREATE_COLUMNS.has(key) && typeof value === "string" && value.trim()) payload[key] = value.trim();
      }
      const firstName = payload.first_name ?? "";
      const lastName = payload.last_name ?? "";
      if (!firstName || !lastName) throw new FlorError("validation", "First and last name are required.");
      payload.first_name = firstName;
      payload.last_name = lastName;
      const name = `${firstName} ${lastName}`.trim();
      const { data, error } = await mutation.create(workspaceId, userId, payload);
      if (error?.code === "23505") {
        throw new FlorError("validation", "This patient may already be in FLOR.");
      }
      if (error?.code === "42501" || error?.status === 403) {
        throw new FlorError("not_member", "Your FLOR role can't add patients to this workspace.");
      }
      if (error || !data) throw new FlorError("server", "Couldn’t confirm the patient was added.");
      const person = toPersonDetail(parseWithSchema(PersonRowSchema, data));
      if (person.name?.trim().toLowerCase() !== name.toLowerCase() || !valuesMatchUpdate(payload, person)) {
        throw new FlorError("server", "FLOR returned a different patient.");
      }
      logger.info("Created patient", { count: Object.keys(payload).length });
      return person;
    },
  };
}
