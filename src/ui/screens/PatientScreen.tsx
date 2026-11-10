import { formatAddress, formatDob, formatInsurance, formatSex, personDisplayName } from "../../shared/format";
import type { PersonDetail } from "../../shared/types";
import { SavedLine } from "../components/Chrome";
import { BackIcon } from "../components/Icons";
import { ListSkeleton, MessageState } from "../components/States";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong className={value ? undefined : "missing"}>{value || "Not on file"}</strong>
    </div>
  );
}

export function PatientScreen({
  patient,
  loading,
  error,
  offline,
  onBack,
  onRetry,
}: {
  patient: PersonDetail | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  onBack: () => void;
  onRetry: () => void;
}) {
  const meta = patient
    ? [formatDob(patient.dateOfBirth), formatSex(patient.sex), patient.mrn ? `MRN ${patient.mrn}` : ""]
        .filter(Boolean)
        .join(" · ")
    : "";
  return (
    <main className="screen">
      <button type="button" className="back-button" onClick={onBack}>
        <BackIcon /> Back
      </button>
      {offline ? (
        <MessageState title="You're offline" message="This chart isn't available until you're back online." action="Try again" onAction={onRetry} />
      ) : error ? (
        <MessageState title="Something went wrong" message={error} action="Try again" onAction={onRetry} />
      ) : loading || !patient ? (
        <ListSkeleton />
      ) : (
        <div className="scroll">
          <h1 className="patient-name">{personDisplayName(patient)}</h1>
          <p className="lede">{meta || "Demographics from FLOR"}</p>
          <section className="card detail-card">
            <h2>Contact</h2>
            <Row label="Phone" value={patient.phone ?? ""} />
            <Row label="Email" value={patient.email ?? ""} />
          </section>
          <section className="card detail-card">
            <h2>Address</h2>
            <Row
              label="Home"
              value={formatAddress({
                addressLine1: patient.addressLine1,
                city: patient.city,
                state: patient.state,
                postalCode: patient.postalCode,
              })}
            />
          </section>
          <section className="card detail-card">
            <h2>Insurance</h2>
            <Row label="Coverage" value={formatInsurance(patient.insurancePayer, patient.insuranceMemberId)} />
          </section>
        </div>
      )}
      <SavedLine />
    </main>
  );
}
