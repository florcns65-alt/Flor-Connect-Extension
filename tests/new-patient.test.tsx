import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readDocument } from "../src/engine/read";
import {
  createDecision,
  duplicateCandidates,
  retryWouldDuplicate,
  fingerprintNewPatientFacts,
  patientInsertPayload,
  readNewPatient,
} from "../src/engine/new-patient";
import { CreatePatientFieldsSchema } from "../src/shared/messages";
import type { DirectoryPerson } from "../src/shared/types";
import { AddPatientScreen } from "../src/ui/screens/AddPatientScreen";
import { PatientsScreen } from "../src/ui/screens/PatientsScreen";

function mount(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const workspaceId = "11111111-1111-4111-8111-111111111111";

afterEach(() => cleanup());

const screenProps = {
  workspaceName: "Worcester P&N",
  workspaces: [{ id: workspaceId, name: "Worcester P&N", role: "clinician" as const }],
  workspaceId,
  initials: "CO",
  onSelectWorkspace: () => undefined,
  onOpenSettings: () => undefined,
  onBack: () => undefined,
  onClose: () => undefined,
  onRetry: () => undefined,
  onField: () => undefined,
  onEdit: () => undefined,
  onCreate: () => undefined,
  onCreateAnyway: () => undefined,
  onOpenPatient: () => undefined,
};

describe("current-tab patient reading", () => {
  it("reads an existing chart, including a heading name, and drops the source MRN", () => {
    const read = readNewPatient(readDocument(mount(`
      <header><h1>Phil Belford (1)</h1><p>DOB: 1972-02-09</p></header>
      <section id="who">
        <table>
          <tr><td>Name</td><td>Phil</td><td>Belford</td></tr>
          <tr><td>DOB</td><td>1972-02-09</td></tr>
          <tr><td>External ID</td><td>100245</td></tr>
          <tr><td>Birth Sex</td><td>Male</td></tr>
        </table>
      </section>
    `)).facts);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.draft.first_name).toBe("Phil");
    expect(read.draft.last_name).toBe("Belford");
    expect(read.personName).not.toContain("Belford Belford");
    expect(read.draft.date_of_birth).toBe("1972-02-09");
    expect(read.draft.sex).toBe("Male");
    expect(JSON.stringify(read.draft)).not.toContain("100245");
  });

  it("reads any HTML labels that match FLOR patient fields", () => {
    const read = readNewPatient(readDocument(mount(`
      <section>
        <label for="given">First name</label><span id="given">Ada</span>
        <label>Last name</label><span>Lovelace</span>
        <label>City</label><span>London</span>
        <label>Postal code</label><span>SW1A</span>
        <label>Notes</label><span>not a patient field</span>
        <label>Password</label><span>secret-value</span>
      </section>
    `)).facts);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.draft.first_name).toBe("Ada");
    expect(read.draft.last_name).toBe("Lovelace");
    expect(read.draft.city).toBe("London");
    expect(read.draft.postal_code).toBe("SW1A");
    expect(JSON.stringify(read.draft)).not.toContain("not a patient field");
    expect(JSON.stringify(read.draft)).not.toContain("secret-value");
  });

  it("reads a registration form that is not limited to one demo origin", () => {
    const read = readNewPatient(readDocument(mount(`
      <form>
        <label>First Name <input name="form_fname" value="Taylor"></label>
        <label>Last Name <input name="form_lname" value="Example"></label>
        <label>DOB <input name="form_dob" value="1991-06-04"></label>
        <label>Sex <input name="form_sex" value="Female"></label>
        <label>External ID <input name="pubpid" value="EHR-42"></label>
      </form>
    `)).facts);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.draft.first_name).toBe("Taylor");
    expect(read.draft.last_name).toBe("Example");
    expect(read.draft.date_of_birth).toBe("1991-06-04");
    expect(JSON.stringify(read.draft)).not.toContain("EHR-42");
  });

  it("refuses a page with two people and a page with no patient", () => {
    const mixed = readNewPatient(readDocument(mount(`
      <table>
        <tr><th>Name</th><th>DOB</th></tr>
        <tr id="a"><td>Jane Doe</td><td>12 Mar 1984</td></tr>
        <tr id="b"><td>Sam Example</td><td>1 Jan 1990</td></tr>
      </table>
    `)).facts);
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.reason).toBe("ambiguous");
    const empty = readNewPatient(readDocument(mount("<h1>Schedule</h1><p>No chart is open.</p>")).facts);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe("unreadable");
  });

  it("leaves an ambiguous date blank and changes the fingerprint when the page changes", () => {
    const first = readDocument(mount(`<dl><dt>Name</dt><dd>Jane Doe</dd><dt>DOB</dt><dd>03/04/1984</dd></dl>`));
    const read = readNewPatient(first.facts);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.draft.first_name).toBe("Jane");
    expect(read.draft.date_of_birth).toBe("");
    expect(read.warnings.join(" ")).toMatch(/date of birth/i);
    const changed = readDocument(mount(`<dl><dt>Name</dt><dd>Jane Doe</dd><dt>DOB</dt><dd>1984-03-12</dd></dl>`));
    expect(fingerprintNewPatientFacts(first.facts)).not.toBe(fingerprintNewPatientFacts(changed.facts));
  });
});

