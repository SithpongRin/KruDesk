# KruDesk — Handoff for a new chat

> **ខ្មែរ (សង្ខេប)** ៖ ឯកសារនេះប្រាប់ AI ថ្មី (Claude ឬ Gemini) ពីស្ថានភាពគម្រោង ការសម្រេចចិត្តរបស់គ្រូ
> វិធានធ្វើការ និងការងារដែលនៅសល់។ ចាប់ផ្ដើមឆាតថ្មីដោយឲ្យ AI អានឯកសារនេះមុនគេ។
>
> Last updated: 2026-11-20 (handed back to Gemini) · Live commit: see `git log -1` on `main` (check Settings → «អំពីកម្មវិធី»)

---

## 0. ⚠️ Current state — read this first (2026-11-20, end of the Claude chat)

**Live = `eb31a41`.** The working tree has **uncommitted work by Gemini** (13 files, on top of `eb31a41`):
- Task 1: ministry presets for grades 10, 11, 12 (`createGrade10/11/12Subjects`, `track?: 'science' | 'social'`
  on `SchoolClass`, track choice in `ClassFormModal` and the «គំរូវិទ្យាល័យ» confirm dialog, Excel column
  width for 3-digit maxima).
- Grades 7–8 switched to the **ministry preset** (teacher's decision 2026-11-20: «យកតាមក្រសួងជាចម្បង ហើយ
  អ្នកប្រើប្រាស់អាចកែឈ្មោះវាតាមក្រោយ — សាលាខ្លះគ្មានម៉ោង ICT»): 14 subjects, 750 (÷ 15); arts, ict,
  agriculture, extra_2/3 off. Banner/button now «ប្ដូរតាមគំរូក្រសួង».
- Fix for the duplicate `ict` id in `mergeSubjectsWithPreset` (`presetIds` guard + `used` check).

**Update 2026-11-20 (later): the problem below is FIXED in the working tree (still uncommitted).**
`mergeSubjectsWithPreset` promotes the first scored «សិល្បៈ» (`arts`, default-named `subj_14`, or hand-typed)
into the life-skills row (id kept, empty old `life_skills` dropped), turns off every subject that is off / not
in the preset even if scored, and returns `migratedSubjects` + `deactivatedSubjects`; the confirm dialog
previews both and the toast repeats them. Tests in `presetMerge.test.ts` cover decision 5. `npm test` 149/149,
build OK. Checked in the browser on a fake 15-subject class (scores in arts + ict): dialog listed
«សិល្បៈ → បំណិនជីវិតតាមមូលដ្ឋាន» and ICT off, after merging 14 active / 750, banner gone, ICT scores still in
the DB, class average matched (sum of 14) ÷ 750 × 50. Waiting for the teacher's OK to commit.

Original note — Claude reviewed it: every max score/total matches the ministry PDF, `npm test` 147/147, build OK, PDFs and
«មើលមុន» print fine. One problem was left, found by applying «ប្ដូរតាមគំរូក្រសួង» to a
fake class shaped like the teacher's real 8A (old 15-subject school preset with scores in `arts` and `ict`):
- `life_skills` is added as a new EMPTY subject → blank = 0 → every average drops (e.g. 40.46 → 38.08);
- `arts` and `ict` stay active because they have scores → 16 subjects, 850 (÷ 17), not the ministry 14 / 750;
- the orange banner is still shown after pressing the button.

**Teacher's decisions for the fix (2026-11-20, replace the old rule «scored subjects stay on»):**
1. **សិល្បៈ → បំណិនជីវិត.** The ministry subject is «បំណិនជីវិតតាមមូលដ្ឋាន (សិល្បៈ កសិកម្ម …)». When merging
   the lower-secondary preset into a class whose `arts` (or a hand-typed «សិល្បៈ») has scores and whose
   `life_skills` has none, use the existing `arts` subject (keep id `'arts'` so its scores stay) as the
   life-skills row (name / max / order / active from the preset). Do not add the preset `arts` row again
   with the same id, and an unscored old `life_skills` must not become active or duplicated.
