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
  onPick,
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
  onPick?: (index: number) => void;
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
              {onPick && field.status !== "matched" ? <button type="button" className="text-button" onClick={() => onPick(index)}>Pick this on the page</button> : null}
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

export function ChartRead({
  person, fields, identity, host, pageTitle, frameNote, onReview, onBack, workspaceName, initials,
}: {
  person: PersonDetail; fields: MappedField[]; identity: string; host: string; pageTitle: string; frameNote: string;
  onReview: () => void; onBack: () => void; workspaceName: string | null; initials: string;
}) {
  const shown = fields.filter((field) => field.pageValue && field.key);
  return (
    <TransferChrome personName={personDisplayName(person)} title="Read this chart" lede="Here's what we found on this page. Nothing is saved yet." onBack={onBack} workspaceName={workspaceName} initials={initials} action={<button type="button" className="btn-primary" onClick={onReview}>Review and save to FLOR</button>} foot="This page is read only. We won't type into it.">
      <PatientChip person={person} host={host} pageTitle={pageTitle} />
      <p className={identity.startsWith("Name and date") ? "identity-flag" : "identity-flag bad"}>{identity}</p>
      <p className="page-note">Example chart · Read only</p>
      {frameNote ? <p className="body-copy">{frameNote}</p> : null}
      <p className="section-heading">{shown.length} details from this chart</p>
      <div className="card">
        {shown.map((field) => (
          <div className="detail-row" key={`${field.key}-${field.evidence}`}>
            <span className="check" aria-hidden="true">✓</span>
            <span><strong>{field.fieldLabel}</strong><span className="person-meta">{field.evidence}</span></span>
            <strong>{field.pageValue}</strong>
          </div>
        ))}
      </div>
    </TransferChrome>
  );
}

export function PickField({
  person, lookingFor, pickedLabel, pickedValue, filling, onUse, onCancel, workspaceName, initials,
}: {
  person: PersonDetail; lookingFor: string; pickedLabel: string; pickedValue: string; filling: boolean;
  onUse: () => void; onCancel: () => void; workspaceName: string | null; initials: string;
}) {
  return (
    <TransferChrome personName={personDisplayName(person)} title="Pick it on the page" lede={`We weren't sure which box is ${lookingFor}. Click it on the page, or cancel.`} onBack={onCancel} workspaceName={workspaceName} initials={initials} action={<><button type="button" className="btn-primary" onClick={onUse} disabled={!pickedValue && !pickedLabel}>Use this field</button><button type="button" className="text-button" onClick={onCancel}>Cancel</button></>}>
      <PatientChip person={person} />
      <p className="section-heading">Looking for {lookingFor}</p>
      <p className="body-copy">{filling ? `Filling this page from ${personDisplayName(person)}` : `Saving this page to ${personDisplayName(person)}`}</p>
      <p className="pick-status">Click the field on the page</p>
      {pickedLabel || pickedValue ? <div className="card"><p className="person-meta">You picked</p><strong>{pickedLabel || lookingFor}</strong><p className="screen-title">{pickedValue}</p><p className="person-meta">As it appears on the page</p></div> : null}
    </TransferChrome>
  );
}

