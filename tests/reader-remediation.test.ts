import { describe, expect, it } from "vitest";
import { detectPeople, identityFor, mapPageFacts } from "../src/engine/facts";
import { peopleSearchExpression } from "../src/api/filters";
import { readDocument } from "../src/engine/read";
import { acceptScan, bindFocusedHttpTab } from "../src/ui/tab-bind";
import { readActivePage } from "../src/ui/transfer-tab";
import type { PersonDetail } from "../src/shared/types";

const florTarget: PersonDetail = {
  id: "22222222-2222-4222-8222-222222222222",
  firstName: "Test",
  lastName: "Synthetic",
  middleName: null,
  name: "Test Synthetic",
  dateOfBirth: "2020-01-01",
  sex: null,
  mrn: "MRN-TEST",
  phone: null,
  email: null,
  addressLine1: null,
  city: null,
  state: null,
  postalCode: null,
  insurancePayer: null,
  insuranceMemberId: null,
};

const phil: PersonDetail = { ...florTarget, firstName: "Phil", lastName: "Belford", name: "Phil Belford", dateOfBirth: "1972-02-09", mrn: "100245" };

function mount(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const OPENEMR_CHART = `
<header><h1>Phil Belford (1)</h1><p>DOB: 1972-02-09</p></header>
<section id="who">
  <table>
    <tr><td>Name</td><td>Phil</td><td>Belford</td></tr>
    <tr><td>DOB</td><td>1972-02-09</td></tr>
    <tr><td>External ID</td><td>1</td></tr>
    <tr><td>Birth Sex</td><td>Male</td></tr>
  </table>
</section>`;

describe("OpenEMR-like identity", () => {
  it("assembles Phil and Belford once and does not invent a second person from the header", () => {
    const read = readDocument(mount(OPENEMR_CHART));
    const detected = detectPeople(read.facts);
    expect(detected.people.map((person) => person.name)).toEqual(["Phil Belford"]);
    expect(detected.mixed).toBe(false);
    expect(detected.people.some((person) => person.name.includes("Belford Belford"))).toBe(false);
    const mapped = mapPageFacts(read.facts, florTarget);
    expect(mapped.mixed).toBe(false);
    const identity = identityFor(mapped.fields, florTarget);
    expect(identity.kind).toBe("mismatch");
    expect(identity.blockSave).toBe(true);
    expect(identityFor(mapped.fields, phil).kind).toBe("match");
  });

  it("keeps two different people, and homonyms with different dates, separate", () => {
    const two = readDocument(mount(`
      <table>
        <tr id="a"><td>Name</td><td>Phil Belford</td></tr>
        <tr id="b"><td>Name</td><td>Sam Example</td></tr>
      </table>`));
    expect(detectPeople(two.facts).mixed).toBe(true);
    const homonyms = readDocument(mount(`
      <section id="a"><span>Name</span><span>Phil Belford</span><span>DOB</span><span>1972-02-09</span></section>
      <section id="b"><span>Name</span><span>Phil Belford</span><span>DOB</span><span>1980-01-01</span></section>`));
    expect(detectPeople(homonyms.facts).mixed).toBe(true);
    const nameOnly = readDocument(mount(`
      <section id="one"><h2>Name</h2><p>Phil Belford</p></section>
      <section id="two"><h2>Name</h2><p>Phil Belford</p></section>`));
    expect(detectPeople(nameOnly.facts).mixed).toBe(true);
  });

  it("does not treat a local id or a patient id as the FLOR MRN", () => {
    const read = readDocument(mount(`<label for="pid">Patient ID</label><input id="pid" value="100DFK"><label for="fn">Given</label><input id="fn" value="John"><label for="ln">Family Name</label><input id="ln" value="Sánchez">`));
    const mapped = mapPageFacts(read.facts, { ...phil, firstName: "John", lastName: "Sánchez", dateOfBirth: "1980-07-18" });
    expect(mapped.fields.find((field) => field.key === "mrn" && field.pageValue === "100DFK")).toBeUndefined();
    expect(mapped.fields.find((field) => field.key === "last_name")?.pageValue).toBe("Sánchez");
  });
});

describe("OpenMRS-like pages", () => {
  it("reads sibling labels on an editable demographics form", () => {
    const read = readDocument(mount(`
      <form>
        <div><label>Given (required)</label><input id="given" value="John"></div>
        <div><label>Middle</label><input id="middle" value=""></div>
        <div><label>Family Name (required)</label><input id="family" value="Sánchez"></div>
        <div><label>Gender</label><select id="gender"><option>Male</option></select></div>
        <div><label>Birthdate</label><input id="birth" value="1980-07-18"></div>
      </form>`));
    expect(read.unlabeledControls).toBe(0);
    const detected = detectPeople(read.facts);
    expect(detected.mixed).toBe(false);
    expect(detected.people.map((person) => person.name)).toEqual(["John Sánchez"]);
    expect(mapPageFacts(read.facts, florTarget).fields.find((field) => field.key === "date_of_birth")?.pageValue).toBe("1980-07-18");
  });

  it("reads a summary heading and a dotted birth date without calling the page empty", () => {
    const read = readDocument(mount(`
      <div class="patient-header"><h1>John Sánchez</h1><div>Male 46 year(s) (18.Jul.1980)</div><span>Patient ID</span><span>100DFK</span></div>
      <h3>DIAGNOSES</h3><p>None</p>`));
    expect(read.facts.length).toBeGreaterThan(0);
    const detected = detectPeople(read.facts);
    expect(detected.people.map((person) => person.name)).toEqual(["John Sánchez"]);
    expect(detected.mixed).toBe(false);
  });
});

describe("which tab is read", () => {
  it("uses only the focused window and drops a stale or foreign document", () => {
    const john = { id: 2, url: "https://o2.openmrs.org/openmrs/patient.page", title: "John" };
    const phil = { id: 1, url: "https://demo.openemr.io/openemr/interface/patient_file/summary/demographics.php", title: "Phil" };
    const bound = bindFocusedHttpTab([
      { id: 10, focused: false, activeTab: phil },
      { id: 11, focused: true, activeTab: john },
    ]);
    expect(bound.ok).toBe(true);
    if (bound.ok) expect(bound.tab.id).toBe(2);
    const hidden = bindFocusedHttpTab([
      { id: 10, focused: true, activeTab: { id: 9, url: "chrome://newtab/", title: "" } },
      { id: 11, focused: false, activeTab: phil },
    ]);
    expect(hidden.ok).toBe(false);
    expect(acceptScan({
      requestId: 1,
      currentId: 2,
      tabId: 2,
      currentTabId: 2,
      tabHost: "o2.openmrs.org",
      tabPath: "/openmrs/patient.page",
      documentHost: "o2.openmrs.org",
      documentPath: "/openmrs/patient.page",
      readerBuild: "2.5.0",
      panelBuild: "2.5.0",
    })).toBe("stale-request");
    expect(acceptScan({
      requestId: 4,
      currentId: 4,
      tabId: 2,
      currentTabId: 2,
      tabHost: "o2.openmrs.org",
      tabPath: "/openmrs/patient.page",
      documentHost: "demo.openemr.io",
      documentPath: "/openemr/interface/patient_file/summary/demographics.php",
      readerBuild: "2.5.0",
      panelBuild: "2.5.0",
    })).toBe("wrong-document");
    expect(acceptScan({
      requestId: 4,
      currentId: 4,
      tabId: 2,
      currentTabId: 2,
      tabHost: "o2.openmrs.org",
      tabPath: "/openmrs/patient.page",
      documentHost: "o2.openmrs.org",
      documentPath: "/openmrs/patient.page",
      readerBuild: "2.4.0",
      panelBuild: "2.5.0",
    })).toBe("stale-reader");
  });

  it("searches the displayed name with a real substring wildcard", () => {
    const expression = peopleSearchExpression("Synthetic");
    expect(expression).toContain("name.ilike.*Synthetic*");
    expect(expression).toContain("first_name.ilike.*Synthetic*");
    expect(expression).not.toContain("ilike.%Synthetic%");
  });
});

describe("read failures stay specific", () => {
  it("reports permission, injection, frames, and unlabeled boxes separately", async () => {
    const tab = { id: 3, url: "https://o2.openmrs.org/openmrs/patient.page", title: "Chart" };
    const base = { queryTab: async () => ({ ok: true as const, tab, windowId: 1, webTabs: 1, windows: 1 }), hasPermission: async () => true, requestPermission: async () => true };
    const read = { host: "o2.openmrs.org", path: "/openmrs/patient.page", build: "2.5.0" };
    const denied = await readActivePage({ ...base, hasPermission: async () => false, requestPermission: async () => false, read: async () => ({ facts: [], frameErrors: 0, closedControls: 0, unlabeledControls: 0, injectionFailed: false, ...read }) });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("permission");
    const injected = await readActivePage({ ...base, read: async () => ({ facts: [], frameErrors: 0, closedControls: 0, unlabeledControls: 0, injectionFailed: true, ...read }) });
    if (!injected.ok) expect(injected.reason).toBe("injection");
    const framed = await readActivePage({ ...base, read: async () => ({ facts: [], frameErrors: 2, closedControls: 0, unlabeledControls: 0, injectionFailed: false, ...read }) });
    if (!framed.ok) expect(framed.reason).toBe("frames");
    const unlabeled = await readActivePage({ ...base, read: async () => ({ facts: [], frameErrors: 0, closedControls: 1, unlabeledControls: 4, injectionFailed: false, ...read }) });
    if (!unlabeled.ok) {
      expect(unlabeled.reason).toBe("unlabeled");
      expect(unlabeled.counts).toContain("4 unlabeled");
      expect(unlabeled.counts).not.toContain("John");
    }
  });
});
