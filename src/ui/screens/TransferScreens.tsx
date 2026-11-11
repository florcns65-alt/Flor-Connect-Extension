import type { ReactNode } from "react";
import type { MappedField, SaveField } from "../../engine/map";
import { formatDob, personDisplayName, personInitials } from "../../shared/format";
import type { PersonDetail } from "../../shared/types";
import { Header } from "../components/Chrome";
import { BackIcon, ShieldIcon } from "../components/Icons";

function PatientChip({ person, host, pageTitle }: { person: PersonDetail; host?: string; pageTitle?: string }) {
  const name = personDisplayName(person);
  return (
    <div className="card transfer-patient">
      <div className="identity">
        <span className="avatar tone-a">{personInitials(name)}</span>
        <div>
          <strong>
            {name} <span className="example-pill">Example</span>
          </strong>
          <p className="person-meta">
            {[formatDob(person.dateOfBirth), person.sex, person.mrn ? `MRN ${person.mrn}` : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {host ? (
        <div className="page-chip">
          <span>{host}{pageTitle ? ` · ${pageTitle}` : ""}</span>
          <span className="person-meta">Example form</span>
        </div>
      ) : null}
    </div>
  );
}

export function TransferChrome({
  personName,
  title,
  lede,
  onBack,
  children,
  action,
  foot,
  workspaceName,
  initials,
}: {
  personName: string;
  title: string;
  lede?: string;
  onBack: () => void;
  children: ReactNode;
  action?: ReactNode;
  foot?: string;
  workspaceName: string | null;
  initials: string;
}) {
  return (
    <main className="screen transfer">
      <Header workspaceName={workspaceName} workspaces={[]} workspaceId={null} initials={initials} onSelectWorkspace={() => undefined} onOpenSettings={() => undefined} />
      <button type="button" className="back-button" onClick={onBack}>
        <BackIcon /> {personName}
      </button>
      <div className="scroll">
        <h1 className="screen-title">{title}</h1>
        {lede ? <p className="body-copy">{lede}</p> : null}
        {children}
      </div>
      {action}
      {foot ? (
        <p className="quiet">
          <ShieldIcon /> {foot}
        </p>
      ) : null}
    </main>
  );
}

export function FillPreview({
  person,
  fields,
  host,
  pageTitle,
  frameNote,
  onToggle,
  onContinue,
  onBack,
  workspaceName,
  initials,
}: {
  person: PersonDetail;
  fields: MappedField[];
  host: string;
  pageTitle: string;
  frameNote: string;
  onToggle: (index: number) => void;
  onContinue: () => void;
  onBack: () => void;
  workspaceName: string | null;
  initials: string;
}) {
  const matched = fields.filter((field) => field.status === "matched").length;
  return (
    <TransferChrome
      personName={personDisplayName(person)}
      title="Fill this page"
      lede="Review what we'll type into the open form."
      onBack={onBack}
      workspaceName={workspaceName}
      initials={initials}
      action={
        <button type="button" className="btn-primary" onClick={onContinue}>
          Fill selected fields
        </button>
      }
      foot="We'll only type. Nothing is saved or submitted in the EHR."
    >
      <PatientChip person={person} host={host} pageTitle={pageTitle} />
      <p className="section-heading">{matched} of {fields.length} fields match</p>
      {frameNote ? <p className="body-copy">{frameNote}</p> : null}
      <div className="card">
        {fields.map((field, index) => (
          <label className="map-row" key={`${field.fieldLabel}-${index}`}>
            <input type="checkbox" checked={field.selected} disabled={field.status !== "matched"} onChange={() => onToggle(index)} />
            <span>
              <strong>{field.florValue || field.fieldLabel}</strong>
              {field.status === "matched" ? <span className="person-meta"> → {field.fieldLabel}</span> : null}
              {field.note ? <span className="person-meta">{field.note}</span> : null}
            </span>
            <span className={field.status === "matched" ? "chip-status" : "chip-status done"}>{field.status === "matched" ? "Matched" : "Unmatched"}</span>
          </label>
        ))}
      </div>
    </TransferChrome>
  );
}

export function ExistingValues({
  person,
  fields,
  emptyCount,
  onToggle,
  onFill,
  onBack,
  workspaceName,
  initials,
}: {
  person: PersonDetail;
  fields: MappedField[];
  emptyCount: number;
  onToggle: (index: number) => void;
  onFill: () => void;
  onBack: () => void;
  workspaceName: string | null;
  initials: string;
}) {
  const occupied = fields.filter((field) => field.occupied && field.status === "matched");
  return (
    <TransferChrome
      personName={personDisplayName(person)}
      title="Some boxes already have a value"
      lede="We'll leave those as they are, unless you choose to replace them."
      onBack={onBack}
      workspaceName={workspaceName}
      initials={initials}
      action={
        <button type="button" className="btn-primary" onClick={onFill}>
          Fill selected fields
        </button>
      }
      foot="We'll only type. Nothing is saved or submitted in the EHR."
    >
      <PatientChip person={person} />
      <p className="body-copy">{emptyCount} empty boxes will be filled as planned.</p>
      <div className="card">
        {occupied.map((field) => {
          const index = fields.indexOf(field);
          return (
            <div className="conflict" key={field.fieldLabel}>
              <h2 className="section-heading">{field.fieldLabel}</h2>
              <p className="conflict-line"><span>On this page</span><span>{field.pageValue}</span></p>
              <p className="conflict-line"><span>From FLOR</span><span>{field.florValue}</span></p>
              <label className="map-row">
                <input type="checkbox" checked={field.selected} onChange={() => onToggle(index)} />
                <span>Replace with the FLOR value</span>
              </label>
            </div>
          );
        })}
      </div>
    </TransferChrome>
  );
}

export function FillResult({
  filled,
  skipped,
  site,
  onBack,
  onUndo,
  workspaceName,
  initials,
}: {
  filled: number;
  skipped: string[];
  site: string;
  onBack: () => void;
  onUndo: () => void;
  workspaceName: string | null;
  initials: string;
}) {
  const note = skipped.length ? `${skipped.join(" and ")} ${skipped.length === 1 ? "was" : "were"} left as they were.` : "Every selected box was typed.";
  return (
    <main className="screen transfer result-screen">
      <Header workspaceName={workspaceName} workspaces={[]} workspaceId={null} initials={initials} onSelectWorkspace={() => undefined} onOpenSettings={() => undefined} />
      <div className="scroll result-copy">
        <div className="empty-icon done-icon" aria-hidden="true">✓</div>
        <h1 className="screen-title">{filled} fields filled</h1>
        <p className="body-copy">{note}</p>
        <p className="section-heading">Review and save in {site}.</p>
      </div>
      <button type="button" className="btn-primary" onClick={onBack}>Back to patient</button>
      <button type="button" className="text-button undo" onClick={onUndo}>Undo</button>
    </main>
  );
}

export function NoForm({
  personName,
  onRetry,
  onBack,
  workspaceName,
  initials,
}: {
  personName: string;
  onRetry: () => void;
  onBack: () => void;
  workspaceName: string | null;
  initials: string;
}) {
  return (
    <main className="screen transfer">
      <Header workspaceName={workspaceName} workspaces={[]} workspaceId={null} initials={initials} onSelectWorkspace={() => undefined} onOpenSettings={() => undefined} />
      <button type="button" className="back-button" onClick={onBack}><BackIcon /> {personName}</button>
      <div className="scroll result-copy">
        <div className="empty-icon" aria-hidden="true">▭</div>
        <h1 className="screen-title">No form on this page</h1>
        <p className="body-copy">Check this is the tab with the form you want to fill, then try again. Some pages don't have boxes FLOR Connect can fill yet — and not every EHR works in the same way.</p>
      </div>
      <button type="button" className="btn-primary" onClick={onRetry}>Try again</button>
      <button type="button" className="text-button" onClick={onBack}>Back to {personName}</button>
    </main>
  );
}

export function SavePreview({
  person,
  fields,
  identity,
  host,
  pageTitle,
  onToggle,
  onSave,
  onBack,
  busy,
  error,
  workspaceName,
  initials,
}: {
  person: PersonDetail;
  fields: SaveField[];
  identity: string;
  host: string;
  pageTitle: string;
  onToggle: (index: number) => void;
  onSave: () => void;
  onBack: () => void;
  busy: boolean;
  error?: string;
  workspaceName: string | null;
  initials: string;
}) {
  const blocked = identity.startsWith("This page");
  return (
    <TransferChrome
      personName={personDisplayName(person)}
      title="Save this page to FLOR"
      lede="Review what we found. Nothing is saved until you confirm."
      onBack={onBack}
      workspaceName={workspaceName}
      initials={initials}
      action={
        <button type="button" className="btn-primary" onClick={onSave} disabled={blocked || busy || fields.every((field) => !field.selected)}>
          {busy ? "Saving…" : "Save selected fields to FLOR"}
        </button>
      }
      foot="Nothing is saved to FLOR without your confirmation."
    >
      <div className="card transfer-patient">
        <div className="identity">
          <span className="avatar tone-a">{personInitials(personDisplayName(person))}</span>
          <div>
            <strong>{personDisplayName(person)} <span className="example-pill">Example</span></strong>
            <p className="person-meta">{[formatDob(person.dateOfBirth), person.sex, person.mrn ? `MRN ${person.mrn}` : ""].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <p className={blocked ? "identity-flag bad" : "identity-flag"}>{identity}</p>
        <div className="page-chip"><span>{host} · {pageTitle}</span><span className="person-meta">Example form</span></div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <p className="section-heading">{fields.length} fields found on this page</p>
      <div className="card">
        {fields.map((field, index) => (
          <label className="map-row" key={field.key}>
            <input type="checkbox" checked={field.selected} disabled={blocked} onChange={() => onToggle(index)} />
            <span>{field.label}</span>
            <strong>{field.value}</strong>
          </label>
        ))}
      </div>
    </TransferChrome>
  );
}

