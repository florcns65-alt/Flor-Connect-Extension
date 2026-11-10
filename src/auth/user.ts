import type { PublicUser } from "../shared/types";

export interface RawAuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export function toPublicUser(user: RawAuthUser): PublicUser {
  const meta = user.user_metadata ?? {};
  const candidate = meta.full_name ?? meta.name;
  const name = typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
  return {
    id: user.id,
    email: user.email ?? "",
    name,
  };
}
