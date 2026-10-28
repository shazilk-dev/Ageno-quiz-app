# Rich Text Plan: tables, scenarios and lists inside questions

**Purpose:** a question can hold structure, not just a line of text: a scenario paragraph, then a table, then the question; or a list; or a snippet of code. What an admin types, pastes or imports as a table must reach the player as a real table, in the exam, in the review and in the admin pages. The AI skill that converts a file into an Ageno Quiz file must produce such questions and check them.

- **Created:** 2026-10-28
- **Last updated:** 2026-10-28 (Session 6: R5)
- **Current phase:** All phases done. What is left is only the user's: R0.1 (confirming inline-only options) and the checks in `docs/MANUAL_STEPS.md` ("Rich text plan").
- **Same rules as the other plans:** read `docs/IMPROVEMENT_ROADMAP.md` ("How to use this file") first; tick a box only after verifying; run `npx tsc --noEmit` and `npm run lint` after each task and `npm run build` at the end of a phase; update this file's Status table and Session Log every session; reference task IDs in commits (`feat(richtext): R1.2 ...`). Things only the user can check (a phone, a real Excel or Word paste, claude.ai) go in `docs/MANUAL_STEPS.md`.

## Decisions

| Decision | Choice | Note |
|---|---|---|
| How structure is stored | **A Markdown subset inside the existing `text` string** | Agreed with the user on 2026-10-28. No schema change, no data migration, no Firestore change. Rejected: a separate `table` field (schema v3, snapshot upgrade, format v2, clumsy to author), HTML or a WYSIWYG editor (XSS, sanitizer, heavy), `react-markdown` (about 40-50 kB in the exam chunk, more syntax than wanted). |
| Syntax | GitHub-flavoured Markdown (GFM) subset | Because it is a subset of a standard, the hand-written parser can be swapped for a full library later with **no data migration**. |
| Where it applies | Question `text` and `explanation`: all blocks. Option `text` and `rationale`: inline only (bold, italic, code, line breaks) | **Proposed, confirm.** Say so if options should get tables too: it is one flag in the renderer, but it changes the import rules and the AI skill. |
| Parser | Own, about 200 lines, zero dependencies, pure (`lib/rich-text/`), output is a tree | The same parser serves the renderer, the editor checks, the importers and the bundled `validate.mjs`. |
| Safety | React elements only. No `dangerouslySetInnerHTML`, no HTML, **no links, no images** in v1 | An exam page must not carry a clickable link an author can disguise; images keep using `imageUrl`. A test fails if `dangerouslySetInnerHTML` appears in the rich-text code. |
| Format version | Stays `ageno-quiz` **v1** | The change is additive: an old file is still valid and renders the same. Only the skill text and examples change. |
| Column alignment | Explicit only (`:--`, `:-:`, `--:`) | No guessing from the numbers: predictable, and the AI skill writes `---:` for numeric columns. |
| Limits | `LIMITS.questionText` 2000 → **4000**, `LIMITS.explanation` 2000 → **4000**; `maxLevelBytes` unchanged (300 KB). **Done in R3** (the editor can now paste a big table), generated format files rebuilt. | A 6×8 table is about 400-600 characters. The level cap still protects the attempt document. |

## What the code looks like today (the audit, 2026-10-28)

- **Display is plain.** `QuestionView.tsx:59` and `QuestionReview.tsx:85` put `{question.text}` inside an `<h2>` with `whitespace-pre-line`: newlines survive, runs of spaces and tabs collapse, so a pasted table becomes jumbled lines. Option text, reasons and the explanation are the same (`whitespace-pre-line` spans).
- **The question text is the heading.** The `<h2>` is the focus target when the question changes and `aria-labelledby` of the section. A table inside a heading is invalid HTML and a screen reader would read the whole table as the heading. R2.1 splits this. `__tests__/quiz-attempt.test.tsx:117` finds the heading by the question text (`heading()`), and several tests check focus on it.
- **Storage already keeps structure.** `quiz-schema.ts` only trims the ends of `text`; inner newlines survive in Firestore, in the attempt snapshot, in JSON and in quoted CSV cells. So **no data or API change** is needed for the display.
- **The editor is a 2-row `<textarea>`** (`QuestionCard.tsx:175`) with no preview, no table helper. The Grid (`QuestionGrid.tsx:285`) edits the raw text in one cell.
- **Places that show question text**: `QuestionView`, `QuestionReview`, `PlayerPreview` (uses the two real components), `app/(admin)/quizzes/[quizId]/page.tsx:166`, import `CheckStep.tsx:141` (a 2-line clamp), the Grid cell and its `title`. Places that use it as a key: `lib/quiz-checks.ts` (`textKey`, duplicates).
- **The importers flatten.** `lib/quiz-import/text.ts` trims every line, joins wrapped lines with a space and ends a question's text at a blank line (the next line is reported "ignored"). `lib/quiz-format/write.ts:107` `oneLine()` flattens newlines when exporting the text format, so **export then import would destroy a table** unless R4.2 fixes it. JSON and CSV keep newlines.
- **The AI skill forbids it.** `lib/quiz-format/instructions.ts:25`, rule 7: "Plain text only in every string: no HTML and no Markdown". It also feeds the "Copy AI instructions" button and `skills/ageno-quiz-format/SKILL.md` (generated).
- **Bundle budget is tight.** `/q/[id]` is 169 kB of 170, `/my-quizzes/[attemptId]` is already 171. The exam (`QuizAttempt`) loads with `React.lazy`, so the renderer belongs in that chunk. `QuestionReview` is used by the signed-in result pages: check the size at the end of R2.

## Syntax reference (what R1 implements and the AI skill teaches)

Blocks are separated by a blank line. **A single newline inside a paragraph is a line break** (this is how plain text renders today; it differs from CommonMark on purpose).

````
A company recorded these sales figures.        <- paragraph

