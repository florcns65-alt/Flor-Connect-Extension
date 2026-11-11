import { describe, expect, it } from "vitest";
import { OPENEMR_CALENDAR, OPENEMR_NEW_PATIENT, SYNTHETIC_PATIENT } from "../src/engine/fixtures";
import { factsFromTargetFrames, identityFor, mapPageFacts } from "../src/engine/facts";
import { allowlistedUpdate, instructionsFor, saveFieldsFrom } from "../src/engine/map";
import { fillDocument } from "../src/engine/page";
import { readDocument } from "../src/engine/read";
import type { PersonDetail } from "../src/shared/types";

const jane = SYNTHETIC_PATIENT;
const alex: PersonDetail = {
  ...jane,
  id: "33333333-3333-4333-8333-333333333333",
  firstName: "Alex",
  lastName: "Kim",
  name: "Alex Kim",
  dateOfBirth: "1991-11-02",
  sex: "male",
  mrn: "448812",
  phone: "(617) 555-0108",
  email: "alex.kim@email.example",
  addressLine1: "9 Harbor Road",
  city: "Boston",
  state: "MA",
  postalCode: "02110",
};

function mount(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

function value(doc: Document, id: string): string {
  const element = doc.getElementById(id);
  if (element instanceof HTMLSelectElement) return element.value;
  if (element instanceof HTMLInputElement) return element.value;
  return "";
}

describe("OpenEMR demo Search or Add Patient form", () => {
  it("fills any FLOR patient into the live form and leaves the other frames alone", () => {
    for (const person of [jane, alex]) {
      const form = readDocument(mount(OPENEMR_NEW_PATIENT), 2);
      const calendar = readDocument(mount(OPENEMR_CALENDAR), 1);
      const facts = factsFromTargetFrames([...calendar.facts, ...form.facts]);
      expect(facts.every((fact) => fact.frameId === 2)).toBe(true);
      expect(facts.some((fact) => fact.value === "Emily Carter")).toBe(false);

      const mapped = mapPageFacts(facts, person);
      const identity = identityFor(mapped.fields, person, facts);
      expect(mapped.mixed).toBe(false);
      expect(identity.blockFill).toBe(false);
      expect(identity.blockSave).toBe(true);

      const doc = mount(OPENEMR_NEW_PATIENT);
      const written = fillDocument(doc, instructionsFor(mapped.fields));
      expect(written.filter((row) => row.changed).length).toBeGreaterThan(0);
      expect(value(doc, "form_fname")).toBe(person.firstName);
      expect(value(doc, "form_lname")).toBe(person.lastName);
      expect(value(doc, "form_DOB")).toBe(person.dateOfBirth === jane.dateOfBirth ? "12 Mar 1984" : "2 Nov 1991");
      expect(value(doc, "form_sex")).toBe(person.sex === "female" ? "Female" : "Male");
      expect(value(doc, "form_phone_home")).toBe(person.phone);
      expect(value(doc, "form_email")).toBe(person.email);
      expect(value(doc, "form_street")).toBe(person.addressLine1);
      expect(value(doc, "form_city")).toBe(person.city);
      expect(value(doc, "form_state")).toBe("MA");
      expect(value(doc, "form_postal_code")).toBe(person.postalCode);

      expect(value(doc, "form_ss")).toBe("");
      expect(value(doc, "form_mname")).toBe("");
      expect(value(doc, "form_preferred_name")).toBe("");
      expect(value(doc, "form_birth_fname")).toBe("");
      expect(value(doc, "form_birth_lname")).toBe("");
      expect(value(doc, "form_gender_identity")).toBe("");
      expect(value(doc, "form_sexual_orientation")).toBe("");
      expect(value(doc, "form_street_line_2")).toBe("");
      expect(value(doc, "form_country_code")).toBe("");
      expect(value(doc, "form_phone_cell")).toBe("");
      expect(value(doc, "form_phone_biz")).toBe("");
      expect(value(doc, "form_phone_contact")).toBe("");
      expect(value(doc, "form_pubpid")).toBe("");

      const again = readDocument(doc, 2);
      const saved = mapPageFacts(again.facts, person);
      const savedIdentity = identityFor(saved.fields, person, again.facts);
      expect(savedIdentity.kind).toBe("match");
      expect(savedIdentity.blockFill).toBe(false);
      const payload = allowlistedUpdate(saveFieldsFrom(saved.fields));
      expect(payload.first_name).toBe(person.firstName);
      expect(payload.last_name).toBe(person.lastName);
      expect(payload.date_of_birth).toBe(person.dateOfBirth);
      expect(payload.sex).toBe(person.sex);
      expect(payload.phone).toBe(person.phone);
      expect(payload.email).toBe(person.email);
      expect(payload).not.toHaveProperty("ss");

      const other = person === jane ? alex : jane;
      expect(identityFor(mapPageFacts(again.facts, other).fields, other, again.facts).blockFill).toBe(true);
    }
  });
});
