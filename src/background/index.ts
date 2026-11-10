import { createSupabaseFlorApi, asQueryClient } from "../api/supabase-flor-api";
import { createFlorClient } from "../auth/client";
import { reduceAuth, SIGNED_OUT, type AuthMachineState } from "../auth/machine";
import { completeGoogleSignIn, SignInError } from "../auth/sign-in";
import {
  chromeLocalArea,
  chromeSessionArea,
  clearAllStorage,
  createStorageAdapter,
  readWorkspaceId,
  writeWorkspaceId,
} from "../auth/storage";
import { toPublicUser } from "../auth/user";
import { FlorError } from "../shared/errors";
import { logger } from "../shared/logger";
import { handleMessage, readAuthState, type WorkerContext } from "./router";

const ALARM = "flor-session-refresh";
const config = __FLOR_CONFIG__;
const local = chromeLocalArea();
const session = chromeSessionArea();
const supabase = createFlorClient(
  { supabaseUrl: config.supabaseUrl, supabasePublishableKey: config.supabasePublishableKey },
  createStorageAdapter(local),
);
const api = createSupabaseFlorApi(asQueryClient(supabase));

let auth: AuthMachineState = SIGNED_OUT;
let authError: string | null = null;

function snapshot() {
  return readAuthState({ phase: auth.phase, user: auth.user, error: authError });
}

function broadcast(): void {
  void chrome.runtime.sendMessage({ type: "auth:changed", ...snapshot() }).catch(() => undefined);
}

async function signOutLocal(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (error) {
    logger.warn("Local sign-out reported a problem", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
  try {
    await clearAllStorage(local, session);
  } catch (error) {
    logger.warn("Clearing extension storage failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
  auth = reduceAuth(auth, { type: "SIGN_OUT" });
  authError = null;
  broadcast();
}

async function signIn() {
  if (auth.phase === "signing_in") return snapshot();
  auth = reduceAuth(auth, { type: "SIGN_IN_START" });
  authError = null;
  broadcast();
  try {
    const user = await completeGoogleSignIn({
      signInWithOAuth: (input) => supabase.auth.signInWithOAuth(input),
      exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
      getRedirectURL: (path) => chrome.identity.getRedirectURL(path),
      launchWebAuthFlow: (details) => chrome.identity.launchWebAuthFlow(details),
    });
    auth = reduceAuth(auth, { type: "SIGN_IN_SUCCESS", user });
    authError = null;
  } catch (error) {
    const cancelled = error instanceof SignInError && error.code === "cancelled";
    auth = reduceAuth(auth, cancelled ? { type: "SIGN_IN_CANCELLED" } : { type: "SIGN_IN_FAILED" });
    authError = error instanceof Error ? error.message : "We couldn't finish sign-in. Please try again.";
    logger.warn("Sign-in failed", {
      redirectNotAllowed: error instanceof SignInError ? error.redirectNotAllowed : false,
    });
  }
  broadcast();
  return snapshot();
}

async function restoreSession(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      logger.warn("Session refresh failed during startup");
      await signOutLocal();
      return;
    }
    if (!data.session) {
      auth = reduceAuth(auth, { type: "SIGN_OUT" });
      authError = null;
      return;
    }
    auth = reduceAuth(auth, { type: "SESSION_RESTORED", user: toPublicUser(data.session.user) });
    authError = null;
    broadcast();
  } catch {
    logger.warn("Session restore failed");
    await signOutLocal();
  }
}

async function refreshFromAlarm(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      if (auth.phase === "signed_in" || error) await signOutLocal();
      return;
    }
    auth = reduceAuth(auth, { type: "REFRESH_OK", user: toPublicUser(data.session.user) });
    broadcast();
  } catch {
    logger.warn("Scheduled session refresh failed");
    await signOutLocal();
  }
}

function requireUser() {
  if (auth.phase !== "signed_in" || !auth.user) {
    throw new FlorError("signed_out", "Please sign in again.");
  }
  return auth.user;
}

const context: WorkerContext = {
  getAuth: snapshot,
  signIn,
  signOut: async () => {
    await signOutLocal();
    return snapshot();
  },
  invalidateSession: signOutLocal,
  getWorkspaceId: () => readWorkspaceId(local),
  setWorkspaceId: (id) => writeWorkspaceId(local, id),
  openFlor: async () => {
    const url = `${config.florOrigin.replace(/\/$/, "")}/`;
    await chrome.tabs.create({ url });
  },
  api,
  requireUser,
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(context, message).then(sendResponse);
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void refreshFromAlarm();
});

function ensureAlarm(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.alarms.get(ALARM, (existing) => {
      const message = chrome.runtime.lastError?.message;
      if (message) {
        reject(new Error(message));
        return;
      }
      if (existing?.periodInMinutes === 10) {
        resolve();
        return;
      }
      chrome.alarms.create(ALARM, { periodInMinutes: 10 });
      resolve();
    });
  });
}

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  logger.warn("Could not set side panel behavior");
});

void ensureAlarm().catch(() => {
  logger.warn("Could not schedule session refresh");
});

void restoreSession();
