import { formatDob, personDisplayName, personInitials } from "../../shared/format";
import type { Workspace } from "../../shared/types";
import type { AddPatientModel } from "../use-add-patient";
import type { NewPatientField } from "../../engine/new-patient";
import { Header } from "../components/Chrome";
import { BackIcon } from "../components/Icons";

const FORM_FIELDS: Array<{ key: NewPatientField; label: string; type?: string }> = [
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "date_of_birth", label: "Date of birth", type: "date" },
  { key: "sex", label: "Sex" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "address_line1", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postal_code", label: "Postal code" },
];

export function AddPatientScreen({
  model,
  workspaceName,
  workspaces,
  workspaceId,
  initials,
  onSelectWorkspace,
  onOpenSettings,
  onBack,
  onRetry,
  onField,
  onCreate,
  onCreateAnyway,
  onOpenPatient,
}: {
  model: AddPatientModel;
  workspaceName: string | null;
  workspaces: Workspace[];
  workspaceId: string | null;
  initials: string;
  onSelectWorkspace: (id: string) => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onRetry: () => void;
  onField: (field: NewPatientField, value: string) => void;
  onCreate: () => void;
  onCreateAnyway: () => void;
  onOpenPatient: (id: string) => void;
}) {
  const saving = model.kind === "review" && model.busy;
  const duplicates = model.kind === "review" ? model.duplicates : [];
  const canCreate = model.kind === "review"
    && Boolean(model.draft.first_name.trim() && model.draft.last_name.trim())
    && !model.busy;

  return (
    <main className="screen transfer">
      <Header workspaceName={workspaceName} workspaces={workspaces} workspaceId={workspaceId} initials={initials} onSelectWorkspace={onSelectWorkspace} onOpenSettings={onOpenSettings} />
      {model.kind !== "success" ? <button type="button" className="back-button" onClick={onBack}>
        <BackIcon /> {model.kind === "review" ? "Add a new patient" : "Your patients"}
      </button> : null}
      <div className={`scroll add-patient-scroll ${model.kind === "success" || model.kind === "error" && model.unsupported ? "add-patient-centered" : ""}`}>
        {model.kind === "ready" ? <>
          <div>
            <h1 className="screen-title">Add a new patient</h1>
            <p className="body-copy">We’ll read the New Patient form on this tab. Nothing is created until you review and confirm.</p>
          </div>
          <div className="card add-patient-source">
            <strong>{workspaceName}</strong>
            <span className="person-meta">This patient will be created in this workspace.</span>
            <strong>demo.openemr.io · New Patient</strong>
            <span className="person-meta">Example registration form</span>
          </div>
          <p className="pick-status">Supported demo site. Read the form to check it’s a new patient registration.</p>
        </> : null}
        {model.kind === "scanning" ? (
          <div className="card add-patient-state" role="status" aria-live="polite">
            <span className="sk sk-avatar" aria-hidden="true" />
            <p className="body-copy">Reading the open registration form…</p>
          </div>
        ) : null}
        {model.kind === "error" ? (
          model.unsupported ? <div className="add-patient-empty-state">
            <div className="add-patient-state-icon" aria-hidden="true">▤</div>
            <h1>This isn’t a new patient form</h1>
            <p>{model.message}</p>
          </div> : <><div className="card add-patient-state">
            <p className="form-error" role="alert">{model.message}</p>
          </div><button type="button" className="btn-primary" onClick={onRetry}>Try again</button><button type="button" className="text-button" onClick={onBack}>Back to patients</button></>
        ) : null}
        {model.kind === "review" ? (
          <>
            <div>
              <h1 className="screen-title">Review new patient</h1>
              <p className="body-copy">Check these details, then create them in FLOR.</p>
            </div>
            <div className="card add-patient-source">
              <strong>{model.sourceHost} · {model.sourceTitle || "New Patient"}</strong>
              <span className="person-meta">Example form · Review each detail</span>
            </div>
            {model.warnings.length ? (
              <div className="identity-flag warn" role="status">
                {model.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            ) : null}
            <div className="card add-patient-fields">
              {FORM_FIELDS.map(({ key, label, type }) => (
                <label className="add-patient-field" key={key}>
                  <span>{label}{model.evidence[key] ? <small>From “{model.evidence[key]}”</small> : null}</span>
                  <input
                    type={type ?? "text"}
                    value={model.draft[key]}
                    onChange={(event) => onField(key, event.target.value)}
                    autoComplete="off"
                    aria-label={label}
                  />
                </label>
              ))}
              <div className="add-patient-field">
                <span>Medical record number</span>
                <div className="assigned-mrn">Assigned by FLOR</div>
                <small>FLOR will assign this when you create the patient.</small>
              </div>
            </div>
            {model.error ? <p className="form-error" role="alert">{model.error}</p> : null}
            {duplicates.length ? (
              <section className="card add-patient-duplicates" aria-labelledby="duplicate-heading">
                <h2 id="duplicate-heading">A similar patient may be here</h2>
                <p className="person-meta">Have a look before you create another. We won’t merge these automatically.</p>
                {duplicates.map((person) => (
                  <button type="button" className="person" key={person.id} onClick={() => onOpenPatient(person.id)}>
                    <span className="avatar tone-a">{personInitials(personDisplayName(person))}</span>
                    <span>
                      <span className="person-name">{personDisplayName(person)}</span>
                      <span className="person-meta">{[formatDob(person.dateOfBirth), person.mrn ? `MRN ${person.mrn}` : ""].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="trailing">Open</span>
                  </button>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
      {model.kind === "ready" ? <button type="button" className="btn-primary" onClick={onRetry}>Review details</button> : null}
      {model.kind === "error" && model.unsupported ? <button type="button" className="btn-primary" onClick={onRetry}>Try again</button> : null}
      {model.kind === "error" && model.unsupported ? <button type="button" className="text-button" onClick={onBack}>Back to patients</button> : null}
      {model.kind === "review" ? (
        <>
        <button type="button" className="btn-primary" onClick={onCreate} disabled={!canCreate || duplicates.length > 0}>
          {saving ? "Adding patient…" : "Create patient in FLOR"}
        </button>
        {duplicates.length > 0 ? <button type="button" className="text-button" onClick={onCreateAnyway} disabled={!canCreate}>Create a new patient anyway</button> : null}
        </>
      ) : null}
      {model.kind === "ready" ? <p className="quiet">♢ &nbsp;Nothing is created yet.</p> : null}
      {model.kind === "review" ? <p className="quiet">This draft is only kept until you cancel or close.</p> : null}
      {model.kind === "success" ? <>
        <div className="add-patient-success">
          <div className="add-patient-success-icon" aria-hidden="true">✓</div>
          <h1>{model.name} is in FLOR</h1>
          <p>Medical record number {model.mrn ? `${model.mrn} assigned by FLOR.` : "assigned by FLOR."} This is an example — not a real record.</p>
        </div>
        <button type="button" className="btn-primary" onClick={onBack}>Back to patients</button>
      </> : null}
    </main>
  );
}