| Region | Q1  | Q2  |                          <- table: header row
|:-------|----:|----:|                          <- delimiter row (required): :-- left, --: right, :-: centre
| North  | 120 | 150 |                          <- body rows
| South  |  90 |  80 |

Which region grew in Q2?                        <- paragraph
````

| Construct | Syntax | Notes |
|---|---|---|
| Table | header row + delimiter row + body rows | Recognised **only** when the delimiter row follows the header and has the same number of cells. A line that merely contains `|` is plain text. Cells are inline text. Short rows are padded, extra cells are ignored by the renderer and **reported by the checks**. Write a pipe in a cell as `\|`. Leading and trailing pipes are optional. |
| List | `- item` / `* item` / `+ item`; `1. item` / `1) item` | At least **2 consecutive items** (one lone "- x" line stays text). Flat only, no nesting. |
| Code block | a line with three backticks, the code, a line with three backticks | Monospace, no inline parsing, scrolls sideways. |
| Bold, italic, code | `**bold**`, `_italic_`, `` `code` `` | `*italic*` with a single asterisk is **not** supported, so `2*3*4` stays as typed. `**` pairs and `_` pairs need a non-space next to the marks. `_` inside a word is not italic. |
| Escape | `\*  \_  \|  \`` and `\\` | Shows the character literally. |
| Not supported in v1 | HTML (shows as text), links, images, nested lists, headings, block quotes, merged cells, LaTeX | `<br>` is a common AI habit: the importers convert it to a line break and warn (R4.5). |

**Known edge cases** (the scan in R2.4 lists every existing question they would touch): `x**2 + y**2` becomes bold; `a_b_c` is fine; a line starting "1. " twice in a row becomes a list. Fix by backticks or a backslash.

## Design targets

### Rendering (R1, R2)

- **Layout.** Paragraphs keep today's measure (`max-w-[68ch]`, 18/20 px, weight 500 for the question). A table, a code block and a list may use the full width of the exam column, in `text-sm`/`text-base` weight 400 so the table reads as data, not as a heading.
- **Table look.** Tokens only (no `bg-ink`). Header row `bg-surface` + `text-text` weight 500; body `text-text-body`; outer edge `border-control-border`, inner lines `border-border`; cell padding `px-3 py-1.5`; `tabular-nums` in right-aligned columns; the first column is the row header only if the author's header cell is blank-free (no magic: all header cells are `<th scope="col">`). Zebra stripes off by default (less ink, fewer contrast pairs).
- **Small screens.** The table sits in a wrapper with `overflow-x-auto`, `tabIndex={0}`, `role="region"` and `aria-label="Table, scrolls sideways"` so a keyboard user can scroll it; a soft edge hint shows when there is more to the right. The page itself never scrolls sideways.
- **Compact exam.** The UX plan wants a normal question to fit one screen. A table is taller by nature: it scrolls like a long question does. No max-height inside the exam.
- **Plain text is untouched.** A question with no construct renders as paragraphs and line breaks, pixel for pixel like today (a golden test, R5.1).
- **If the parser ever throws,** `RichText` falls back to today's plain `whitespace-pre-line` text. A broken question never blanks the exam.

### Accessibility (R2.1)

- The exam heading becomes `<h2 class="sr-only">Question 3 of 20</h2>`; the question content is a `div` with `tabIndex=-1` that is the focus target and is labelled by that heading (`role="group"`, `aria-labelledby`). Focus on a new question reads "Question 3 of 20", then the content.
- Real `<table>`, `<thead>`, `<th scope="col">`, `<tbody>`. Lists are real `ul`/`ol`.
- `toPlainText(tree)` gives a one-line text for tooltips, list previews and screen-reader fallbacks.

### Authoring (R3)

- An admin never has to type a pipe: **Insert table** and **paste from Excel, Google Sheets or Word** produce the Markdown. A small **Formatting help** popover shows the syntax with the example above.
- Hand-editing a 6×8 table as raw pipes is tedious, so a table under the cursor can be opened in a small cell grid (**Edit table**, R3.5). This is the one task marked *recommended, may be deferred*; everything else works without it.

## Architecture

```
lib/rich-text/            pure, no React, no Firebase (runs in the browser, on the server and inside validate.mjs)
  types.ts                Block / Inline tree, Diagnostic
  parse.ts                parseRichText(text, { blocks: "all" | "inline" }) -> { blocks, diagnostics }
  plain.ts                toPlainText(blocks), hasStructure(blocks)
  build.ts                tableToMarkdown(cells, align), escapeCell()   (used by the editor and the paste converter)
  paste.ts                tsvToTable(text), htmlTableToCells(html)       (paste converter; the HTML half needs DOMParser)
  table-at.ts             findTableAt(text, cursor) / replaceTable(...)  (for Edit table)
components/rich-text/
  RichText.tsx            renders the tree; props: text, mode ("blocks" | "inline"), className
  RichTable.tsx           the scroll wrapper + table
components/admin/quiz-editor/
  RichTextField.tsx       textarea + toolbar + live preview + paste handler (replaces the question textarea)
  InsertTableDialog.tsx, TableEditorDialog.tsx, FormattingHelp.tsx
```

The tree has one node type per construct. **Adding a construct later** (an image, a formula) means one parser rule, one renderer case and one line in `instructions.ts`; the stored data stays a string.

`Diagnostic` = `{ kind: "table-columns" | "table-no-header" | "html-tag" | "unclosed-fence", line, message }`. The editor's `ChecksPanel`, `checkRows` (import) and `validateQuizFile` (the AI validator) all call the same parser, so the three say the same thing.

## Phases

### R0: Decisions and baseline (20 min)

