# The Ledger — tutoring sign-in, calendar & invoicing

A free, mobile-responsive app for running your tutoring sign-ins, bookings,
and monthly invoicing. Built with React + Firebase (Firestore + Auth +
Hosting), all on Firebase's free "Spark" plan.

## What's in here

- **Kiosk sign-in** (`/`) — the page you leave open on the iPad. Students
  search their name, sign with a finger/stylus, and check in.
- **Tutor admin** (`/admin`) — password-protected, for you:
  - **Students** — register/edit students, accountable-payer details,
    EFT/Card, payment timing, hourly rate. Export to CSV.
  - **Calendar** — Day/Month toggle, individual or group bookings, date
    ranges with daily/weekly repeat, tap a day to manage it.
  - **Invoices** — auto-built each month from actual sign-ins (not just
    what was booked), mark paid with a date + method, print/save as PDF,
    export CSV.
  - **Settings** — default hourly rate.

## About Google Sheets / Calendar sync

You chose to skip this for now, so it isn't wired up. Every list (students,
sessions, invoices) has a **CSV export** button instead — CSV files open
straight into Excel, and in Google Sheets via *File > Import > Upload*.
If you want live two-way sync with Google Calendar/Sheets later, it's a
clean add-on (client-side Google sign-in, no server needed, still free) —
just ask.

---

## 1. One-time Firebase console setup

You said you already have a Firebase project linked to your GitHub repo, so:

1. In the [Firebase console](https://console.firebase.google.com), open your project.
2. **Build > Firestore Database** → Create database → **production mode** → pick a region close to South Africa (e.g. `eur3` or `europe-west1`).
3. **Build > Authentication** → Get started → enable the **Email/Password** sign-in method.
4. Still in Authentication → **Users** tab → **Add user** → enter the email/password you (the tutor) will log in with. This is your only admin account; add more later the same way if you get a second tutor.
5. **Project settings** (gear icon) → scroll to **Your apps** → if you don't have a Web app yet, click **Add app > Web**, name it anything, skip hosting setup there. Copy the `firebaseConfig` values shown — you'll need them in step 2 below.

## 2. Configure the code

```bash
cp .env.example .env
```

Open `.env` and paste in the values from your Firebase web app config:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

`.env` is already in `.gitignore` — it won't be committed. (These values
aren't secret in the security sense — Firestore rules do the real access
control — but keeping them out of the repo is still good practice.)

Install dependencies:

```bash
npm install
```

## 3. Run it locally

```bash
npm run dev
```

Opens at `http://localhost:5173`. The kiosk is the home page; admin is at
`/admin/login`.

## 4. Deploy the security rules

The first time, and any time you change `firestore.rules`:

```bash
npm install -g firebase-tools   # once, if you don't have the CLI
firebase login
firebase use --add              # pick your existing Firebase project
firebase deploy --only firestore:rules
```

## 5. Deploy the app (Firebase Hosting — free)

```bash
npm run deploy
```

This builds the app and pushes it to Firebase Hosting. You'll get a live
URL like `https://your-project.web.app` — that's the link you give
students and put on the iPad.

### Optional: auto-deploy from GitHub

If you'd like every push to `main` to deploy automatically, run
`firebase init hosting:github` from the project folder and follow the
prompts — it writes a GitHub Actions workflow for you and stores the
needed secret in your repo automatically.

## 6. Set up the iPad

1. Open the live URL in Safari on the iPad.
2. Tap **Share → Add to Home Screen**. This gives students a full-screen
   app-like icon with no browser bars — a proper kiosk.
3. Leave it on that screen between sessions; each student just taps in.

## How invoicing works

- Every sign-in at the kiosk is saved with that day's date, the session
  type, duration, and the rate that applied **at that moment** (so if you
  change a student's rate mid-month, past sign-ins keep their original
  price).
- On the **Invoices** page, pick a month — you'll see every student who
  signed in, with a live count pulled straight from their sign-ins (not
  just what was pre-booked). E.g. a student booked for 4 weekly sessions
  but who only signed in 3 times will invoice for 3.
- **Generate invoice** locks that in as a real invoice document. **Refresh**
  recomputes it from sign-ins if more happened after you generated it.
- **Mark paid** asks for the date and EFT/Card, and updates the badge.
- **View / Download** opens a clean printable invoice — use your browser's
  **Print → Save as PDF** to download it.

## Data model (Firestore collections)

| Collection  | Purpose |
|---|---|
| `students`  | Registration + billing details per student |
| `sessions`  | One doc per kiosk sign-in (date, signature, rate charged) |
| `bookings`  | Calendar entries — individual/group, date range, repeat rule |
| `invoices`  | One doc per student per month, with line items + paid status |
| `settings`  | Single doc (`general`) holding the default hourly rate |

## A note on the kiosk and privacy

Because the kiosk needs to work without anyone logging in, the security
rules let anyone with the link read student names (for the search bar) and
today's bookings, and create a sign-in record. They can't read past
sign-ins, invoices, or edit/delete anything — only your logged-in admin
account can. This is normal for a kiosk device kept in your studio; just
don't post the kiosk link publicly.