2. **Subjects that are off in the preset are switched off even if they have scores** (ict, agriculture,
   extra_*, teacher-added subjects) — scores stay in the DB, the teacher can turn them on again in the
   «មុខវិជ្ជា» tab. Applies to all presets (grades 7–12).
3. The confirm dialog and the toast after merging say which subjects were switched off («ពិន្ទុនៅរក្សាទុក —
   អាចបើកវិញនៅផ្ទាំង "មុខវិជ្ជា"») and «សិល្បៈ → បំណិនជីវិតតាមមូលដ្ឋាន».
4. After merging, the banner must disappear (`subjectsDifferFromPreset` → false).
5. Test: a class with the old 15-subject school preset and scores in `arts` + `ict` → merge the ministry
   preset → 14 active, total 750, `arts` carries the life-skills name, `ict` off, no duplicate ids,
   `subjectsDifferFromPreset` false, one student's average = (sum of the 14) ÷ 750 × 50.

Then: `npm test` + `npm run build`, update §3 «Subjects» below (the merge rules there are now outdated),
report to the teacher, and commit/push only when the teacher says so. After deploying, the teacher's real
8A needs «ប្ដូរតាមគំរូក្រសួង» and a check of its math scores (typed on /50 earlier, now /100).

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
| Subjects | editable per class; presets follow **MoEYS instruction ៦៧ អយក.សណន (2026-2027)** for all grades 7–12. **Grades 7–8** (`createLowerSecondarySubjects()`, MoEYS §4.1): 14 active subjects totalling 750 (÷ 15) — **តែងសេចក្ដី 60 + សរសេរតាមអាន 40** (group `អក្សរសាស្ត្រខ្មែរ`), **គណិតវិទ្យា 100**, others 50 (`រូបវិទ្យា`, `គីមីវិទ្យា`, `ជីវវិទ្យា`, `ផែនដី និងបរិស្ថានវិទ្យា`, `សីលធម៌-ពលរដ្ឋវិជ្ជា`, `ភូមិវិទ្យា`, `ប្រវត្តិវិទ្យា`, `ភាសាបរទេស`, `គេហវិទ្យា`, `អប់រំកាយ កីឡា និងសុខភាព`, `បំណិនជីវិតតាមមូលដ្ឋាន (សិល្បៈ កសិកម្ម គេហកិច្ច…)`). Optional school subjects (`arts`, `ict`, `agriculture`, `extra_2/3`) stay in the list with `isActive: false` so teachers can turn them on if taught. **Grade 9** (`createGrade9Subjects()`, MoEYS §2): 10 subjects totalling 420 (÷ 8.4), `ភាសាបរទេស` `isBonus` (only > 25 counts), others off. **Grades 10–12** (MoEYS §3, §5): `createGrade10Subjects()` (13 subjects, 800 ÷ 16), `createGrade11Subjects(track)` (13 subjects, 825 ÷ 16.5, science/social), `createGrade12Subjects(track)` (9 regular subjects, 625 ÷ 12.5 + `ភាសាបរទេស` `isBonus`, others off); optional `track?: 'science' | 'social'` stored on `SchoolClass`; `getPresetSubjects(preset, gradeLevel, track)`. The «គំរូអនុវិទ្យាល័យ / គំរូវិទ្យាល័យ» buttons **merge** (`mergeSubjectsWithPreset`): ids kept (scores safe), legacy ids `subj_4/13/14`, `extra_1`, `ict` mapped when still default-named and not already in the target preset, maxScore never lowered below an entered score, **non-preset / inactive subjects (including teacher-added ones) are turned off (`isActive: false`) even if scored** (scores stay in IndexedDB; teacher can re-enable them in «មុខវិជ្ជា»), and when migrating to the lower-secondary ministry preset, a scored `arts` (or hand-typed «សិល្បៈ») subject is promoted into `life_skills` (keeping its id) if `life_skills` has no scores yet. `isActive` / `isBonus` per subject. Score-grid headers are single-line (no wrap, no truncation). Grades A–F shown on screen only (not on paper). Averages not capped at 50 (pending teacher decision) |
| Khmer group | monthly sheet: two part columns under number 1, no total column. Semester summary: ONE «អក្សរសាស្ត្រខ្មែរ» column (sum of parts) with one rank |
| Averages | (sum of scores ÷ sum of max) × 50; **blank = 0 by default** (MoEYS divides by the full total; configurable); ties share rank (1,2,2,4). Display defaults to **truncation** (`កាត់ចោល`, e.g. `44.625 → 44.62`, configurable in Settings); **ranking, grade, and pass/fail use the 2-decimal displayed value** (`displayedAverage`) so equal printed averages share a rank |
| Documents & Sidebar | Sidebar order: `ផ្ទាំងដើម · សិស្ស · បញ្ជីហៅឈ្មោះ · បញ្ជីវត្តមាន · បញ្ជីពិន្ទុ · លទ្ធផលប្រចាំខែ · តារាងកិត្តិយស · ប័ណ្ណសរសើរ · កាតសិស្ស · ការកំណត់` (mobile nav shows 4 primary + «ច្រើនទៀត»). «លទ្ធផលប្រចាំខែ» has a `ប្រចាំខែ \| ឆមាសទី ១ \| ឆមាសទី ២ \| ប្រចាំឆ្នាំ` period switch (`SemesterResultsSheet`, `SemesterReportSheet`, `AnnualResultsSheet`, `exportSemesterResultsExcel`, `exportAnnualResultsExcel`). Annual pass/fail: fails if `annualAvg < 25` OR counted absences `> absenceFailLimit` (default `30`, `absenceFailCountType: 'unexcused'`, `0` = off; `អវត្តមានលើសកំណត់` in ផ្សេងៗ when failing by absence only). Shared `DocumentSignDialog` prompts for lunar date (free text typed by teacher), place (remembered), and Gregorian date; Certificate grade words (`A: ល្អប្រសើរ`, `B: ល្អណាស់`, `C: ល្អ`, `D: ល្អបង្គួរ`, `E: មធ្យម`, `F: ខ្សោយ`) are editable and remembered |
| Signatures | **Every document** (PDF and Excel) ends with the teacher's layout (2026-11-20, shared `DocumentSignature`): right — lunar line (typed once in the sign dialog, remembered as `documentLunarDate`, e.g. «ថ្ងៃ.....ខែ.....ឆ្នាំ មមែ អដ្ឋស័ក ព.ស. ២៥៧០»), «{place} ថ្ងៃទី.....ខែ.....ឆ្នាំ ២០២៦» (day/month blank for handwriting by default, `documentDateHandwritten`), «គ្រូទទួលបន្ទុកថ្នាក់», signing space, teacher's name (Moul); left — «បានឃើញ និង ឯកភាព» / «នាយកសាលា» (Moul) level with the teacher's title, **no dates and no director's name**. Certificate: director only (dates, «នាយកសាលា», name). Documents without the dialog (lists, attendance, score sheets, Excel) use the saved lunar line and place |
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
- [x] **Ministry-preset reminder:** on «បញ្ជីពិន្ទុ», a grade 7–9 class whose active subjects differ
      from the ministry preset shows an orange banner «ប្ដូរតាមគំរូក្រសួង» (one click → merge) with
      «កុំបង្ហាញទៀត» (per class, `localStorage['krudesk.presetHintDismissed']`). The merge also
      matches hand-typed subjects **by name** (ignores spaces, hyphens, «(…)»), so no duplicates.
