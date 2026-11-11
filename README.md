# FLOR Connect

Chrome side panel for FLOR. Version 2.7.1.

## How to install

The project is in:

`/Users/florincoporation/Desktop/flor-connect-extension`

You need Chrome 116 or newer, and Node 20 or newer.

1. Open a terminal in that folder.
2. Install dependencies and build:

```bash
cd /Users/florincoporation/Desktop/flor-connect-extension
npm ci
export FLOR_SUPABASE_PUBLISHABLE_KEY="the-publishable-anon-key"
npm run build
```

Use the Supabase publishable key for project `wbxzevwfxizfjtxrarjq`. Do not use the service-role key. The build fails if the key is missing.

3. Open `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select this folder:

`/Users/florincoporation/Desktop/flor-connect-extension/dist`

7. The name is **FLOR Connect** and the id is `bmjkikhmfmaieahonelaljfkeapiflah`.
8. Click the toolbar icon. The side panel opens.

After you change the code, run `npm run build` again, then click **Reload** on the FLOR Connect card at `chrome://extensions`.

`npm run dev` rebuilds `dist` when files change. Chrome still needs that Reload.

## Real test

1. Sign in with a FLOR Google account and pick a workspace.
2. Leave a patient chart or registration form open in the current Chrome tab. Do not let the extension open or submit that page.
3. In the panel, open **Patients**.
4. Click **Add patient from page**, then **Read from page**.
5. Allow the site if Chrome asks.
6. Check the details. Correct them if needed. Nothing is saved until you confirm.
7. Confirm to add the patient. FLOR assigns the MRN. The chart’s own MRN is not copied.

If the page has no patient, or more than one, the panel stops. There is no blank form to type into.

Roles that can add a patient: owner, admin, clinician, staff. Viewer and billing do not see the button.

## Scripts

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Writes the unpacked extension to `dist` |
| `npm run dev` | Rebuilds `dist` on file changes |
| `npm run build:store` | Store build, without the fixed extension id |
| `npm run package` | Zip of the unpacked build in `dist-zip` |

The default build uses the preview FLOR origin. Set `FLOR_PROFILE=prod` to use `https://florcns.com`.

More sign-in checks are in [docs/M1_TEST.md](docs/M1_TEST.md). Store upload is in [docs/PUBLISHING.md](docs/PUBLISHING.md).
