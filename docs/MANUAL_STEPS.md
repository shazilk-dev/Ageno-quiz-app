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

## Admin Phase A4.3 (trash; after it is deployed)

Deleting a quiz now moves it to the trash; it is no longer permanent. Check in the deployed admin (about 5 minutes), ideally on a throwaway quiz that has at least one result:
- [ ] **Quizzes → Delete** on that quiz: the dialog says its questions and results are kept. After confirming, it leaves the Quizzes tab and shows under **Trash**.
- [ ] Signed out (or in another browser), the quiz is gone from `/join`, and its link and access code no longer open it.
- [ ] The leaderboard no longer shows that quiz (all-time, week and month).
- [ ] **Trash → Restore**: the quiz is listed again, its link works, and the leaderboard has the same people and points as before.
- [ ] **Trash → Delete forever**: the button stays disabled until the exact title is typed; the dialog states how many results go. After confirming, the quiz and its results are gone for good.
- [ ] Dashboard: the quiz count drops when a quiz goes to the trash.

## Admin Phase A1 (question model v2; on branch `phase-7-polish`, not merged or pushed yet)

A1 lets a question have several correct answers, adds a reason per option, and stores a result's answers as one `sheet` on the result instead of one document each. Old quizzes, old results and attempts in progress keep working without any step from you.

- [ ] After the deploy is live, run `npm run backfill:sheets` (a dry run: it prints how many older results would get a sheet), then `npm run backfill:sheets -- --apply`. Nothing reads the sheets yet (they are for the per-question reports in A5), so this can wait, but do it before A5. Safe to run again.

Check in a real browser after the deploy (about 10 minutes):
- [ ] As admin, edit a quiz: add a **Select all that apply** question with two correct options and a reason on a few options. Use **Preview question as a player** (eye icon) on it, then **After submitting**. Save, then open the quiz view: the type and reasons show.
- [ ] As a player, take that quiz: the question shows checkboxes and "Select all that apply · Choose 2". Submit with one of the two ticked: it counts as wrong. The review shows the correct options with their reasons, your wrong pick with its reason, and a **Why the others are wrong** fold.
- [ ] On a phone-sized window (390 wide) look at the question and the review with long option text: nothing runs off the screen, tap targets are comfortable.
- [ ] Start a quiz **before** the deploy and finish it **after** it: it still submits and shows its result. (Only possible if you have an attempt open when it goes live; otherwise skip.)
- [ ] Open an old result under **My quizzes**: the review still shows.

## Admin Phase A2 (import/export and the AI skill; after it is deployed)

Nothing here changes data you already have. The wizard creates quizzes **closed** unless you tick "Open it to players right away".