- [ ] **Teacher's 8A still has the old 11 subjects (math /50, Khmer 50+50)** until they click
      «ប្ដូរតាមគំរូក្រសួង». Math scores already typed on /50 then count on /100 — teacher must re-check them.
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

- [x] **Document frames (2026-11-20):** defaults chosen by the teacher from their own templates, shipped in
      `public/images/frames/` (teacher's decision 2026-11-20, despite the images coming from other artists —
      remove them if an artist objects): certificate = orange Khmer «ក្បាច់» border (`certificate-kbach.jpg`),
      honor-roll names = gold plaque (`name-plaque.png`, white patch behind its open middle); honor-roll page =
      built-in indigo band like sample 03. Each can be replaced per device: «ប្ដូរស៊ុម» (certificate,
      honor roll) and «ប្ដូរស៊ុមឈ្មោះ» (honor roll) store a picked image in IndexedDB settings
      (`certificateBorder`, `honorRollBorder`, `honorRollNameBanner`; travels in backups; turned to the page's
      orientation, ≤ 2400 px JPEG / ≤ 1200 px PNG for the plaque). «ស៊ុមដើម» / «ស៊ុមឈ្មោះដើម» go back to the
      defaults. The honor-roll title shows the month only; no crowns.

## 7. «បញ្ជីពិន្ទុ» vs the MoEYS standard (checked 2026-11-20)

