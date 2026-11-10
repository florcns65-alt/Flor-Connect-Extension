import type { PersonDetail } from "../shared/types";

/**
 * The patient open in the panel.
 * Fill (FLOR → EHR) and Save (EHR → FLOR) should read this snapshot.
 * It lives in memory only. Do not persist it.
 */
export interface SelectedPatient {
  id: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  mrn: string | null;
  phone: string | null;
  email: string | null;
}

export function toSelectedPatient(person: PersonDetail): SelectedPatient {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    dateOfBirth: person.dateOfBirth,
    sex: person.sex,
    mrn: person.mrn,
    phone: person.phone,
    email: person.email,
  };
}
