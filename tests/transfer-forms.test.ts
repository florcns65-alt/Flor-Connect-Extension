import { describe, expect, it, vi } from "vitest";
import { createSupabaseFlorApi } from "../src/api/supabase-flor-api";
import type { PersonMutation } from "../src/api/flor-api";
import { OPENEMR_DEMOGRAPHICS, OPENMRS_REGISTRATION, SYNTHETIC_PATIENT } from "../src/engine/fixtures";
import {
  allowlistedUpdate,
  checkIdentity,
  instructionsFor,
  locksMatch,
  mapControls,
  saveFieldsFrom,
} from "../src/engine/map";
import { fillDocument, scanDocument } from "../src/engine/page";
import { readActiveForm } from "../src/ui/transfer-tab";

function mount(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const patient = SYNTHETIC_PATIENT;

describe("OpenEMR-like and OpenMRS-like forms", () => {
  it("fills empty demographic boxes and leaves an occupied phone unless chosen", () => {
    const doc = mount(OPENEMR_DEMOGRAPHICS);
    const controls = scanDocument(doc);
    expect(controls.some((control) => control.inputType === "password")).toBe(false);
    const fields = mapControls(controls, patient);
    expect(fields.find((field) => field.key === "first_name")?.status).toBe("matched");
    expect(fields.find((field) => field.key === "phone")?.occupied).toBe(true);
    expect(fields.find((field) => field.key === "phone")?.selected).toBe(false);
    const written = fillDocument(doc, instructionsFor(fields));
    expect(written.find((row) => row.id === "form_fname")?.changed).toBe(true);
    expect((doc.getElementById("form_fname") as HTMLInputElement).value).toBe("Jane");
    expect((doc.getElementById("form_phone_home") as HTMLInputElement).value).toBe("(508) 555-0199");
    const phone = fields.find((field) => field.key === "phone");
    if (phone) phone.selected = true;
    fillDocument(doc, instructionsFor(fields));
    expect((doc.getElementById("form_phone_home") as HTMLInputElement).value).toBe("(508) 555-0142");
  });

  it("fills an OpenMRS-like registration form, including a date and a short sex option", () => {
    const doc = mount(OPENMRS_REGISTRATION);
    const controls = scanDocument(doc);
    expect(controls.some((control) => control.name === "secretToken")).toBe(false);
    const fields = mapControls(controls, patient);
    expect(fields.find((field) => field.key === "first_name")?.status).toBe("matched");
    fillDocument(doc, instructionsFor(fields));
    expect((doc.getElementById("givenName") as HTMLInputElement).value).toBe("Jane");
    expect((doc.getElementById("familyName") as HTMLInputElement).value).toBe("Doe");
    expect((doc.getElementById("birthdate") as HTMLInputElement).value).toBe("1984-03-12");
    expect((doc.getElementById("gender") as HTMLSelectElement).value).toBe("F");
  });

  it("refuses a save when the page names a different person", () => {
    const doc = mount(OPENEMR_DEMOGRAPHICS);
    (doc.getElementById("form_fname") as HTMLInputElement).value = "Robert";
    (doc.getElementById("form_lname") as HTMLInputElement).value = "Smith";
    const identity = checkIdentity(mapControls(scanDocument(doc), patient), patient);
    expect(identity.blockSave).toBe(true);
  });

  it("builds an allowlisted save from a matching OpenEMR page", () => {
    const doc = mount(OPENEMR_DEMOGRAPHICS);
    (doc.getElementById("form_fname") as HTMLInputElement).value = "Jane";
    (doc.getElementById("form_lname") as HTMLInputElement).value = "Doe";
    (doc.getElementById("form_DOB") as HTMLInputElement).value = "12 Mar 1984";
    (doc.getElementById("form_phone_home") as HTMLInputElement).value = "(508) 555-0142";
    (doc.getElementById("form_street") as HTMLInputElement).value = "14 Elm Street";
    const fields = mapControls(scanDocument(doc), patient);
    const identity = checkIdentity(fields, patient);
    expect(identity.matches).toBe(true);
    const payload = allowlistedUpdate(saveFieldsFrom(fields));
    expect(payload.first_name).toBe("Jane");
    expect(payload.date_of_birth).toBe("1984-03-12");
    expect(payload.phone).toBe("(508) 555-0142");
    expect(payload).not.toHaveProperty("password");
  });
});

describe("transfer guards", () => {
  it("rejects a different tab, url, patient, or workspace", () => {
    const lock = { tabId: 4, url: "https://demo.openemr.io/patient", patientId: patient.id, workspaceId: "11111111-1111-4111-8111-111111111111" };
    expect(locksMatch(lock, lock)).toBe(true);
    expect(locksMatch(lock, { ...lock, tabId: 9 })).toBe(false);
    expect(locksMatch(lock, { ...lock, url: "https://demo.openemr.io/other" })).toBe(false);
    expect(locksMatch(lock, { ...lock, patientId: "33333333-3333-4333-8333-333333333333" })).toBe(false);
  });

  it("does not scan a tab until permission is granted", async () => {
    const scan = vi.fn(async () => ({ controls: [], frameErrors: 0 }));
    const denied = await readActiveForm({
      queryTab: async () => ({ id: 1, url: "https://demo.openemr.io/form", title: "New Patient" }),
      hasPermission: async () => false,
      requestPermission: async () => false,
      scan,
    });
    expect(denied.ok).toBe(false);
    expect(scan).not.toHaveBeenCalled();
  });

  it("reports a page with no editable boxes", async () => {
    const result = await readActiveForm({
      queryTab: async () => ({ id: 1, url: "https://demo.openemr.io/blank", title: "Blank" }),
      hasPermission: async () => true,
      requestPermission: async () => true,
      scan: async () => ({ controls: [], frameErrors: 0 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-form");
  });
});

describe("save through the user session", () => {
  it("confirms the row FLOR returns and refuses a failed write", async () => {
    const calls: Record<string, string>[] = [];
    const mutation: PersonMutation = {
      async update(_workspaceId, _personId, fields) {
        calls.push(fields);
        return {
          data: {
            id: patient.id,
            first_name: "Jane",
            last_name: "Doe",
            date_of_birth: "1984-03-12",
            sex: "female",
            mrn: "100245",
            phone: fields.phone,
            email: patient.email,
            address_line1: fields.address_line1,
            city: "Worcester",
            state: "MA",
            postal_code: "01608",
          },
          error: null,
        };
      },
    };
    const personRow = {
      id: patient.id,
      first_name: "Jane",
      last_name: "Doe",
      date_of_birth: "1984-03-12",
      sex: "female",
      mrn: "100245",
      phone: "(508) 555-0142",
      email: patient.email,
      address_line1: "14 Elm Street",
      city: "Worcester",
      state: "MA",
      postal_code: "01608",
    };
    const chain = (data: unknown) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        lt: () => builder,
        in: () => builder,
        or: () => builder,
        order: () => builder,
        limit: () => builder,
        range: () => builder,
        single: () => Promise.resolve({ data, error: null }),
        then: (done: (value: { data: unknown; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(done),
      };
      return builder;
    };
    const client = {
      from: (table: string) => chain(table === "people" ? personRow : []),
    };
    const api = createSupabaseFlorApi(client as never, mutation);
    const saved = await api.updatePersonDemographics(
      "11111111-1111-4111-8111-111111111111",
      patient.id,
      { phone: "(508) 555-0142", address_line1: "14 Elm Street", notes: "do not write" },
      "2026-11-10T12:00:00.000Z",
    );
    expect(calls[0]?.phone).toBe("(508) 555-0142");
    expect(calls[0]).not.toHaveProperty("notes");
    expect(saved.chart.person.phone).toBe("(508) 555-0142");

    const failing: PersonMutation = { async update() { return { data: null, error: { message: "row level security", code: "42501" } }; } };
    const denied = createSupabaseFlorApi(client as never, failing);
    await expect(
      denied.updatePersonDemographics("11111111-1111-4111-8111-111111111111", patient.id, { phone: "555" }, "2026-11-10T12:00:00.000Z"),
    ).rejects.toThrow(/did not save/i);
  });
});
