# Online registration form and Register builder — design

Date: 2026-11-05
Status: draft for approval

## Why

Multiplying Minds currently registers learners on a printed/PDF form ("Registration for 2027", English and Afrikaans versions) and Marisa then types each one into the app by hand through Students > Register student. We want parents to fill in the registration online, on their phone, in English or Afrikaans, and have it land in the app ready for Marisa to approve with one click. Approving creates (or updates) the student and puts the registration fee on their invoice.

Marisa must be able to change the form herself, Google Forms style, without a developer: questions, sections, options, prices, terms, bank details, and next year's version.

## Goals

- A public, mobile-friendly registration page that looks like the 2027 PDF design and works in English and Afrikaans.
- A fully customisable form builder at **Settings > Register builder**.
- Submissions wait in a pending list for Marisa to approve or reject; nothing reaches the student list on its own.
- Approving creates a new student or updates an existing one, adds the registration fee to an invoice, and can record the fee as paid.
- Marisa can see which existing students have and haven't registered for the new year, and archive the ones who aren't coming back.

## Non-goals

- Email notifications (to Marisa or parents). Needs a Cloud Function and the paid Firebase (Blaze) plan; left for later.
- Online payment of the fee. Parents pay by EFT using the bank details shown; Marisa records the payment.
- Automatic translation. Marisa types both languages.
- More than one active form at a time (e.g. separate forms per subject).

## Anti-goals (would be a failure even if it works)

- Sensitive answers (parent ID number, address, learner date of birth, signature) becoming readable by anyone with the kiosk link. The `students` collection is public-read; these must never be stored there.
- Spam or prank submissions appearing in the kiosk search or on invoices without Marisa's approval.
- Marisa being able to break registration by deleting a question the app needs to create a student.
- A learner's grade being bumped twice (once by registration, again by the 1 January rollover).
- Losing a returning student's history (invoices, attendance, payments) by creating a duplicate instead of updating.

## Constraints

- Existing stack: React 18 + Vite, Firebase Auth + Firestore, Firebase Hosting, free (Spark) plan. No Cloud Functions, no Firebase Storage.
- Images (logo) are stored as data URLs inside Firestore documents (1 MB doc limit). The current logo lives in `settings/general`, which is admin-only, so the public form needs its own public copy.
- Firestore rules are the only server-side protection. Public writes must be create-only and validated in the rules.
- Invoices are monthly per student (`buildMonthlyInvoice` in `src/lib/helpers.js`), numbered via `addNumberedInvoice`, with one-off charges in `extraLines` and payments via the `MarkPaidModal` / `paymentFields` flow.
- Follow the project convention: one version-numbered commit per release (v0.32, v0.33…) with a git tag. Push/deploy only when the user asks.

## The public form (`/register`)

- New public route `/register`, alongside the kiosk (`/`). No login.
- Visual design follows the 2027 PDF: logo at the top, title band ("Registration for 2027" / "Registrasie vir 2027"), coloured section bands (teal, green, pink, lilac), tick-box option cards, the terms list with ticks, a signature and date row, and the bank details block.
- **Language:** an *English | Afrikaans* switch at the top. Defaults to the browser language (Afrikaans if it starts with `af`, otherwise English). Switching keeps everything already typed. Any text Marisa left blank in Afrikaans falls back to English.
- **Mobile:** single column on phones (two columns where the PDF has them, on wider screens). Large tap targets for tick boxes and option cards. Signature is the existing finger-drawn `SignaturePad`.
- **Required fields** are marked and checked before submit, with messages in the chosen language.
- **Consent and terms:** the default form ends with a required "I accept the terms and conditions" tick box and a required POPIA consent tick box ("I agree that Multiplying Minds may store these details for tutoring and billing"). These are ordinary tick-box questions in the builder, marked required.
- **Spam protection:** a hidden honeypot field (submissions with it filled are silently dropped) plus size/shape checks in the Firestore rules.
- **When registrations are closed** (switch in the builder), the page shows Marisa's custom "closed" message instead of the form.
- **After submitting:** a thank-you screen showing the bank details and payment reference (learner name + surname), a **Download PDF** button that produces a copy of their completed form in the same design, and a **Register another learner** button that starts a new form with the parent and emergency-contact answers already filled in.

## The Register builder (Settings > Register builder)

A third tab in Settings, next to General and Users.

