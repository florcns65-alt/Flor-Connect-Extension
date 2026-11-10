import { useEffect, useState } from "react";
import { personInitials, roleLabel } from "../../shared/format";
import type { Workspace } from "../../shared/types";
import { CheckIcon, ChevronIcon, LeafIcon, ShieldIcon } from "./Icons";

export function Brand({ word }: { word: string }) {
  return (
    <div className={word === "FLOR Connect" ? "brand brand-lg" : "brand"}>
      <span className="brand-mark">
        <LeafIcon />
      </span>
      <span className="brand-name">{word}</span>
    </div>
  );
}

export function SavedLine() {
  return (
    <p className="quiet">
      <ShieldIcon />
      <span>Nothing is saved without you.</span>
    </p>
  );
}

export function Header({
  workspaceName,
  workspaces,
  workspaceId,
  initials,
  onSelectWorkspace,
  onOpenSettings,
}: {
  workspaceName: string | null;
  workspaces: Workspace[];
  workspaceId: string | null;
  initials: string;
  onSelectWorkspace: (id: string) => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="topbar">
      <Brand word="FLOR" />
      <div className="topbar-side">
        {workspaceName ? (
          <button
            type="button"
            className="workspace-button"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((value) => !value)}
          >
            <span>{workspaceName}</span>
            <ChevronIcon />
          </button>
        ) : null}
        <button type="button" className="me" onClick={onOpenSettings} aria-label="Settings">
          {initials}
        </button>
      </div>
      {open ? (
        <div className="menu" role="listbox" aria-label="Workspaces">
          {workspaces.map((workspace) => (
            <button
              type="button"
              key={workspace.id}
              role="option"
              aria-selected={workspace.id === workspaceId}
              onClick={() => {
                setOpen(false);
                onSelectWorkspace(workspace.id);
              }}
            >
              <span>
                <span className="choice-name">{workspace.name}</span>
                <span className="choice-meta">{roleLabel(workspace.role)}</span>
              </span>
              {workspace.id === workspaceId ? <CheckIcon /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export function clinicianInitials(name: string | null, email: string): string {
  return personInitials(name || email || "?");
}
