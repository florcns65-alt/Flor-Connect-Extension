import { normalizeSearchQuery } from "../../api/filters";
import { formatDob } from "../../shared/format";
import type { PersonSummary, TodayAppointment, Workspace } from "../../shared/types";
import { Header, SavedLine } from "../components/Chrome";
import { SearchIcon } from "../components/Icons";
import { Nav } from "../components/Nav";
import { AppointmentButton, PersonButton } from "../components/PersonRow";
import { ListSkeleton, MessageState } from "../components/States";

function personMeta(person: PersonSummary): string {
  return [formatDob(person.dateOfBirth), person.mrn ? `MRN ${person.mrn}` : ""].filter(Boolean).join(" · ") || "Patient";
}

export function PatientsScreen({
  initials,
  workspaceName,
  workspaces,
  workspaceId,
  onSelectWorkspace,
  onOpenSettings,
  query,
  onQuery,
  appointments,
  appointmentsLoading,
  searchResults,
  searchLoading,
  recents,
  error,
  offline,
  onRetry,
  onOpenPatient,
  onNavigate,
}: {
  initials: string;
  workspaceName: string | null;
  workspaces: Workspace[];
  workspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenSettings: () => void;
  query: string;
  onQuery: (value: string) => void;
  appointments: TodayAppointment[] | null;
  appointmentsLoading: boolean;
  searchResults: PersonSummary[] | null;
  searchLoading: boolean;
  recents: PersonSummary[];
  error: string | null;
  offline: boolean;
  onRetry: () => void;
  onOpenPatient: (id: string) => void;
  onNavigate: (route: "home" | "patients" | "activity" | "settings") => void;
}) {
  const searching = normalizeSearchQuery(query) !== null;
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
        <h1 className="page-title">Your patients</h1>
        <p className="lede">Straight from FLOR, ready to fill any EHR form.</p>
        <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search name or MRN"
            aria-label="Search name or MRN"
          />
        </form>
        {offline ? (
          <MessageState title="You're offline" message="FLOR Connect will try again when you're back online." action="Try again" onAction={onRetry} />
        ) : error ? (
          <MessageState title="Something went wrong" message={error} action="Try again" onAction={onRetry} />
        ) : searching ? (
          <section>
            <h2 className="section-label">Results</h2>
            <div className="card">
              {searchLoading || searchResults === null ? (
                <ListSkeleton />
              ) : searchResults.length === 0 ? (
                <p className="empty-in-card">
                  <strong>No one matches that</strong>
                  <span>Try a first name, last name, or MRN.</span>
                </p>
              ) : (
                searchResults.map((person) => (
                  <PersonButton key={person.id} person={person} meta={personMeta(person)} onOpen={onOpenPatient} />
                ))
              )}
            </div>
          </section>
        ) : (
          <>
            <section>
              <h2 className="section-label">Today</h2>
              <div className="card">
                {appointmentsLoading || appointments === null ? (
                  <ListSkeleton />
                ) : appointments.length === 0 ? (
                  <p className="empty-in-card">
                    <strong>No appointments today</strong>
                    <span>Search by name or MRN.</span>
                  </p>
                ) : (
                  appointments.map((appointment) => (
                    <AppointmentButton key={appointment.id} appointment={appointment} onOpen={onOpenPatient} />
                  ))
                )}
              </div>
            </section>
            {recents.length > 0 ? (
              <section>
                <h2 className="section-label">Recent</h2>
                <div className="card">
                  {recents.map((person) => (
                    <PersonButton key={person.id} person={person} meta={personMeta(person)} onOpen={onOpenPatient} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
      <div className="dock">
        <SavedLine />
        <Nav route="patients" onChange={onNavigate} />
      </div>
    </main>
  );
}
