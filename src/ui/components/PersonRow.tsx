import { formatDob, formatTime, isFinishedStatus, personDisplayName, personInitials } from "../../shared/format";
import type { PersonSummary, TodayAppointment } from "../../shared/types";
import { CheckIcon, ChevronIcon } from "./Icons";

function tone(name: string): string {
  const tones = ["tone-a", "tone-b", "tone-c"];
  let hash = 0;
  for (const character of name) hash = (hash + character.charCodeAt(0)) % tones.length;
  return tones[hash] ?? "tone-a";
}

export function PersonButton({
  person,
  meta,
  trailing,
  onOpen,
}: {
  person: PersonSummary;
  meta: string;
  trailing?: string;
  onOpen: (id: string) => void;
}) {
  const name = personDisplayName(person);
  return (
    <button type="button" className="person" onClick={() => onOpen(person.id)}>
      <span className={`avatar ${tone(name)}`}>{personInitials(name)}</span>
      <span>
        <span className="person-name">{name}</span>
        <span className="person-meta">{meta}</span>
      </span>
      <span className="trailing">
        {trailing ? <span className="when">{trailing}</span> : null}
        <ChevronIcon />
      </span>
    </button>
  );
}

export function AppointmentButton({
  appointment,
  onOpen,
}: {
  appointment: TodayAppointment;
  onOpen: (id: string) => void;
}) {
  const person = appointment.person;
  const name = person ? personDisplayName(person) : "Patient not on file";
  const dob = formatDob(person?.dateOfBirth);
  const kind = appointment.appointmentType || "Visit";
  const meta = [kind, dob].filter(Boolean).join(" · ");
  const finished = isFinishedStatus(appointment.status);
  const cancelled = appointment.status ? /cancel/i.test(appointment.status) : false;
  return (
    <button
      type="button"
      className="person"
      onClick={() => person && onOpen(person.id)}
      disabled={!person}
    >
      <span className={`avatar ${tone(name)}`}>{personInitials(name)}</span>
      <span>
        <span className="person-name">{name}</span>
        <span className="person-meta">{meta}</span>
      </span>
      <span className={finished ? "when done" : cancelled ? "when muted" : "when"}>
        {formatTime(appointment.startTime)}
        {finished ? <CheckIcon /> : null}
      </span>
    </button>
  );
}
