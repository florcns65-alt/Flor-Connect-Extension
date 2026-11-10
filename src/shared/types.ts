export const ROLES = ["owner", "admin", "clinician", "staff", "viewer", "billing"] as const;
export type WorkspaceRole = (typeof ROLES)[number];

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export interface PersonSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  mrn: string | null;
}

export interface PersonDetail extends PersonSummary {
  middleName: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  insurancePayer: string | null;
  insuranceMemberId: string | null;
}

export interface AppointmentSnippet {
  id: string;
  startTime: string;
  endTime: string | null;
  status: string | null;
  appointmentType: string | null;
}

/** A directory row. `appointment` is the next visit, or the latest one when nothing is upcoming. */
export interface DirectoryPerson extends PersonSummary {
  appointment: AppointmentSnippet | null;
}

export interface PeoplePage {
  people: DirectoryPerson[];
  total: number;
  offset: number;
  limit: number;
}

export interface PersonChart {
  person: PersonDetail;
  upcoming: AppointmentSnippet[];
  recent: AppointmentSnippet[];
}

export interface TodayAppointment {
  id: string;
  startTime: string;
  endTime: string | null;
  status: string | null;
  appointmentType: string | null;
  reason: string | null;
  person: PersonSummary | null;
}

export interface DayBounds {
  startUtc: string;
  endUtc: string;
}

export interface LegalStatus {
  complete: boolean;
  missing: string[];
}
