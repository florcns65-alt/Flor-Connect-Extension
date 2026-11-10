import { normalizeSearchQuery } from "../../api/filters";
import type { PersonSummary, TodayAppointment, Workspace } from "../../shared/types";
import { Header } from "../components/Chrome";
import { ArrowUpIcon, SearchIcon } from "../components/Icons";
import { Nav } from "../components/Nav";
import { AppointmentButton, PersonButton } from "../components/PersonRow";
import { ListSkeleton, MessageState } from "../components/States";
import { SavedLine } from "../components/Chrome";
import { formatDob } from "../../shared/format";

export function HomeScreen({
  greeting,
  initials,
  workspaceName,
  workspaces,
  workspaceId,
  onSelectWorkspace,
  onOpenSettings,
  onSeeAll,
  query,
  onQuery,
  appointments,
  appointmentsLoading,
  searchResults,
  searchLoading,
  error,
  offline,
  onRetry,
  onOpenPatient,
  route,
  onNavigate,
}: {
  greeting: string;
  initials: string;
  workspaceName: string | null;
  workspaces: Workspace[];
  workspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenSettings: () => void;
  onSeeAll: () => void;
  query: string;
  onQuery: (value: string) => void;
  appointments: TodayAppointment[] | null;
  appointmentsLoading: boolean;
  searchResults: PersonSummary[] | null;
  searchLoading: boolean;
  error: string | null;
  offline: boolean;
  onRetry: () => void;
  onOpenPatient: (id: string) => void;
  route: "home" | "patients" | "activity" | "settings" | "patient";
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
      <p className="greeting">{greeting}</p>
      <form
        className="search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSeeAll();
        }}
      >
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Who are you seeing?"
          aria-label="Who are you seeing?"
        />
      </form>
      <div className="scroll">
        {offline ? (
          <MessageState title="You're offline" message="FLOR Connect will try again when you're back online." action="Try again" onAction={onRetry} />
        ) : error ? (
          <MessageState title="Something went wrong" message={error} action="Try again" onAction={onRetry} />
        ) : (
          <section className="card">
            <div className="card-head">
              <h2>{searching ? "Matches" : "Today's patients"}</h2>
              {searching ? null : (
                <button type="button" className="text-button" onClick={onSeeAll}>
                  See all
                </button>
              )}
            </div>
            {searching ? (
              searchLoading || searchResults === null ? (
                <ListSkeleton />
              ) : searchResults.length === 0 ? (
                <p className="empty-in-card">
                  <strong>No one matches that</strong>
                  <span>Try a first name, last name, or MRN.</span>
                </p>
              ) : (
                searchResults.map((person) => (
                  <PersonButton
                    key={person.id}
                    person={person}
                    meta={[formatDob(person.dateOfBirth), person.mrn ? `MRN ${person.mrn}` : ""].filter(Boolean).join(" · ") || "Patient"}
                    onOpen={onOpenPatient}
                  />
                ))
              )
            ) : appointmentsLoading || appointments === null ? (
              <ListSkeleton />
            ) : appointments.length === 0 ? (
              <p className="empty-in-card">
                <strong>No appointments today</strong>
                <span>Search still works if you know who you're seeing.</span>
              </p>
            ) : (
              appointments.map((appointment) => (
                <AppointmentButton key={appointment.id} appointment={appointment} onOpen={onOpenPatient} />
              ))
            )}
          </section>
        )}
      </div>
      <div className="dock">
        <button type="button" className="btn-primary" disabled aria-describedby="fill-soon">
          <ArrowUpIcon />
          Fill this page
        </button>
        <p id="fill-soon" className="action-note">
          Coming soon
        </p>
        <SavedLine />
        <Nav route={route} onChange={onNavigate} />
      </div>
    </main>
  );
}
