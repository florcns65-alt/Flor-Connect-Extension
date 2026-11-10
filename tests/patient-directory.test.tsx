import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { attachListAppointments, groupByLetter } from "../src/api/directory";
import { PEOPLE_PAGE_SIZE, peoplePageQuery } from "../src/api/filters";
import type { AppointmentRow } from "../src/api/schemas";
import type { PersonSummary } from "../src/shared/types";
import { toSelectedPatient } from "../src/ui/selected-patient";
import { PatientScreen } from "../src/ui/screens/PatientScreen";
import { PatientsScreen } from "../src/ui/screens/PatientsScreen";

const person = (id: string, lastName: string, firstName: string): PersonSummary => ({
  id,
  firstName,
  lastName,
  name: null,
  dateOfBirth: "1984-03-12",
  sex: "female",
  mrn: "100245",
});

function appointment(id: string, personId: string, start: string): AppointmentRow {
  return {
    id,
    person_id: personId,
    start_time: start,
    end_time: null,
    status: "scheduled",
    appointment_type: "Follow-up",
    reason: null,
  };
}

const baseProps = {
  initials: "CO",
  workspaceName: "Worcester P&N",
  workspaces: [{ id: "11111111-1111-4111-8111-111111111111", name: "Worcester P&N", role: "clinician" as const }],
  workspaceId: "11111111-1111-4111-8111-111111111111",
  onSelectWorkspace: () => undefined,
  onOpenSettings: () => undefined,
  mode: "all" as const,
  onMode: () => undefined,
  query: "",
  onQuery: () => undefined,
  loadingMore: false,
  hasMore: false,
  onLoadMore: () => undefined,
  appointments: [],
  appointmentsLoading: false,
  error: null,
  offline: false,
  onRetry: () => undefined,
  onOpenPatient: () => undefined,
  onNavigate: () => undefined,
};

describe("patient directory queries", () => {
  it("pages 50 people at a time, sorted by last name", () => {
    expect(peoplePageQuery("ws", 0)).toMatchObject({
      table: "people",
      range: { from: 0, to: 49 },
      count: "exact",
      orders: [
        { column: "last_name", ascending: true, nullsFirst: false },
        { column: "first_name", ascending: true, nullsFirst: false },
      ],
    });
    expect(peoplePageQuery("ws", PEOPLE_PAGE_SIZE).range).toEqual({ from: 50, to: 99 });
  });

  it("keeps the next appointment, otherwise the latest past one", () => {
    const jane = person("22222222-2222-4222-8222-222222222222", "Doe", "Jane");
    const rows = attachListAppointments(
      [jane],
      [appointment("33333333-3333-4333-8333-333333333333", jane.id, "2026-11-12T15:00:00.000Z")],
      [appointment("44444444-4444-4444-8444-444444444444", jane.id, "2026-11-01T15:00:00.000Z")],
    );
    expect(rows[0]?.appointment?.startTime).toBe("2026-11-12T15:00:00.000Z");
    const onlyPast = attachListAppointments(
      [jane],
      [],
      [appointment("44444444-4444-4444-8444-444444444444", jane.id, "2026-11-01T15:00:00.000Z")],
    );
    expect(onlyPast[0]?.appointment?.id).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("groups the page by the first letter of the last name", () => {
    const groups = groupByLetter([
      person("22222222-2222-4222-8222-222222222222", "Adeyemi", "Ade"),
      person("33333333-3333-4333-8333-333333333333", "Doe", "Jane"),
    ]);
    expect(groups.map((group) => group.letter)).toEqual(["A", "D"]);
  });
});

describe("patient list states", () => {
  it("shows a loading skeleton", () => {
    render(
      <PatientsScreen
        {...baseProps}
        people={null}
        total={null}
        workspaceTotal={null}
        loading
      />,
    );
    expect(screen.getByLabelText("Loading patients")).toBeInTheDocument();
  });

  it("shows the empty workspace", () => {
    render(
      <PatientsScreen
        {...baseProps}
        people={[]}
        total={0}
        workspaceTotal={0}
        loading={false}
      />,
    );
    expect(screen.getByText("No patients here yet")).toBeInTheDocument();
    expect(screen.getByText("None in this workspace yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add new patient/i })).not.toBeInTheDocument();
  });

  it("shows no matches and can name the query", () => {
    render(
      <PatientsScreen
        {...baseProps}
        query="Okafz"
        people={[]}
        total={0}
        workspaceTotal={128}
        loading={false}
      />,
    );
    expect(screen.getByText(/No one matches/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("shows an error with retry", () => {
    render(
      <PatientsScreen
        {...baseProps}
        people={null}
        total={null}
        workspaceTotal={null}
        loading={false}
        error="FLOR couldn't be reached."
      />,
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders a patient and keeps fill and save disabled", () => {
    const detail = {
      ...person("22222222-2222-4222-8222-222222222222", "Doe", "Jane"),
      middleName: null,
      phone: null,
      email: null,
      addressLine1: null,
      city: null,
      state: null,
      postalCode: null,
      insurancePayer: null,
      insuranceMemberId: null,
    };
    render(
      <PatientScreen
        patient={detail}
        upcoming={[{ id: "33333333-3333-4333-8333-333333333333", startTime: "2026-11-12T15:00:00.000Z", endTime: null, status: "scheduled", appointmentType: "Follow-up" }]}
        recent={[]}
        loading={false}
        error={null}
        offline={false}
        onBack={() => undefined}
        onRetry={() => undefined}
        onNavigate={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /fill this page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save this page to flor/i })).toBeDisabled();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(toSelectedPatient(detail).mrn).toBe("100245");
  });
});
