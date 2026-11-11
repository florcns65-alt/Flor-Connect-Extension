import { describe, expect, it } from "vitest";
import { SYNTHETIC_PATIENT } from "../src/engine/fixtures";
import {
  applyLayout,
  confirmRegion,
  dateCertainty,
  detectPeople,
  isoDate,
  layoutDrifted,
  mapPageFacts,
  mixedFactsUnlocked,
  pageSignature,
  rememberLayout,
  safePageAddress,
} from "../src/engine/facts";
import { allowlistedUpdate, locksMatch, saveFieldsFrom } from "../src/engine/map";
import { fillDocument } from "../src/engine/page";
import { cancelFieldPicker, installFieldPicker, mergeReads, readDocument, takeFieldPick } from "../src/engine/read";

const patient = SYNTHETIC_PATIENT;

function mount(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const CHART = `
<article id="summary">
  <h1>Patient summary</h1>
  <dl>
    <dt>Name</dt><dd>Jane Doe</dd>
    <dt>DOB</dt><dd>12 Mar 1984</dd>
    <dt>Sex</dt><dd>Female</dd>
    <dt>External ID</dt><dd>100245</dd>
    <dt>Home Phone</dt><dd>(508) 555-0142</dd>
  </dl>
  <h2>Sex</h2>
  <p>Female</p>
</article>`;

const MIXED = `
<table id="people">
  <tr><th>Name</th><th>MRN</th><th>DOB</th></tr>
  <tr id="jane"><td>Jane Doe</td><td>100245</td><td>12 Mar 1984</td></tr>
  <tr id="sam"><td>Sam Example</td><td>000111</td><td>1 Jan 1990</td></tr>
</table>`;

describe("read-only charts and accessible forms", () => {
  it("reads a definition list and a heading without inventing empty fields", () => {
    const read = readDocument(mount(CHART));
    const mapped = mapPageFacts(read.facts, patient);
    expect(mapped.mixed).toBe(false);
    expect(mapped.fields.find((field) => field.key === "first_name")?.pageValue).toBe("Jane");
    expect(mapped.fields.find((field) => field.key === "last_name")?.pageValue).toBe("Doe");
    expect(mapped.fields.find((field) => field.key === "date_of_birth")?.evidence).toContain("DOB");
    expect(mapped.fields.find((field) => field.key === "sex")?.evidence).toMatch(/label|heading/);
    expect(mapped.fields.some((field) => field.key === "email")).toBe(false);
  });

  it("uses aria and autocomplete as evidence", () => {
    const read = readDocument(mount(`
      <label id="given">Given name</label>
      <input id="given-name" aria-labelledby="given" autocomplete="given-name" value="Jane">
      <input id="family" aria-label="Family name" autocomplete="family-name" value="Doe">
      <input id="birth" autocomplete="bday" value="1984-03-12">
    `));
    const mapped = mapPageFacts(read.facts, patient);
    expect(mapped.fields.find((field) => field.key === "first_name")?.evidence).toContain("Given name");
    expect(mapped.fields.find((field) => field.key === "last_name")?.pageValue).toBe("Doe");
    expect(mapped.fields.find((field) => field.key === "date_of_birth")?.pageValue).toBe("1984-03-12");
  });

  it("does not save an ambiguous numeric date or a date that is not there", () => {
    expect(dateCertainty("03/04/1984")).toBe("ambiguous");
    expect(isoDate("03/04/1984")).toBe("");
    expect(isoDate("15/03/1984")).toBe("1984-03-15");
    const read = readDocument(mount(`<dl><dt>Name</dt><dd>Jane Doe</dd><dt>DOB</dt><dd>03/04/1984</dd></dl>`));
    const mapped = mapPageFacts(read.facts, patient);
    const payload = allowlistedUpdate(saveFieldsFrom(mapped.fields));
    expect(payload.date_of_birth).toBeUndefined();
    expect(mapped.fields.find((field) => field.key === "date_of_birth")?.status).toBe("ambiguous");
  });

  it("refuses a mixed list until the clicked region is revalidated", () => {
    const read = readDocument(mount(MIXED));
    const mapped = mapPageFacts(read.facts, patient);
    expect(mapped.mixed).toBe(true);
    expect(detectPeople(read.facts).people.map((person) => person.name)).toEqual(["Jane Doe", "Sam Example"]);
    expect(mixedFactsUnlocked(true, false)).toBe(false);
    const jane = read.facts.find((fact) => fact.value === "Jane Doe");
    const confirmed = confirmRegion(read.facts, jane?.regionId ?? "", patient);
    expect(confirmed.ok).toBe(true);
    expect(confirmRegion(read.facts, "page", patient).ok).toBe(false);
    const sam = read.facts.find((fact) => fact.value === "Sam Example");
    expect(confirmRegion(read.facts, sam?.regionId ?? "", patient).ok).toBe(false);
  });

  it("reads an open shadow tree and reports a closed control", () => {
    document.body.innerHTML = `<input id="locked" aria-label="Home Phone" value="555" disabled>`;
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<label for="given">First Name</label><input id="given" value="Jane">`;
    document.body.append(host);
    const read = readDocument(document);
    expect(read.closedControls).toBe(1);
    expect(read.facts.some((fact) => fact.value === "Jane")).toBe(true);
    expect(read.facts.some((fact) => fact.controlId === "locked")).toBe(false);
  });

  it("counts an unreadable frame separately from a readable one", () => {
    const merged = mergeReads([readDocument(mount(CHART), 0), null]);
    expect(merged.frameErrors).toBe(1);
    expect(merged.facts.length).toBeGreaterThan(0);
  });
});

describe("picker, memory, and stale pages", () => {
  it("removes the picker overlay and listeners on cancel", () => {
    mount(`<label for="dob">Date of Birth</label><input id="dob" value="12 Mar 1984">`);
    installFieldPicker(document);
    document.getElementById("dob")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(takeFieldPick(document)?.value).toBe("12 Mar 1984");
    installFieldPicker(document);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("flor-pick-style")).toBeNull();
    document.getElementById("dob")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(takeFieldPick(document)).toBeNull();
    cancelFieldPicker(document);
  });

  it("drops a remembered layout when the form structure changes and never stores the value", () => {
    const read = readDocument(mount(`<label for="fn">First Name</label><input id="fn" name="fn" value="Jane">`));
    const mapped = mapPageFacts(read.facts, patient);
    const memory = rememberLayout({ workspaceId: patient.id, url: "https://demo.openemr.io/form?token=secret", facts: read.facts, fields: mapped.fields });
    expect(memory).toBeNull();
    expect(safePageAddress("https://user:pw@demo.openemr.io/form")).toBeNull();
    const safe = rememberLayout({ workspaceId: "11111111-1111-4111-8111-111111111111", url: "https://demo.openemr.io/demographics", facts: read.facts, fields: mapped.fields });
    expect(safe?.anchors[0]?.key).toBe("first_name");
    expect(JSON.stringify(safe)).not.toContain("Jane");
    expect(layoutDrifted(safe!, read.facts)).toBe(false);
    const changed = readDocument(mount(`<label for="fn">First Name</label><input id="other" name="other" value="Jane">`));
    expect(layoutDrifted(safe!, changed.facts)).toBe(true);
    expect(applyLayout(safe!, changed.facts, mapPageFacts(changed.facts, patient).fields).every((field) => field.pageValue !== "Jane" || field.controlId !== "fn")).toBe(true);
    expect(pageSignature(read.facts)).not.toContain("Jane");
  });

  it("rejects a stale tab before a fill would be trusted", () => {
    const lock = { tabId: 4, url: "https://demo.openemr.io/form", patientId: patient.id, workspaceId: "11111111-1111-4111-8111-111111111111", regionId: "tr#jane" };
    expect(locksMatch(lock, { ...lock, url: "https://demo.openemr.io/other" })).toBe(false);
    expect(locksMatch(lock, { ...lock, regionId: "tr#sam" })).toBe(false);
  });

  it("updates a controlled input through the native setter and reports a rerender that clears it", () => {
    document.body.innerHTML = `<label for="fn">First Name</label><input id="fn" value="">`;
    const input = document.getElementById("fn") as HTMLInputElement;
    let state = "";
    input.addEventListener("input", () => { state = input.value; });
    const written = fillDocument(document, [{ id: "fn", name: "", label: "First Name", tag: "input", value: "Jane" }]);
    expect(state).toBe("Jane");
    expect(written[0]?.changed).toBe(true);
    input.addEventListener("input", () => { input.value = ""; });
    const reset = fillDocument(document, [{ id: "fn", name: "", label: "First Name", tag: "input", value: "Janet" }]);
    expect(reset[0]?.changed).toBe(false);
    expect(reset[0]?.readBack).toBe("");
  });
});
