# Online Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public bilingual registration form at `/register`, a form builder at Settings > Register builder, and an approve/reject flow that creates or updates students and bills the registration fee.

**Architecture:** Form definitions live in a public-read `registrationForms/{formId}` collection with a public pointer doc `publicSettings/registration`; submissions go to a create-only `registrations` collection that only admins read. Pure logic (answers → student fields, pricing, matching, grade rollover, form validation) lives in `src/lib/registration.js` and is unit-tested with Node's built-in test runner. Local testing uses the Firebase emulators under a `demo-` project id, so nothing touches the live project.

**Tech Stack:** React 18, Vite 5, Firebase 10 (Auth + Firestore), html2pdf.js, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-05-online-registration-design.md`

## Global Constraints

- No commits, no deploys (user instruction for this build). Test only against the emulators.
- Sensitive answers (ID, address, date of birth, emergency contact, signature) never written to `students/*`.
- Core links that must exist before a form can be opened: `learner.firstName`, `learner.lastName`, `learner.contact`, `parent.name`, `parent.surname`, `parent.contact`.
- Every user-facing form text is `{ en, af }`; empty `af` falls back to `en`.
- Default form content = spec appendix, verbatim.
- Styling follows `src/index.css` tokens for admin screens; the public form uses its own palette from the spec appendix.

## Review Focus

- Sibling submitted with pre-filled parent details → approve defaults to Create new (test in `registration.test.js`: `findMatches` returns type `parent`).
- Registering in November for next year → grade unchanged until rollover, then exactly the registered grade (test: `rolloverUpdates`).
- Approving onto a month whose invoice is already paid → blocked with a message, invoice untouched.
- Optional answers left blank on an update → existing student values kept (test: `studentPatch` drops empty values).
- Form with a core question's link removed or missing → can't be opened (test: `missingCoreLinks`).

---

### Task 1: Emulator setup and seed

**Files:** Modify `firebase.json`, `package.json`, `src/firebase.js`; Create `.env.emulator`, `scripts/seed-emulator.mjs`.

- [ ] Add `emulators` (auth 9099, firestore 8080, ui 4000, singleProjectMode) to `firebase.json`.
- [ ] `src/firebase.js`: when `import.meta.env.VITE_USE_EMULATORS === 'true'`, call `connectFirestoreEmulator(db, '127.0.0.1', 8080)` and `connectAuthEmulator(auth, 'http://127.0.0.1:9099')`.
- [ ] `.env.emulator`: `VITE_USE_EMULATORS=true`, `VITE_FIREBASE_PROJECT_ID=demo-multiplying-minds`, dummy api key/app id.
- [ ] Scripts: `"emulators": "firebase emulators:start --project demo-multiplying-minds"`, `"dev:emulator": "vite --mode emulator"`, `"seed:emulator": "node scripts/seed-emulator.mjs"`, `"test": "node --test src/lib/"`.
- [ ] Seed: create auth user `admin@test.local` / `test1234`, sign in, write `settings/users`, `settings/general` (rate 250, billing details), `settings/invoiceCounter` with current scheme, `settings.gradeRolloverYear = 2026`, and four students (one sharing a parent phone with another).
- [ ] Verify: emulators start; seed prints "Seeded"; app on `--mode emulator` logs in.

### Task 2: Pure registration logic + default form

**Files:** Create `src/lib/registration.js`, `src/lib/defaultRegistrationForm.js`, `src/lib/registration.test.js`.

**Produces:**
- `SAVES_TO` — list of `{ key, label, core }` for the eight link keys.
- `t(text, lang) -> string` (fallback to en).
- `allQuestions(form) -> question[]`.
- `missingCoreLinks(form) -> key[]`.
- `studentFromAnswers(form, answers) -> { firstName, lastName, studentContact, grade, accountable: { name, surname, contact, email } }`.
- `pricingFromAnswers(form, answers) -> { rate: number|null, fee: number, feeOptions: string[] }`.
- `findMatches(candidate, students) -> [{ type: 'learner'|'parent', student }]` (learner matches first).
- `studentPatch(existing, incoming) -> object` (drops empty strings/null, merges accountable).
- `rolloverUpdates(students, year) -> [{ id, data }]` (pending grade for `year` wins, cleared; else +1).
- `gradeFields(grade, formYear, currentYear) -> { grade } | { pendingGrade: { year, grade } }`.
- `siblingAnswers(form, answers) -> answers` (keeps sections with `keepForSibling`).
- `newId() -> string`.
- `defaultRegistrationForm(year) -> form` (spec appendix).

- [ ] Tests first for: fallback in `t`; `missingCoreLinks` on default form (empty) and with parent contact removed (`['parent.contact']`); `studentFromAnswers` on a filled default form; `pricingFromAnswers` (online individual + GR 10–11 → rate 300, fee 1500); `findMatches` learner vs parent-only vs none, case/space-insensitive, phone digits only; `studentPatch` keeps existing email when blank; `rolloverUpdates` (+1, pending grade applied, blank grade with pending applied, blank without pending skipped); `gradeFields` current vs future year.
- [ ] `npm test` → fail, implement, → pass.

### Task 3: Data layer and rules

**Files:** Modify `src/lib/db.js`, `firestore.rules`.

**Produces:** `listenRegistrationForms`, `saveRegistrationForm(form)`, `listenPublicRegistration`, `setActiveRegistrationForm(formId)`, `getPublicRegistrationForm() -> form|null`, `submitRegistration(data)`, `listenRegistrations`, `updateRegistration(id, data)`, `deleteRegistration(id)`; `addNumberedInvoice` returns the new invoice id.

- [ ] Rules: `publicSettings/{doc}` and `registrationForms/{id}` read: true, write: isAdmin(). `registrations/{id}` create: status == 'new', `submittedAt == request.time`, keys hasOnly([formId, year, lang, status, submittedAt, answers, signature, form]), `signature` string < 500000; read/update/delete: isAdmin().
- [ ] Verify in emulator: logged-out create succeeds, logged-out read is denied.

### Task 4: Public form `/register`

**Files:** Create `src/pages/Register.jsx`, `src/components/registration/RegisterFormView.jsx`, `src/components/registration/registration.css`; Modify `src/App.jsx`, `src/components/SignaturePad.jsx` (optional `placeholder` prop).

- [ ] `RegisterFormView({ form, lang, answers, onChange, readOnly, errors, sigRefs })` renders header, coloured sections, half/full width questions, option cards, tick lists, signature with today's date.
- [ ] `Register` page: loads public form; EN/AF switch (default from `navigator.language`); closed message; validation messages in chosen language; honeypot; submit; thank-you screen with sections flagged `showOnThankYou`, payment reference, Download PDF, Register another learner.
- [ ] Verify at 375px and desktop widths in the browser.

### Task 5: Register builder

**Files:** Create `src/components/registration/RegisterBuilder.jsx`, `src/components/registration/QuestionEditor.jsx`; Modify `src/pages/Settings.jsx`.

- [ ] Creates the default form on first open (logo copied from `settings/general`), closed.
- [ ] Form picker, live/open switches, year, EN/AF texts, logo, copy link, preview, copy for next year.
- [ ] Section and question add/edit/move/delete; core questions can't be deleted or unlinked; one link per key; options with rate / fee / grade.
- [ ] Save blocked when the form is open (or being made live and open) and `missingCoreLinks` is non-empty; unsaved-changes warning on tab switch and page leave.

### Task 6: Registrations list and approval

**Files:** Create `src/components/registration/RegistrationsTab.jsx`, `src/components/registration/RegistrationDetails.jsx`, `src/components/registration/ApproveModal.jsx`, `src/lib/approveRegistration.js`; Modify `src/pages/Students.jsx`, `src/App.jsx` (route + menu badge).

- [ ] Tab at `/admin/students/registrations`; New / Rejected filter; details view; Reject (note), Restore, Delete.
- [ ] ApproveModal: match banner and choice (defaults per spec), student fields, rate, payment method/timing, fee label/amount/month, Paid / Not paid yet with payment fields.
- [ ] `approveRegistration({...})`: create/update student (with `gradeFields`, `registeredYears`, `registrationIds`, `archived: false`), fee onto invoice (block paid invoice), record payment via `paymentFields`, mark registration approved.

### Task 7: Returning students and archive

**Files:** Modify `src/pages/Students.jsx`, `src/pages/Kiosk.jsx`, `src/components/BookingForm.jsx`, `src/components/GroupForm.jsx`.

- [ ] Rollover uses `rolloverUpdates`; grade cell shows pending grade.
- [ ] Year column + Registered / Not registered filter; Active / Archived / All filter; Archive/Unarchive per row; "Archive everyone not registered for <year>" with name list confirm; Registration details button per student.
- [ ] Archived students hidden in kiosk, booking picker and group picker (unless already selected).

### Task 8: End-to-end check

- [ ] `npm test` passes; `npm run build` succeeds.
- [ ] In the emulator: build form → open → submit as parent on phone width (EN and AF) → sibling → approve new (paid) → approve sibling (not paid) → approve returning student → check invoices, grade, archive.