describe("creation guards", () => {
  const person = (id: string, firstName: string, lastName: string): DirectoryPerson => ({
    id, firstName, lastName, name: null, dateOfBirth: "1990-01-09", sex: "female", mrn: "100245", appointment: null,
  });

  it("matches a same name without requiring a duplicate, and does not merge by itself", () => {
    const matches = duplicateCandidates(
      [person("22222222-2222-4222-8222-222222222222", "Taylor", "Example"), person("33333333-3333-4333-8333-333333333333", "Jane", "Doe")],
      { first_name: "Taylor", last_name: "Example" },
    );
    expect(matches).toHaveLength(1);
    expect(createDecision(0, false)).toBe("insert");
    expect(createDecision(1, false)).toBe("review-duplicates");
    expect(createDecision(1, true)).toBe("insert");
    expect(retryWouldDuplicate("server", 1)).toBe(true);
    expect(retryWouldDuplicate("network", 1)).toBe(true);
    expect(retryWouldDuplicate("validation", 1)).toBe(true);
    expect(retryWouldDuplicate("not_member", 1)).toBe(false);
    expect(retryWouldDuplicate("server", 0)).toBe(false);
  });

  it("builds an insert from the signed-in user and never sends a source MRN", () => {
    const payload = patientInsertPayload(workspaceId, "user-1", {
      first_name: "Taylor",
      last_name: "Example",
      date_of_birth: "1991-06-04",
      sex: "Female",
    });
    expect(payload.user_id).toBe("user-1");
    expect(payload.workspace_id).toBe(workspaceId);
    expect(payload.name).toBe("Taylor Example");
    expect(payload).not.toHaveProperty("mrn");
    expect(CreatePatientFieldsSchema.safeParse({ first_name: "Taylor", last_name: "Example", mrn: "EHR-42" }).success).toBe(false);
  });
});

describe("Add Patient screens", () => {
  it("offers add patient from page to a clinician and not to a viewer", () => {
    const props = {
      initials: "CO",
      workspaceName: "Worcester P&N",
      workspaces: [{ id: workspaceId, name: "Worcester P&N", role: "clinician" as const }],
      workspaceId,
      onSelectWorkspace: () => undefined,
      onOpenSettings: () => undefined,
      mode: "all" as const,
      onMode: () => undefined,
      query: "",
      onQuery: () => undefined,
      people: [],
      total: 0,
      workspaceTotal: 0,
      loading: false,
      loadingMore: false,
      hasMore: false,
      onLoadMore: () => undefined,
      appointments: [],
      appointmentsLoading: false,
      error: null,
      offline: false,
      onRetry: () => undefined,
      onOpenPatient: () => undefined,
      onAddPatient: () => undefined,
      onNavigate: () => undefined,
    };
    const { rerender } = render(<PatientsScreen {...props} />);
    expect(screen.getByRole("button", { name: "Add patient from page" })).toBeInTheDocument();
    rerender(<PatientsScreen {...props} workspaces={[{ id: workspaceId, name: "Worcester P&N", role: "viewer" }]} />);
    expect(screen.queryByRole("button", { name: "Add patient from page" })).not.toBeInTheDocument();
  });

  it("shows extracted details and an assigned MRN, with no blank form and no source MRN", () => {
    render(<AddPatientScreen {...screenProps} model={{
      kind: "review",
      host: "demo.openemr.io",
      title: "Phil Belford",
      draft: { first_name: "Phil", last_name: "Belford", date_of_birth: "1972-02-09", sex: "Male", phone: "", email: "", address_line1: "", city: "", state: "", postal_code: "" },
      evidence: { first_name: "From the heading “Name”", last_name: "From the heading “Name”", date_of_birth: "From the label “DOB”" },
      warnings: [],
      duplicates: [],
      tabId: 1,
      url: "https://demo.openemr.io/openemr/interface/patient_file/summary/demographics.php",
      fingerprint: "same",
      personName: "Phil Belford",
      busy: false,
      error: "",
      editing: false,
      holdWrite: false,
    }} />);
    expect(screen.getByRole("heading", { name: "Review extracted details" })).toBeInTheDocument();
    expect(screen.getByText("Phil")).toBeInTheDocument();
    expect(screen.getByText("Assigned by FLOR")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/100245/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review & add to FLOR" })).toBeEnabled();
  });

  it("stops another insert when a failed write may already have created the patient", () => {
    render(<AddPatientScreen {...screenProps} model={{
      kind: "duplicate",
      host: "demo.openemr.io",
      title: "Phil Belford",
      draft: { first_name: "Phil", last_name: "Belford", date_of_birth: "1972-02-09", sex: "Male", phone: "", email: "", address_line1: "", city: "", state: "", postal_code: "" },
      evidence: {},
      warnings: [],
      duplicates: [{ id: "22222222-2222-4222-8222-222222222222", firstName: "Phil", lastName: "Belford", name: null, dateOfBirth: "1972-02-09", sex: "male", mrn: "100245", appointment: null }],
      tabId: 1,
      url: "https://demo.openemr.io/chart",
      fingerprint: "same",
      personName: "Phil Belford",
      busy: false,
      error: "This name is already in FLOR.",
      holdWrite: true,
    }} />);
    expect(screen.queryByRole("button", { name: "Add to FLOR anyway" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open existing patient" })).toBeEnabled();
  });

  it("does not offer a manual patient when the page cannot be read", () => {
    render(<AddPatientScreen {...screenProps} model={{ kind: "error", message: "No patient on this page." }} />);
    expect(screen.getByRole("heading", { name: /Cannot read patient details/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create|Add to FLOR/ })).not.toBeInTheDocument();
  });
});
