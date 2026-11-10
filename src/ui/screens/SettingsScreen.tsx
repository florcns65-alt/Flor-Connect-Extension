import type { Workspace } from "../../shared/types";
import { Header, SavedLine } from "../components/Chrome";
import { Nav } from "../components/Nav";
import { roleLabel } from "../../shared/format";

export function SettingsScreen({
  email,
  initials,
  workspace,
  version,
  onSignOut,
  busy,
  onSelectWorkspace,
  onNavigate,
  workspaces,
  workspaceId,
}: {
  email: string;
  initials: string;
  workspace: Workspace | null;
  version: string;
  onSignOut: () => void;
  busy: boolean;
  onSelectWorkspace: (id: string) => void;
  onNavigate: (route: "home" | "patients" | "activity" | "settings") => void;
  workspaces: Workspace[];
  workspaceId: string | null;
}) {
  return (
    <main className="screen">
      <Header
        workspaceName={workspace?.name ?? null}
        workspaces={workspaces}
        workspaceId={workspaceId}
        initials={initials}
        onSelectWorkspace={onSelectWorkspace}
        onOpenSettings={() => onNavigate("settings")}
      />
      <div className="scroll">
        <h1 className="page-title">Settings</h1>
        <section className="card detail-card">
          <h2>Signed in</h2>
          <div className="detail-row">
            <span>Email</span>
            <strong>{email || "Not available"}</strong>
          </div>
          <div className="detail-row">
            <span>Workspace</span>
            <strong>{workspace ? `${workspace.name} · ${roleLabel(workspace.role)}` : "None selected"}</strong>
          </div>
          <div className="detail-row">
            <span>Version</span>
            <strong>{version}</strong>
          </div>
        </section>
      </div>
      <button type="button" className="btn-primary" onClick={onSignOut} disabled={busy}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      <SavedLine />
      <Nav route="settings" onChange={onNavigate} />
    </main>
  );
}
