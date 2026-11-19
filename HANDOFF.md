# KruDesk — Handoff for a new chat

> **ខ្មែរ (សង្ខេប)** ៖ ឯកសារនេះប្រាប់ AI ថ្មី (Claude ឬ Gemini) ពីស្ថានភាពគម្រោង ការសម្រេចចិត្តរបស់គ្រូ
> វិធានធ្វើការ និងការងារដែលនៅសល់។ ចាប់ផ្ដើមឆាតថ្មីដោយឲ្យ AI អានឯកសារនេះមុនគេ។
>
> Last updated: 2026-11-19 · Live commit: `c738653` on `main`

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
src/print/*        print layouts (StudentList, Roster, Attendance, MonthlyScore, Semester, MonthlyResults, StudentReport, HonorRoll, Certificate sheets)
src/lib/*          pure logic + tests: grading, attendance, monthlyResults, khmerDate, khmerSort, exportFilename, provinces
src/db/*           database.ts (Dexie schema), repos, presets (subject lists)
src/services/*     backup, excelImport/Export, pdfExport, card renderer (copied from card app)
reference/*.webp   photos of the official paper forms — print layouts must match them
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
| Subjects | editable per class; presets for grades 7–9 and 10–12. **អក្សរសាស្ត្រខ្មែរ = 100** (សរសេរតាមអាន 50 + តែងសេចក្ដី 50), **គណិតវិទ្យា = 100**, others 50. `isActive` / `isBonus` per subject; lower-secondary cols 12–15 + `extra_1..3` off (`isActive: false`) by default. Grades A–F shown on screen only (not on paper). Averages not capped at 50 (pending teacher decision) |
| Khmer group | monthly sheet: two part columns under number 1, no total column. Semester summary: ONE «អក្សរសាស្ត្រខ្មែរ» column (sum of parts) with one rank |
| Averages | (sum of scores ÷ sum of max) × 50; blank ≠ 0 (configurable); ties share rank (1,2,2,4). Display defaults to **truncation** (`កាត់ចោល`, e.g. `44.625 → 44.62`, configurable in Settings); ranking uses full precision |
| Documents & Sidebar | Sidebar order: `ផ្ទាំងដើម · សិស្ស · បញ្ជីហៅឈ្មោះ · បញ្ជីវត្តមាន · បញ្ជីពិន្ទុ · លទ្ធផលប្រចាំខែ · តារាងកិត្តិយស · ប័ណ្ណសរសើរ · កាតសិស្ស · ការកំណត់` (mobile nav shows 4 primary + «ច្រើនទៀត»). Shared `DocumentSignDialog` prompts for lunar date (free text typed by teacher), place (remembered), and Gregorian date; Certificate grade words (`A: ល្អប្រសើរ`, `B: ល្អណាស់`, `C: ល្អ`, `D: ល្អបង្គួរ`, `E: មធ្យម`, `F: ខ្សោយ`) are editable and remembered |
| Semesters | S1 = Nov–Feb (+ exam Mar), S2 = Apr–Jun (+ exam Jul); semester avg = (monthly avg + exam avg) ÷ 2; annual = (S1 + S2) ÷ 2 — all configurable. **Not confirmed by an official MoEYS document** |
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

- **Gemini (Antigravity)** writes the code in `D:\KruDesk`, commits and pushes.
- **Claude (Claude Code)** reviews each step: reads the diff, runs tests/build, tries the app in a
  browser (localhost and the live site), checks generated PDFs, and writes the next prompt for Gemini.
- Local dev server: `npm run dev` → http://localhost:5173/KruDesk/

## 6. Open items

- [x] **Privacy (done 2026-11-19):** a real 8A attendance PDF was committed once. History was
      rewritten, the GitHub repo was deleted and recreated, and clean `main` was pushed again —
      the old commit no longer exists on GitHub. Pages was re-enabled (`gh-pages` / root).
- [x] **Roll call blocked days (done in `da602a5`):** Sundays/future/holiday dates now show only the blocking banner without draft badges or draft subtitle.
- [x] **Migrated attendance display (done in `da602a5`, backup fix in `ba487c0`):** migrated sessions show «បានរក្សាទុក (ពីទិន្នន័យចាស់)» without a timestamp; Dexie v3 + backup restore flag shared `savedAt` sessions.
- [x] **Stale chunk after deploy (done in `ba487c0`):** `vite:preloadError` and `ErrorBoundary` reload once via `krudesk-chunk-reload` in `sessionStorage`, cleared after healthy app start.
- [x] **Subject names & lower-secondary scorebook (done in `c738653`, refined):** cols 4, 13, 14 named, `isActive`/`isBonus` added, Dexie v4 + backup restore (`< v3` only) normalize default-named preset subjects while leaving teacher-renamed subjects active.
- [ ] Not yet tested by a human: Excel import from a real file, restore from a `.json` file,
      printing on real paper (attendance, scores, cards duplex alignment).
- [ ] Browser storage is not "persisted" on a normal visit → teachers should install the app and back up weekly.
