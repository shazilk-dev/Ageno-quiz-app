# Manual steps

Things only you can do (dashboards, accounts, deploys, checks in a real browser). Each block says which part of `docs/PERFORMANCE_PLAN.md` it belongs to. Tick the boxes as you go; the next session reads this file.

---

## Performance Phases S0 to S3 (merged into `main` and pushed on 2026-10-26)

The push deploys all of it. Step 1 (the "before" numbers) can't be measured once the new version is live; skip it if it already is. Then do steps 2–7, the S2 checks and the S3 checks.

Do the steps in this order. Steps 1–4 take about 15 minutes; step 6 is the real check.

### 1. Measure the current site first (optional, about 5 minutes)

This gives the "before" numbers. Skip it if you don't care about the comparison.

- [ ] Open the live site in Chrome, signed out. Press F12 → **Network** tab → tick **Disable cache**.
- [ ] Do each action below. For each one, click the request named in the table, open its **Timing** tab and note **Waiting for server response**. Write the numbers in the table:

| Action | Request to click | Before | After (step 6) |
|---|---|---|---|
| Open `/join` | `quizzes` | | |
| Open a quiz lobby `/q/...` | the quiz id | | |
| Sign in with email | `session` (POST) | | |
| Open My quizzes | `my-attempts` | | |
| Open Leaderboard | `leaderboard?...` | | |
| Start a quiz | `start` | | |

Also note how long the whole sign-in feels, from clicking **Sign in** to seeing the next page: ______ s.

### 2. Confirm where the database is

