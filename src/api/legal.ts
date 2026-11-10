import versions from "../../config/legal-versions.json";
import type { LegalStatus } from "../shared/types";

export interface LegalAcceptance {
  kind: string;
  version: string;
}

export function currentLegalVersions(): Record<string, string> {
  return { ...versions };
}

export function missingLegalAcceptances(
  rows: LegalAcceptance[],
  current: Record<string, string> = currentLegalVersions(),
): string[] {
  return Object.entries(current)
    .filter(([kind, version]) => !rows.some((row) => row.kind === kind && row.version === version))
    .map(([kind]) => kind);
}

export function legalStatus(rows: LegalAcceptance[], current?: Record<string, string>): LegalStatus {
  const missing = missingLegalAcceptances(rows, current);
  return { complete: missing.length === 0, missing };
}
