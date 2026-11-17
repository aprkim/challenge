# challenge.lihallc.com

Mobile-first check-in app for community challenges. Static HTML/CSS/JS with no build step, hosted on **GitHub Pages**. Data lives in **Firestore in the existing `tiny-wins25` project** (the same one tiny-do uses), with anonymous sign-in.

- `/exercise/03`: a challenge from `challenges.json`
- `/exercise`: redirects to the current challenge (the latest one that has started, else the next one to start)
- `/`: redirects to `/exercise`

GitHub Pages has no URL rewrites, so `404.html` is a copy of `index.html` and serves every route. Keep the two files identical; `npm test` checks this.

## Go live (one time)

1. **Firestore rules**: copy the block between `BEGIN` and `END` in `firestore.rules` into `tiny-do/firestore.rules`, just before the last two closing braces. Then deploy from the tiny-do repo:
   ```bash
   firebase deploy --only firestore:rules --project tiny-wins25
   ```
   Never deploy rules from this repo. Rules are project-wide, so it would wipe tiny-do's and tiny-cards' rules. That's why the emulator config here is named `firebase.emulator.json` and not `firebase.json`.
2. **GitHub Pages**: in the repo's Settings → Pages, choose "Deploy from a branch", `main`, `/ (root)`. The `CNAME` file already says `challenge.lihallc.com`.
3. **DNS**: wherever lihallc.com's DNS is managed, add a CNAME record `challenge` → `aprkim.github.io`. Then tick "Enforce HTTPS" in Pages once the certificate is issued.
4. **If sign-in fails on the new domain**: in Google Cloud console → APIs & Services → Credentials, check whether the browser key (`AIzaSyBycF…`) is limited to certain websites. If it is, add `challenge.lihallc.com/*`.

## Launching the next challenge

Add an entry to `challenges.json` with slug `"04"` and its title and dates, then push. `/exercise/04` works right away, and `/exercise` switches to it on its start date. Each challenge's data sits under its own key (`exercise-04`), so nothing carries over.

## Data

`challenges/{category}-{slug}/participants/{lowercased name}` → `{ name, createdAt, dates: ['2026-11-20', …] }`

- **Names**: the lowercased name is the document id, so names are unique per challenge regardless of case. The rules enforce this.
- **Check-ins**: added and removed with `arrayUnion` / `arrayRemove`, which are idempotent and safe from two devices at once. The rules allow at most one new well-formed date per write and nothing else to change. Dates outside the challenge are never counted.
- **Identity**: no login. The participant id is stored in `localStorage` per challenge. "Not you?" clears it.
- **Today**: taken from the viewer's local date, so Korea and the US each see their own today.
- **Saving**: optimistic, through Firestore's local writes. If the server rejects a write, the SDK reverts it and a toast appears. The Everyone screen updates live.

## Development

```bash
npm run dev
```
Serves the app at http://localhost:8080 against production Firestore.

```bash
npm test
```
Unit tests for the calendar logic and the page files.

```bash
npm run e2e
```
Runs two emulated phones against the Firebase emulators, using the real SDK and `firestore.rules`. Needs `firebase-tools` and Playwright. If gstatic.com is blocked, set `FIREBASE_SDK_DIR` to `node_modules/firebase` from `firebase@10.12.5`.
