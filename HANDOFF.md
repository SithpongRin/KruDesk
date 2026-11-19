# KruDesk — Handoff for a new chat

> **ខ្មែរ (សង្ខេប)** ៖ ឯកសារនេះប្រាប់ AI ថ្មី (Claude ឬ Gemini) ពីស្ថានភាពគម្រោង ការសម្រេចចិត្តរបស់គ្រូ
> វិធានធ្វើការ និងការងារដែលនៅសល់។ ចាប់ផ្ដើមឆាតថ្មីដោយឲ្យ AI អានឯកសារនេះមុនគេ។
>
> Last updated: 2026-11-20 (handed back to Gemini) · Live commit: see `git log -1` on `main` (check Settings → «អំពីកម្មវិធី»)

---

## 1. What KruDesk is

An offline-first web app for Cambodian homeroom teachers (គ្រូបន្ទុកថ្នាក់): classes & students,
daily roll call (បញ្ជីហៅឈ្មោះ), monthly/semester/annual scores (បញ្ជីពិន្ទុ), and student ID cards
(កាតសិស្ស). No login, no backend — all data lives in the browser (IndexedDB `KruDeskDB`).

- Live: https://sithpongrin.github.io/KruDesk/
- Repo: https://github.com/SithpongRin/KruDesk (public, branch `main`)
- Deploy: push to `main` → GitHub Actions (`npm ci → npm test → npm run build`) → `gh-pages`
- Local folder: `D:\KruDesk` · Original card app (read-only reference): `D:\កាតសិស្ស System`

## 2. Stack & layout

React 19 · Vite 6 · TypeScript strict · Tailwind 3 · Dexie 4 (DB version 4, backup schema v3) · Zustand · ExcelJS ·
pdf-lib + html-to-image · vite-plugin-pwa (`registerType: 'prompt'`) · Vitest.

```
src/app            App shell, ErrorBoundary
src/features/*     students, roster, results, attendance, scores, cards, dashboard, settings (lazy-loaded views)
src/print/*        print layouts (StudentList, Roster, Attendance, MonthlyScore, Semester, MonthlyResults, StudentReport, SemesterResults, SemesterReport, AnnualResults, HonorRoll, Certificate sheets)
src/lib/*          pure logic + tests: grading, attendance, monthlyResults, khmerDate, khmerSort, exportFilename, provinces
src/db/*           database.ts (Dexie schema), repos, presets (subject lists)
src/services/*     backup, excelImport/Export, pdfExport, card renderer (copied from card app)
reference/*.webp   photos of the official paper forms — print layouts must match them
private_samples/   teacher's real school PDFs/PNGs (git-ignored — NEVER commit or copy names/photos into repo/tests):
                   00_moeys_instruction_67_exams_2026-2027.pdf  official MoEYS rules (subjects, max scores, divisors, averages, calendar, absence rules)
                   01 monthly report card · 02 monthly results table · 03 honor roll · 04 certificate
                   05 semester report cards (54 pages, one per student) · 06 annual results · 07 semester results
                   (*_pN.png = page images of the same PDFs)
PLAN.md            original plan (Khmer) · GEMINI_PROMPT.md original build brief · README.md user guide
```

## 3. Teacher's decisions (do not change without asking)

