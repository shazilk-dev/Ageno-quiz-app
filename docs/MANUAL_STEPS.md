# Manual steps

Things only you can do (dashboards, accounts, deploys, checks in a real browser). Each block says which part of `docs/PERFORMANCE_PLAN.md` it belongs to. Tick the boxes as you go; the next session reads this file.

---

## Performance Phases S0 + S1 + S2 (code done and committed on 2026-10-26, not deployed yet)

One deploy covers all three. Do steps 1–7 below, then the S2 checks right after them.

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

- [ ] Commit and push the branch (or ask me to commit it), then let Vercel build it. No Firestore rules or index deploy is needed for this phase.

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

