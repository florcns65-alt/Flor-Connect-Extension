import { ageInYears, appointmentStatusLabel, formatDob, formatSex, formatVisitWhen, personDisplayName, personInitials } from "../../shared/format";
import type { AppointmentSnippet, PersonDetail } from "../../shared/types";
import { ArrowUpIcon, BackIcon, ClockIcon } from "../components/Icons";
import { ListSkeleton, MessageState } from "../components/States";
import { BuildStamp } from "../components/Chrome";
import { Nav } from "../components/Nav";

function Visit({ visit, upcoming }: { visit: AppointmentSnippet; upcoming: boolean }) {
  const done = appointmentStatusLabel(visit.status) === "Done";
  return (
    <div className="visit">
      <ClockIcon />
      <span>
        <strong>{formatVisitWhen(visit.startTime, new Date(), upcoming)}</strong>
        <span className="person-meta">{visit.appointmentType || "Visit"}</span>
      </span>
      {visit.status ? <span className={done ? "chip-status done" : "chip-status"}>{appointmentStatusLabel(visit.status)}</span> : null}
    </div>
  );
}

export function PatientScreen({
  patient,
  upcoming,
  recent,
  loading,
  error,
  offline,
  onBack,
  onRetry,
  onFill,
  onSave,
  onNavigate,
}: {
  patient: PersonDetail | null;
  upcoming: AppointmentSnippet[];
  recent: AppointmentSnippet[];
  loading: boolean;
  error: string | null;
  offline: boolean;
  onBack: () => void;
  onRetry: () => void;
  onFill: () => void;
  onSave: () => void;
  onNavigate: (route: "home" | "patients" | "activity" | "settings") => void;
}) {
  const name = patient ? personDisplayName(patient) : "";
  const age = patient ? ageInYears(patient.dateOfBirth) : null;
  const meta = patient
    ? [formatDob(patient.dateOfBirth), age === null ? "" : String(age), formatSex(patient.sex)].filter(Boolean).join(" · ")
    : "";
  return (
    <main className="screen">
      <BuildStamp />
      <button type="button" className="back-button" onClick={onBack}>
        <BackIcon /> Your patients
      </button>
      {offline ? (
        <MessageState title="You're offline" message="This chart isn't available until you're back online." action="Try again" onAction={onRetry} />
      ) : error ? (
        <MessageState title="Something went wrong" message={error} action="Try again" onAction={onRetry} />
      ) : loading || !patient ? (
        <ListSkeleton />
      ) : (
        <div className="scroll">
          <div className="identity">
            <span className="avatar tone-a identity-avatar">{personInitials(name)}</span>
            <div>
              <h1 className="patient-name">{name}</h1>
              <p className="lede">{meta}</p>
              {patient.mrn ? <p className="lede">MRN {patient.mrn}</p> : null}
            </div>
          </div>
          <section className="card detail-card">
            <h2>Upcoming</h2>
            {upcoming.length === 0 ? <p className="person-meta">Nothing scheduled.</p> : upcoming.map((visit) => <Visit key={visit.id} visit={visit} upcoming />)}
          </section>
          <section className="card detail-card">
            <h2>Recent</h2>
            {recent.length === 0 ? <p className="person-meta">No recent visits.</p> : recent.map((visit) => <Visit key={visit.id} visit={visit} upcoming={false} />)}
          </section>
        </div>
      )}
      <div className="dock">
        <button type="button" className="btn-primary" onClick={onFill} disabled={!patient}>
          <ArrowUpIcon /> Fill this page
        </button>
        <button type="button" className="link-action" onClick={onSave} disabled={!patient}>
          ↓ Save this page to FLOR
        </button>
        <Nav route="patient" onChange={onNavigate} />
      </div>
    </main>
  );
}