| Area | Decision |
|---|---|
| Onboarding | teacher name, school, director, province/capital (required), academic year |
| Numbers | Arabic digits by default (Khmer digits optional in Settings); cards keep their own Khmer formatting |
| Student order | automatic Khmer alphabetical ក–អ (no drag reorder) |
| Attendance | Called **«បញ្ជីវត្តមាន»** (not «បញ្ជីហៅឈ្មោះ»; action words stay «ហៅឈ្មោះ»). **Only days where the teacher took roll call and pressed «រក្សាទុក» count** (`attendanceSessions`). Untaken days: blank on screen, grey on paper. Codes ច្ប / អច្ប / ឈ; **ឈ is counted inside ច្ប** in totals. Paper columns: ច្ប · អច្ប · សរុប. On screen only: «ចំនួនថ្ងៃបានហៅឈ្មោះ» and per-student «មក» |
| Roster | **«បញ្ជីហៅឈ្មោះ»** is a read-only class roster with parents' names/occupations & address (`RosterView` + `RosterSheet`), showing active students in ក–អ order |
| Subjects | editable per class; presets for grades 7–9 and 10–12. Grades 7–9 preset follows the **teacher's school documents** (`private_samples/01`, `05`): **សរសេរតាមអាន 40 + តែងសេចក្ដី 60**, **គណិតវិទ្យា 100**, others 50; 15 active subjects (… គេហវិទ្យា · សិល្បៈ · បច្ចេកវិទ្យាគមនាគមន៍និងព័ត៌មាន), divisor 16 (allowed by the MoEYS note «i = total ÷ 50» for schools with extra subjects). **Grade 9** classes get `createGrade9Subjects()` instead (MoEYS §2): 10 subjects, total 420 (÷ 8.4), ភាសាបរទេស `isBonus` (only the part above 25 counts), other subjects off; `getPresetSubjects(preset, gradeLevel)`. ការងារកសិកម្ម, បំណិនជីវិតតាមមូលដ្ឋាន, extra_2/3 stay off but keep their scorebook column positions. The «គំរូអនុវិទ្យាល័យ / គំរូវិទ្យាល័យ» buttons **merge** (`mergeSubjectsWithPreset`): ids kept (scores safe), legacy ids `subj_4/13/14`, `extra_1` mapped when still default-named, maxScore never lowered below an entered score, scored subjects stay on, teacher-added subjects kept. `isActive` / `isBonus` per subject. Score-grid headers are single-line (no wrap, no truncation). Grades A–F shown on screen only (not on paper). Averages not capped at 50 (pending teacher decision) |
| Khmer group | monthly sheet: two part columns under number 1, no total column. Semester summary: ONE «អក្សរសាស្ត្រខ្មែរ» column (sum of parts) with one rank |
| Averages | (sum of scores ÷ sum of max) × 50; **blank = 0 by default** (MoEYS divides by the full total; configurable); ties share rank (1,2,2,4). Display defaults to **truncation** (`កាត់ចោល`, e.g. `44.625 → 44.62`, configurable in Settings); **ranking, grade, and pass/fail use the 2-decimal displayed value** (`displayedAverage`) so equal printed averages share a rank |
| Documents & Sidebar | Sidebar order: `ផ្ទាំងដើម · សិស្ស · បញ្ជីហៅឈ្មោះ · បញ្ជីវត្តមាន · បញ្ជីពិន្ទុ · លទ្ធផលប្រចាំខែ · តារាងកិត្តិយស · ប័ណ្ណសរសើរ · កាតសិស្ស · ការកំណត់` (mobile nav shows 4 primary + «ច្រើនទៀត»). «លទ្ធផលប្រចាំខែ» has a `ប្រចាំខែ \| ឆមាសទី ១ \| ឆមាសទី ២ \| ប្រចាំឆ្នាំ` period switch (`SemesterResultsSheet`, `SemesterReportSheet`, `AnnualResultsSheet`, `exportSemesterResultsExcel`, `exportAnnualResultsExcel`). Annual pass/fail: fails if `annualAvg < 25` OR counted absences `> absenceFailLimit` (default `30`, `absenceFailCountType: 'unexcused'`, `0` = off; `អវត្តមានលើសកំណត់` in ផ្សេងៗ when failing by absence only). Shared `DocumentSignDialog` prompts for lunar date (free text typed by teacher), place (remembered), and Gregorian date; Certificate grade words (`A: ល្អប្រសើរ`, `B: ល្អណាស់`, `C: ល្អ`, `D: ល្អបង្គួរ`, `E: មធ្យម`, `F: ខ្សោយ`) are editable and remembered |
| Semesters | **Per MoEYS instruction ៦៧ អយក.សណន (2026-2027)**: grades 7–8 sit the S1 exam 8–13 Feb and S2 23–28 Aug → S1 months = Nov–Jan, S2 = Mar–Jul (`DEFAULT_SCORE_CONFIG`, `SCORE_RULES_VERSION = 2`; `resolveScoreConfig()` moves configs saved under older rules, incl. old backups, to these months and blank = 0 once; later Settings edits are kept). Semester `ពិន្ទុសរុប = displayed ខែប្រចាំឆមាស + displayed ប្រឡងឆមាស`, `មធ្យម = ពិន្ទុសរុប ÷ 2`; annual = (S1 + S2) ÷ 2 — **confirmed** by the ministry's worked examples (`src/lib/__tests__/ministry2026.test.ts`) |
| Students who leave | `statusChangedAt`; still shown in the month they left, hidden afterwards |

## 4. Rules for any AI working on this repo

1. **Never commit exported files or backups** (PDF, Excel, CSV, `KruDesk_Backup_*.json`). They can contain
   real student names. `.gitignore` blocks them — do not override it. A real class list was leaked once;
   the repo had to be deleted and recreated to remove it.
2. Never modify, move or delete anything in `D:\កាតសិស្ស System`.
3. Never force-push and never rewrite history unless the teacher explicitly asks.
4. Before every commit: `npm test` and `npm run build` must pass. Tests that need the original card app
   folder skip themselves on CI — keep it that way.
