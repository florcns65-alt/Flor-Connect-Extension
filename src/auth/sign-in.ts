import { EXTENSION_ID } from "../../config/extension-key";
import { toPublicUser, type RawAuthUser } from "./user";
import type { PublicUser } from "../shared/types";

export type SignInFailureCode = "cancelled" | "missing_code" | "oauth_error" | "exchange_failed" | "no_url";

export class SignInError extends Error {
  readonly code: SignInFailureCode;
  readonly redirectNotAllowed: boolean;

  constructor(code: SignInFailureCode, message: string, redirectNotAllowed = false) {
    super(message);
    this.name = "SignInError";
    this.code = code;
    this.redirectNotAllowed = redirectNotAllowed;
  }
}

export interface GoogleSignInDeps {
  signInWithOAuth(input: {
    provider: "google";
    options: {
      redirectTo: string;
      skipBrowserRedirect: true;
      queryParams: { prompt: "select_account" };
    };
  }): Promise<{ data: { url: string | null } | null; error: { message: string } | null }>;
  launchWebAuthFlow(input: { url: string; interactive: true }): Promise<string | undefined>;
  exchangeCodeForSession(code: string): Promise<{
    data: { session: { user: RawAuthUser } | null; user: RawAuthUser | null };
    error: { message: string } | null;
  }>;
  getRedirectURL(path: string): string;
}

function isCancelMessage(message: string): boolean {
  return /did not approve|user closed|window closed|canceled|cancelled|access_denied/i.test(message);
}

export function isRedirectNotAllowed(message: string): boolean {
  return /redirect/i.test(message) && /not allowed|invalid|mismatch|denied/i.test(message);
}

function friendlyOAuth(message: string): string {
  if (isRedirectNotAllowed(message)) {
    return `Supabase says the redirect is not allowed. Add https://${EXTENSION_ID}.chromiumapp.org/** to the project's redirect URLs.`;
  }
  if (/network|fetch|offline/i.test(message)) {
    return "We couldn't reach FLOR. Check your connection and try again.";
  }
  return "We couldn't finish sign-in. Please try again.";
}

export async function completeGoogleSignIn(deps: GoogleSignInDeps): Promise<PublicUser> {
  const redirectTo = deps.getRedirectURL("auth");
  const started = await deps.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (started.error) {
    throw new SignInError("oauth_error", friendlyOAuth(started.error.message), isRedirectNotAllowed(started.error.message));
  }
  const url = started.data?.url;
  if (!url) {
    throw new SignInError("no_url", "We couldn't start Google sign-in. Please try again.");
  }

  let result: string | undefined;
  try {
    result = await deps.launchWebAuthFlow({ url, interactive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in was cancelled.";
    if (isCancelMessage(message)) {
      throw new SignInError("cancelled", "Sign-in was cancelled. You can try again when you're ready.");
    }
    throw new SignInError("oauth_error", friendlyOAuth(message), isRedirectNotAllowed(message));
  }

  if (!result) {
    throw new SignInError("cancelled", "Sign-in was cancelled. You can try again when you're ready.");
  }

  const returned = new URL(result);
  const oauthError = returned.searchParams.get("error");
  if (oauthError) {
    const description = returned.searchParams.get("error_description") ?? oauthError;
    if (oauthError === "access_denied" || isCancelMessage(description)) {
      throw new SignInError("cancelled", "Sign-in was cancelled. You can try again when you're ready.");
    }
    throw new SignInError("oauth_error", friendlyOAuth(description), isRedirectNotAllowed(description));
  }

  const code = returned.searchParams.get("code");
  if (!code) {
    throw new SignInError("missing_code", "We couldn't finish sign-in. Please try again.");
  }

  const exchanged = await deps.exchangeCodeForSession(code);
  if (exchanged.error || (!exchanged.data.user && !exchanged.data.session?.user)) {
    const message = exchanged.error?.message ?? "We couldn't finish sign-in. Please try again.";
    throw new SignInError("exchange_failed", friendlyOAuth(message), isRedirectNotAllowed(message));
  }
  const user = exchanged.data.user ?? exchanged.data.session?.user;
  if (!user) {
    throw new SignInError("exchange_failed", "We couldn't finish sign-in. Please try again.");
  }
  return toPublicUser(user);
}