- [ ] R0.1 *(open: building on the proposed default until the user says otherwise)* Confirm the open decision above (inline-only options) and the syntax table with the user.
- [x] R0.2 Run the tests the later phases touch once, so a later failure is known to be new: `quiz-attempt`, `question-review`, `quiz-schema`, `quiz-format`, `quiz-import`, `format-artifacts`, `import-wizard`, `quiz-editor` (one file at a time on a slow machine). Note the counts in the log.
- [x] R0.3 Note the current First Load JS of `/q/[id]`, `/my-quizzes/[attemptId]` and `/join` from `npm run build` as the baseline.

**Done when:** decisions are recorded here; baselines are in the log. *(Baselines are in the log; R0.1 is the one open item.)*

### R1: Parser and renderer (about 2 h)

- [x] R1.1 `lib/rich-text/types.ts`, `parse.ts`: paragraphs with line breaks, tables (strict recognition, alignment, `\|`, padding), flat lists (2+ items), code fences, inline bold/italic/code/escapes, `blocks: "inline"` mode (no tables, lists or fences; line breaks only). Never throws; every input gives a tree; a lone `|` line is text.
- [x] R1.2 `diagnostics`: table with the wrong column count, a table-like block without a delimiter row, `<br>` / HTML tags, an unclosed fence. A diagnostic never changes the tree.
- [x] R1.3 `plain.ts`: `toPlainText`, `hasStructure`.
- [x] R1.4 `components/rich-text/RichText.tsx` and `RichTable.tsx` with the look and the scroll wrapper above; try/catch fallback to plain text; memoised by `text` + mode.
- [x] R1.5 Add the table token pairs (header text on header fill, body text on page/surface, edge on page) to `scripts/check-contrast.mjs` for both themes.
- [x] R1.6 Unit tests: `__tests__/rich-text.test.ts` (syntax table above, one case per row, plus the edge cases) and `__tests__/rich-text-render.test.tsx` (real `<table>`, `th scope`, scroll region, no `<script>`/`<img>` produced from `<script>` / `<img onerror>` input, fallback on a forced parser error).

**Done when:** the unit tests pass; `tsc`, `lint` clean; contrast test green.

### R2: Show it everywhere a question is shown (about 1.5 h)

- [x] R2.1 `QuestionView`: the sr-only heading + focus-target content block described under Accessibility; question text through `RichText`; the select-all hint and the image stay as they are. Update `quiz-attempt.test.tsx` helper `heading()` and the focus assertions (behaviour must not change: focus lands on the new question).
- [x] R2.2 `QuestionReview`: question and explanation through `RichText` (blocks); option text and reasons through `RichText` (inline). Keep the card layout and the status pills; `question-review.test.tsx` must still pass.
- [x] R2.3 Admin: `app/(admin)/quizzes/[quizId]/page.tsx` detail; import `CheckStep.tsx` row preview (replace the 2-line raw clamp by `toPlainText` clamped, plus a small "table" tag when the question has one); Grid cell shows the first line + a "table" tag (editing there stays raw; the cell says "Edit in cards").
- [x] R2.4 `scripts/scan-richtext.ts` + `npm run scan:richtext` (dry run, read-only, same style as `backfill:*`): lists every stored question, option, reason and explanation that would render **differently** from today (any table, list, fence, bold, italic, code or escape) with quiz id, level and a snippet. Run it before release and fix or accept each hit (usually: backticks around a formula).
- [x] R2.5 `npm run build`: compare First Load JS with the R0.3 baseline; keep every public page under 170 kB. If `/my-quizzes/[attemptId]` grows, load `RichTable` with `React.lazy` (only questions that have a table need it).

**Done when:** a question written as scenario + table shows correctly in the exam, the review, the result page and the admin detail; a plain question is unchanged (golden test); focus and reading order in the exam are as before.

### R3: Editor: write, paste and check (about 3 h; 4.5 h with R3.5)

- [x] R3.1 `RichTextField`: auto-growing textarea (3 rows to start), small toolbar (Table, Bold, List, Code; Ctrl+B for bold), live **Preview** under the box (collapsed for a question with no structure, open once it has a table or list; uses the same `RichText`). Replaces the textarea in `QuestionCard` for the question text and the explanation. Option text keeps its small inputs.
- [x] R3.2 `InsertTableDialog` + `build.ts`: rows (1-20) × columns (1-8) steppers, "first row is the header" on; inserts the template on its own paragraph at the cursor with blank lines around it.
- [x] R3.3 Paste converter (`paste.ts` + handler in `RichTextField`): if the clipboard has `text/html` with a `<table>` (Word, Google Docs, Excel, web), or `text/plain` with 2+ lines of the same tab count ≥ 1 (Sheets, Excel), insert a Markdown table; merged cells repeat their text, nested tables flatten, line breaks inside a cell become spaces, pipes are escaped. Otherwise the browser's own paste runs. After converting, a one-line notice: "Pasted as a table. **Paste as plain text instead**" (swaps to the raw paste).
- [x] R3.4 `ChecksPanel` / `lib/quiz-checks.ts`: advice from the parser's diagnostics ("Row 3 has 5 cells but the header has 4", "This looks like a table but has no `|---|` line", "HTML is shown as text"), plus "More than 6 columns: players on a phone will scroll sideways" and "More than 25 rows". Advice only, as the panel is today.
- [x] R3.5 *(recommended, may be deferred)* `TableEditorDialog` + `table-at.ts`: when the cursor is inside a table, **Edit table** opens its cells in a small grid (add/remove row or column, alignment per column), and writes back an aligned Markdown table. Pasting a block of cells into the dialog works (reuse `grid.ts` parsing).
- [x] R3.6 `FormattingHelp` popover: the syntax table and the scenario + table example, copyable.
- [x] R3.7 Check that nothing else loses the text: copy and move across levels, Duplicate quiz, the draft in localStorage, Undo (`setQuestions`), `PlayerPreview`. Check `grid.ts` copy/paste of a cell with line breaks does not split into rows (quoted cells); fix or block with a clear message.
- [x] R3.8 Tests: `rich-text-paste.test.ts` (TSV, HTML table fixtures from Word/Sheets/Excel saved as strings), `quiz-editor-richtext.test.tsx` (insert, paste, convert-back, preview, checks), existing `quiz-editor*.test.tsx` unchanged and green.