export function MappingReview({
  person, fields, host, pageTitle, matched, remember, layoutNote, blocked, onToggle, onPick, onRemember, onContinue, onBack, workspaceName, initials,
}: {
  person: PersonDetail; fields: MappedField[]; host: string; pageTitle: string; matched: number; remember: boolean; layoutNote: string; blocked: boolean;
  onToggle: (index: number) => void; onPick: (index: number) => void; onRemember: () => void; onContinue: () => void; onBack: () => void; workspaceName: string | null; initials: string;
}) {
  return (
    <TransferChrome personName={personDisplayName(person)} title="Review this mapping" lede={`Check how fields will be matched for ${personDisplayName(person)}.`} onBack={onBack} workspaceName={workspaceName} initials={initials} action={<button type="button" className="btn-primary" onClick={onContinue} disabled={blocked}>Continue</button>} foot="You can still review values before anything is saved.">
      <PatientChip person={person} host={host} pageTitle={pageTitle} />
      <p className="pick-status">Saving to FLOR</p>
      <p className="section-heading">{matched} of {fields.length} fields match</p>
      {layoutNote ? <p className="body-copy">{layoutNote}</p> : null}
      {blocked ? <p className="identity-flag bad">This page does not match the selected patient. A manual match cannot override that.</p> : null}
      <div className="card">
        {fields.map((field, index) => (
          <label className="map-row" key={`${field.fieldLabel}-${index}`}>
            <input type="checkbox" checked={field.selected} onChange={() => onToggle(index)} />
            <span>
              <strong>{field.status === "matched" ? field.pageValue || field.florValue : field.fieldLabel}</strong>
              {field.status === "matched" ? <span className="person-meta"> → {field.fieldLabel}</span> : <button type="button" className="text-button" onClick={() => onPick(index)}>Pick this on the page</button>}
            </span>
            <span className={field.status === "matched" ? "chip-status" : "chip-status done"}>{field.status === "matched" ? "Matched" : "Unmatched"}</span>
          </label>
        ))}
      </div>
      <label className="card remember">
        <input type="checkbox" checked={remember} onChange={onRemember} />
        <span><strong>Remember this form's layout</strong><span className="person-meta">Remembered for this session only. Field names and positions — never {person.firstName || "the patient"}'s details.</span></span>
      </label>
    </TransferChrome>
  );
}

export function CantRead({ personName, onRetry, onBack, workspaceName, initials }: { personName: string; onRetry: () => void; onBack: () => void; workspaceName: string | null; initials: string }) {
  return (
    <main className="screen transfer">
      <Header workspaceName={workspaceName} workspaces={[]} workspaceId={null} initials={initials} onSelectWorkspace={() => undefined} onOpenSettings={() => undefined} />
      <button type="button" className="back-button" onClick={onBack}><BackIcon /> {personName}</button>
      <div className="scroll result-copy">
        <div className="empty-icon" aria-hidden="true">▭</div>
        <h1 className="screen-title">We can't read this page</h1>
        <p className="body-copy">This tab doesn't have text or boxes we can use. Files, pictures of forms, and desktop programs aren't readable this way — and not every EHR works the same.</p>
      </div>
      <button type="button" className="btn-primary" onClick={onRetry}>Try again</button>
      <button type="button" className="text-button" onClick={onBack}>Back to {personName}</button>
    </main>
  );
}

export function MultiPerson({
  person, others, warning, onChoose, onCancel, workspaceName, initials,
}: {
  person: PersonDetail; others: Array<{ name: string; mrn: string }>; warning: string; onChoose: () => void; onCancel: () => void; workspaceName: string | null; initials: string;
}) {
  return (
    <TransferChrome personName={personDisplayName(person)} title="More than one person" lede="We won't save until it's clear who this is." onBack={onCancel} workspaceName={workspaceName} initials={initials} action={<><button type="button" className="btn-primary" onClick={onChoose}>This is {personDisplayName(person)}</button><button type="button" className="text-button" onClick={onCancel}>Cancel</button></>}>
      <p className="identity-flag warn">{warning || "Two names were found. Mixing people from a list would be unsafe."}</p>
      <div className="card person-choice">
        <div className="identity"><span className="avatar tone-a">{personInitials(personDisplayName(person))}</span><div><strong>{personDisplayName(person)} <span className="example-pill">Example</span></strong><p className="person-meta">{[formatDob(person.dateOfBirth), person.sex, person.mrn ? `MRN ${person.mrn}` : ""].filter(Boolean).join(" · ")}</p></div></div>
        <p className="person-meta">Selected in FLOR</p>
      </div>
      {others.map((other) => (
        <div className="card person-choice" key={other.name}>
          <div className="identity"><span className="avatar">{personInitials(other.name)}</span><div><strong>{other.name} <span className="example-pill">Example</span></strong>{other.mrn ? <p className="person-meta">MRN {other.mrn}</p> : null}</div></div>
          <p className="person-meta">Also on this page</p>
        </div>
      ))}
    </TransferChrome>
  );
}