**Form-level settings**
- Year (e.g. 2027), shown in the title.
- Title, intro text and "closed" message, each in English and Afrikaans.
- Registrations open / closed switch.
- Logo (defaults to a copy of the logo in General settings; can be replaced).
- "Copy this form for next year" button: duplicates the form with the year +1, as a new closed draft Marisa can edit and then open. The previous year's form is kept (read-only) so old registrations still make sense.
- "Copy registration link" button and a preview of the form as parents see it.

**Sections and questions**
- The form is a list of sections; each section has a heading (EN/AF) and a colour (from the design's palette) and contains questions. Sections and questions can be added, deleted, reordered (up/down buttons are enough; drag is optional) and edited.
- Question types: short answer, paragraph, phone number, email, date, number, single choice, multiple choice, tick box, signature, information text (for the terms list and bank details, no answer), and section heading.
- Every question has: label (EN/AF), optional help text (EN/AF), required on/off, and for choice questions a list of options (each EN/AF).
- Layout hint: half-width or full-width, so the PDF's two-column look can be reproduced on wide screens.

**"Saves to" links**
- Each question has an optional **Saves to** setting that links its answer to a student field: learner first name, learner surname, learner contact number, grade, parent name, parent surname, parent contact number, parent email. Each link can be used by one question only.
- **Core questions** (learner first name, learner surname, learner contact number, parent name, parent surname, parent contact number) are needed to create a student. They can be reworded and moved but not deleted, and their "Saves to" link can't be removed. The builder won't let Marisa open the form if any of them is missing.
- Unlinked answers are kept with the registration only (see Privacy).
- Names are asked as separate name and surname boxes, not one "Full name" line.

**Prices on options**
- Any option in a choice question can optionally carry:
  - an **hourly rate** (e.g. "Online individual @ R300 per hour" → R300). The first chosen option with a rate pre-fills the student's hourly rate on approval.
  - a **registration fee** (e.g. "GR 10–11 (R1 500)" → R1,500). The chosen fee options are added up to pre-fill the fee on approval.
- The option's label is free text, so Marisa writes the price into the wording herself as on the PDF.

**Default form**
- The first time the builder opens, it is filled with the 2027 PDF design, linked up: Parent/guardian details (name, surname, ID, address, contact number, email), Emergency contact (name, surname, relationship, contact number), Learner details (first name, surname, grade, contact number, date of birth), Lessons (Online individual R300/h, Online group R200/h, In person R150/h), 2027 registration – mathematics (GR 8–9, GR 10–11, GR 12, each R1 500), Terms and conditions (the six terms from the PDF), terms acceptance, POPIA consent, signature, and Banking details (FNB details from the PDF, reference "Learner first name + surname"). English and Afrikaans text are taken from the two PDFs.

**Saving**
- The builder has a Save button (like General settings). Unsaved changes are warned about on leaving the tab.

## Admin side: pending registrations

- **Badge:** the Students item in the admin menu shows a count of new registrations.
- **Students page:** a "Registrations" tab (alongside the existing student list and Groups tabs) listing pending registrations, newest first: learner name, grade, parent name and contact, submitted date. A "Rejected" filter shows rejected ones.
- Opening one shows all answers as the parent gave them (with the questions as they were when submitted), including the signature.

**Approve**
1. The app looks for a likely existing student:
   - **Learner match** (same learner first + last name, case- and space-insensitive): the pop-up says "This looks like <name> (already a student)" and defaults to **Update existing student**, with **Create as new student** as the alternative.
   - **Parent-only match** (same parent contact number or email, different learner name): this is usually a sibling, so the pop-up says "Same parent as <name>" and defaults to **Create as new student**. Update stays available if Marisa knows it's the same child (e.g. a name spelling change).
   - Marisa can also pick a different existing student from a search box.
   - If the matched student is already marked registered for that year, the pop-up warns "Already registered for <year>" (likely a duplicate submission).
2. The pop-up shows the student details from the linked answers in the same fields as the current student form, editable, plus the hourly rate (pre-filled from the chosen option, else the student's current rate, else the default rate), payment method and payment timing.
3. **Registration fee** section:
   - Fee line label (default "Registration <year>" plus the chosen grade option, e.g. "Registration 2027 – GR 10–11") and amount (pre-filled from the options), both editable. Amount 0 or blank means no fee line.
   - Invoice month: defaults to the month of approval; dropdown to choose another month.
   - **Paid / Not paid yet.** Paid shows the same payment fields as "Mark paid" (date, method, amount with part payments allowed, reference).
4. On save:
   - Create the student, or update the matched one (overwrite linked fields with the new answers; keep everything else, including all history).
   - Add the fee as an `extraLines` entry on that student's invoice for the chosen month, creating the invoice (numbered as usual) if none exists. If that month's invoice is already paid, warn and ask for another month instead of silently changing a paid invoice.
   - If Paid, record the payment on that invoice using the existing payments model.
   - Mark the registration approved, linked to the student id and invoice id, and record the student as registered for that year.

**Reject:** moves it to the Rejected list (with an optional note). Rejected registrations can be restored or permanently deleted.

## Returning students and the new year

- **Registered status per year:** each student records which form years they registered for (set on approval). The Students list gets a "<year>" column and a filter: Registered / Not registered, so Marisa can follow up, using the parent contact number shown.
- **Grade:** the registration grade is the grade for the form's year.
  - If the form's year is the current year, approval sets the student's grade straight away.
  - If it's a future year (registering in November for 2027), the student keeps their current grade for the rest of this year, and the registration grade is stored as a pending "grade for 2027". The student profile shows it as "Grade 10 from 2027".
  - On the 1 January rollover (currently in `Students.jsx`, lines 73–89), a student with a pending grade for the new year gets exactly that grade instead of +1, and the pending value is cleared. Everyone else gets +1 as today.
  - So a Grade 9 learner registered in November as Grade 10 for 2027 shows Grade 9 until 1 January, then Grade 10, never Grade 11.
  - The form's grade question is a choice or number; for the grade link, the builder maps each choice option to a grade number (e.g. "Grade 10" → 10). For range options like the fee boxes "GR 10–11", the grade comes from the learner's separate Grade question, not the fee option.
- **Archive (new):** students can be archived and unarchived. Archived students are hidden from the kiosk search, the main student list (visible under an "Archived" filter) and new bookings, but their invoices, attendance and payments stay untouched. Approving a registration that matches an archived student unarchives them.
- **"Archive everyone not registered for <year>"** button on the Students page: shows the list of names first and asks to confirm. Nothing is archived automatically.

## Privacy and data storage

- **Form definition:** a public-read, admin-write document (e.g. `registrationForms/{year}` plus a pointer to the active one) so `/register` can load it, including its own copy of the logo.
- **Submissions:** a `registrations` collection. Rules: anyone may **create** (with size/shape checks, status must be "new", no extra admin fields); only admins may read, update or delete. Each submission stores its answers, a snapshot of the questions as they were, the form year, the language used, the signature (as a small image data URL), and the submitted time.
- **Student record:** only the linked student fields go onto the student document (which the kiosk can read). ID number, address, date of birth, emergency contact, signature and all other unlinked answers stay in `registrations` only. The student profile shows them under "Registration details" by loading the linked registration (admin only).

## Decided by the user

- Build it into the app (Option B), not Google Forms.
- Fully customisable form builder, located at Settings > Register builder.
- Design follows the supplied 2027 registration PDF; English and Afrikaans; mobile friendly.
- There is a registration fee amount.
- On Approve, a pop-up with the payment info matching the invoice, where Marisa marks it paid or not paid yet; the fee shows on the student's invoice.
- Agreed with the recommendations on: "Saves to" links and core questions, separate name/surname, fee on the approval-month invoice with a month dropdown, EN/AF side-by-side in the builder with English fallback, matching returning students and updating instead of duplicating, the grade-rollover fix, the per-year registered filter, manual archive plus a confirm-first bulk archive, and the extras list (privacy split, consent and terms tick boxes, siblings button, open/closed switch, copy for next year, question types, menu badge instead of email, parent PDF copy, reject to a list).

## Calls made by Claude (check these)

- Sibling-safe matching: "Update existing" is the default only when the learner's name matches; a parent-only match defaults to "Create as new student".
- Registering for a future year keeps the current grade until 1 January, then applies the registered grade (no double bump).
- The public page and parent PDF follow the 2027 design closely (same sections, order, colours, logo, tick-box cards, terms and bank block), built as a responsive web page rather than a pixel copy of the PDF.
- Option prices: hourly rate and registration fee are optional numbers attached to choice options, rather than a separate pricing screen.
- Hourly rate comes from the first chosen option with a rate; fees from all chosen fee options are added together.
- Matching on learner name, parent phone or parent email, with "Update existing" as the default when there's a match.
- If the chosen invoice month is already paid, the app asks for another month rather than changing a paid invoice.
- Pending registrations live as a tab on the Students page; the builder lives in Settings.
- Previous years' forms are kept read-only.

## Left to the builder

- Exact Firestore document shapes, field names and rule expressions (within the privacy rules above).
- Component structure, CSS approach (in line with `src/index.css`), and whether reordering is by drag or up/down buttons.
- How the parent's PDF copy is generated (`html2pdf.js` is already a dependency).
- How the release is split into versions (e.g. v0.32 builder + public form, v0.33 approval + invoices, v0.34 returning students + archive).

## Appendix: default form content (from the 2027 PDFs)

The PDFs aren't in the repo; this is their full content. Single "Full name / Naam en van" lines are split into Name/Naam and Surname/Van.

**Visual:** white page; logo top centre (the Multiplying Minds chameleon logo, same as the logo in General settings); title band in slate grey (~#6b7a90) with white bold text; section header bands with a dark navy heading and icon: Parent/guardian teal (~#7fdcdc), Emergency contact green (~#c5ecaa), Learner pink (~#f2a8d8), the three option boxes lilac (~#dcc8ec), Terms teal, Banking slate (~#5d7890) with white text; teal ✓ ticks on terms; decorative pink/teal/green waves top corners and three stripes along the bottom.

| Section (EN / AF) | Questions (EN / AF) |
|---|---|
| Registration for 2027 / Registrasie vir 2027 | (title) |
| Parent / guardian details / Ouer / voog se besonderhede | Name / Naam* (→ parent name) · Surname / Van* (→ parent surname) · ID / ID · Address / Adres · Contact number / Kontaknommer* (→ parent contact) · Email / E-pos (→ parent email) |
| Emergency contact details / Kontakbesonderhede (indien noodgeval) | Name / Naam · Surname / Van · Relationship / Verhouding · Contact number / Kontaknommer |
| Learner details / Leerder se besonderhede | Name / Naam* (→ learner first name) · Surname / Van* (→ learner surname) · Contact number / Kontaknommer* (→ learner contact) · Grade / Graad (→ grade) · Date of birth / Geboortedatum |
| Online / Aanlyn | Individual @ R300 per hour / Individueel @ R300 per uur (rate 300) · Groups @ R200 per hour / Groepe @ R200 per uur (rate 200) |
| In person / In persoon | In person @ R150 per hour / In persoon @ R150 per uur (rate 150) |
| 2027 registration (mathematics) / Registrasie vir 2027 (wiskunde) | GR 8–9 (R1 500) (fee 1500) · GR 10–11 (R1 500) (fee 1500) · GR 12 (R1 500) (fee 1500) |

The Online and In person boxes together form one lesson-option question (shown as the two boxes on wide screens).

**Important information / terms & conditions — Belangrike inligting / voorwaardes**

| English | Afrikaans |
|---|---|
| Lessons must be cancelled at least 12 hours in advance. | Klasse moet minstens 12 ure vooruit gekanselleer word. |
| If a learner is late or does not attend a scheduled lesson, the full lesson fee is still payable. | Indien 'n leerder laat is vir die gereëlde les sal die volle bedrag van die les steeds betaalbaar wees. |
| The learner must be prepared to switch on their camera during an online lesson. | Die leerder moet bereid wees om die kamera aan te skakel tydens 'n aanlyn les. |
| Lessons are payable monthly in advance. | Klasse is maandeliks vooruit betaalbaar. |
| A minimum of 3 lessons per month is payable, whether the learner attends or not. Any additional lessons cancelled in advance may be carried over as credit to the following month. | 'n Minimum van 3 klasse per maand is betaalbaar, ongeag of die leerder die klasse bywoon of nie. Enige ander klasse wat vroegtydig gekanselleer word sal as krediet oorgedra kan word na die volgende maand toe. |
| If lessons have not been paid for by the 7th of each month, the learner may not attend further lessons until the account is up to date. | Indien klasse nie teen die 7de van elke maand betaal is nie sal die leerder nie verder klasse kan bywoon totdat die rekening op datum is nie. |

Then: I accept the terms and conditions* / Ek aanvaar die terme en voorwaardes* · POPIA consent* (EN/AF wording by builder) · Signature* / Handtekening* · Date / Datum (filled automatically with the submission date).

**Banking details / Bankbesonderhede** (information text):
Multiplying Minds · FNB Gold Business Cheque Account / FNB Gold Business Cheque rekening · Account number / Rekeningnommer: 63229304231 · Branch code / Takkode: 250655 · Reference / Verwysing: Learner first name + surname / Leerder naam + van.
