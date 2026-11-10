import type { DayBounds, LegalStatus, PeoplePage, PersonChart, TodayAppointment, Workspace } from "../shared/types";

/** Read-only FLOR access. A later milestone can replace this with `/api/connect/v2` without changing the panel. */
export interface FlorApi {
  getLegalStatus(userId: string): Promise<LegalStatus>;
  listWorkspaces(userId: string): Promise<Workspace[]>;
  listTodayAppointments(workspaceId: string, bounds: DayBounds): Promise<TodayAppointment[]>;
  listPeople(workspaceId: string, offset: number): Promise<PeoplePage>;
  searchPeople(workspaceId: string, query: string, offset?: number): Promise<PeoplePage>;
  getPersonChart(workspaceId: string, personId: string, nowIso: string): Promise<PersonChart>;
}
