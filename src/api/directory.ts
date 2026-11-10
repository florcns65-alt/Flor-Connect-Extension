import { blankToNull } from "../shared/format";
import type { AppointmentSnippet, DirectoryPerson, PersonSummary } from "../shared/types";
import type { AppointmentRow } from "./schemas";

export function toAppointmentSnippet(row: AppointmentRow | null | undefined): AppointmentSnippet | null {
  if (!row) return null;
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: blankToNull(row.end_time),
    status: blankToNull(row.status),
    appointmentType: blankToNull(row.appointment_type),
  };
}

/**
 * Upcoming rows must already be oldest-first. Recent rows must already be newest-first.
 * Each person keeps the next visit when there is one, otherwise the latest past visit.
 */
export function attachListAppointments(
  people: PersonSummary[],
  upcoming: AppointmentRow[],
  recent: AppointmentRow[],
): DirectoryPerson[] {
  const nextByPerson = new Map<string, AppointmentRow>();
  for (const row of upcoming) {
    if (row.person_id && !nextByPerson.has(row.person_id)) nextByPerson.set(row.person_id, row);
  }
  const recentByPerson = new Map<string, AppointmentRow>();
  for (const row of recent) {
    if (row.person_id && !recentByPerson.has(row.person_id)) recentByPerson.set(row.person_id, row);
  }
  return people.map((person) => ({
    ...person,
    appointment: toAppointmentSnippet(nextByPerson.get(person.id) ?? recentByPerson.get(person.id)),
  }));
}

export function groupByLetter<T extends Pick<PersonSummary, "lastName" | "firstName" | "name">>(
  people: T[],
): Array<{ letter: string; people: T[] }> {
  const groups = new Map<string, T[]>();
  for (const person of people) {
    const source = (person.lastName || person.firstName || person.name || "").trim();
    const character = source.charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(character) ? character : "#";
    const rows = groups.get(letter) ?? [];
    rows.push(person);
    groups.set(letter, rows);
  }
  return [...groups.entries()].map(([letter, rows]) => ({ letter, people: rows }));
}
