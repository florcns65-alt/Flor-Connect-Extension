import { useEffect, useRef } from "react";
import { normalizeSearchQuery } from "../../api/filters";
import { groupByLetter } from "../../api/directory";
import { ageInYears, formatSex, formatShortDate, personDisplayName, personInitials } from "../../shared/format";
import type { DirectoryPerson, TodayAppointment, Workspace } from "../../shared/types";
import { Header } from "../components/Chrome";
import { ChevronIcon, PeopleIcon, SearchIcon } from "../components/Icons";
import { Nav } from "../components/Nav";
import { MessageState } from "../components/States";

function rowMeta(person: Pick<DirectoryPerson, "dateOfBirth" | "sex" | "mrn">): string {
  return [ageInYears(person.dateOfBirth)?.toString(), formatSex(person.sex), person.mrn ? `MRN ${person.mrn}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function DirectoryRow({
  person,
  highlighted,
  onOpen,
}: {
  person: DirectoryPerson;
  highlighted?: boolean;
  onOpen: (id: string) => void;
}) {
  const name = personDisplayName(person);
  const when = person.appointment ? formatShortDate(person.appointment.startTime) : "";
  return (
    <button type="button" className={highlighted ? "person match" : "person"} onClick={() => onOpen(person.id)}>
      <span className="avatar tone-a">{personInitials(name)}</span>
      <span>
        <span className="person-name">{name}</span>
        <span className="person-meta">{rowMeta(person) || "Patient"}</span>
      </span>
      <span className="trailing">
        {when ? <span className="when muted">{when}</span> : null}
        <ChevronIcon />
      </span>
    </button>
  );
}

export function PatientsScreen({
  initials,
  workspaceName,
  workspaces,
  workspaceId,
  onSelectWorkspace,
  onOpenSettings,
  mode,
  onMode,
  query,
  onQuery,
  people,
  total,
  workspaceTotal,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  appointments,
  appointmentsLoading,
  error,
  offline,
  onRetry,
  onOpenPatient,
  onAddPatient,
  onNavigate,
}: {
  initials: string;
  workspaceName: string | null;
  workspaces: Workspace[];
  workspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenSettings: () => void;
  mode: "today" | "all";
  onMode: (mode: "today" | "all") => void;
  query: string;
  onQuery: (value: string) => void;
  people: DirectoryPerson[] | null;
  total: number | null;
  workspaceTotal: number | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  appointments: TodayAppointment[] | null;
  appointmentsLoading: boolean;
  error: string | null;
  offline: boolean;
  onRetry: () => void;
  onOpenPatient: (id: string) => void;
  onAddPatient?: () => void;
  onNavigate: (route: "home" | "patients" | "activity" | "settings") => void;
}) {
  const searching = normalizeSearchQuery(query) !== null;
  const role = workspaces.find((workspace) => workspace.id === workspaceId)?.role;
  const canAddPatient = role === "owner" || role === "admin" || role === "clinician" || role === "staff";
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || loading || loadingMore || searching === false && mode === "today") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, mode, onLoadMore, searching]);

  const subtitle =
    workspaceTotal === null ? "" : workspaceTotal === 0 ? "None in this workspace yet." : `${workspaceTotal} in this workspace.`;
  const emptyWorkspace = !searching && workspaceTotal === 0 && !loading;
  const noMatches = searching && !loading && total === 0;
  const showSkeleton = loading && !people?.length && !emptyWorkspace;

  let body: JSX.Element;
  if (offline) {
    body = <MessageState title="You're offline" message="FLOR Connect will try again when you're back online." action="Try again" onAction={onRetry} />;
  } else if (error && !people?.length) {
    body = <MessageState title="Something went wrong" message={error} action="Try again" onAction={onRetry} />;
  } else if (showSkeleton || (mode === "today" && !searching && appointmentsLoading && appointments === null)) {
    body = <DirectorySkeleton />;
  } else if (emptyWorkspace) {
    body = (
      <div className="empty-hero">
        <div className="empty-icon" aria-hidden="true">
          <PeopleIcon />
        </div>
        <h2>No patients here yet</h2>
        <p>Add a patient from this tab.</p>
      </div>
    );
  } else if (noMatches) {
    body = (
      <div className="empty-hero card no-match">
        <div className="empty-icon" aria-hidden="true">
          <SearchIcon />
        </div>
        <h2>No one matches “{query.trim()}”</h2>
        <p>Try a name, birthday or MRN instead.</p>
        <button type="button" className="text-button" onClick={() => onQuery("")}>
          Clear search
        </button>
      </div>
    );
  } else if (!searching && mode === "today") {
    const rows = (appointments ?? []).flatMap((appointment) => (appointment.person ? [appointment] : []));
    body = (
      <section className="card directory">
        {rows.length === 0 ? (
          <p className="empty-in-card">
            <strong>No appointments today</strong>
            <span>Everyone in the workspace is on All patients.</span>
          </p>
        ) : (
          rows.map((appointment) => (
            <DirectoryRow
              key={appointment.id}
              person={{ ...appointment.person!, appointment: { id: appointment.id, startTime: appointment.startTime, endTime: appointment.endTime, status: appointment.status, appointmentType: appointment.appointmentType } }}
              onOpen={onOpenPatient}
            />
          ))
        )}
      </section>
    );
  } else {
    const groups = groupByLetter(people ?? []);
    const countLabel = total === 1 ? "1 patient" : `${total ?? people?.length ?? 0} patients`;
    body = (
      <>
        <div className="list-meta">
          <span>{countLabel}</span>
          {searching ? null : <span className="sort-label">Name</span>}
        </div>
        <section className="card directory">
          {groups.map((group) => (
            <div key={group.letter}>
              {searching ? null : <h2 className="letter">{group.letter}</h2>}
              {group.people.map((person) => (
                <DirectoryRow key={person.id} person={person} highlighted={searching} onOpen={onOpenPatient} />
              ))}
            </div>
          ))}
          {hasMore ? <div ref={sentinel} className="load-more">{loadingMore ? "Loading more..." : ""}</div> : null}
          {error ? (
            <p className="empty-in-card">
              <span>{error}</span>
              <button type="button" className="text-button" onClick={onRetry}>
                Try again
              </button>
            </p>
          ) : null}
        </section>
      </>
    );
  }

  return (
    <main className="screen patients-screen">
      <Header
        workspaceName={workspaceName}
        workspaces={workspaces}
        workspaceId={workspaceId}
        initials={initials}
        onSelectWorkspace={onSelectWorkspace}
        onOpenSettings={onOpenSettings}
      />
      <div className="scroll">
        <div>
          <h1 className="page-title patients-title">Your patients</h1>
          {subtitle ? <p className="lede patients-lede">{subtitle}</p> : <div className="sk sk-line" />}
        </div>
        {onAddPatient && canAddPatient ? (
          <button type="button" className="add-patient-link" onClick={onAddPatient} disabled={offline}>
            Add patient from page
          </button>
        ) : null}
        <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search name, birthday or MRN"
            aria-label="Search name, birthday or MRN"
          />
          {query ? (
            <button type="button" className="icon-button" aria-label="Clear" onClick={() => onQuery("")}>
              ×
            </button>
          ) : null}
        </form>
        <div className="segment" role="group" aria-label="Patient list">
          <button type="button" aria-pressed={!searching && mode === "today"} onClick={() => onMode("today")}>
            Today
          </button>
          <button type="button" aria-pressed={searching || mode === "all"} onClick={() => onMode("all")}>
            All patients
          </button>
        </div>
        {body}
      </div>
      <div className="dock">
        <Nav route="patients" onChange={onNavigate} />
      </div>
    </main>
  );
}

function DirectorySkeleton() {
  return (
    <div className="card directory" aria-busy="true" aria-label="Loading patients">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="sk-person" key={index}>
          <span className="sk sk-avatar" />
          <span>
            <span className="sk sk-line" />
            <span className="sk sk-line short" />
          </span>
        </div>
      ))}
    </div>
  );
}
