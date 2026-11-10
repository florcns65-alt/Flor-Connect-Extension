import { GoogleIcon, HeartIcon, IdIcon, LeafIcon, NoteIcon } from "../components/Icons";
import { Brand, SavedLine } from "../components/Chrome";

export function WelcomeScreen({
  busy,
  error,
  onSignIn,
}: {
  busy: boolean;
  error: string | null;
  onSignIn: () => void;
}) {
  return (
    <main className="welcome">
      <Brand word="FLOR Connect" />
      <div className="orbit" aria-hidden="true">
        <span className="ring ring-a" />
        <span className="ring ring-b" />
        <span className="ring ring-c" />
        <span className="core">
          <LeafIcon size={28} />
        </span>
        <span className="spark spark-a" />
        <span className="spark spark-b" />
        <span className="chip chip-vitals">
          <HeartIcon /> Vitals <span className="dot" />
        </span>
        <span className="chip chip-patient">
          <IdIcon /> Patient <span className="dot" />
        </span>
        <span className="chip chip-note">
          <NoteIcon /> Visit note <span className="dot" />
        </span>
      </div>
      <h1 className="hero-title">
        Your EHR, with FLOR
        <br />
        beside you
      </h1>
      <p className="hero-sub">
        Bring what's on the page into FLOR, or fill a form from FLOR. Calmly, and only when you say so.
      </p>
      <div className="welcome-spacer" />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn-primary" onClick={onSignIn} disabled={busy}>
        {busy ? null : <GoogleIcon />}
        {busy ? "Waiting for Google…" : "Continue with Google"}
      </button>
      <SavedLine />
      <p className="invite">New here? Ask your clinic admin for an invite.</p>
    </main>
  );
}
