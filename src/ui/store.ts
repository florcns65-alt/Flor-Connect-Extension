import { create } from "zustand";
import type { FlorError } from "../shared/errors";
import type { AuthStateMessage } from "../shared/messages";
import type { DirectoryPerson, PeoplePage, PersonChart, PersonDetail, PersonSummary, TodayAppointment, Workspace } from "../shared/types";
import { toSelectedPatient, type SelectedPatient } from "./selected-patient";

export type PanelRoute = "home" | "patients" | "activity" | "settings" | "patient";
export type LegalGate = "unknown" | "ok" | "required";

interface FlorState {
  auth: AuthStateMessage;
  legal: LegalGate;
  missingLegal: string[];
  workspaces: Workspace[];
  workspaceId: string | null;
  bootLoading: boolean;
  appointments: TodayAppointment[] | null;
  appointmentsLoading: boolean;
  query: string;
  searchResults: PersonSummary[] | null;
  searchLoading: boolean;
  patientListMode: "today" | "all";
  directory: DirectoryPerson[] | null;
  directoryTotal: number | null;
  workspacePatientTotal: number | null;
  directoryOffset: number;
  directoryLoading: boolean;
  directoryLoadingMore: boolean;
  directoryError: FlorError | null;
  patient: PersonDetail | null;
  patientChart: PersonChart | null;
  selectedPatient: SelectedPatient | null;
  patientLoading: boolean;
  recents: PersonSummary[];
  route: PanelRoute;
  previousRoute: Exclude<PanelRoute, "patient">;
  loadError: FlorError | null;
  offline: boolean;
  ready: boolean;
  reloadKey: number;
  applyAuth: (auth: AuthStateMessage) => void;
  setBoot: (input: { legal: LegalGate; missingLegal: string[]; workspaces: Workspace[]; workspaceId: string | null }) => void;
  setBootLoading: (bootLoading: boolean) => void;
  setAppointments: (appointments: TodayAppointment[]) => void;
  setAppointmentsLoading: (appointmentsLoading: boolean) => void;
  setQuery: (query: string) => void;
  setPatientListMode: (patientListMode: "today" | "all") => void;
  setSearchResults: (searchResults: PersonSummary[] | null) => void;
  setSearchLoading: (searchLoading: boolean) => void;
  setDirectoryLoading: (directoryLoading: boolean) => void;
  setDirectory: (page: PeoplePage, filtered: boolean) => void;
  appendDirectory: (page: PeoplePage) => void;
  setDirectoryLoadingMore: (directoryLoadingMore: boolean) => void;
  setDirectoryError: (directoryError: FlorError | null) => void;
  setPatient: (chart: PersonChart) => void;
  setPatientLoading: (patientLoading: boolean) => void;
  setRoute: (route: PanelRoute) => void;
  selectWorkspace: (workspaceId: string) => void;
  setLoadError: (loadError: FlorError | null) => void;
  setOffline: (offline: boolean) => void;
  retry: () => void;
  clearClinical: () => void;
}

function summaryOf(person: PersonDetail): PersonSummary {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    name: person.name,
    dateOfBirth: person.dateOfBirth,
    sex: person.sex,
    mrn: person.mrn,
  };
}

function remember(recents: PersonSummary[], person: PersonDetail): PersonSummary[] {
  const next = summaryOf(person);
  return [next, ...recents.filter((item) => item.id !== next.id)].slice(0, 5);
}

const emptyClinical = {
  appointments: null as TodayAppointment[] | null,
  appointmentsLoading: false,
  query: "",
  searchResults: null as PersonSummary[] | null,
  searchLoading: false,
  patientListMode: "all" as const,
  directory: null as DirectoryPerson[] | null,
  directoryTotal: null as number | null,
  workspacePatientTotal: null as number | null,
  directoryOffset: 0,
  directoryLoading: false,
  directoryLoadingMore: false,
  directoryError: null as FlorError | null,
  patient: null as PersonDetail | null,
  patientChart: null as PersonChart | null,
  selectedPatient: null as SelectedPatient | null,
  patientLoading: false,
  recents: [] as PersonSummary[],
  route: "home" as PanelRoute,
  previousRoute: "home" as Exclude<PanelRoute, "patient">,
  loadError: null as FlorError | null,
};

