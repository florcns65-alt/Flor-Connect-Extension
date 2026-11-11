# Milestone 1 manual test

The cloud agent did **not** complete a live Google sign-in. There is no FLOR test account in this environment. Unit tests cover the auth state machine, the PKCE hand-off, legal gating, query building, and log redaction. Use this list on a machine where you can sign in.

## Before you start

1. In Supabase project `wbxzevwfxizfjtxrarjq` → Authentication → URL Configuration → Redirect URLs, allow:
   `https://bmjkikhmfmaieahonelaljfkeapiflah.chromiumapp.org/**`
   This URL is already allowed. If sign-in says the redirect is not allowed, stop and check that setting. Do not change the extension to work around it.
2. Copy the project **publishable (anon)** key from Supabase → Project Settings → API Keys. Do not use the service-role key.
3. Build and load:

```bash
export FLOR_SUPABASE_PUBLISHABLE_KEY="the-publishable-anon-key"
npm ci
npm run build
```

4. Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select the `dist` folder.
5. Confirm the extension id is `bmjkikhmfmaieahonelaljfkeapiflah` and the name is FLOR Connect 2.7.0.

`npm run build` uses the preview FLOR origin (`https://florcns-preview-onbk3fadxa-ue.a.run.app`). For a production-origin build later, set `FLOR_PROFILE=prod` as well. `npm run build:store` omits the manifest `key`, so that package will not keep this extension id.

## Sign in

1. Click the toolbar icon. The side panel opens on the welcome screen.
2. Choose **Continue with Google**. A Google account chooser opens. Pick a FLOR account that has finished the in-app agreements.
3. The panel leaves the welcome screen. It does not ask you to paste a code.
4. Close the Google window instead. The panel stays on welcome and says sign-in was cancelled.
5. Open Settings. The signed-in email is the Google account. The version is 2.7.0.

## Legal gate

1. Sign in with an account that has not accepted the current FLOR agreements.
2. The panel shows **Finish your FLOR setup** and does not show today's patients or search results.
3. **Finish your FLOR setup** opens the FLOR site in a new tab.
4. After accepting on the site, choose **I've done it — check again**. The patient screens appear only after the check passes.

## Workspace

1. An account with one workspace goes straight to Home. The workspace name is in the header.
2. An account with more than one workspace sees **Choose a workspace**, each with a role chip (owner, admin, clinician, staff, viewer, or billing).
3. Pick one. Close the panel and open it again. The same workspace is still selected.
4. Use the workspace name in the header to switch. Today's list reloads. The previous patient's details are gone.

## Today, search, and the patient

1. Home shows **Today's patients** for the clinic's local calendar day: time, name, and date of birth.
2. If the day has no appointments, the card says **No appointments today**.
3. **Fill this page** is disabled and marked **Coming soon**.
4. In **Who are you seeing?**, one letter does nothing. Two letters, after a short pause, search first name, last name, and MRN (at most 25 people).
5. Open a person. The page shows name, date of birth, sex, MRN, phone, email, address, and insurance. **Back** returns to the list.
6. The Patients tab shows the same day and any people you opened in this panel session. Those "Recent" names disappear when the panel is closed. They are not written to disk.

## Session and sign-out

1. Close Chrome completely and open it again. Open the panel. You are still signed in.
2. Leave Chrome idle for more than an hour, then open the panel again. You are still signed in, or you are back on the welcome screen if refresh failed.
3. Turn the network off. The panel says you are offline and offers **Try again**. It does not invent patient data.
4. Choose **Sign out**. The welcome screen returns.
5. In DevTools on the service worker, `chrome.storage.local.get(null, console.log)` and `chrome.storage.session.get(null, console.log)` are both empty.
6. Watch the service worker console during sign-in, search, and opening a patient. It must not print an access token, a refresh token, an email address, or a patient name, date of birth, MRN, phone, or address.

## Package

```bash
export FLOR_SUPABASE_PUBLISHABLE_KEY="the-publishable-anon-key"
npm run package
```

`dist-zip/flor-connect-2.7.0.zip` and `dist-zip/flor-connect-2.7.0.zip.sha256` are written. Loading that unpacked zip (unzipped) shows the same extension id.
