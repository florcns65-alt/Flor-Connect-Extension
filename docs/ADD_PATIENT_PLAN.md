# Add Patient from the current tab

## Goal

From Patients, a signed-in clinician reads one patient from the EHR or EMR page already open in the active tab, reviews the extracted demographics, and explicitly adds that patient to the selected FLOR workspace.

The extension does not open or navigate another page, does not start from a blank form, and does not write to FLOR before confirmation. FLOR assigns the new MRN. The source chart's MRN is never copied into FLOR.

## Implementation status

- [x] Patients entry: “Add patient from page”, limited to roles that can create patients.
- [x] Read the active tab with the general labeled-page reader. A chart or a registration form can be the source. There is no EHR-specific adapter and no demo-origin allowlist.
- [x] Show the extracted details for review and allow corrections. Unreadable pages and ambiguous identity stop the flow. There is no manual-entry fallback.
- [x] Check possible duplicates before creation and again immediately before writing. Do not merge automatically.
- [x] Create through the signed-in user's selected workspace and existing RLS. Omit MRN so FLOR generates it.
- [ ] A live OpenEMR walkthrough still depends on the supplied demo session. Automated coverage uses synthetic charts and forms.

## What this reader can do

It reads one person's labeled demographics from the current document: labels, accessible names, autocomplete, definition lists, tables, and headings. It does not use OCR or a model. A page with more than one person, no readable name, or no permission is refused. Support is the pages whose labels the reader can see, not a promise about every EHR.

## Older notes

The checklist below is the original implementation plan. Where it says to accept only `demo.openemr.io` registration forms, that limit has been removed.

## Current state

- `PatientsScreen` has an Add New Patient action for roles allowed to create patients.
- `readActivePage` can request permission for the active site and read labeled fields. It does not submit forms.
- `useTransfer` is designed around an already selected FLOR patient. Its identity check intentionally blocks a page that describes a different person, so it is not suitable for this flow.
- The reader already recognizes common first/last name, DOB, sex, MRN/external ID, phone, email, and address labels. The current allowlist excludes sensitive fields such as SSN and payment data.
- `FlorApi` supports reading people and updating existing demographics; it has no create operation or create message/schema.
- The configured production `people` table has RLS enabled and an INSERT policy for workspace owners, admins, clinicians, and staff. Its insert policy requires `user_id = auth.uid()`. `name`, `user_id`, and `workspace_id` are required. The database assigns an MRN when omitted; it also has uniqueness constraints for a user's patient name and a workspace MRN.

## User flow

1. Add **Add New Patient** at the top of the Patients section, following the supplied six-screen FLOR Connect design reference.
2. On click, explain that the user should open a supported **new patient / registration** form in the active tab. Request host permission for that site only, using the existing optional-permission flow.
3. Read labeled, visible, enabled demographic controls without changing them. Require a supported registration-form signal; do not treat any arbitrary patient page as a new-patient form.
4. Map supported fields into a draft. Show the source site and every value for review. Mark uncertain or unmapped values; require first and last name, and a valid, unambiguous DOB if it is required by FLOR's patient-creation rules. Do not read or save unsupported sensitive data.
5. Before offering creation, search the selected workspace for likely duplicates using exact/normalized identity signals (MRN when present; otherwise name plus DOB). Show possible matches and let the clinician open an existing FLOR patient. Never merge or create automatically when identity is ambiguous.
6. The clinician reviews the final draft and chooses **Create patient**. Recheck the active tab, URL, workspace, and form values immediately before writing. If any changed, discard the draft and ask the user to read/review again.
7. Create the record once, confirm the returned FLOR record, refresh the directory, and open the new patient's detail screen. If the request times out, check for a matching record before allowing a retry; never silently send a second insert.

## Implementation phases

### 1. Design and scope

- Implement the supplied visual states: Patients entry, registration-read prompt, review, possible existing patient, created, and unsupported form. Permission and recoverable read/write failures use the extension's existing error patterns.
- First-release source scope is the OpenEMR demo origin (`https://demo.openemr.io`) and explicitly identified registration forms. Add more origins only after validating each source's labels and structure.
- Confirm FLOR's required patient fields, patient status defaults, and whether an external form MRN is ever permitted to become a FLOR MRN. Default plan: omit incoming MRN and let FLOR generate it.

### 2. Read and map a new-patient form

