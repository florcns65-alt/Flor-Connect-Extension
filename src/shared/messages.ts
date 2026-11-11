import { z } from "zod";
import { ERROR_CODES, type ErrorCode } from "./errors";
import { ROLES } from "./types";

export const PublicUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string().nullable(),
  })
  .strict();

export const AuthStateSchema = z
  .object({
    phase: z.enum(["signed_out", "signing_in", "signed_in"]),
    user: PublicUserSchema.nullable(),
    error: z.string().nullable(),
  })
  .strict();

export type AuthStateMessage = z.infer<typeof AuthStateSchema>;

const WorkspaceSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    role: z.enum(ROLES),
  })
  .strict();

export const BootstrapSchema = z
  .object({
    legal: z
      .object({
        complete: z.boolean(),
        missing: z.array(z.string()),
      })
      .strict(),
    workspaces: z.array(WorkspaceSchema),
    workspaceId: z.string().uuid().nullable(),
  })
  .strict();

const PersonSummarySchema = z
  .object({
    id: z.string().uuid(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    name: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    sex: z.string().nullable(),
    mrn: z.string().nullable(),
  })
  .strict();

export const PersonDetailSchema = PersonSummarySchema.extend({
  middleName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  addressLine1: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  insurancePayer: z.string().nullable(),
  insuranceMemberId: z.string().nullable(),
}).strict();

export const AppointmentsSchema = z.array(
  z
    .object({
      id: z.string().uuid(),
      startTime: z.string(),
      endTime: z.string().nullable(),
      status: z.string().nullable(),
      appointmentType: z.string().nullable(),
      reason: z.string().nullable(),
      person: PersonSummarySchema.nullable(),
    })
    .strict(),
);

export const PeopleSchema = z.array(PersonSummarySchema);

const AppointmentSnippetSchema = z
  .object({
    id: z.string().uuid(),
    startTime: z.string(),
    endTime: z.string().nullable(),
    status: z.string().nullable(),
    appointmentType: z.string().nullable(),
  })
  .strict();

export const PeoplePageSchema = z
  .object({
    people: z.array(PersonSummarySchema.extend({ appointment: AppointmentSnippetSchema.nullable() }).strict()),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
  })
  .strict();

export const DemographicUpdateSchema = z
  .object({
    first_name: z.string().max(80).optional(),
    last_name: z.string().max(80).optional(),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sex: z.string().max(40).optional(),
    mrn: z.string().max(64).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().max(120).optional(),
    address_line1: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    state: z.string().max(40).optional(),
    postal_code: z.string().max(20).optional(),
  })
  .strict();

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const CreatePatientFieldsSchema = z
  .object({
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    date_of_birth: z.string().refine(validDateOnly, "Enter a valid date of birth.").optional(),
    sex: z.string().trim().max(40).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().max(120).email().optional(),
    address_line1: z.string().trim().max(160).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(40).optional(),
    postal_code: z.string().trim().max(20).optional(),
  })
  .strict();

export type CreatePatientFields = z.infer<typeof CreatePatientFieldsSchema>;

export const PersonChartSchema = z
  .object({
    person: PersonDetailSchema,
    upcoming: z.array(AppointmentSnippetSchema),
    recent: z.array(AppointmentSnippetSchema),
  })
  .strict();

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth:getState") }).strict(),
  z.object({ type: z.literal("meta:version") }).strict(),
  z.object({ type: z.literal("auth:signIn") }).strict(),
  z.object({ type: z.literal("auth:signOut") }).strict(),
  z.object({ type: z.literal("flor:open") }).strict(),
  z.object({ type: z.literal("data:bootstrap") }).strict(),
  z.object({ type: z.literal("data:appointments"), workspaceId: z.string().uuid() }).strict(),
  z.object({
    type: z.literal("data:people"),
    workspaceId: z.string().uuid(),
    offset: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({
    type: z.literal("data:search"),
    workspaceId: z.string().uuid(),
    query: z.string().max(80),
    offset: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({
    type: z.literal("data:patient"),
    workspaceId: z.string().uuid(),
    personId: z.string().uuid(),
  }).strict(),
  z.object({
    type: z.literal("data:updatePerson"),
    workspaceId: z.string().uuid(),
    personId: z.string().uuid(),
    fields: DemographicUpdateSchema,
  }).strict(),
  z.object({
    type: z.literal("data:createPatient"),
    workspaceId: z.string().uuid(),
    fields: CreatePatientFieldsSchema,
  }).strict(),
  z.object({ type: z.literal("workspace:set"), workspaceId: z.string().uuid() }).strict(),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const EnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum(ERROR_CODES),
          message: z.string(),
        })
        .strict(),
    })
    .strict(),
]);

export type Envelope = z.infer<typeof EnvelopeSchema>;

export function ok(data: unknown): Envelope {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string): Envelope {
  return { ok: false, error: { code, message } };
}