**Done when:** an admin can paste a table from Excel or Word into a question and see it render under the box, and the saved quiz shows it to players; the checks say so when a table is broken.

### R4: Import, export and the AI skill (about 2.5 h)

- [x] R4.1 `lib/quiz-import/text.ts` (the plain-text format): the text of a question may now span blank lines and table lines up to the first option/explanation/image line, **line breaks kept** where the author put a blank line or a `|` line; ordinary wrapped lines still join with a space. A list inside a question's text cannot be written in this format (a `- ` line is an option there): say so in the template and use JSON or CSV for lists.
- [x] R4.2 `lib/quiz-format/write.ts`: the text export keeps a question's line breaks (the `oneLine` call stays for options and reasons). **Round trip tests** for all three formats: export → import gives the same question text for plain, table, list and code questions.
- [x] R4.3 CSV and pasted spreadsheet (`lib/quiz-import/table.ts`, `spreadsheet.ts`): a quoted cell holding line breaks and pipes survives, including the quoted-cell form Excel puts on the clipboard. Fix if it does not.
- [x] R4.4 `lib/quiz-format/instructions.ts`: **rewrite rule 7** (Markdown subset allowed in `text` and `explanation`; options and reasons inline only; no HTML, links, images) and **add a table rule**: keep a table, a schedule or a data grid the question depends on as a Markdown table, never flatten it into a sentence and never replace it by an `imageUrl`; scenario, then table, then the question, with blank lines between; every row the same number of cells; the `|---|` row is required; numbers right-aligned with `---:`; write line breaks as `\n` in JSON; keep tables to about 6 columns and 12 rows, split a bigger one; do not invent cells that the source does not have (mark them `-` and add a `note`). The limits rule picks up the new `LIMITS` numbers by itself.
- [x] R4.5 `lib/quiz-format/examples.ts`: put a scenario + table question (and one with a list) in `FULL_EXAMPLE`; `lib/quiz-import/templates.ts`: the same in the CSV and text templates. `json-schema.ts`: the `text` and `explanation` descriptions mention the subset. Importers (`read.ts`, `text.ts`, `spreadsheet.ts`) turn `<br>` / `<br/>` into a line break and add a warning ("converted"), because AIs write it.
- [x] R4.6 `lib/quiz-format/checks.ts` and `validate.ts`: the parser's diagnostics become warnings in the report (so the bundled `validate.mjs` prints them and the AI can fix them before handing the file over). A broken table is a warning, not an error, so an import is never blocked by it.
- [x] R4.7 `CheckStep` (import wizard) shows the rendered question under the editable row (reuse R3.1's preview), so a table is seen before it is imported. `/quizzes/ai` page text mentions tables.
- [x] R4.8 `npm run build:format`, commit the generated `public/ageno-quiz/*` and `skills/ageno-quiz-format/*`; `format-artifacts.test.ts` and `build:format -- --check` pass. Update `quiz-format.test.ts`, `quiz-import.test.ts`, `import-wizard.test.tsx` for the new cases.
- [x] R4.9 MANUAL_STEPS: re-upload the new skill zip in claude.ai (Settings > Features) and convert one real past paper that has tables; keep the result as a fixture only if the user agrees.

**Done when:** a past paper with tables goes through the skill (or the pasted instructions) into a JSON file whose tables render in the import preview and in the exam; a table survives export and re-import in JSON, CSV and text.

### R5: Hardening, QA and docs (about 1.5 h)

- [x] R5.1 Golden test: a set of plain questions (the ones in the existing tests, plus awkward ones with `|`, `*`, `_`, `-`, `1.`, `<b>`) renders text-for-text as before.
- [x] R5.2 Fuzz test: random strings (including very long, 4000 characters, and 200-row tables) never throw, finish fast, and never produce an element other than the allowed set.
- [x] R5.3 Safety test: `<script>`, `<img onerror>`, `javascript:` links and `[x](http://...)` input show as inert text; a test greps `lib/rich-text`, `components/rich-text` and the editor for `dangerouslySetInnerHTML`.
- [x] R5.4 Run the full checks: `tsc`, `lint`, `build` (page sizes against the budget), the affected test files, and `npm run scan:richtext` (R2.4) against the real data. Record the sizes and the scan result in the log.
- [x] R5.5 Docs: `CLAUDE.md` (a "Rich text in questions" paragraph in the data layer or format section; the plan in the first bullet), `docs/ADMIN_PLAN.md` (a line in 3.3 pointing here), the Status table and the log here.
- [x] R5.6 `docs/MANUAL_STEPS.md` ("Rich text plan"): see the section added with this plan; tick it as the user checks.

**Done when:** all of the above is green and documented; the manual checks are listed for the user.

## Effort and risk

About 2-3 working sessions: R0-R2 (the renderer, visible to players), R3 (the editor), R4-R5 (import, AI skill, hardening). Dropping R3.5 saves 1.5 h.

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing text renders differently (`x**2`, a line "1. foo" twice) | Low | Strict rules (2+ list items, table needs the delimiter row, no single-asterisk italic), golden test, and the **scan script against the real data** before release. |
| The exam's focus and reading order break when the heading changes | Medium | R2.1 is its own task with the existing focus tests adapted, then a screen-reader check in MANUAL_STEPS. |
| A table is too wide on a phone | Medium | Scroll region, advice at more than 6 columns, the skill is told to split big tables; the image field stays as the fallback. |
| Page size over budget (`/q/[id]` 169, result page 171) | Medium | Renderer lives in the lazy exam chunk; `RichTable` can be lazy; measured in R2.5. |
| An AI writes tables the parser does not read (no delimiter row, HTML) | Medium | The validator warns, the importers convert `<br>`, the skill rule gives the exact pattern and an example. |
| Export to the text format loses a table | High if not fixed | R4.2 and its round-trip tests are required, not optional. |
| Excel / Word paste differs by app | Medium | Fixtures for each in R3.8; the real-app check is in MANUAL_STEPS; "paste as plain text" is always one click away. |

## Order of work

R0 → R1 → R2 (players see tables; safe to ship alone, because plain text is unchanged) → R3 → R4 → R5. R4.1-R4.3 (importers) can be done before R3 if the AI skill is the more urgent route.

## Out of scope (ideas for later)

- **A shared scenario for several questions** ("use this table for questions 4 to 6"). Today the author repeats the scenario in each question (copy and Duplicate work, and the level byte cap counts each copy). A proper question group needs a data model change (ADMIN_PLAN territory) and is the first thing to add if case-study papers are common.
- Images inside question text (`![alt](https://...)`) and links; merged cells; nested lists; headings; LaTeX / formulas (KaTeX is a lazy chunk if ever needed); sortable tables.
- Rich text in the quiz description, the lobby or option rows beyond inline marks.
- Swapping the parser for a library: possible at any time without a migration (the syntax is GFM).

## Status

| Phase | Title | Status |
|---|---|---|
| R0 | Decisions and baseline | Baselines done; R0.1 (confirm inline-only options) open |
| R1 | Parser and renderer | Done |
| R2 | Show it everywhere | Done (manual checks in MANUAL_STEPS) |
| R3 | Editor: write, paste, check | Done (real-browser checks in MANUAL_STEPS) |
| R4 | Import, export, AI skill | Done (re-upload the skill and the real-paper check are in MANUAL_STEPS) |
| R5 | Hardening, QA, docs | Done (the manual checks in MANUAL_STEPS and R0.1 are the user's) |

## Session log

- **2026-10-28 (Session 1):** Planning only; no code changed. Read how question text is stored (plain string, inner newlines kept), shown (`whitespace-pre-line` in an `<h2>` that is also the focus target), edited (2-row textarea, Grid cell), imported (`text.ts` joins wrapped lines and ends a question at a blank line) and exported (`write.ts` `oneLine` flattens the text format), and where the AI skill forbids Markdown (`instructions.ts` rule 7). Chose a GFM subset inside `text` (no schema change). Found and planned for: the heading/focus structure, the export round trip, the tight page-size budget, `<br>` from AIs, and the need for a scan of existing data. Next: R0, then R1.
- **2026-10-28 (Session 2): R0 and R1.** Proceeded on the proposed default for R0.1 (options inline only; the parser's `blocks: "inline"` mode is the one switch), so R0.1 stays open until the user confirms.
  - **Baselines (R0.2):** `quiz-attempt` 47, `question-review` 6, `quiz-schema` 28, `quiz-format` 62, `quiz-import` 37, `format-artifacts` 11, `import-wizard` 15, `quiz-editor` 26 tests, all passing. **First Load JS (R0.3):** `/q/[id]` 169 kB (page 8.39), `/my-quizzes/[attemptId]` 171 kB (6.57), `/join` 166 kB (4.94), `/my-quizzes` 169 kB, `/` 163 kB, shared 103 kB.
  - **R1.1-R1.3:** `lib/rich-text/types.ts`, `parse.ts`, `plain.ts` (pure, no dependencies). Also in the parser: a table, a fence or a list may start on the line right after a paragraph line (no blank line needed); a table ends at the first line without an unescaped pipe (GFM would keep it as a row; this is kinder to AI output that forgets the blank line); a fence line may not contain other backticks (so ```x``` inside a sentence is a code span); `_` and `**` are searched for a closer once per paragraph, so unmatched marks cannot go quadratic (4000-character worst cases parse in under 10 ms). Row numbers in the "table-columns" advice count the header as row 1.
  - **R1.4:** `components/rich-text/RichText.tsx`, `RichTable.tsx`, plus two small helpers the plan did not list: `Inlines.tsx` (shared by both, avoids an import loop) and `ScrollRegion.tsx`. **Deviation:** the scroll box becomes a focusable `role="region"` with the label "Table, scrolls sideways" only when the content really overflows (measured with a ResizeObserver), so a small table adds no tab stop and no false "scrolls" announcement; the soft right edge is an inset shadow in the `text-muted` token (the brand has no gradients). Code blocks use the same box.
  - **R1.5:** six labelled table pairs added to `scripts/check-contrast.mjs`; they restate existing token pairs, both themes pass.
  - **R1.6:** `__tests__/rich-text.test.ts` (43 tests) and `__tests__/rich-text-render.test.tsx` (13 tests).
  - **Verification:** `npx tsc --noEmit` clean, `npm run lint` clean, `rich-text`, `rich-text-render` and `theme-contrast` tests green (58). Nothing imports the renderer yet, so no screen changed. `npm run build` passes and every page size is unchanged from the baseline (169 / 171 / 166 kB).
  - **Next:** R2 (QuestionView/QuestionReview/admin use `RichText`), after R0.1 is confirmed or accepted.
- **2026-10-28 (Session 3): R2.**
  - **R2.1 `QuestionView`:** the heading is now a screen-reader-only `h2` "Question N of M". The question is `RichText` inside a `div` (`tabIndex=-1`, `role="group"`, labelled by that heading) that takes the focus. Option text is inline `RichText`. **Decision beyond the plan:** the options' `radiogroup`/`group` used to be named by the heading, which held the question text; now it is named "Question N of M" + the question text for a plain question (the same words as before) but only "Question N of M" when the question has a table or list, so a screen reader does not read a whole table every time the options are entered. `quiz-attempt.test.tsx`: only the `heading()` helper changed (it finds the group); every focus and keyboard assertion passes unchanged.
  - **R2.2 `QuestionReview`:** "Question N" is now the `h3`; the question and the explanation are block `RichText`; option text, reasons and the "why the others are wrong" list are inline. `question-review.test.tsx` passes unchanged.
  - **R2.3 admin:** the quiz detail page uses `RichText`; the import `CheckStep` row shows `toPlainText` clamped to 2 lines plus a tag per table / list / code block. **Found and fixed (not in the plan):** the Grid's cells are `<input type="text">`, which cannot hold a line break: a table would show flattened and the first keystroke would **save it flattened**. A question or option text with a line break now shows as a read-only cell (first line, a tag for what is inside, click opens the card) in `QuestionGrid` (`MultilineCell`). This also protects any existing multi-line question. New helpers `structureOf` and `firstLine` in `lib/rich-text/plain.ts`.
  - **R2.4 scan:** `npm run scan:richtext` (read-only; `lib/rich-text/scan.ts` pure, `lib/server/richtext-scan.ts` reads every quiz incl. the trash and the legacy collection, `scripts/scan-richtext.ts` prints). A text counts as "different" when its rendered words differ from the typed words, so it catches tables, lists, code, bold, italic, code spans and escapes without a separate rule per construct. **Not run against real data yet** (needs `.env.local`): it is in MANUAL_STEPS.
  - **R2.5 sizes:** the first measurement put `/my-quizzes/[attemptId]` at 174 kB (baseline 171). Fixes: `RichTable` and a new `RichCode` load with `React.lazy` (as the plan said), and the result page loads `ResultsScreen` with `React.lazy` too (the server still renders it into the HTML). First Load JS now: `/q/[id]` 169 (unchanged), `/join` 166 (unchanged), `/` 163, **`/my-quizzes/[attemptId]` 167 (was 171)**, `/my-quizzes` 169. Admin pages grew by their share of the parser: `/quizzes/[quizId]` 168 → 171, `/quizzes/[quizId]/edit` and `/new` 197 → 201, `/quizzes/import` 182 → 184 (not public pages, no budget).
  - **Tests:** `rich-text-screens.test.tsx` (21: the exam heading and focus with a table, the options' name, a golden set of 9 plain texts, review with tables and marks, the Grid never flattening), `rich-text-scan.test.ts` (8), a new "ready" case in `server-rendered-pages.test.tsx` (the lazy result page shows a table without a request). `rich-text-render.test.tsx` now waits for the lazy table. Affected files all green (rich-text 43, render 13, scan 8, screens 21, quiz-attempt 47, question-review 6, admin-pages 18, quiz-editor-speed 22, import-wizard 15, theme-contrast 2, my-quizzes-page 5, server-rendered-pages 6); `tsc` and `lint` clean; `npm run build` passes.
  - **Behaviour to know:** a table or code block appears one tick after the text around it (its code loads on its own; a grey placeholder holds the place). In the exam the focus does not move when it appears (tested).
  - **Not done / next:** R3 (editor). The editor's question box is still the plain textarea, so for now a table can only come from an import file or the JSON.
- **2026-10-28 (Session 4): R3.**
  - **R3.1 `RichTextField`** (`components/admin/quiz-editor/`): replaces the textarea for the question text and the explanation in `QuestionCard` (same ids and labels, so Jump-to-question and every existing test work). A box that grows with its text (3 rows to start), a toolbar (Insert table, Edit table when the cursor is in one, Bold with Ctrl/Cmd+B, Bulleted list, Code block, Formatting help), the preview, a character count once within 20% of the limit. The preview is a disclosure button (closed for plain text, opens by itself once there is a table, list or code block, and stays as the author left it after a click). **Added beyond the plan:** the parser's advice also shows right under the box (first two items), because the Checks panel is folded away and an author fixing a table wants to see the problem at once.
  - **Toolbar edits keep the browser's Undo:** the change is handed to `document.execCommand("insertText")` after selecting the range; if the browser refuses it falls back to setting the value and restoring the selection. The edits themselves are pure functions (`lib/rich-text/edit.ts`: `insertBlock`, `toggleBold`, `toggleList`, `insertCodeBlock`). `insertBlock` also swallows the spaces next to the cut, so inserting in the middle of a sentence leaves no dangling spaces. jsdom has no `execCommand`, so the tests cover the fallback; **Ctrl+Z in a real browser is in MANUAL_STEPS**.
  - **R3.2 + R3.5 are one dialog, `TableEditorDialog`** (Insert and Edit): a grid of cells with add / remove row and column buttons, an alignment select per column, Enter moves down a row, and a block of cells pasted into any cell fills the grid from there. **Deviation from R3.2:** buttons instead of steppers (add stops at 8 columns and 20 body rows, unless the table being edited is already bigger), and no "first row is the header" checkbox: Markdown needs a header row, so an **all-empty header means no header** and `RichTable` now leaves out the `thead` in that case (test in `rich-text-render`). Cells are edited as source (`**bold**` stays bold, `\|` shows as `|`): `editableCell` / `storableCell` in `lib/rich-text/build.ts`. R3.5 was not deferred.
  - **`parse.ts` refactor:** the block scan is now `scanBlocks(lines)` (exported), and `parseAll` builds the tree and the diagnostics from it. `findTableAt` (`lib/rich-text/table-at.ts`) uses the same scan, so a line is a table in the editor exactly when it is one on the player's screen (and a table inside a code fence is not one). No behaviour change: the 77 parser / renderer / screen tests passed untouched.
  - **R3.3 paste converter** (`lib/rich-text/paste.ts`): an HTML `<table>` first (Excel, Sheets, Word, web: merged cells repeat their text, `<br>` and paragraphs become spaces, nested tables flatten, `style` / `script` ignored, exactly one top-level table, at least 2 rows and 2 columns), else tab-separated text (2+ lines with the same number of cells, 2+ cells; quoted cells with line breaks work through the importer's `parseTable`). **Not taken for a table:** one line, ragged lines, a single column, a column that is empty on every line (indented code), a quote that never closes, more than 2000 cells: those paste as the browser always did. Cell text goes through `escapeCell`, so `|`, `**`, a lone `_` at a word edge and backticks come out as the same words (tested against the parser for 15 awkward strings). The notice "Pasted as a table. Paste as plain text instead" puts back exactly what the browser's own paste would have left (spaces next to the cursor included) and goes away as soon as the text changes.
  - **R3.4 checks** (`lib/quiz-checks.ts`): new codes `formatting` (the parser's diagnostics for the question text, explanation, options and reasons; one line per text, "(2 more problems in this text.)" for the rest, "line N" only in multi-line text), `wide-table` (more than 6 columns) and `long-table` (more than 25 rows). A text with none of `|`, a backtick or `<` is not parsed at all. Advice only, as before.
  - **R3.6 `FormattingHelp`** is a dialog (not a popover): the syntax table, the scenario + table example (`lib/rich-text/example.ts`, also what R4's AI instructions can reuse) with a Copy button and how it renders.
  - **Limits (planned for R4, done here):** `LIMITS.questionText` and `LIMITS.explanation` 2000 → 4000, `npm run build:format` rerun (generated files committed-ready, `format-artifacts` passes). A 20 × 8 table can pass 2000 characters, and the editor should not let an author paste something the save then refuses.
  - **R3.7:** checked and covered by tests: save (only the ends are trimmed), the copy kept on the device, Duplicate quiz, copy across levels (`cloneAsNew`), duplicate question, and pasting a spreadsheet cell with line breaks into the Grid (a quoted cell stays one cell; it does not split into rows). Nothing needed fixing. The Grid's own cell stays read-only for multi-line text (R2).
  - **R3.8 tests:** `rich-text-edit.test.ts` (53: table writing, cell escaping round trips, every toolbar edit, `findTableAt`, the checks), `rich-text-paste.test.ts` (22: Excel, Sheets and Word HTML fixtures, merged cells, nested tables, TSV edge cases), `quiz-editor-richtext.test.tsx` (36: toolbar, Insert / Edit table, paste and Paste-as-plain-text, preview, advice, help, and through the real editor: save, Checks panel, duplicate, draft). Together with the existing suites: 17 files, 444 tests, all passing, `tsc` and `lint` clean.
  - **Sizes (`npm run build` passes):** public pages unchanged from R2: `/q/[id]` 169 kB, `/my-quizzes/[attemptId]` 167, `/join` 166, `/my-quizzes` 169, `/` 163. Admin pages (no budget) grew by the editor's share: `/quizzes/[quizId]/edit` and `/new` 201 → 207 kB, `/quizzes/import` 184 → 192 (the import check step uses the same question card), `/quizzes/[quizId]` 171 (unchanged). The two dialogs could load on click if the admin pages ever need the room.
  - **Not done / next:** R4 (importers, export round trip, AI skill rewrite, `validate.mjs` warnings, import preview). The text rule in `instructions.ts` still says "plain text only" until R4.4. Real-browser checks for R3 are in MANUAL_STEPS.
- **2026-10-28 (Session 5): R4.**
  - **R4.1 plain-text reader** (`lib/quiz-import/text.ts`, new `multiline.ts`): a question and an explanation may run over several lines. Rules, shared with the writer so a text written out reads back identical: a blank line is kept (two blank lines stay two); a line with a `|`, a code fence, or a line that starts like a mark (or sits next to one) keeps its break; a code block (three backticks) is taken exactly, whatever is inside; a line ending with `\` keeps its break (the backslash goes); any other wrapped line still joins with a space. **Deviation from the plan:** a list inside a question *can* be written in this format: put a backslash before a line that would be read as a mark (`\- item`, `\2. item`, `\> note`) and the reader drops it. The text template shows it. An unclosed code block is an error on its row naming the line, because it would swallow the rest of the file. After an option, a blank line still ends the continuation (loose text is still "ignored").
  - **R4.2 export** (`write.ts`): the text export writes a question's and an explanation's line breaks with `writeMultiline` (options and reasons stay one line). Round-trip tests run 12 awkward texts (plain, table, list with and without blank lines, code, code first, single line breaks, a pipe in prose, lines that look like marks, several blank lines, trailing backslashes, text around a fence) through JSON, CSV and the text format: question and explanation come back identical. Limits of the text format only: leading spaces on a line (outside a code block) and trailing spaces in code are not kept; JSON and CSV keep everything.
  - **R4.3 CSV / pasted cells:** `parseTable` already read quoted cells with line breaks, pipes and doubled quotes (tests added for the Excel clipboard form and a CSV file). One fix: Windows line ends inside a cell now become plain `\n` (`cellAt` in `spreadsheet.ts`).
  - **R4.4 rules** (`instructions.ts`): rule 7 now allows the Markdown subset in `text` and `explanation` (options and reasons one line; no HTML, links, images or headings; never `<br>`); new rule 8 "Keep a table as a table" (scenario, table, question; same number of cells in every row; the `|---|` row; `---:` for numbers; `\n` in JSON; about 6 columns and 12 rows; do not invent cells, use `-` and a `note`); the old 8 and 9 are now 9 and 10, and rule 9 says a table or HTML warning means the question will not look as meant, so fix it. The limits rule already follows `LIMITS` (4000).
  - **R4.5:** `FULL_EXAMPLE` has a scenario + table question (easy) and a list question (hard); the CSV template has a second (commented) sample row with a table; the text template has questions 3 (table) and 4 (list, with backslashes); the JSON Schema describes the subset on `text` and `explanation`. `<br>`, `<br/>` and `<BR />` become a line break (a space inside a table row; code blocks untouched) in **every** reader, in option and reason texts too, with a warning on the row (`finishRows` in `lib/quiz-format/types.ts`, `breaks.ts`).
  - **R4.6:** the editor's advice moved to `lib/rich-text/advice.ts` (`formattingAdvice`: one source for the Checks panel, `checkRows` and so `validate.mjs`). A broken table, HTML shown as text, a table over 6 columns or 25 rows is a warning on the row: an import is never blocked by it, the wizard marks the row Check, and `validate.mjs` prints it with its place ("Easy · question 1: Question text, line 3: Row 2 has 3 cells but the header has 2...").
  - **R4.7:** the import check step draws a question that has a table, list or code block with the real `RichText` (otherwise the 2-line text as before); the AI & formats page and its "rules in short" mention tables, the line-break rule of the text format and `<br>`.
  - **R4.8:** `npm run build:format` rerun (schema, templates, example, `SKILL.md`, `validate.mjs`, zip); `format-artifacts` passes (`--check` too). Updated counts in `quiz-format.test.ts` (the full example now has 5 questions); new `rich-text-import.test.ts` (58 tests), a `validate.mjs` case in `format-artifacts.test.ts`, a table case in `import-wizard.test.tsx`.
  - **Verification:** `tsc` and `lint` clean; `rich-text-import` 58, `quiz-format` 62, `quiz-import` 37, `format-artifacts` 12, `import-wizard` 16, `quiz-editor` + `quiz-editor-richtext` + `quiz-schema` + `rich-text-screens` + `admin-pages` 129, `rich-text` + `rich-text-edit` all green. `npm run build` passes: public pages unchanged (`/q/[id]` 169 kB, `/my-quizzes/[attemptId]` 167, `/join` 166); admin: `/quizzes/import` 192 → 194, `/quizzes/[quizId]` 171 → 173, `/quizzes/ai` 120.
  - **R4.9:** added to MANUAL_STEPS (re-upload the skill zip, a real past paper, Excel / Sheets cells with line breaks, the templates). Not done here: they need claude.ai and Excel.
  - **Next:** R5 (golden, fuzz and safety tests, the full check, `CLAUDE.md` and `ADMIN_PLAN.md` lines).
- **2026-10-28 (Session 6): R5.**
  - **R5.1-R5.3 `__tests__/rich-text-hardening.test.tsx` (45 tests):** *Golden:* 29 plain questions (pipes, `*`, `_`, dashes, `1.` and `1)` alone, a lone `- `, `<b>`, `\`, a URL with underscores, `![alt](url)`...) render the same words in the same order in both modes with no table, list, bold, italic, code, link or image, and a plain text draws no advice; the documented changing cases (`x**2 + y**2`, two numbered lines) are pinned so they cannot drift. *Fuzz:* a seeded generator (replayable) makes 600 texts in both parser modes that never throw, stay inside the node set (a table row always has the header's width, a list always 2+ items), and the test fails if the generator stops reaching tables, lists and code (the first version never made a table, and the check caught it); 15 worst-case 4000-character texts (unclosed `**`, `_`, backtick, only pipes, backslashes, repeated header/delimiter rows, fences, blank lines) each parse in under 400 ms (they take a few ms); a 200-row and a 5000-row table; 40 random texts and a 200-row table are rendered and every element is on an allow list (`div span p br strong em code ul ol li table thead tbody tr th td pre`) with no `on*`, `href`, `src` or `srcdoc` attribute. *Safety:* 13 hostile strings (script, img onerror, svg onload, iframe, `javascript:` and `http` links, images, entities, markup inside bold or backticks) in six places (paragraph, table cell, table header, list item, bold, inline option) stay inert text; a source check bans `dangerouslySetInnerHTML`, `.innerHTML =`, `.outerHTML =`, `insertAdjacentHTML` and `document.write(` under `lib/rich-text`, `components/rich-text`, the editor and the exam. Nothing in the code needed fixing; no behaviour changed in this session.
  - **R5.4 checks:** `tsc` and `lint` clean. `npm run build` passes. First Load JS: `/q/[id]` **169 kB**, `/my-quizzes/[attemptId]` **167**, `/join` **166**, `/my-quizzes` 169, `/` 163 (all under 170, none larger than the R0.3 baseline, and the result page is 4 kB smaller); admin (no budget): `/quizzes/[quizId]/edit` and `/new` 209, `/quizzes/import` 194, `/quizzes/[quizId]` 173, `/quizzes/ai` 120. Tests, all passing: rich-text 43, render 14, screens 21, scan 8, edit 53, paste 22, import 58, hardening 45, quiz-attempt 47, question-review 6, quiz-schema 28, quiz-format 62, quiz-import 37, theme-contrast 2, quiz-editor 26, quiz-editor-richtext 36, quiz-editor-speed 22, quiz-editor-tools 27, import-wizard 16, admin-pages 18, format-artifacts 12, server-rendered-pages 6.
  - **`npm run scan:richtext` against the real data (read-only):** 54 questions in 3 quizzes, **12 texts would look different, all intended**. 9 are backticks around code in the JavaScript and Python quizzes (`` `NaN` ``, `` `typeof null` ``, `` `bool([])` ``...) which now show as code. 3 are in "PCAO-F Exam Practice" (medium): ordering questions whose text ends in "1. ... 5. ..." lines; they now show as a real numbered list, which is what the author meant. No `x**2`-style accident was found, so nothing needs editing before release. No question in the data has a table yet.
  - **R5.5 docs:** `CLAUDE.md` has a "Rich text in questions" section and the test-file mention; `docs/ADMIN_PLAN.md` 3.3 points here; this file's Status and header.
  - **R5.6:** the "Rich text plan" section in MANUAL_STEPS was written with the earlier phases; I added the scan result under its first item. Still open for the user: phone, dark mode, screen reader, real Excel / Sheets / Word paste, Ctrl+Z, re-upload of the skill zip and a real past paper, and R0.1.
  - **Next:** nothing in this plan. Ideas for later are under "Out of scope" (a shared scenario for several questions is the first to consider).
