import { describe, expect, it, vi } from "vitest";
import { createSupabaseFlorApi } from "../src/api/supabase-flor-api";
import type { QueryClient, QueryResult } from "../src/api/query";
import { mapPostgrestError } from "../src/api/map-error";
import { parseWithSchema, PersonRowSchema } from "../src/api/schemas";
import { FlorError } from "../src/shared/errors";
import { fetchWithTimeoutAndRetry } from "../src/api/fetch";

const WS = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const APPT = "33333333-3333-4333-8333-333333333333";

function client(handler: (table: string, trace: string[]) => unknown): { client: QueryClient; traces: string[][] } {
  const traces: string[][] = [];
  return {
    traces,
    client: {
      from(table: string) {
        const trace: string[] = [table];
        traces.push(trace);
        const chain = {
          select(columns: string) {
            trace.push(`select:${columns}`);
            return chain;
          },
          eq(column: string, value: string) {
            trace.push(`eq:${column}:${value}`);
            return chain;
          },
          gte(column: string, value: string) {
            trace.push(`gte:${column}:${value}`);
            return chain;
          },
          lt(column: string, value: string) {
            trace.push(`lt:${column}:${value}`);
            return chain;
          },
          in(column: string, values: string[]) {
            trace.push(`in:${column}:${values.join("|")}`);
            return chain;
          },
          or(expression: string) {
            trace.push(`or:${expression}`);
            return chain;
          },
          order(column: string) {
            trace.push(`order:${column}`);
            return chain;
          },
          limit(count: number) {
            trace.push(`limit:${count}`);
            return chain;
          },
          range(from: number, to: number) {
            trace.push(`range:${from}-${to}`);
            return chain;
          },
          single() {
            return Promise.resolve({ data: handler(table, trace), error: null });
          },
          then(onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) {
            return Promise.resolve({ data: handler(table, trace), error: null }).then(onFulfilled, onRejected);
          },
        };
        return { select: (columns: string) => chain.select(columns) };
      },
    } as QueryClient,
  };
}

describe("FlorApi", () => {
  it("does not search until the query has 2 characters", async () => {
    const fake = client(() => {
      throw new Error("should not query");
    });
    const api = createSupabaseFlorApi(fake.client);
    await expect(api.searchPeople(WS, "j")).resolves.toEqual({ people: [], total: 0, offset: 0, limit: 50 });
    expect(fake.traces).toHaveLength(0);
  });

  it("loads today's appointments and the matching people", async () => {
    const fake = client((table) => {
      if (table === "appointments") {
        return [
          {
            id: APPT,
            person_id: PERSON,
            start_time: "2026-11-10T21:30:00.000Z",
            end_time: null,
            status: "scheduled",
            appointment_type: "Follow-up",
            reason: null,
          },
        ];
      }
      return [
        {
          id: PERSON,
          first_name: "Jane",
          last_name: "Doe",
          name: null,
          date_of_birth: "1984-03-12",
          sex: "female",
          mrn: "10428",
        },
      ];
    });
    const api = createSupabaseFlorApi(fake.client);
    const rows = await api.listTodayAppointments(WS, {
      startUtc: "2026-11-10T05:00:00.000Z",
      endUtc: "2026-11-11T05:00:00.000Z",
    });
    expect(rows[0]?.person?.firstName).toBe("Jane");
    expect(rows[0]?.appointmentType).toBe("Follow-up");
    expect(fake.traces[0]).toContain("eq:workspace_id:" + WS);
    expect(fake.traces[1]?.some((line) => line.startsWith("in:id:"))).toBe(true);
  });

  it("escapes a search before sending the or() filter", async () => {
    const fake = client(() => []);
    const api = createSupabaseFlorApi(fake.client);
    await api.searchPeople(WS, "Ann, Jr");
    expect(fake.traces[0].join("\n")).toContain("first_name.ilike.%Ann\\, Jr%");
    expect(fake.traces[0].join("\n")).toContain("mrn.ilike.%Ann\\, Jr%");
    expect(fake.traces[0]).toContain("range:0-49");
    expect(fake.traces[0]).toContain("order:last_name");
  });
});

describe("response parsing", () => {
  it("does not echo a bad payload", () => {
    expect(() => parseWithSchema(PersonRowSchema, { first_name: "Jane Doe", mrn: "10428" })).toThrow(FlorError);
  });

  it("maps an expired JWT to signed-out without using the raw message as the UI text", () => {
    const error = mapPostgrestError({
      status: 401,
      message: "JWT expired eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
    });
    expect(error.code).toBe("signed_out");
    expect(error.message).not.toContain("eyJ");
  });
});

describe("fetch", () => {
  it("retries a network failure once and does not retry HTTP 400", async () => {
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        return new Response("ok", { status: 200 });
      }),
    );
    const response = await fetchWithTimeoutAndRetry("https://example.test/read");
    expect(response.status).toBe(200);
    expect(attempts).toBe(2);

    attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempts += 1;
        return new Response("no", { status: 400 });
      }),
    );
    const rejected = await fetchWithTimeoutAndRetry("https://example.test/no");
    expect(rejected.status).toBe(400);
    expect(attempts).toBe(1);
    vi.unstubAllGlobals();
  });
});
