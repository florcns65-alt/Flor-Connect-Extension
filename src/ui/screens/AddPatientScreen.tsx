import { formatDob, personDisplayName, personInitials } from "../../shared/format";
import type { Workspace } from "../../shared/types";
import type { NewPatientDraft, NewPatientField } from "../../engine/new-patient";
import checkIcon from "../assets/check.svg";
import documentIcon from "../assets/document.svg";
import idCardIcon from "../assets/id-card.svg";
import shieldIcon from "../assets/shield.svg";
import { Header } from "../components/Chrome";
import { BackIcon } from "../components/Icons";
import type { AddPatientModel } from "../use-add-patient";

const EDIT_FIELDS: Array<{ key: NewPatientField; label: string; type?: string }> = [
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

function prettySex(value: string | null | undefined): string {
  const text = value?.trim().toLowerCase() ?? "";
  if (text === "f" || text === "female") return "Female";
  if (text === "m" || text === "male") return "Male";
  return value?.trim() ?? "";
}

function shownValue(key: NewPatientField, draft: NewPatientDraft): string {
  if (key === "date_of_birth") return formatDob(draft.date_of_birth);
  return draft[key];
}

function SourceRow({ host, title }: { host: string; title: string }) {
  return (
    <div className="add-source">
      <span className="add-source-icon">
        <img src={idCardIcon} alt="" width={16} height={16} />
      </span>
      <span>
        <strong>{host ? `${host} · Current tab` : "Current tab"}</strong>
        <span>{title || "This page"}</span>
      </span>
    </div>
  );
}

function PersonChip({ initials, name, meta }: { initials: string; name: string; meta: string }) {
  return (
    <div className="add-person">
      <span className="add-person-avatar">{initials}</span>
      <span>
        <strong>{name}</strong>
        <span>{meta}</span>
      </span>
    </div>
  );
}

export function AddPatientScreen({
  model,
  workspaceName,
  workspaces,
  workspaceId,
  initials,
  onSelectWorkspace,
  onOpenSettings,
  onBack,
  onClose,
  onRetry,
  onField,
  onEdit,
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
  onClose: () => void;
  onRetry: () => void;
  onField: (field: NewPatientField, value: string) => void;
  onEdit: () => void;
  onCreate: () => void;
  onCreateAnyway: () => void;
  onOpenPatient: (id: string) => void;
}) {
  const header = (
    <Header workspaceName={workspaceName} workspaces={workspaces} workspaceId={workspaceId} initials={initials} onSelectWorkspace={onSelectWorkspace} onOpenSettings={onOpenSettings} />
  );
  const reading = model.kind === "scanning";
  const saving = (model.kind === "review" || model.kind === "duplicate") && model.busy;
  const draftReady = model.kind === "review" && Boolean(model.draft.first_name.trim() && model.draft.last_name.trim());

  if (model.kind === "success") {
    return (
      <main className="screen add-flow">
        {header}
        <div className="add-hero">
          <div className="add-hero-icon add-hero-success" aria-hidden="true">
            <span>
              <img src={checkIcon} alt="" width={22} height={22} />
            </span>
          </div>
          <h1>{model.name || "This patient"} was added to FLOR</h1>
          <p>{model.mrn ? `Medical record number ${model.mrn} assigned by FLOR.` : "Medical record number assigned by FLOR."}</p>
        </div>
        <button type="button" className="btn-primary add-flow-primary" onClick={onClose}>Back to patients</button>
      </main>
    );
  }

  if (model.kind === "error") {
    return (
      <main className="screen add-flow">
        {header}
        <button type="button" className="back-button" onClick={onClose}><BackIcon /> Your patients</button>
        <div className="add-hero">
          <div className="add-hero-icon" aria-hidden="true">
            <span>
              <img src={documentIcon} alt="" width={28} height={28} />
            </span>
          </div>
          <h1>Cannot read patient details<br />on this page</h1>
          <p>{model.message}</p>
        </div>
        <button type="button" className="btn-primary add-flow-primary" onClick={onRetry}>Try again</button>
        <button type="button" className="add-flow-link" onClick={onClose}>Back to patients</button>
      </main>
    );
  }

  if (model.kind === "duplicate") {
    const pageMeta = [formatDob(model.draft.date_of_birth), prettySex(model.draft.sex), "No MRN yet"].filter(Boolean).join(" · ");
    const named = model.personName || `${model.draft.first_name} ${model.draft.last_name}`.trim();
    return (
      <main className="screen add-flow">
        {header}
        <button type="button" className="back-button" onClick={onBack}><BackIcon /> Review extracted details</button>
        <div className="scroll">
          <div className="add-copy">
            <h1>A similar patient may be here</h1>
          </div>
          <p className="add-note warn">A patient named {named} is already in this workspace.</p>
          {model.duplicates.map((person) => {
            const meta = [formatDob(person.dateOfBirth), prettySex(person.sex), "Already in FLOR"].filter(Boolean).join(" · ");
            return (
              <button type="button" className="card add-match" key={person.id} onClick={() => onOpenPatient(person.id)}>
                <span className="add-kicker">Already in FLOR</span>
                <PersonChip initials={personInitials(personDisplayName(person))} name={personDisplayName(person)} meta={meta} />
              </button>
            );
          })}
          <section className="card add-match">
            <span className="add-kicker">Read from the page</span>
            <PersonChip initials={personInitials(named)} name={named} meta={pageMeta} />
          </section>
          {model.error ? <p className="form-error" role="alert">{model.error}</p> : null}
        </div>
        {model.duplicates.length === 1 ? (
          <button type="button" className="btn-primary add-flow-primary" onClick={() => onOpenPatient(model.duplicates[0].id)} disabled={saving}>Open existing patient</button>
        ) : null}
        {model.holdWrite ? null : (
          <button type="button" className="add-flow-link" onClick={onCreateAnyway} disabled={saving || !model.draft.first_name.trim() || !model.draft.last_name.trim()}>
            {saving ? "Adding patient…" : "Add to FLOR anyway"}
          </button>
        )}
      </main>
    );
  }

  if (model.kind === "review") {
    const summary = EDIT_FIELDS.filter(({ key }) => model.draft[key].trim());
    return (
      <main className="screen add-flow">
        {header}
        <button type="button" className="back-button" onClick={onBack}><BackIcon /> Add patient from page</button>
        <div className="scroll">
          <div className="add-copy">
            <h1>Review extracted details</h1>
          </div>
          <SourceRow host={model.host} title={model.title} />
          {model.warnings.length ? <div className="add-note warn" role="status">{model.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
          <div className="card add-draft">
            {model.editing ? EDIT_FIELDS.map(({ key, label, type }) => (
              <label className="add-field" key={key}>
                <span>{label}</span>
                <input type={type ?? "text"} value={model.draft[key]} onChange={(event) => onField(key, event.target.value)} autoComplete="off" aria-label={label} />
                {model.evidence[key] ? <small>{model.evidence[key]}</small> : null}
              </label>
            )) : summary.map(({ key, label }) => (
              <div className="add-field" key={key}>
                <span>{label}</span>
                <strong>{shownValue(key, model.draft)}</strong>
                {model.evidence[key] ? <small>{model.evidence[key]}</small> : null}
              </div>
            ))}
            <div className="add-field">
              <span>Medical record number</span>
              <div className="add-assigned">Assigned by FLOR</div>
              <small>FLOR will assign this when you add the patient.</small>
            </div>
          </div>
          <button type="button" className="add-flow-link add-flow-link-left" onClick={onEdit}>{model.editing ? "Done editing" : "Edit extracted details"}</button>
          <p className="add-keep">Kept until you close.</p>
          {model.error ? <p className="form-error" role="alert">{model.error}</p> : null}
        </div>
        <button type="button" className="btn-primary add-flow-primary" onClick={onCreate} disabled={!draftReady || saving || model.holdWrite}>
          {saving ? "Adding patient…" : "Review & add to FLOR"}
        </button>
        <button type="button" className="add-flow-link" onClick={onClose}>Cancel</button>
      </main>
    );
  }

  return (
    <main className="screen add-flow">
      {header}
      <button type="button" className="back-button" onClick={onClose}><BackIcon /> Your patients</button>
      <div className="scroll">
        <div className="add-copy">
          <h1>Add patient from page</h1>
        </div>
        <section className="card add-context">
          <strong>{workspaceName}</strong>
          <span>This person will be added to this workspace.</span>
          <SourceRow host={model.host} title={model.title} />
        </section>
      </div>
      <button type="button" className="btn-primary add-flow-primary" onClick={onRetry} disabled={reading}>
        {reading ? "Reading this page…" : "Read from page"}
      </button>
      <p className="add-reassure">
        <img src={shieldIcon} alt="" width={16} height={16} />
        <span>Nothing is added to FLOR yet.</span>
      </p>
    </main>
  );
}
