import { describe, expect, it, vi } from "vitest";
import { reduceAuth, SIGNED_OUT } from "../src/auth/machine";
import { completeGoogleSignIn, SignInError } from "../src/auth/sign-in";
import { toPublicUser } from "../src/auth/user";
import { supabaseAuthOptions } from "../src/auth/client";
import { createMemoryArea, createStorageAdapter } from "../src/auth/storage";
import type { PublicUser } from "../src/shared/types";

const user: PublicUser = {
  id: "44444444-4444-4444-8444-444444444444",
  email: "clinician@example.com",
  name: "Chioma Okoli",
};

describe("auth state machine", () => {
  it("moves signed-out → signing-in → signed-in → refresh fail → signed-out", () => {
    let state = SIGNED_OUT;
    state = reduceAuth(state, { type: "SIGN_IN_START" });
    expect(state.phase).toBe("signing_in");
    state = reduceAuth(state, { type: "SIGN_IN_SUCCESS", user });
    expect(state).toEqual({ phase: "signed_in", user });
    state = reduceAuth(state, { type: "REFRESH_OK", user });
    expect(state.phase).toBe("signed_in");
    state = reduceAuth(state, { type: "REFRESH_FAIL" });
    expect(state).toEqual({ phase: "signed_out", user: null });
  });

  it("returns to signed-out when sign-in is cancelled and when the user signs out", () => {
    const signingIn = reduceAuth(SIGNED_OUT, { type: "SIGN_IN_START" });
    expect(reduceAuth(signingIn, { type: "SIGN_IN_CANCELLED" }).phase).toBe("signed_out");
    const signedIn = reduceAuth(SIGNED_OUT, { type: "SESSION_RESTORED", user });
    expect(reduceAuth(signedIn, { type: "SIGN_OUT" })).toEqual(SIGNED_OUT);
  });
});

describe("public user", () => {
  it("keeps only id, email, and name", () => {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signaturevalue";
    const raw = {
      id: user.id,
      email: user.email,
      access_token: token,
      refresh_token: "refresh-token-value",
      user_metadata: { full_name: "Chioma Okoli", name: "Chioma" },
    };
    const pub = toPublicUser(raw);
    expect(pub).toEqual(user);
    expect(JSON.stringify(pub)).not.toContain(token);
    expect(JSON.stringify(pub)).not.toContain("refresh-token-value");
  });
});

describe("supabase auth options", () => {
  it("uses PKCE, persistent storage, and no URL session detection", () => {
    const storage = createStorageAdapter(createMemoryArea());
    expect(supabaseAuthOptions(storage)).toMatchObject({
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage,
    });
  });
});

describe("Google sign-in", () => {
  const redirectTo = "https://bmjkikhmfmaieahonelaljfkeapiflah.chromiumapp.org/auth";

  function deps(overrides: Partial<Parameters<typeof completeGoogleSignIn>[0]> = {}) {
    return {
      getRedirectURL: vi.fn(() => redirectTo),
      signInWithOAuth: vi.fn(async () => ({ data: { url: "https://accounts.example/oauth" }, error: null })),
      launchWebAuthFlow: vi.fn(async () => `${redirectTo}?code=auth-code-123`),
      exchangeCodeForSession: vi.fn(async () => ({
        data: { session: { user: { id: user.id, email: user.email, user_metadata: { full_name: user.name } } }, user: null },
        error: null,
      })),
      ...overrides,
    };
  }

  it("starts Google PKCE with the extension redirect and exchanges the code", async () => {
    const client = deps();
    await expect(completeGoogleSignIn(client)).resolves.toEqual(user);
    expect(client.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    expect(client.launchWebAuthFlow).toHaveBeenCalledWith({ url: "https://accounts.example/oauth", interactive: true });
    expect(client.exchangeCodeForSession).toHaveBeenCalledWith("auth-code-123");
  });

  it("explains a closed window without exchanging a code", async () => {
    const client = deps({
      launchWebAuthFlow: vi.fn(async () => {
        throw new Error("The user did not approve access.");
      }),
    });
    await expect(completeGoogleSignIn(client)).rejects.toMatchObject({ code: "cancelled" });
    expect(client.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("reports a missing code", async () => {
    const client = deps({ launchWebAuthFlow: vi.fn(async () => redirectTo) });
    await expect(completeGoogleSignIn(client)).rejects.toBeInstanceOf(SignInError);
    await expect(completeGoogleSignIn(client)).rejects.toMatchObject({ code: "missing_code" });
  });

  it("reports a redirect that Supabase did not allow, without changing the flow", async () => {
    const client = deps({
      launchWebAuthFlow: vi.fn(async () => `${redirectTo}?error=invalid_request&error_description=redirect+not+allowed`),
    });
    const error = await completeGoogleSignIn(client).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(SignInError);
    expect(error).toMatchObject({ redirectNotAllowed: true });
    expect((error as SignInError).message.toLowerCase()).toContain("not allowed");
    expect(client.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
