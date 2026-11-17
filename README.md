# challenge.lihallc.com

Mobile-first check-in app for community challenges. Static HTML/CSS/JS (no build step) on Vercel, with data in Supabase.

- `/exercise/03`: a challenge, picked by `category` + `slug` from the `challenges` table
- `/exercise`: redirects to the current challenge (the latest one that has started, else the next one to start)
- `/`: redirects to `/exercise`

## Setup (one time)

1. **Supabase**: create a project. In the SQL editor, run `supabase/schema.sql`, then `supabase/challenges.sql`.
2. **Keys**: put the Project URL and the publishable (or legacy anon) key in `config.js`. The key is public by design; RLS limits it to reading, joining and adding or removing check-ins inside the challenge dates.
3. **Vercel**: import this repo. Framework preset: Other. No build command, output directory `.`.
4. **Domain**: in Vercel, add `challenge.lihallc.com` to the project, then add the DNS record Vercel shows (CNAME `challenge` → `cname.vercel-dns.com`) at your DNS provider.

## Launching the next challenge

Copy the insert in `supabase/challenges.sql`, change `slug` to `'04'` along with the title and dates, and run it. `/exercise/04` works right away, and `/exercise` switches to it on its start date. There's no deploy.

## How it works

- **Identity**: no login. The participant id is stored in `localStorage` per challenge. "Not you?" clears it.
- **Today**: taken from the viewer's local date, so Korea and the US each see their own today. The server only rejects dates outside the challenge, or later than today in UTC+14.
- **Check-ins**: optimistic. A tap flips the cell at once and saves in the background. Rapid taps collapse into the final state. On error it rolls back and shows a toast.
- **Sync**: data reloads when the app returns to the foreground and when the Everyone tab opens.

## Development

```bash
npm run dev
```
Serves the app at http://localhost:8080 using the Supabase project in `config.js`.

```bash
npm test
```
Unit tests for the date and calendar logic.

```bash
node tests/e2e.mjs
```
Runs the app on two emulated phones against an in-memory mock API (needs Playwright).
