import type { PublicUser } from "../shared/types";

export type AuthPhase = "signed_out" | "signing_in" | "signed_in";

export interface AuthMachineState {
  phase: AuthPhase;
  user: PublicUser | null;
}

export type AuthEvent =
  | { type: "SIGN_IN_START" }
  | { type: "SIGN_IN_SUCCESS"; user: PublicUser }
  | { type: "SIGN_IN_CANCELLED" }
  | { type: "SIGN_IN_FAILED" }
  | { type: "SESSION_RESTORED"; user: PublicUser }
  | { type: "REFRESH_OK"; user: PublicUser }
  | { type: "REFRESH_FAIL" }
  | { type: "SIGN_OUT" };

export const SIGNED_OUT: AuthMachineState = { phase: "signed_out", user: null };

export function reduceAuth(state: AuthMachineState, event: AuthEvent): AuthMachineState {
  switch (event.type) {
    case "SIGN_IN_START":
      return { phase: "signing_in", user: null };
    case "SIGN_IN_SUCCESS":
    case "SESSION_RESTORED":
    case "REFRESH_OK":
      return { phase: "signed_in", user: event.user };
    case "SIGN_IN_CANCELLED":
    case "SIGN_IN_FAILED":
    case "REFRESH_FAIL":
    case "SIGN_OUT":
      return SIGNED_OUT;
    default:
      return state;
  }
}
