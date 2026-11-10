import { blankToNull } from "../shared/format";
import type { PersonDetail, PersonSummary, TodayAppointment, Workspace } from "../shared/types";
import type { AppointmentRow, PersonRow, WorkspaceRow } from "./schemas";

export function toPersonSummary(row: PersonRow): PersonSummary {
  return {
    id: row.id,
    firstName: blankToNull(row.first_name),
    lastName: blankToNull(row.last_name),
    name: blankToNull(row.name),
    dateOfBirth: blankToNull(row.date_of_birth),
    sex: blankToNull(row.sex),
    mrn: blankToNull(row.mrn),
  };
}

export function toPersonDetail(row: PersonRow): PersonDetail {
  return {
    ...toPersonSummary(row),
    middleName: blankToNull(row.middle_name),
    phone: blankToNull(row.phone),
    email: blankToNull(row.email),
    addressLine1: blankToNull(row.address_line1),
    city: blankToNull(row.city),
    state: blankToNull(row.state),
    postalCode: blankToNull(row.postal_code),
    insurancePayer: blankToNull(row.insurance_payer),
    insuranceMemberId: blankToNull(row.insurance_member_id),
  };
}

export function toWorkspace(row: WorkspaceRow): Workspace | null {
  const embedded = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
  if (!embedded?.id || !embedded.name) return null;
  return {
    id: row.workspace_id,
    name: embedded.name,
    role: row.role,
  };
}

export function mergeAppointments(appointments: AppointmentRow[], people: PersonRow[]): TodayAppointment[] {
  const byId = new Map(people.map((person) => [person.id, toPersonSummary(person)]));
  return appointments.map((appointment) => ({
    id: appointment.id,
    startTime: appointment.start_time,
    endTime: blankToNull(appointment.end_time),
    status: blankToNull(appointment.status),
    appointmentType: blankToNull(appointment.appointment_type),
    reason: blankToNull(appointment.reason),
    person: appointment.person_id ? byId.get(appointment.person_id) ?? null : null,
  }));
}
