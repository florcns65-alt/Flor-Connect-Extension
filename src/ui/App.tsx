import { greeting } from "../shared/format";
import { clinicianInitials } from "./components/Chrome";
import { MessageState, PageSkeleton } from "./components/States";
import { ActivityScreen } from "./screens/ActivityScreen";
import { NotMemberScreen } from "./screens/GateScreens";
import { HomeScreen } from "./screens/HomeScreen";
import { PatientScreen } from "./screens/PatientScreen";
import { ExistingValues, FillPreview, FillResult, NoForm, SavePreview } from "./screens/TransferScreens";
import { emptySelectedCount, useTransfer } from "./use-transfer";
import { PatientsScreen } from "./screens/PatientsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { WorkspaceScreen } from "./screens/WorkspaceScreen";
import { loadMorePatients, openFlor, openPatient, retryPatient, selectWorkspace, signIn, signOut, useFlorSession } from "./session";
import { useFlorStore } from "./store";

export function App() {
  useFlorSession();
  const ready = useFlorStore((state) => state.ready);
  const auth = useFlorStore((state) => state.auth);
  const legal = useFlorStore((state) => state.legal);
  const missingLegal = useFlorStore((state) => state.missingLegal);
  const workspaces = useFlorStore((state) => state.workspaces);
  const workspaceId = useFlorStore((state) => state.workspaceId);
  const bootLoading = useFlorStore((state) => state.bootLoading);
  const appointments = useFlorStore((state) => state.appointments);
  const appointmentsLoading = useFlorStore((state) => state.appointmentsLoading);
  const query = useFlorStore((state) => state.query);
  const searchResults = useFlorStore((state) => state.searchResults);
  const searchLoading = useFlorStore((state) => state.searchLoading);
  const patientListMode = useFlorStore((state) => state.patientListMode);
  const directory = useFlorStore((state) => state.directory);
  const directoryTotal = useFlorStore((state) => state.directoryTotal);
  const workspacePatientTotal = useFlorStore((state) => state.workspacePatientTotal);
  const directoryLoading = useFlorStore((state) => state.directoryLoading);
  const directoryLoadingMore = useFlorStore((state) => state.directoryLoadingMore);
  const directoryError = useFlorStore((state) => state.directoryError);
  const patient = useFlorStore((state) => state.patient);
  const patientChart = useFlorStore((state) => state.patientChart);
  const transfer = useTransfer(patient, workspaceId);
  const patientLoading = useFlorStore((state) => state.patientLoading);
  const route = useFlorStore((state) => state.route);
  const previousRoute = useFlorStore((state) => state.previousRoute);
  const loadError = useFlorStore((state) => state.loadError);
  const offline = useFlorStore((state) => state.offline);

  if (!ready || (auth.phase === "signed_in" && legal === "unknown" && !loadError)) {
    return <PageSkeleton />;
  }

  if (auth.phase === "signed_in" && legal === "unknown") {
    return (
      <main className="screen">
        <MessageState
          title="Something went wrong"
          message={loadError?.message ?? "FLOR Connect couldn't open your account."}
          action="Try again"
          onAction={() => useFlorStore.getState().retry()}
        />
      </main>
    );
  }

  if (auth.phase !== "signed_in") {
    return <WelcomeScreen busy={auth.phase === "signing_in"} error={auth.error} onSignIn={() => void signIn()} />;
  }

  if (legal === "required") {
    return (
      <SetupScreen
        missing={missingLegal}
        busy={bootLoading}
        onOpenFlor={() => void openFlor()}
        onRecheck={() => useFlorStore.getState().retry()}
      />
    );
  }

  if (workspaces.length === 0) {
    return <NotMemberScreen onSignOut={() => void signOut()} />;
  }

  if (!workspaceId) {
    return <WorkspaceScreen workspaces={workspaces} onSelect={(id) => void selectWorkspace(id)} />;
  }

  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;
  const initials = clinicianInitials(auth.user?.name ?? null, auth.user?.email ?? "");
  const errorMessage = loadError?.message ?? null;
  const shared = {
    initials,
    workspaceName: workspace?.name ?? null,
    workspaces,
    workspaceId,
    onSelectWorkspace: (id: string) => void selectWorkspace(id),
    onOpenSettings: () => useFlorStore.getState().setRoute("settings"),
    onNavigate: (next: "home" | "patients" | "activity" | "settings") => useFlorStore.getState().setRoute(next),
  };

  if (route === "patient") {
    const personName = patient ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim() : "patient";
    if (transfer.model?.kind === "no-form") {
      return (
        <NoForm personName={personName} onRetry={transfer.startFill} onBack={transfer.close} workspaceName={workspace?.name ?? null} initials={initials} />
      );
    }
    if (transfer.model?.kind === "preview" && patient) {
      return (
        <FillPreview
          person={patient}
          fields={transfer.model.fields}
          host={transfer.model.host}
          pageTitle={transfer.model.pageTitle}
          frameNote={transfer.model.frameErrors ? "Some frames on the page could not be read." : ""}
          onToggle={transfer.toggle}
          onContinue={transfer.continueFill}
          onBack={transfer.close}
          workspaceName={workspace?.name ?? null}
          initials={initials}
        />
      );
    }
    if (transfer.model?.kind === "conflicts" && patient) {
      return (
        <ExistingValues
          person={patient}
          fields={transfer.model.fields}
          emptyCount={emptySelectedCount(transfer.model.fields)}
          onToggle={transfer.toggle}
          onFill={transfer.fillConflicts}
          onBack={transfer.close}
          workspaceName={workspace?.name ?? null}
          initials={initials}
        />
      );
    }
    if (transfer.model?.kind === "result") {
      return (
        <FillResult
          filled={transfer.model.filled}
          skipped={transfer.model.skipped}
          site={transfer.model.site}
          onBack={transfer.close}
          onUndo={() => void transfer.undo()}
          workspaceName={workspace?.name ?? null}
          initials={initials}
        />
      );
    }
    if (transfer.model?.kind === "save" && patient) {
      return (
        <SavePreview
          person={patient}
          fields={transfer.model.fields}
          identity={transfer.model.identity}
          host={transfer.model.host}
          pageTitle={transfer.model.pageTitle}
          onToggle={transfer.toggleSave}
          onSave={() => void transfer.save()}
          onBack={transfer.close}
          busy={transfer.model.busy}
          error={transfer.model.error}
          workspaceName={workspace?.name ?? null}
          initials={initials}
        />
      );
    }
    return (
      <PatientScreen
        patient={patient}
        upcoming={patientChart?.upcoming ?? []}
        recent={patientChart?.recent ?? []}
        loading={patientLoading}
        error={errorMessage}
        offline={offline}
        onBack={() => useFlorStore.getState().setRoute(previousRoute)}
        onRetry={() => retryPatient()}
        onFill={transfer.startFill}
        onSave={transfer.startSave}
        onNavigate={(next) => useFlorStore.getState().setRoute(next)}
      />
    );
  }

  if (route === "patients") {
    return (
      <PatientsScreen
        {...shared}
        mode={patientListMode}
        onMode={(next) => useFlorStore.getState().setPatientListMode(next)}
        query={query}
        onQuery={(value) => useFlorStore.getState().setQuery(value)}
        people={directory}
        total={directoryTotal}
        workspaceTotal={workspacePatientTotal}
        loading={directoryLoading}
        loadingMore={directoryLoadingMore}
        hasMore={directory !== null && directoryTotal !== null && directory.length < directoryTotal}
        onLoadMore={() => void loadMorePatients()}
        appointments={appointments}
        appointmentsLoading={appointmentsLoading}
        error={directoryError?.message ?? null}
        offline={offline}
        onRetry={() => useFlorStore.getState().retry()}
        onOpenPatient={(id) => void openPatient(id)}
      />
    );
  }

  if (route === "activity") {
    return <ActivityScreen {...shared} />;
  }

  if (route === "settings") {
    return (
      <SettingsScreen
        {...shared}
        email={auth.user?.email ?? ""}
        workspace={workspace}
        version={__FLOR_VERSION__}
        busy={false}
        onSignOut={() => void signOut()}
      />
    );
  }

  return (
    <HomeScreen
      {...shared}
      greeting={greeting(new Date(), auth.user?.name ?? null)}
      query={query}
      onQuery={(value) => useFlorStore.getState().setQuery(value)}
      onSeeAll={() => useFlorStore.getState().setRoute("patients")}
      appointments={appointments}
      appointmentsLoading={appointmentsLoading}
      searchResults={searchResults}
      searchLoading={searchLoading}
      error={errorMessage}
      offline={offline}
      onRetry={() => useFlorStore.getState().retry()}
      onOpenPatient={(id) => void openPatient(id)}
      route={route}
    />
  );
}
