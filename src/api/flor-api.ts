import type { DayBounds, LegalStatus, PersonDetail, PersonSummary, TodayAppointment, Workspace } from "../shared/types";

/** Read-only FLOR access. Milestone 2 can replace this with `/api/connect/v2` without changing the panel. */
export interface FlorApi {
  getLegalStatus(userId: string): Promise<LegalStatus>;
  listWorkspaces(userId: string): Promise<Workspace[]>;
  listTodayAppointments(workspaceId: string, bounds: DayBounds): Promise<TodayAppointment[]>;
  searchPeople(workspaceId: string, query: string): Promise<PersonSummary[]>;
  getPerson(personId: string): Promise<PersonDetail>;
}