5. Never draw Khmer text with pdf-lib/jsPDF; PDFs are rasterised from HTML print layouts.
6. Dates: build `YYYY-MM-DD` keys from local year/month/day, never `toISOString()` (UTC+7).
7. Schema changes need a new Dexie version with an `.upgrade()` and a backup schema bump that still
   restores older backups.
8. Work in small steps; after each step report: what changed, test count, build result, commit hash.

## 5. How the teacher works

- **From 2026-11-20 Gemini (Antigravity) continues the work** (the teacher's choice). Claude wrote the
  code on 2026-11-19/20 (commits `f8ba48a` … see `git log`); before that Gemini wrote it and Claude reviewed.
- Each step: change → `npm test` + `npm run build` → try it in a browser (localhost and the live
  site) → commit/push only after the teacher says so (push to `main` deploys the live site).
- **Check every printed document against `private_samples/`** (layout) and
  `private_samples/00_moeys_instruction_67_exams_2026-2027.pdf` (rules). The teacher notices
  differences in column widths, fonts (Moul for headings), signature blocks and wording.
- Local dev server: `npm run dev` → http://localhost:5173/KruDesk/

## 6. Open items

- [x] **Privacy (done 2026-11-19):** a real 8A attendance PDF was committed once. History was
      rewritten, the GitHub repo was deleted and recreated, and clean `main` was pushed again —
      the old commit no longer exists on GitHub. Pages was re-enabled (`gh-pages` / root).
- [x] **Roll call blocked days (done in `da602a5`):** Sundays/future/holiday dates now show only the blocking banner without draft badges or draft subtitle.
- [x] **Migrated attendance display (done in `da602a5`, backup fix in `ba487c0`):** migrated sessions show «បានរក្សាទុក (ពីទិន្នន័យចាស់)» without a timestamp; Dexie v3 + backup restore flag shared `savedAt` sessions.
- [x] **Stale chunk after deploy (done in `ba487c0`):** `vite:preloadError` and `ErrorBoundary` reload once via `krudesk-chunk-reload` in `sessionStorage`, cleared after healthy app start.
- [x] **Subject names & lower-secondary scorebook (done in `c738653`, refined):** cols 4, 13, 14 named, `isActive`/`isBonus` added, Dexie v4 + backup restore (`< v3` only) normalize default-named preset subjects while leaving teacher-renamed subjects active.
- [x] **Restore from `.json` (checked on the live site 2026-11-19):** a fake-data schema v3 backup
      restored from the onboarding «ស្ដារពី Backup» (1 class, 3 students, attendance, monthly scores).
- [ ] Not yet tested by a human: Excel import from a real file, real PDF downloads,
      printing on real paper (attendance, scores, cards duplex alignment).
- [ ] Browser storage is not "persisted" on a normal visit → teachers should install the app and back up weekly.
- [x] **App updates (done in `82d7218`):** the installed app also checks for a new version when the
      window regains focus / becomes visible (max once a minute). Settings → «អំពីកម្មវិធី» shows
      version + commit + build time and has «ពិនិត្យរកកំណែថ្មី». Compare the commit there with `git log`.
- [x] **School-preset reminder:** on «បញ្ជីពិន្ទុ», a grade 7–9 class whose active subjects differ
      from the school preset shows an orange banner «ប្ដូរតាមគំរូសាលា» (one click → merge) with
      «កុំបង្ហាញទៀត» (per class, `localStorage['krudesk.presetHintDismissed']`). The merge also
      matches hand-typed subjects **by name** (ignores spaces, hyphens, «(…)»), so no duplicates.
      Checked on the live site (2026-11-19, fake class with the old 11 subjects): banner shown →
      merge → 15 active subjects, ids and scores kept, banner gone.
- [ ] **Teacher's 8A still has the old 11 subjects (math /50, Khmer 50+50)** until they click
      «ប្ដូរតាមគំរូសាលា». Math scores already typed on /50 then count on /100 — teacher must re-check them.
- [x] **Real PWA update flow (verified on the live site 2026-11-19):** after deploying `f8ba48a`, a tab
      still on `c882a6b` showed «មានកំណែថ្មី — ចុចដើម្បីធ្វើបច្ចុប្បន្នភាព»; the button loaded the new
      bundle, «អំពីកម្មវិធី» then showed `f8ba48a`, and the (fake) data was kept.
- [x] **Screen tables, no wrapping:** subject editor names have a minimum width (`f8ba48a`); the
      «លទ្ធផលប្រចាំខែ» tables (monthly / semester / annual) use single-line headers
      («ខែប្រចាំឆមាស», «ប្រឡងឆមាស»). Print layouts are unchanged.
- [ ] **MoEYS absence rules for grades 9 and 12 (§6.5)** not implemented: besides avg < 25 and
      unexcused > 30, the ministry also drops candidates with unexcused + excused > 40 or many
      excused absences (counted until 7 June 2027), and students missing semester-exam subjects.
      The app only has one absence limit. Ask the teacher before adding.
- [ ] Ask the teacher how the school counts «បណ្ណសរសើរ» / «លិខិតសរសើរ» on the semester report
      (app counts months with a certificate; the school sample shows 0 / 0).
- [x] **PDF preview «មើលមុន» (2026-11-20):** `exportPrintNodesToPdf` renders each page to PNG once
      (`renderPrintNodesToPng`), shows those PNGs in `PdfPreviewModal` (`usePdfPreviewStore`, mounted
      in `App.tsx`), and builds the PDF from the same PNGs (`buildPdfFromPngs`) only when the teacher
      presses «ទាញយក PDF» — preview and PDF are identical. It returns `null` when the preview is
      closed; every caller shows the success toast only `if (exported)`. Card PDFs (`pdfService.ts`)
      keep their own `CardPreviewModal`. Tests: `src/services/__tests__/pdfPreview.test.tsx`.

## 7. «បញ្ជីពិន្ទុ» vs the MoEYS standard (checked 2026-11-20)

| Item | MoEYS instruction ៦៧ (2026-2027) | KruDesk now | Status |
|---|---|---|---|
| Grades 7–8 subjects | 14 exam subjects, total 750, i = 15 (§4.1): តែងសេចក្ដី 60, សរសេរតាមអាន 40, គណិត 100, others 50 incl. «អប់រំកាយ កីឡា និងសុខភាព» and «បំណិនជីវិតតាមមូលដ្ឋាន (សិល្បៈ កសិកម្ម ពេងជាង…)» | school preset: 15 subjects (សិល្បៈ and ICT separate, បំណិនជីវិត off), total 800, i = 16 | OK — the ministry note (§5) lets schools with extra subjects use i = total ÷ 50; the teacher chose the school list. Names follow the school («អប់រំកាយ-កីឡា», «ផែនដីវិទ្យា») |
| Grade 9 subjects | 10 subjects, total 420, i = 8.4 + ភាសាបរទេស bonus (score − 25) (§2.1) | `createGrade9Subjects()` | OK (tests reproduce the ministry example: 35.82) |
| Grades 10, 11, 12 subjects | grade 10: 13 subjects, 800 (i = 16), ភាសាខ្មែរ 150, គណិត 150, ភាសាបរទេស 100, others 25–50; grade 11 and 12: science / social-science tracks (825, i = 16.5 / 625, i = 12.5), grade 12 ភាសាបរទេស bonus (§3, §5) | `createUpperSecondarySubjects()`: 12 subjects, all /50 | **NOT per ministry** — next task |
| Monthly average | sum of all subjects ÷ i (on /50) | (sum ÷ sum of max) × 50 with blank = 0 → same value | OK |
| Monthly-in-semester average | sum of monthly averages ÷ number of months | same | OK |
| Semester exam average | sum of exam scores ÷ i | same (exam tab uses the class subjects) | OK |
| Semester average | (exam avg + monthly avg) ÷ 2 | same, on displayed 2-decimal values | OK |
| Annual average | (S1 + S2) ÷ 2 | same | OK |
| Decimals | examples are truncated (34.395 → 34.39) | truncate by default | OK |
| Semester months (grades 7–8) | S1 exam 8–13 Feb, S2 exam 23–28 Aug | S1 = Nov–Jan, S2 = Mar–Jul | OK (grade 9 sits S2 on 14–19 June, grade 12 on 7–12 June — the app has one calendar for all grades) |
| Fail / not eligible (grades 9, 12) | annual avg < 25; missing semester-exam subjects; unexcused > 30; unexcused + excused > 40; many excused absences (§6.5) | avg < 25 or one absence limit (default unexcused > 30) | **Partly** — open item above |

### Next tasks for Gemini (ask the teacher before each)
1. Upper-secondary presets per grade (10, 11 science / social, 12 science / social) from §3 and §5 of
   the ministry PDF, the same way grade 9 was done (`getPresetSubjects(preset, gradeLevel)`, plus a
   track choice for grades 11–12). Grade 12 ភាសាបរទេស is a bonus subject like grade 9.
2. Per-grade semester calendars if the teacher wants grade 9 / 12 to differ from grades 7–8.
3. The grade 9 / 12 absence and missing-exam rules (open item above).
4. «បណ្ណសរសើរ» / «លិខិតសរសើរ» counting on the semester report (open item above).
5. Results tables (samples 02, 06, 07) still use slightly smaller fonts than the samples.
