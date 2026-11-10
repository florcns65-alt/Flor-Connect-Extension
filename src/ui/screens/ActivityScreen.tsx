import type { Workspace } from "../../shared/types";
import { Header, SavedLine } from "../components/Chrome";
import { Nav } from "../components/Nav";

export function ActivityScreen({
  initials,
  workspaceName,
  workspaces,
  workspaceId,
  onSelectWorkspace,
  onOpenSettings,
  onNavigate,
}: {
  initials: string;
  workspaceName: string | null;
  workspaces: Workspace[];
  workspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenSettings: () => void;
  onNavigate: (route: "home" | "patients" | "activity" | "settings") => void;
}) {
  return (
    <main className="screen">
      <Header
        workspaceName={workspaceName}
        workspaces={workspaces}
        workspaceId={workspaceId}
        initials={initials}
        onSelectWorkspace={onSelectWorkspace}
        onOpenSettings={onOpenSettings}
      />
      <div className="scroll">
        <h1 className="page-title">Activity</h1>
        <div className="card">
          <p className="empty-in-card">
            <strong>Nothing here yet</strong>
            <span>Fills and saves arrive in a later update. This panel only reads for now.</span>
          </p>
        </div>
      </div>
      <SavedLine />
      <Nav route="activity" onChange={onNavigate} />
    </main>
  );
}
