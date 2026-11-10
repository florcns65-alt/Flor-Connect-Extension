import { describe, expect, it } from "vitest";
import { legalStatus, missingLegalAcceptances, currentLegalVersions } from "../src/api/legal";
import {
  escapePostgrestOrValue,
  normalizeSearchQuery,
  peopleSearchExpression,
  peopleSearchQuery,
  todayAppointmentsQuery,
  SEARCH_LIMIT,
} from "../src/api/filters";
import { localDayBounds } from "../src/shared/format";
import legalVersions from "../config/legal-versions.json";

describe("legal check", () => {
  it("matches FLOR's current versions", () => {
    expect(legalVersions).toEqual({
      terms: "2026-05-02",
      privacy: "2026-08-06",
      ai_use: "2026-05-02",
      ambient_listening: "2026-05-02",
      email_ingestion: "2026-05-02",
      hipaa: "2026-05-02",
      esign: "2026-05-02",
    });
    expect(currentLegalVersions()).toEqual(legalVersions);
  });

  it("requires every current kind and version", () => {
    const current = currentLegalVersions();
    expect(missingLegalAcceptances([], current)).toEqual(Object.keys(current));
    const rows = Object.entries(current).map(([kind, version]) => ({ kind, version }));
    expect(legalStatus(rows).complete).toBe(true);
    const stale = rows.map((row) => (row.kind === "privacy" ? { ...row, version: "2020-01-01" } : row));
    expect(legalStatus(stale)).toEqual({ complete: false, missing: ["privacy"] });
  });
});

describe("query builders", () => {
  it("bounds today's appointments to the device-local day", () => {
    const now = new Date(2026, 10, 10, 16, 45, 0);
    const bounds = localDayBounds(now);
    const query = todayAppointmentsQuery("11111111-1111-4111-8111-111111111111", bounds);
    expect(query).toMatchObject({
      table: "appointments",
      columns: "id, person_id, start_time, end_time, status, appointment_type, reason",
      order: { column: "start_time", ascending: true },
    });
    expect(query.filters).toEqual([
      { op: "eq", column: "workspace_id", value: "11111111-1111-4111-8111-111111111111" },
      { op: "gte", column: "start_time", value: bounds.startUtc },
      { op: "lt", column: "start_time", value: bounds.endUtc },
    ]);
    const start = new Date(bounds.startUtc);
    const end = new Date(bounds.endUtc);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(10);
    expect(start.getDate()).toBe(10);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(11);
    expect(end.getHours()).toBe(0);
  });

  it("escapes search characters reserved by PostgREST or()", () => {
    expect(escapePostgrestOrValue("Ann, (Jr) 100%\\")).toBe("Ann\\, \\(Jr\\) 100\\%\\\\");
    const expression = peopleSearchExpression("Ann, Jr");
    expect(expression).toBe("first_name.ilike.%Ann\\, Jr%,last_name.ilike.%Ann\\, Jr%,mrn.ilike.%Ann\\, Jr%");
    expect(peopleSearchQuery("ws", "Ann, Jr")).toMatchObject({
      table: "people",
      limit: SEARCH_LIMIT,
      filters: [
        { op: "eq", column: "workspace_id", value: "ws" },
        { op: "or", expression },
      ],
    });
  });

  it("ignores queries shorter than 2 characters", () => {
    expect(normalizeSearchQuery(" ")).toBeNull();
    expect(normalizeSearchQuery("j")).toBeNull();
    expect(normalizeSearchQuery("  ja  ")).toBe("ja");
    expect(normalizeSearchQuery("x".repeat(100))?.length).toBe(80);
  });
});