- [ ] Firebase console → project **ageno-quiz-af3ff** → **Firestore Database**. The location is shown at the top of the Data tab (or under the database's settings).
- [ ] It should say **eur3**. If it does, nothing else to do here.
- [ ] If it says something else, change `vercel.json` before deploying (or tell me in the next session):

| Firestore location | Put in `vercel.json` `regions` |
|---|---|
| `eur3`, `europe-west1`, `europe-west3`, `europe-west4` | `fra1` (already set) |
| `nam5`, `us-east1`, `us-east4` | `iad1` |
| `us-central1` | `cle1` |
| `asia-south1` (Mumbai) | `bom1` |

### 3. Vercel settings (Vercel dashboard → your project → Settings)

- [ ] **Functions → Function Region:** after the deploy in step 5, this should show **Frankfurt, Germany (fra1)**. `vercel.json` sets it; if the dashboard shows a different region after deploying, set Frankfurt there too.
- [ ] **Functions → Fluid Compute:** make sure it's **enabled**. It's on by default for newer projects. It reuses warm functions, so fewer requests hit a cold start.
- [ ] No environment variable changes are needed.

### 4. Turn on Speed Insights

- [ ] Vercel project → **Speed Insights** tab → **Enable**. The code is already added (`<SpeedInsights />` in `app/layout.tsx`). Without this switch it sends nothing. The free plan has a monthly data-point limit, which is plenty for this site.

### 5. Deploy

- [ ] Already pushed to `main` on 2026-10-26. Check in Vercel that the deployment finished (green). No Firestore rules or index deploy is needed.

### 6. Check it on the deployed site (about 10 minutes)

Sign-in and sign-out:
- [ ] **Sign in with email.** It should feel clearly faster. In the Network tab, click the `session` POST → **Timing** shows `verify`, `session` and `total` under "Server Timing". `total` should be well under 400 ms.
- [ ] **Sign in with Google**, with an existing account and (if you can) a brand-new Google account. The new account should get a profile: it appears in the admin **Users** screen.
- [ ] **Sign up with email.** After **Create account** you should go straight to the sign-in page, with a note that the account is ready. Sign in.
- [ ] **Verify email link:** open the link from the verification email. The page should say "Email verified" once and **not** reload over and over (the old page reloaded itself every 3 seconds).
- [ ] **Sign out on one device only:** sign in on your phone and your laptop. Sign out on the phone. The laptop should **stay signed in** (this changed: signing out used to sign you out everywhere).
- [ ] **Sign out of all devices:** sign in on the phone again. On the laptop, go to Profile → **Security** → **Sign out of all devices** → **Sign out everywhere**. The laptop goes to the sign-in page right away. The phone is signed out too, but not instantly: as an admin, the admin screens refuse it on the next page load; as a player, it is signed out the next time its sign-in token renews (within the hour). That delay is how Firebase sign-in works everywhere, not a fault.
- [ ] **Admin:** sign in as an admin and open the Dashboard. You should get in exactly as before.

Data screens:
- [ ] Fill in the **After** column of the table in step 1. The API requests now also show `auth`/`db`/`total` under **Server Timing**: if one is still slow, those three numbers say which part.
- [ ] Take one quiz end to end (start → answer → submit → result).

If something fails, note what you did and what you saw (a screenshot of the Network request helps). The next session starts by reading this file.

### 7. A day or two later

- [ ] Vercel → **Speed Insights**: note the LCP and TTFB for `/`, `/join` and `/q/[id]` here. This is the real-visitor baseline for the next phases.
  - `/`: LCP ____ TTFB ____
  - `/join`: LCP ____ TTFB ____
  - `/q/[id]`: LCP ____ TTFB ____

### S2 checks: cached quiz data (after the same deploy, about 5 minutes)

- [ ] Open `/join` twice. In the Network tab, the second `quizzes` request's **Server Timing** `db` should be about 1 ms (the first one after a deploy reads the database).
- [ ] As an admin, edit a quiz's title and save. Reload `/join` as a player: the new title shows **right away**.
- [ ] Switch a quiz **off** in the editor and save. Open its lobby `/q/...`: it says the quiz isn't open, right away. Switch it back on and save: the lobby lets you start again, right away.
- [ ] Start a quiz. The `start` request's **Server Timing** `db` should be well under 300 ms.
- [ ] If you ever change a quiz directly in the Firebase console (not through the editor), the site shows it within 5 minutes. Saving the quiz in the editor shows it at once.

### S3 checks: pages arrive with their data (about 10 minutes)

For each page below, use **View page source** (Ctrl+U) or watch the first paint: the data should be there at once, with no skeleton that turns into content.
- [ ] `/join` signed out: the quiz cards are in the page source. Edit a quiz title as admin and save, then reload `/join`: the new title shows (the first reload may still show the old one while the page rebuilds; the next one shows the new title).
- [ ] A lobby `/q/...`: the browser tab shows the quiz's title. A made-up address like `/q/nothing-here` shows "Quiz not found".
- [ ] Signed in, open **My quizzes**, then a result from it, then **Leaderboard**: each appears with its data straight away. Change a leaderboard filter: the old board stays (dimmed) until the new one arrives.
- [ ] As admin, open **Dashboard**, **Quizzes**, **Users** and **Reports**: each shows its numbers straight away. Create or delete something and check the list updates as before.
- [ ] Sign out, then press the browser's Back button to My quizzes: you're sent to sign in, not shown your data.

## Performance Phase S4 (merged into `main` and pushed on 2026-10-26)

S4 made every page about 65 kB lighter. It removed the Firestore SDK and the Node polyfills from the browser and moved the profile and activity-log writes to the server. The new Firestore rules deny the browser everything. **They are not deployed yet** (the session wasn't allowed to deploy to production):

- [ ] Once Vercel shows the S4 version live (green), run `firebase deploy --only firestore:rules --project ageno-quiz-af3ff` (or type `! firebase deploy --only firestore:rules --project ageno-quiz-af3ff` in Claude Code). Until then the old, looser rules stay live; nothing breaks either way.

Check in a real browser on the deployed site, with the console open (F12 → **Console**). No red errors should appear on any of these (about 10 minutes):
- [ ] Open `/`, `/join`, a lobby, `/sign-in`, signed out. Pages look and behave as before.
- [ ] **Sign up** with a new email. Then, as admin, open **Users**: the new person is there before they've signed in. (Before S4 the profile only appeared after their first sign-in.)
- [ ] **Sign in with Google.** The popup opens and you're signed in.
- [ ] **Profile → Profile:** change your display name and save. Reload: the new name stays. As admin, the Users screen shows the new name.
- [ ] **Profile → Password:** change your password, sign out, sign in with the new one.
- [ ] **Profile → Email** (optional, with an address you can read): change it; a verification email arrives at the new address.
- [ ] **Profile → Security:** start "Add an authenticator app". A short placeholder, then the QR code. Cancel. (If you use two-factor, set it up and remove it again.)
- [ ] **Take a quiz:** start, answer, submit, see the result. Start should be as quick as before (the exam's code now loads in the background while you're on the lobby).
- [ ] A quiz in progress: reload the page. The "resume" screen appears and resuming works.
- [ ] As admin, open the Dashboard, Quizzes, Users, Reports and the quiz editor. All work as before. (The admin screens never used Firestore from the browser, so the stricter rules don't affect them.)

## Performance Phase S5 (precomputed leaderboard; on branch `phase-7-polish`, not merged or pushed yet)

S5 stores each person's best score per quiz (`leaderboard`) and their totals (`userTotals`) when they submit, so the leaderboard is one small query and counts every result (the old page only looked at the top 100). The admin quiz list reads a stored result count. Two things must happen around the deploy, **in this order**:

- [ ] **1. Deploy the new indexes** (before the code goes live; the "one quiz" boards need them): `firebase deploy --only firestore:indexes --project ageno-quiz-af3ff` (or `! firebase deploy --only firestore:indexes --project ageno-quiz-af3ff` in Claude Code). If it asks whether to delete indexes that aren't in `firestore.indexes.json`, answer **No**. Then wait until Firebase console → Firestore → **Indexes** shows the four new `leaderboard` indexes as **Enabled** (a few minutes; the collection is empty, so it's quick).
- [ ] **2. Merge and push**, and wait for Vercel to show the new version live (green). Until step 3 runs, the all-time leaderboard only shows results submitted after the deploy.
- [ ] **3. Fill the leaderboard from the existing results**, at a quiet time (nobody taking a quiz):
  - `npm run backfill:leaderboard` first: a dry run that writes nothing. On 2026-10-26 it read 79 results → 19 rows for 11 people; the numbers should be about that plus whatever came in since.
  - Then `npm run backfill:leaderboard -- --apply`. It's safe to run again any time (it rebuilds from scratch), for example if someone submitted while it ran.

Checks on the deployed site (about 5 minutes):
- [ ] **Leaderboard**, every quiz: the same people and points as before the deploy (the old board could be wrong once there were more than 100 results; there aren't yet).
- [ ] Pick one quiz: each person appears **once** now, with their best attempt (before, every attempt had its own row). Pick a difficulty: the board narrows to it. Week and Month still work.
- [ ] Take a quiz, then open the leaderboard: your new result counts straight away on **All time** (Week and Month can take up to 30 seconds).
- [ ] Change your display name on Profile: the leaderboard shows the new name (within a few seconds).
- [ ] As admin, **Quizzes**: the result counts match the **Reports** screen for each quiz.

## Admin Phase A1 (question model v2; on branch `phase-7-polish`, not merged or pushed yet)

A1 lets a question have several correct answers, adds a reason per option, and stores a result's answers as one `sheet` on the result instead of one document each. Old quizzes, old results and attempts in progress keep working without any step from you.

- [ ] After the deploy is live, run `npm run backfill:sheets` (a dry run: it prints how many older results would get a sheet), then `npm run backfill:sheets -- --apply`. Nothing reads the sheets yet (they are for the per-question reports in A5), so this can wait, but do it before A5. Safe to run again.

Check in a real browser after the deploy (about 10 minutes):
- [ ] As admin, edit a quiz: add a **Select all that apply** question with two correct options and a reason on a few options. Use **Preview the review** (eye icon) on it. Save, then open the quiz view: the type and reasons show.
- [ ] As a player, take that quiz: the question shows checkboxes and "Select all that apply · Choose 2". Submit with one of the two ticked: it counts as wrong. The review shows the correct options with their reasons, your wrong pick with its reason, and a **Why the others are wrong** fold.
- [ ] On a phone-sized window (390 wide) look at the question and the review with long option text: nothing runs off the screen, tap targets are comfortable.
- [ ] Start a quiz **before** the deploy and finish it **after** it: it still submits and shows its result. (Only possible if you have an attempt open when it goes live; otherwise skip.)
- [ ] Open an old result under **My quizzes**: the review still shows.
