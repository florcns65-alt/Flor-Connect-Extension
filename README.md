# FLOR Connect

FLOR Connect is a Chrome side panel (Manifest V3) for a clinician who already uses FLOR. Milestone 1 signs in with Google through Supabase, checks the current legal agreements, lets you pick a workspace, and shows today's appointments plus a patient search. It is read-only.

Nothing on an EHR page is read or filled yet. Those steps are later milestones. `src/engine` is reserved for them.

## What you need

- Chrome 116 or newer
- The Supabase **publishable (anon)** key for project `wbxzevwfxizfjtxrarjq`
- This redirect URL allowed in that project's Auth URL configuration (it already is):

`https://bmjkikhmfmaieahonelaljfkeapiflah.chromiumapp.org/**`

Do not put a service-role key in the extension. The key is injected at build time and is not committed.

## Config

| File | What it holds |
| --- | --- |
| `config/preview.json` | Supabase URL, publishable-key placeholder, preview FLOR origin |
| `config/prod.json` | Same Supabase project, production origin `https://florcns.com` |
| `config/legal-versions.json` | The seven agreement versions the panel compares with `legal_acceptances` |

`supabasePublishableKey` stays `__SUPABASE_PUBLISHABLE_KEY__` in both JSON files. `npm run build` fails with a clear error if `FLOR_SUPABASE_PUBLISHABLE_KEY` is missing, and it also refuses a key whose JWT role is `service_role`.

The default build talks to the preview FLOR origin. Set `FLOR_PROFILE=prod` to bake in the production origin instead.

## Build and load

```bash
npm ci
export FLOR_SUPABASE_PUBLISHABLE_KEY="publishable-anon-key"
npm run build
```

Open `chrome://extensions`, enable Developer mode, and **Load unpacked** the `dist` folder. The id must be `bmjkikhmfmaieahonelaljfkeapiflah`. That id comes from the public `key` in the manifest. It is not a secret.

Click the toolbar icon. The side panel opens.

`npm run dev` rebuilds `dist` whenever a file changes. Reload the extension in Chrome after a change.

`npm run build:store` is the same build without the manifest `key`. That is the package for the Chrome Web Store item `lkjfhjkgfbonfnlchglghoialgiipbid`. It does not keep the unpacked id above.

`npm run package` builds the unpacked extension and writes `dist-zip/flor-connect-2.4.0.zip` plus a `.sha256` file. `npm run package:store` does the same for the store build.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Unpacked extension in `dist` |
| `npm run build:store` | Store build, no manifest key |
| `npm run package` | Unpacked zip + SHA256 |
| `npm run package:store` | Store zip + SHA256 |

## How sign-in works

The service worker owns the Supabase client (PKCE, session stored in `chrome.storage.local`). The side panel never receives the access token or the refresh token. It asks the worker over `chrome.runtime.sendMessage`, and the worker performs every network call with the signed-in user's JWT. Row Level Security on Supabase is what allows or refuses each row.

An alarm every 10 minutes calls `getSession()` so a sleeping worker still refreshes. If that refresh fails, the panel returns to the welcome screen and local storage is cleared.

Patient names, dates of birth, and the rest of a chart stay in memory. They are not written to `chrome.storage`. The logger redacts JWTs, email addresses, and fields whose names look like a name, date of birth, MRN, phone, or address.

## Manual test

See [docs/M1_TEST.md](docs/M1_TEST.md). A live Google sign-in has to be done by someone with a FLOR account. The automated tests do not claim that a real sign-in succeeded.

## Publishing

The store upload is a workflow the owner runs by hand. See [docs/PUBLISHING.md](docs/PUBLISHING.md). Nothing is published from a pull request.

## Out of scope for this milestone

Reading or filling an EHR form, "Add this site", and writing anything back to FLOR.
