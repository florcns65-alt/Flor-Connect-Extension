import type { PersonSummary } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function blankToNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function personDisplayName(person: Pick<PersonSummary, "firstName" | "lastName" | "name">): string {
  const joined = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
  return joined || person.name || "Unnamed patient";
}

export function personInitials(value: string): string {
  const local = value.replace(/@.*/, "");
  const parts = local.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function formatDob(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatSex(value: string | null): string {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    f: "Female",
    m: "Male",
    female: "Female",
    male: "Male",
    other: "Other",
    unknown: "Unknown",
  };
  return labels[normalized] ?? value.trim();
}

export function formatAddress(parts: {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}): string {
  const cityLine = [parts.city, parts.state].filter(Boolean).join(", ");
  const locality = [cityLine, parts.postalCode].filter(Boolean).join(" ");
  return [parts.addressLine1, locality].filter(Boolean).join(", ");
}

export function formatInsurance(payer: string | null, memberId: string | null): string {
  if (payer && memberId) return `${payer} · ${memberId}`;
  return payer || memberId || "";
}

export function greeting(now: Date, name: string | null): string {
  const hour = now.getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  if (!name) return hello;
  const first = name.trim().split(/\s+/)[0];
  return first ? `${hello}, ${first}` : hello;
}

export function roleLabel(role: string): string {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function localDayBounds(now = new Date()): { startUtc: string; endUtc: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export function isFinishedStatus(status: string | null): boolean {
  if (!status) return false;
  return /^(completed|complete|done|fulfilled|checked_out)$/i.test(status);
}
