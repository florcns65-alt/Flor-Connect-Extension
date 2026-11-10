# Publishing FLOR Connect to the Chrome Web Store

This uploads a **store build** of FLOR Connect to the existing listing `lkjfhjkgfbonfnlchglghoialgiipbid` (the live placeholder, version 1.1.1). The workflow does not run on a pull request. Nothing is sent to Google until you start it.

A store build is `npm run build:store`. It leaves out the manifest `key`, so Chrome keeps the store item's own id. The unpacked build keeps that key and stays `bmjkikhmfmaieahonelaljfkeapiflah`. Do not upload an unpacked zip to this listing.

The package version has to be higher than 1.1.1, and higher than whatever is already published or sitting in review. `2.1.0` is the current version and passes that check against 1.1.1.

## What you set up once

You need the Google account that owns the Chrome Web Store item, and admin access to this GitHub repo.

### 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project, or pick one that is only for this upload. It does not have to be the FLOR production project.
2. Search for **Chrome Web Store API** and enable it.
3. Open **OAuth consent screen**. Choose **External**.
4. Fill in the app name, a support email, and a developer contact email. Save.
5. On the scopes step, continue without adding anything there.
6. Add the Google account that owns the store item as a **test user**. Save.

### 2. OAuth client

1. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorized redirect URIs**, add `https://developers.google.com/oauthplayground`.
4. Create it. Copy the client id and the client secret. You will put them in GitHub. Do not commit them and do not paste them into a pull request.

### 3. Refresh token

1. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Click the gear icon and check **Use your own OAuth credentials**. Enter the client id and client secret from the previous step.
3. In the scope box, enter exactly `https://www.googleapis.com/auth/chromewebstore`.
4. Click **Authorize APIs**. Sign in as the account that **owns the store item**. That can be a different Google account from the one that created the Cloud project.
5. Click **Exchange authorization code for tokens**.
6. Copy the **refresh token** only. The access token expires in about an hour. The workflow asks Google for a new access token each run.

If Google says the token was rejected later, repeat this step and replace the secret.

### 4. Publisher id and item id

The upload API needs both ids in the URL.

- **Item id:** `lkjfhjkgfbonfnlchglghoialgiipbid`. It is also on the item's Package page in the [developer dashboard](https://chrome.google.com/webstore/devconsole).
- **Publisher id:** in the same dashboard, open **Account → Settings**. Copy the publisher id shown there. If you belong to more than one publisher, switch to the one that owns this item first.

### 5. GitHub environment

1. In this repo, open **Settings → Environments → New environment**.
2. Name it exactly `chrome-web-store`.
3. Turn on **Required reviewers** and add yourself (or whoever should approve a publish). A run waits there until that person approves it. That is the gate in front of the upload.
4. Add these **environment secrets**. Do not add them as plain repository variables, and do not echo them in the workflow log.

| Secret | What to paste |
| --- | --- |
| `CWS_CLIENT_ID` | OAuth client id |
| `CWS_CLIENT_SECRET` | OAuth client secret |
| `CWS_REFRESH_TOKEN` | Refresh token from the playground |
| `CWS_EXTENSION_ID` | `lkjfhjkgfbonfnlchglghoialgiipbid` |
| `CWS_PUBLISHER_ID` | Publisher id from the dashboard |
| `FLOR_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key. Not the service-role key. |

`CWS_PUBLISHER_ID` is required because the current Chrome Web Store API (v2) puts the publisher id in every URL. The older v1.1 API, which did not need it, was scheduled to stop on 15 October 2026.

The workflow reads the secrets from the environment and passes them to the script. The script does not print them. If Google sends one of them back in an error, the script replaces it before the error is shown.

## Run it

1. Open **Actions → Publish to Chrome Web Store → Run workflow**.
2. Choose the branch or, in **tag**, type a tag such as `v2.0.0`. A tag must start with `v`. Leave tag empty to build the branch you selected.
3. **profile**
   - `prod` (the default) bakes in `https://florcns.com`.
   - `preview` bakes in the preview Cloud Run origin.
4. **publish_target**
   - `draft-only` (the default) uploads the zip and stops. The new package sits as a draft in the dashboard. This is the right first run.
   - `trustedTesters` also submits that draft for review. API v2 does not take a separate "trusted testers" switch. It publishes to the visibility already saved on the item. Set the listing to trusted testers in the dashboard, and publish once by hand with that visibility, before using this choice. Google requires that one manual publish after a visibility change.
   - `default` submits the draft for review toward the item's saved visibility. Use this only after the checklist below is done and you mean to send 2.0.0 for public review.
5. Approve the environment prompt when GitHub asks. The job then installs, typechecks, lints, tests, builds with `--store`, zips, writes a SHA256, and uploads the zip as an artifact named `flor-connect-store-<run id>`.
6. Pushing a tag `v*` starts the same workflow. A tag run uses `prod` and `draft-only`. It still waits for environment approval. It does not publish to the public by itself.

The script refuses the upload when `manifest.json` still contains `key`, when the version is 1.1.1 or lower, or when the version is not higher than the highest version already published or submitted on the item.

You can check a zip locally, with no Google credentials:

```bash
export FLOR_SUPABASE_PUBLISHABLE_KEY="publishable-anon-key"
npm run package:store
node --experimental-strip-types scripts/webstore-cli.ts --check dist-zip/flor-connect-2.1.0.zip
```

That command does not upload.

## Before 2.0.0 goes public

Do this in the developer dashboard on item `lkjfhjkgfbonfnlchglghoialgiipbid` before you choose `publish_target: default`. The API cannot fill these in.

- [ ] **Privacy policy URL.** Use the public FLOR privacy policy, the same one a clinic sees on florcns.com. The old placeholder text has to come off the listing.
- [ ] **Single purpose.** One sentence, for example: "Shows a signed-in clinician today's FLOR patients in the Chrome side panel."
- [ ] **Permission justifications.** Suggested wording, edit it so it matches what you ship:
  - **sidePanel** — The whole product is the side panel. The clinician opens it from the toolbar.
  - **storage** — Saves the Google sign-in session and the chosen clinic id on this computer. Patient names and chart fields are not written to disk.
  - **identity** — Signs the clinician in with Google. The extension does not read any other account.
  - **alarms** — Wakes every 10 minutes to refresh the sign-in session.
  - **scripting** — Reserved for a later version that reads or fills a page only after the clinician presses a button. Version 2.0.0 does not inject a script. The Fill button is disabled. If review rejects this as unused, remove it from the store manifest and add it when that feature ships.
  - **activeTab** — Reserved for that same later click. Version 2.0.0 does not read the open page. Same note as scripting.
  - **Optional host permission `https://*/*`** — Not granted at install. A later version asks once, when the clinician chooses to add a site. Say that it is optional and off until then.
- [ ] **Data-use / health disclosures.** Say that the panel shows health information the clinic already keeps in FLOR (name, date of birth, MRN, phone, address, insurance) so the clinician can see who they are seeing today. It is not sold, not used for advertising, not used to decide credit, and not sent to an analytics service. There is no analytics. It stays in memory for the open panel and is not written to `chrome.storage`.
- [ ] **Screenshots and description** still match this version. The read and fill screens are not in 2.0.0. Do not describe them as working.
- [ ] You have run **draft-only** once and looked at the draft in the dashboard before submitting it for public review.

This repository does not contain a real client secret, refresh token, or publishable key, and this change does not upload a package.
