import type { CreatePatientFields } from "../shared/messages";
import type { DayBounds, LegalStatus, PeoplePage, PersonChart, PersonDetail, TodayAppointment, Workspace } from "../shared/types";

export interface DemographicUpdateResult {
  chart: PersonChart;
  saved: string[];
}

/** Read-only FLOR access, plus an allowlisted update of an existing patient. */
export interface FlorApi {
  getLegalStatus(userId: string): Promise<LegalStatus>;
  listWorkspaces(userId: string): Promise<Workspace[]>;
  listTodayAppointments(workspaceId: string, bounds: DayBounds): Promise<TodayAppointment[]>;
  listPeople(workspaceId: string, offset: number): Promise<PeoplePage>;
  searchPeople(workspaceId: string, query: string, offset?: number): Promise<PeoplePage>;
  getPersonChart(workspaceId: string, personId: string, nowIso: string): Promise<PersonChart>;
  updatePersonDemographics(
    workspaceId: string,
    personId: string,
    fields: Record<string, string>,
    nowIso: string,
  ): Promise<DemographicUpdateResult>;
  createPerson(workspaceId: string, userId: string, fields: CreatePatientFields): Promise<PersonDetail>;
}

export interface PersonMutation {
  update(
    workspaceId: string,
    personId: string,
    fields: Record<string, string>,
  ): Promise<{ data: unknown; error: { message?: string; code?: string; status?: number } | null }>;
  create?(
    workspaceId: string,
    userId: string,
    fields: Record<string, string>,
  ): Promise<{ data: unknown; error: { message?: string; code?: string; status?: number } | null }>;
}