- Create a dedicated add-patient flow (for example `use-add-patient.ts`) rather than extending the existing-patient `useTransfer` state machine.
- Reuse the reader, permission, and active-tab binding helpers, but add a strict registration-page classifier and a create-specific lock containing tab ID, URL, workspace ID, source host, and a stable fingerprint of the reviewed facts.
- Build a strict `CreatePatientDraft` allowlist from supported demographics. Normalize DOB only when unambiguous; reject invalid dates and ambiguous DOB formats. Reject duplicate candidate controls for one field unless the user resolves them in review.
- Treat multi-person pages, unlabeled required fields, unsupported pages, unreadable frames affecting required identity, and stale reader builds as blocked states.
- Keep draft values in memory only. Do not persist patient values in extension storage or log them; log only safe status/count metadata.

### 3. Add a guarded FLOR create operation

- Extend `FlorApi` with a create operation and add a strict, bounded Zod message/schema for it in `shared/messages.ts`.
- Route the message through the service worker, which already owns the Supabase client and requires a signed-in user. Do not send access tokens or a service-role key to the panel.
- Build the database payload in the worker/API layer: derive `name` from reviewed first/last name; take `workspace_id` from the active workspace and `user_id` only from the authenticated user. Do not accept either identity field from the panel or source form.
- Use the user's Supabase JWT and existing RLS. Keep inserts limited to the current policy's writer roles; viewer/billing users should receive a clear permission error. Do not bypass RLS or embed privileged credentials.
- Omit MRN unless the product explicitly approves importing it; current DB triggers generate an MRN when it is null/omitted. Omit portal identity/status fields and all fields outside the create allowlist.
- Return and schema-validate the inserted patient row. Translate RLS, unique-name/MRN, validation, offline, and uncertain-timeout outcomes into safe, actionable states. A failed/uncertain insert must not trigger an automatic retry.
- Before implementation, verify the production schema and policies again in the intended environment; the inspected production policies may differ from preview or future migrations.

### 4. Review, duplicate handling, and completion

- Render the review using the Figma components and hierarchy. Separate required identity from optional contact data; show provenance for each mapped value and allow correcting or clearing values before submission.
- Duplicate candidates should show enough identity to distinguish them, while avoiding unnecessary PHI. An exact likely match blocks default creation and offers opening the existing record. Ambiguous matches require an explicit resolution path.
- Disable repeat submission while pending. On success, clear the in-memory source draft, refresh Patients, and open the returned patient. On failure, preserve only the in-memory draft while the panel remains open and clearly state whether FLOR confirmed creation.

### 5. Verification

- Unit tests: registration-page classifier; field mapping and normalization; ambiguous/invalid DOB; multiple people; duplicate candidate matching; strict create-message/schema allowlist; payload derives `name`, `user_id`, and workspace correctly; generated MRN omitted.
- API/router tests: success with a returned row; invalid schema; no user; wrong workspace; viewer/billing denied by RLS; writer roles allowed by RLS; unique name/MRN conflict; network timeout without duplicate retry.
- Reader tests with synthetic demo forms: supported registration form reads expected demographics; ordinary chart pages, hidden controls, secret/payment fields, and unsupported forms are rejected or ignored.
- UI tests: Figma-aligned button placement and every flow state; review required before write; repeat click disabled; tab/workspace/form drift discards draft; success refreshes and opens patient.
- Manual test only with synthetic data in the agreed demo workspace and demo form. Confirm that the source form remains unchanged and no real patient information is used.

## Acceptance criteria

- The button appears at the top of Patients and the six supplied states follow the screenshot reference and existing visual system.
- Only an explicitly supported new-patient form can produce a draft; existing or multi-patient pages cannot create a person.
- The clinician reviews and confirms every patient creation.
- Creation is scoped to the signed-in user's selected workspace and controlled by FLOR RLS; no privileged key or browser storage is used.
- Duplicate candidates, stale tabs, permission denial, parsing ambiguity, permission errors, and uncertain network outcomes never cause an automatic insert.
- Successful creation is confirmed from the returned FLOR record and appears in the refreshed Patients list.

## Dependencies and decisions

- The Figma link is still not directly accessible in this environment; implementation uses the screenshot supplied in chat as the visual reference. Verify exact spacing and any details not visible in the screenshot against the live Figma file when access is available.
- Product must confirm which demo origins/forms are in scope and which fields are mandatory for FLOR patient creation.
- Backend owner should confirm the insert policy and uniqueness behavior in preview and production before release. In the inspected production schema, `(user_id, lower(name))` is unique and MRNs are generated when omitted; duplicate-name conflict handling must account for that behavior.
- If direct RLS-protected insert cannot safely provide idempotent creation and the required audit behavior, add a narrowly scoped, `SECURITY INVOKER` backend operation with explicit `EXECUTE` grants and tests. Do not solve this with a `SECURITY DEFINER` bypass.