Check in a real browser as admin (about 15 minutes):
- [ ] **Quizzes → AI & formats**: the page opens signed in. Download the skill zip, the CSV template, the text template and the example; they open. Open `/ageno-quiz/schema.json` in a private window (signed out): it loads without a sign-in.
- [ ] **Import** with `skills/ageno-quiz-format/examples/full.ageno.json` (Choose file): "3 questions: all ready, 1 with a warning", the note is highlighted, **Continue → Create the quiz**. The quiz exists, is closed, has an access code, the select-all question shows "Select all that apply".
- [ ] Open the CSV template in Excel or Google Sheets, delete the `#` in front of `easy`, add two more rows (one with two correct answers, e.g. `A,C`), save as CSV (UTF-8) and import it. Also try copying the rows from the sheet and pasting them into the box. Both should give the same questions.
- [ ] A row with something wrong (empty question, an answer that names an option that isn't there): it says Needs fixing with the reason, **Edit** opens the normal question card, fixing it turns the row Ready; **Leave out** drops it.
- [ ] **Import into a quiz I have → Replace / Update** on a quiz with results: the plan lists new, changed, removed, unchanged per level before you press Import; nothing changes until you do.
- [ ] On a quiz page use **Export JSON / CSV / text**. Import the JSON back into the same quiz with **Update**: the plan says "N unchanged" and nothing else.
- [ ] In the quiz editor, **Import** (inside a level) opens the same checks in a dialog and adds to the draft without saving.
- [ ] 390-wide window: the Import page and the AI & formats page have no sideways scroll; the buttons are easy to tap; keyboard-only works through the steps (Tab, Enter, arrow keys on the option groups).
- [ ] The skill itself, in your own AI tool: install the zip (claude.ai: Settings → Features; Claude Code: unzip into `~/.claude/skills/`). Give it a short list of questions, one with several right answers and one with no answer given. It should write `quiz.ageno.json`, mark the guessed one with a note, run `validate.mjs`, and the file should import. Also try the **Copy AI instructions** text in a plain chat. Note what it got wrong and tell me.
- [ ] A big replace (optional, only on a throwaway quiz): import a file with 300+ questions in a level into a quiz with **Replace**. The page warns it is a large update; players can't start the quiz for a moment; afterwards it is whole.

## Admin Phase A3 (faster editing; after it is deployed)

Nothing here changes stored data: the draft copy lives in your browser only, and Duplicate saves an ordinary new (closed) quiz.

**Image upload is off by default** (Firebase Storage needs the paid Blaze plan; on the free plan, paste the address of a picture hosted elsewhere, which works as before). Skip this block unless you move to Blaze, then also set `NEXT_PUBLIC_IMAGE_UPLOAD=1` in Vercel and redeploy to show the Upload button:
- [ ] Firebase console → project `ageno-quiz-af3ff` → **Build → Storage → Get started** (production mode). New buckets may need the Blaze plan; check what the console says before agreeing to anything that costs money.
- [ ] Look at the bucket name at the top of the Files tab. If it is `ageno-quiz-af3ff.appspot.com` nothing more is needed. If it is `...firebasestorage.app`, add `FIREBASE_STORAGE_BUCKET` with that name to Vercel (Production and Preview) and redeploy.
- [ ] Optional, to keep the rules file in step with the console: `firebase deploy --only storage --project ageno-quiz-af3ff` (deny-all; the server's uploads don't use rules).
- [ ] In the editor open a question's **Explanation and image**, press **Upload**, pick a PNG: a preview shows, save, and the picture appears in the quiz as a player. A PDF or a file over 2 MB is refused with a message. Uploaded pictures are never deleted by the app (deleting a question or quiz leaves them in the bucket; remove them in the console if it matters).

Check in a real browser as admin (about 15 minutes):
- [ ] **Draft kept.** Open a quiz's editor, change the title and a question, wait a second (the bar says "copy kept on this device"), then close the tab without saving. Open the editor again: "You have unsaved changes from earlier" with **Restore them** / **Discard**. Restore brings the edits back; save, and reopen: no prompt. Also try a new quiz (`/quizzes/new`) the same way.
- [ ] Make a draft in one browser tab, save the quiz from a second tab, then reopen the first: the prompt warns the quiz was saved again after the copy was made.
- [ ] **Grid.** In the editor choose **Grid** (beside "Questions"): the page widens, one row per question. Fix a typo in a question and in an option, type `B` or `A, C` in Correct (the right options are tinted), use Up/Down/Enter to move, Enter on the last row adds a row. Pressing Enter anywhere never saves the quiz. Reload: it opens in the view you last used.
- [ ] **Paste rows.** In a spreadsheet make rows `Question, A, B, C, D, Correct`, copy them (with or without the header row), click a Question cell in the grid and paste. Rows appear (the text says how many cells and rows), a select-all answer such as `A, C` flips that row to "Select all", **Undo** puts it back.
- [ ] **Select and move.** Tick two questions (grid or cards): **Copy to** another level, **Go to** it, then **Move to** and **Delete**, each with **Undo**. Save and check the quiz view: the moved questions are in their new level.
- [ ] **Preview as a player** (eye icon on a question, or the button above the list): the real question screen, pick answers, **After submitting** shows the review with your reasons; Previous/Next steps through the level.
- [ ] **Checks** panel (above the level tabs): put the same question twice, leave explanations empty, give a level 40 questions and 5 minutes: each shows up, and clicking one jumps to the question.
- [ ] **Duplicate** (Quizzes list and the quiz page): the copy is "Copy of ...", closed, has its own access code and opens in the editor; the original is untouched.
- [ ] 390-wide window: the editor in card view has no sideways scroll; the grid scrolls sideways inside its own box only. Keyboard-only: Tab to the Grid toggle, edit cells with the arrow keys.

## UX plan (docs/UX_PLAN.md)

Compact exam screen (U3), about 5 minutes on a laptop and a phone:
- [ ] Start any quiz. A normal question (about 3 lines, 4 short options) and the Previous / Flag / Next buttons fit in the window **without scrolling** at roughly 1366×768 and on a 390-wide phone. A very long question or 6+ options scrolls, and on a phone the Next bar stays at the bottom.
- [ ] Top bar is one row: title, "Q 5 of 20", progress bar, clock, Submit. On a phone the title is hidden (it is still read by screen readers), the progress shows as a thin line along the bottom of the bar, and the clock, the questions button and Submit still fit.
- [ ] Picked option: thicker teal border, tinted fill, filled letter badge. Unpicked options have a visible border. Check the select-all questions the same way.

Theme switch (U1):
- [ ] A first visit (private window) opens **light**, with no dark flash while loading. Reload a few pages in both themes: no flash of the other theme.
- [ ] Header icon (desktop) steps Light, Dark, System; on a phone use the menu drawer. Profile → Appearance has the same three choices. The choice survives a reload and a new tab.
- [ ] On **System**, change the OS theme while the page is open: the page follows at once. Change the choice in one tab: another open tab follows.
- [ ] In a quiz, switch theme from the top bar (laptop) or the Questions sheet (phone); the answers and the clock are unaffected.
- [ ] Walk every screen in both themes and note anything unreadable or oddly dark/light (lobby, join, my quizzes, leaderboard, profile, sign-in/up, the home page, the admin pages): U5 will fix what you find.

Results and review (U2, U4), in light and dark:
- [ ] Finish a quiz that has several questions with reasons. The summary card is narrow: score, a three-cell strip (Correct, Time, Difficulty), then small quiet rows if there were unanswered questions or tab switches.
- [ ] In the review a right option is **green with a check and a "Correct answer" pill**, your wrong pick is **red with a cross and "Your answer"**, the others plain. You can tell them apart without colour (cover the colour: icons and words remain). Reasons sit in a ruled block inside the option, the general explanation is a grey ruled block, "Why the others are wrong" opens with a chevron.
- [ ] About **two** four-option questions with one reason each fit on a 1366×768 screen; on a phone about one and a half. If a card is still too tall, say which part (U4 can be tightened).
- [ ] Light mode text is comfortable to read: nothing pale grey you have to squint at, input boxes and answer options have a clear edge, the amber leaderboard numbers are readable.

Final checks (U5.2, U6.2, U6.3):
- [ ] **Phone and laptop, both themes.** Look at the lobby, an exam question, the result and the review in Light and Dark on a real phone and a laptop. Note anything pale, cramped or oddly dark/light.
- [ ] **Keyboard.** With Tab only: reach the header theme button (Enter/Space steps Light, Dark, System), the Profile → Appearance group (arrow keys move between Light / Dark / System), and the "Why the others are wrong" rows in the review (Enter opens them). A teal ring is visible on each, in both themes.
- [ ] **Screen reader** (NVDA on Windows or VoiceOver): the theme button reads its current setting and the next one; in the review each option says "Your answer" / "Correct answer" in words, and each reason says "Why it's correct" or "Why it's wrong".
- [ ] **Print.** Print (or "Save as PDF") a result page in Chrome: dark text on white, no coloured page background. Open `/opengraph-image` in a tab: the image is unchanged (dark, it is a fixed picture).