| Item | MoEYS instruction ៦៧ (2026-2027) | KruDesk now | Status |
|---|---|---|---|
| Grades 7–8 subjects | 14 exam subjects, total 750, i = 15 (§4.1): តែងសេចក្ដី 60, សរសេរតាមអាន 40, គណិត 100, others 50 incl. «អប់រំកាយ កីឡា និងសុខភាព» and «បំណិនជីវិតតាមមូលដ្ឋាន (សិល្បៈ កសិកម្ម គេហកិច្ច…)» | `createLowerSecondarySubjects()` (14 active subjects, 750, i = 15; arts/ict/agriculture off and toggleable) | OK (tests reproduce the ministry example «ឃ»: 34.39) |
| Grade 9 subjects | 10 subjects, total 420, i = 8.4 + ភាសាបរទេស bonus (score − 25) (§2.1) | `createGrade9Subjects()` | OK (tests reproduce the ministry example: 35.82) |
| Grades 10, 11, 12 subjects | grade 10: 13 subjects, 800 (i = 16), ភាសាខ្មែរ 150, គណិត 150, ភាសាបរទេស 100, others 25–50; grade 11 and 12: science / social-science tracks (825, i = 16.5 / 625, i = 12.5), grade 12 ភាសាបរទេស bonus (§3, §5) | `createGrade10Subjects()`, `createGrade11Subjects(track)`, `createGrade12Subjects(track)` + `SchoolClass.track` | OK (tests reproduce grade 12 «ខ» 32.45 and «គ» 38.55) |
| Monthly average | sum of all subjects ÷ i (on /50) | (sum ÷ sum of max) × 50 with blank = 0 → same value | OK |
| Monthly-in-semester average | sum of monthly averages ÷ number of months | same | OK |
| Semester exam average | sum of exam scores ÷ i | same (exam tab uses the class subjects) | OK |
| Semester average | (exam avg + monthly avg) ÷ 2 | same, on displayed 2-decimal values | OK |
| Annual average | (S1 + S2) ÷ 2 | same | OK |
| Decimals | examples are truncated (34.395 → 34.39) | truncate by default | OK |
| Semester months (grades 7–8) | S1 exam 8–13 Feb, S2 exam 23–28 Aug | S1 = Nov–Jan, S2 = Mar–Jul | OK (grade 9 sits S2 on 14–19 June, grade 12 on 7–12 June — the app has one calendar for all grades) |
| Fail / not eligible (grades 9, 12) | annual avg < 25; missing semester-exam subjects; unexcused > 30; unexcused + excused > 40; many excused absences (§6.5) | avg < 25 or one absence limit (default unexcused > 30) | **Partly** — open item above |

### Next tasks for Gemini (ask the teacher before each)
1. ~~Upper-secondary presets per grade (10, 11 science / social, 12 science / social) from §3 and §5 of the ministry PDF~~ — **done** (plus grades 7–8 switched to MoEYS §4.1 14 subjects / 750).
2. Per-grade semester calendars if the teacher wants grade 9 / 12 to differ from grades 7–8.
3. The grade 9 / 12 absence and missing-exam rules (open item above).
4. «បណ្ណសរសើរ» / «លិខិតសរសើរ» counting on the semester report (open item above).
5. Results tables (samples 02, 06, 07) still use slightly smaller fonts than the samples.