export const useFlorStore = create<FlorState>((set, get) => ({
  auth: { phase: "signed_out", user: null, error: null },
  legal: "unknown",
  missingLegal: [],
  workspaces: [],
  workspaceId: null,
  bootLoading: false,
  offline: false,
  ready: false,
  reloadKey: 0,
  ...emptyClinical,
  applyAuth: (auth) => {
    if (auth.phase !== "signed_in") {
      set({
        ready: true,
        auth,
        legal: "unknown",
        missingLegal: [],
        workspaces: [],
        workspaceId: null,
        bootLoading: false,
        ...emptyClinical,
      });
      return;
    }
    set({ ready: true, auth });
  },
  setBoot: (input) => set({ ...input, bootLoading: false, loadError: null }),
  setBootLoading: (bootLoading) => set({ bootLoading }),
  setAppointments: (appointments) => set({ appointments, appointmentsLoading: false, loadError: null }),
  setAppointmentsLoading: (appointmentsLoading) => set({ appointmentsLoading, loadError: appointmentsLoading ? null : get().loadError }),
  setQuery: (query) => set({ query }),
  setPatientListMode: (patientListMode) => set({ patientListMode }),
  setSearchResults: (searchResults) => set({ searchResults, searchLoading: false }),
  setSearchLoading: (searchLoading) => set({ searchLoading }),
  setDirectoryLoading: (directoryLoading) => set({ directoryLoading, directoryError: directoryLoading ? null : get().directoryError }),
  setDirectory: (page, filtered) =>
    set({
      directory: page.people,
      directoryTotal: page.total,
      directoryOffset: page.people.length,
      directoryLoading: false,
      directoryLoadingMore: false,
      directoryError: null,
      workspacePatientTotal: filtered ? get().workspacePatientTotal : page.total,
      searchResults: filtered ? page.people : null,
      searchLoading: false,
    }),
  appendDirectory: (page) =>
    set({
      directory: [...(get().directory ?? []), ...page.people],
      directoryTotal: page.total,
      directoryOffset: (get().directory?.length ?? 0) + page.people.length,
      directoryLoadingMore: false,
      directoryError: null,
    }),
  setDirectoryLoadingMore: (directoryLoadingMore) => set({ directoryLoadingMore }),
  setDirectoryError: (directoryError) =>
    set({ directoryError, directoryLoading: false, directoryLoadingMore: false, searchLoading: false }),
  setPatient: (chart) =>
    set({
      patient: chart.person,
      patientChart: chart,
      selectedPatient: toSelectedPatient(chart.person),
      patientLoading: false,
      loadError: null,
      recents: remember(get().recents, chart.person),
    }),
  setPatientLoading: (patientLoading) => set({ patientLoading }),
  setRoute: (route) => {
    const current = get().route;
    const previousRoute =
      route === "patient" ? (current === "patient" ? get().previousRoute : current) : route;
    set({ route, previousRoute, loadError: null });
  },
  selectWorkspace: (workspaceId) => set({ workspaceId, ...emptyClinical, reloadKey: get().reloadKey + 1 }),
  setLoadError: (loadError) =>
    set({
      loadError,
      appointmentsLoading: false,
      searchLoading: false,
      patientLoading: false,
      bootLoading: false,
      directoryLoading: false,
      directoryLoadingMore: false,
    }),
  setOffline: (offline) => set({ offline }),
  retry: () => set({ loadError: null, reloadKey: get().reloadKey + 1 }),
  clearClinical: () => set({ ...emptyClinical, legal: "unknown", workspaces: [], workspaceId: null }),
}));
