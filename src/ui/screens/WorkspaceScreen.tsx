import { roleLabel } from "../../shared/format";
import type { Workspace } from "../../shared/types";
import { Brand, SavedLine } from "../components/Chrome";

export function WorkspaceScreen({
  workspaces,
  onSelect,
}: {
  workspaces: Workspace[];
  onSelect: (id: string) => void;
}) {
  return (
    <main className="screen">
      <Brand word="FLOR" />
      <div className="scroll">
        <h1 className="page-title">Choose a workspace</h1>
        <p className="lede">You'll see today's patients for this clinic. You can switch later.</p>
        <div className="card">
          {workspaces.map((workspace) => (
            <button type="button" className="choice" key={workspace.id} onClick={() => onSelect(workspace.id)}>
              <span>
                <span className="choice-name">{workspace.name}</span>
                <span className="choice-meta">Workspace</span>
              </span>
              <span className="role">{roleLabel(workspace.role)}</span>
            </button>
          ))}
        </div>
      </div>
      <SavedLine />
    </main>
  );
}
