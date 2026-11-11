import { createRoot } from "react-dom/client";
import type { DirectoryPerson } from "../shared/types";
import { AddPatientScreen } from "./screens/AddPatientScreen";
import { PatientsScreen } from "./screens/PatientsScreen";
import type { AddPatientModel } from "./use-add-patient";
import "./styles.css";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const noop = () => undefined;
const shared = {
  workspaceName: "Worcester P&N",
  workspaces: [{ id: workspaceId, name: "Worcester P&N", role: "clinician" as const }],
  workspaceId,
  initials: "CO",
  onSelectWorkspace: noop,
  onOpenSettings: noop,
  onBack: noop,
  onClose: noop,
  onRetry: noop,
  onField: noop,
  onEdit: noop,
  onCreate: noop,
  onCreateAnyway: noop,
  onOpenPatient: noop,
};

const draft = {
  first_name: "Taylor",
  last_name: "Example",
  date_of_birth: "1991-06-04",
  sex: "Female",
  phone: "",
  email: "",
  address_line1: "",
  city: "",
  state: "",
  postal_code: "",
};

const review: AddPatientModel = {
  kind: "review",
  host: "demo.openemr.io",
  title: "Example chart or form",
  draft,
  evidence: {
    first_name: "From the heading “Name”",
    last_name: "From the heading “Name”",
    date_of_birth: "From the label “DOB”",
    sex: "From the label “Sex”",
  },
  warnings: [],
  duplicates: [],
  tabId: 1,
  url: "https://demo.openemr.io/openemr/interface/patient_file/summary/demographics.php",
  fingerprint: "preview",
  personName: "Taylor Example",
  busy: false,
  error: "",
  editing: false,
  holdWrite: false,
};

const existing: DirectoryPerson = {
  id: "22222222-2222-4222-8222-222222222222",
  firstName: "Taylor",
  lastName: "Example",
  name: "Taylor Example",
  dateOfBirth: "1990-01-09",
  sex: "female",
  mrn: "100245",
  appointment: null,
};

const frames: Array<{ id: string; node: JSX.Element }> = [
  {
    id: "patients",
    node: (
      <PatientsScreen
        {...shared}
        mode="all"
        onMode={noop}
        query=""
        onQuery={noop}
        people={[
          { id: "a", firstName: "Ade", lastName: "Adeyemi", name: null, dateOfBirth: "1967-03-02", sex: "male", mrn: "099870", appointment: null },
          { id: "c", firstName: "Chidi", lastName: "Nwosu", name: null, dateOfBirth: "1975-01-01", sex: "male", mrn: "100088", appointment: null },
        ]}
        total={2}
        workspaceTotal={2}
        loading={false}
        loadingMore={false}
        hasMore={false}
        onLoadMore={noop}
        appointments={[]}
        appointmentsLoading={false}
        error={null}
        offline={false}
        onRetry={noop}
        onOpenPatient={noop}
        onAddPatient={noop}
        onNavigate={noop}
      />
    ),
  },
  { id: "ready", node: <AddPatientScreen {...shared} model={{ kind: "ready", host: "demo.openemr.io", title: "Example chart or form" }} /> },
  { id: "review", node: <AddPatientScreen {...shared} model={review} /> },
  { id: "duplicate", node: <AddPatientScreen {...shared} model={{ ...review, kind: "duplicate", duplicates: [existing] }} /> },
  { id: "success", node: <AddPatientScreen {...shared} model={{ kind: "success", name: "Taylor Example", mrn: "100301" }} /> },
  { id: "blocked", node: <AddPatientScreen {...shared} model={{ kind: "error", message: "No patient on this page." }} /> },
];

export function renderAddPatientPreview(root: HTMLElement, frameId: string): void {
  const frame = frames.find((item) => item.id === frameId) ?? frames[0];
  document.body.style.margin = "0";
  document.body.style.background = "#e7e2da";
  createRoot(root).render(
    <div style={{ width: 400, height: 800, margin: "0 auto", background: "#faf8f4", display: "flex", flexDirection: "column" }}>{frame.node}</div>,
  );
}
