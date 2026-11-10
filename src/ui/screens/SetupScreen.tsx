import { SavedLine } from "../components/Chrome";
import { Brand } from "../components/Chrome";

const LABELS: Record<string, string> = {
  terms: "Terms",
  privacy: "Privacy",
  ai_use: "AI use",
  ambient_listening: "Ambient listening",
  email_ingestion: "Email",
  hipaa: "HIPAA notice",
  esign: "Electronic signature",
};

export function SetupScreen({
  missing,
  onOpenFlor,
  onRecheck,
  busy,
}: {
  missing: string[];
  onOpenFlor: () => void;
  onRecheck: () => void;
  busy: boolean;
}) {
  return (
    <main className="screen">
      <Brand word="FLOR" />
      <div className="scroll">
        <h1 className="page-title">Finish your FLOR setup</h1>
        <p className="lede">
          Patient information stays in FLOR until the current agreements are signed. That signature stays on the FLOR site.
        </p>
        <div className="card">
          <ul className="checklist">
            {(missing.length ? missing : ["terms"]).map((kind) => (
              <li key={kind}>{LABELS[kind] ?? kind}</li>
            ))}
          </ul>
        </div>
      </div>
      <button type="button" className="btn-primary" onClick={onOpenFlor}>
        Finish your FLOR setup
      </button>
      <button type="button" className="btn-quiet" onClick={onRecheck} disabled={busy}>
        {busy ? "Checking…" : "I've done it — check again"}
      </button>
      <SavedLine />
    </main>
  );
}
