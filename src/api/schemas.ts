import { z } from "zod";
import { FlorError } from "../shared/errors";
import { logger } from "../shared/logger";
import { ROLES } from "../shared/types";

export const LegalRowSchema = z.object({
  kind: z.string(),
  version: z.string(),
});

export const LegalRowsSchema = z.array(LegalRowSchema);

const embeddedWorkspace = z.object({
  id: z.string(),
  name: z.string(),
});

export const WorkspaceRowSchema = z.object({
  workspace_id: z.string(),
  role: z.enum(ROLES),
  workspaces: z.union([embeddedWorkspace, z.array(embeddedWorkspace), z.null()]).optional(),
});

export const WorkspaceRowsSchema = z.array(WorkspaceRowSchema);

export const AppointmentRowSchema = z.object({
  id: z.string(),
  person_id: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  appointment_type: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});

export const AppointmentRowsSchema = z.array(AppointmentRowSchema);

export const PersonRowSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  middle_name: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
  mrn: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  insurance_payer: z.string().nullable().optional(),
  insurance_member_id: z.string().nullable().optional(),
});

export const PersonRowsSchema = z.array(PersonRowSchema);

export type LegalRow = z.infer<typeof LegalRowSchema>;
export type WorkspaceRow = z.infer<typeof WorkspaceRowSchema>;
export type AppointmentRow = z.infer<typeof AppointmentRowSchema>;
export type PersonRow = z.infer<typeof PersonRowSchema>;

export function parseWithSchema<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.warn("Response did not match the expected shape");
    throw new FlorError("server", "FLOR returned something we couldn't read. Please try again.");
  }
  return result.data;
}
