# Prompt for Gemini — build KruDesk

> Copy everything below the line into Gemini (works best with Gemini CLI / Antigravity opened in `D:\KruDesk`, so it can read the files mentioned).
> Also attach the 3 photos in `D:\KruDesk\reference\` if your Gemini tool cannot read local files.

---

You are a senior front-end engineer. Build **KruDesk (ជំនួយការគ្រូបន្ទុកថ្នាក់)**, an offline-first web app for Cambodian homeroom teachers. Read this whole brief first, then work **phase by phase** (section 9). After each phase run `npm run build` and `npm test`, fix every error, and give me a short summary before continuing.

## 0. Files you must read first
- `D:\KruDesk\PLAN.md` — the full plan in Khmer (source of truth for features and labels).
- `D:\KruDesk\reference\01_monthly_scores.webp` — paper monthly score sheet (បញ្ជីពិន្ទុប្រចាំខែ).
- `D:\KruDesk\reference\02_semester_scores.webp` — paper semester summary sheet (តារាងស្រង់ពិន្ទុប្រចាំឆមាស).
- `D:\KruDesk\reference\03_attendance.webp` — paper attendance sheet (បញ្ជីហៅឈ្មោះ).
- `D:\KruDesk\គម្រូទិន្នន័យសិស្សក្នុងការបញ្ជូលសិស្សតាម Excel.xlsx` — student Excel import template (column headers = student fields).
- `D:\កាតសិស្ស System\` — my existing, working **student card** app (React + Vite + Dexie). Study `src/` fully: `services/CardCanvasRenderer.ts`, `services/pdfService.ts`, `services/excelService.ts`, `services/backupService.ts`, `db/`, `types/`, `utils/`, `components/card|designer|generate|print|common|layout`, `public/fonts`, `public/images`, `vite.config.ts`, `.github/workflows/deploy.yml`. **Reuse its stack, design language and code.**

## 1. Hard constraints
- **No login, no backend, no external API.** All data lives in the user's browser (IndexedDB via Dexie). Call `navigator.storage.persist()` on startup.
- Hosted on **GitHub Pages** with base path `/KruDesk/`, deployed by GitHub Actions to a `gh-pages` branch (copy the card app's workflow).
- **PWA**, works fully offline after first load.
- UI language: **Khmer**. Fonts from the card app: Battambang (body), Moul (titles), Kantumruy Pro (UI). Bundle them locally, no Google Fonts.
- Stack (same versions as the card app): React 19, Vite 6, TypeScript strict, Tailwind 3, Dexie 4 + dexie-react-hooks, Zustand, ExcelJS, pdf-lib + @pdf-lib/fontkit, lucide-react, clsx, tailwind-merge, zod, vite-plugin-pwa, Vitest.
- **Khmer text in PDFs:** pdf-lib/jsPDF cannot shape Khmer (coeng/subscripts and vowels break). **Never** draw Khmer with `drawText`. Instead:
  1. **Print / Save as PDF:** dedicated print-layout React components + `@page` CSS + `window.print()` (vector, crisp).
  2. **Download PDF:** render each print page DOM node to a canvas at 3× scale (e.g. `html-to-image`, pinned version) and embed the PNG pages into pdf-lib — the same raster approach the card app's `CardCanvasRenderer` uses. Await `document.fonts.ready` before rendering.
- Every list/table can be exported to **Excel and PDF**, filtered by the **month(s)** the user picks.

## 2. Design — "Apple clean"
Copy the card app's look (`AppleSidebar`, `AppleHeader`, `AppleCard`, `AppleButton`, `AppleModal`, `AppleSegmentedControl`, `AppleBadge`): background `#f5f5f7`, white cards, 16–20 px radius, hairline borders `black/[0.06]`, soft shadows, translucent blurred sticky header, SF-like spacing, accent blue `#0071e3`, smooth 150–200 ms transitions. Add dark mode (system + manual toggle). Responsive: sidebar on desktop, bottom nav on phones (≤768 px). Empty states with an icon + one-line hint + primary button. Toasts for success/error. Confirm dialogs before deleting.

## 3. First-run onboarding
If `settings.profile` is missing, show a centered welcome card (app logo = MoEYS emblem from the card app) asking:
- ឈ្មោះគ្រូ (teacher name) *
- ឈ្មោះសាលា (school name) *
- ឈ្មោះនាយក (director name) *
- ឆ្នាំសិក្សា (academic year, default `២០២៦-២០២៧`)
Plus a secondary button **ស្ដារពី Backup** (restore). Save to `settings`. All are editable later in Settings and are used automatically on every printed header/signature block and on the student cards.

## 4. Navigation (sidebar)
| id | Label | Icon |
|---|---|---|
| dashboard | ផ្ទាំងដើម | LayoutDashboard |
| students | សិស្ស | Users |
| attendance | បញ្ជីហៅឈ្មោះ | CalendarCheck |
| scores | បញ្ជីពិន្ទុ | ClipboardList |
| cards | កាតសិស្ស | CreditCard |
| settings | ការកំណត់ | Settings |

Header shows the current **class picker** and **month picker** (remember the last selection in `settings`). Sidebar footer: teacher name + school name + "Offline ✓" badge.

**Dashboard:** counts (classes, students, male/female), today's absences for the selected class, a "last backup N days ago" reminder card with a Backup button.

## 5. Data model (Dexie DB `KruDeskDB`)
```ts
interface Profile { teacherName: string; schoolName: string; directorName: string; academicYear: string }
interface Subject { id: string; name: string; group?: string; maxScore: number; order: number }
interface SchoolClass { id?: number; name: string; gradeLevel: number; academicYear: string; color: string; subjects: Subject[]; createdAt: number }
interface Student {
  id?: number; classId: number; order: number;           // លេខរៀង
  studentId: string; nameKm: string; nameEn?: string;    // អត្តលេខ, គោត្តនាម និងនាម, ឈ្មោះឡាតាំង
  gender: 'ប្រុស' | 'ស្រី'; dateOfBirth: string; placeOfBirth?: string;
  fatherName?: string; fatherOccupation?: string; motherName?: string; motherOccupation?: string;
  address?: string; phone?: string; cardNumber?: string; photoBlob?: Blob;
  status: 'active' | 'dropped' | 'transferred'; createdAt: number; updatedAt: number;
}
type AbsenceCode = 'ច្ប' | 'អច្ប' | 'ឈ';
interface Attendance { classId: number; studentRef: number; date: string /* YYYY-MM-DD */; status: AbsenceCode } // present = no row
interface Holiday { id?: number; date: string; label: string }
interface MonthlyScore { classId: number; studentRef: number; month: string /* YYYY-MM */; scores: Record<string, number | null>; note?: string }
interface SemesterExam { classId: number; studentRef: number; semester: 1 | 2; scores: Record<string, number | null>; note?: string }
```
Stores (indexes): `settings: '&key'`, `classes: '++id, name, academicYear'`, `students: '++id, classId, [classId+order], studentId'`, `attendance: '[classId+date+studentRef], [classId+date], classId'`, `holidays: '++id, &date'`, `monthlyScores: '[classId+month+studentRef], [classId+month]'`, `semesterExams: '[classId+semester+studentRef], [classId+semester]'`, plus the card app's `templates` store and print settings.
**Totals, averages and ranks are computed, never stored.** Put all formulas in pure functions in `src/lib/grading.ts` and `src/lib/attendance.ts` with unit tests.

## 6. Feature specs

### 6.1 សិស្ស (Students)
- **Class cards grid**: name (e.g. ៧ក), academic year, total / female count, color dot, menu (edit, duplicate structure, delete). "+ បង្កើតថ្នាក់" opens a modal: name, grade level 7–12, academic year, color, **subject preset** (see 6.3).
- **Class detail**: student table with search, sort, drag to reorder (updates `order` = លេខរៀង), add/edit modal (all fields above + photo 3×4 crop like the card app's `utils/photo.ts`), delete, status filter. Show ប្រុស / ស្រី / សរុប counts.
- **Import from Excel** using the exact headers of `គម្រូទិន្នន័យសិស្ស…xlsx` (reuse/adapt `excelService.ts` from the card app; preview rows, highlight errors, skip duplicates by អត្តលេខ). Button to download that template.
- **Export** student list to Excel and PDF.

### 6.2 បញ្ជីហៅឈ្មោះ (Attendance) — must match `reference/03_attendance.webp`
- Grid: rows = active students (លេខរៀង, អត្តលេខ, គោត្តនាម និងនាម), columns = days 1…(days in month). Sticky name columns + sticky header.
- Click a cell to cycle **✓ (present) → ច្ប → អច្ប → ឈ → ✓**. Right-click/long-press opens a small picker. Keyboard: arrows to move, `1`=ច្ប, `2`=អច្ប, `3`=ឈ, `0`/Backspace=present.
- Colors: ✓ soft green, ច្ប blue, អច្ប red, ឈ orange.
- Rest days (configurable weekdays, default Sunday) and holidays are grey and disabled. Future days are dimmed and not counted.
- "ថ្ងៃនេះ" mode: one big column for today, easy tapping on phones.
- Summary columns at the end: **ច្ប (includes ឈ), អច្ប, សរុប**, then សេចក្ដីផ្សេងៗ. Daily footer row: number absent per day.
- **Printed sheet**: A4 landscape, header line `អនុ/វិទ្យាល័យ {school}  ថ្នាក់ទី {class}  ខែ {month} ឆ្នាំ {year}` and a box `ប្រុស | ស្រី | សរុប`; **present cells are left blank** (no ✓ on paper); absences print their code (ច្ប / អច្ប / ឈ); rest days shaded; signature block at the bottom: left `បានឃើញ និងឯកភាព / នាយកសាលា / {director}`, right `ធ្វើនៅ……ថ្ងៃទី……ខែ……ឆ្នាំ…… / គ្រូបន្ទុកថ្នាក់ / {teacher}`. Rows auto-size so up to 45 students fit; paginate beyond that, repeating the header.
- Export: Excel (one sheet per selected month, same layout, merged headers, borders, font "Khmer OS Battambang", landscape, fit to 1 page wide, repeat title rows) and PDF.

### 6.3 បញ្ជីពិន្ទុ (Scores) — must match `reference/01_monthly_scores.webp` and `02_semester_scores.webp`
Tabs (segmented control): **ប្រចាំខែ | ប្រឡងឆមាស | ស្រង់ពិន្ទុឆមាស/ឆ្នាំ | មុខវិជ្ជា**.

**Subjects (មុខវិជ្ជា)** are editable per class: add, delete, rename, reorder, set `maxScore`, optional `group` (shown as a merged parent header, e.g. អក្សរសាស្ត្រខ្មែរ over សរសេរតាមអាន + តែងសេចក្ដី). Presets:
- *អនុវិទ្យាល័យ ៧–៩* (from the paper): អក្សរសាស្ត្រខ្មែរ{សរសេរតាមអាន, តែងសេចក្ដី}, គណិតវិទ្យា, ភាសាបរទេស (អង់គ្លេស ឬ បារាំង), [subject 4 – placeholder], រូបវិទ្យា, គីមីវិទ្យា, ជីវវិទ្យា, ផែនដីវិទ្យា, សីលធម៌-ពលរដ្ឋវិទ្យា, ប្រវត្តិវិទ្យា, ភូមិវិទ្យា, គេហវិទ្យា, [subject 13 – placeholder], [subject 14 – placeholder], បំណិនជីវិត, + 3 empty slots. Keep placeholders as clearly editable names. Use the subject list from `PLAN.md` section 4.3 if I have corrected it there.
- *វិទ្យាល័យ ១០–១២*: a sensible editable starting list.
- Default `maxScore` = 50 for every subject (teacher edits). Changing subjects never deletes existing scores of other subjects.

**ប្រចាំខែ (monthly)**: spreadsheet-style grid — Enter/Tab/arrow navigation, paste a block from Excel, numeric validation (0…maxScore, decimals allowed, values over max turn red and are rejected), blank ≠ 0. Computed columns: **ពិន្ទុសរុប, មធ្យមភាគ, ចំណាត់ថ្នាក់**, plus សេចក្ដីផ្សេងៗ. Autosave (debounced) with a subtle "បានរក្សាទុក" indicator.

**ប្រឡងឆមាស**: same grid for semester 1 and 2 exams.

**ស្រង់ពិន្ទុឆមាស/ឆ្នាំ**: read-only summary like photo 02 — for each semester: per-subject exam score + rank, មធ្យមភាគប្រចាំខែ, មធ្យមភាគប្រឡង, មធ្យមភាគឆមាស, ចំណាត់ថ្នាក់; then **លទ្ធផលប្រចាំឆ្នាំ**: មធ្យមភាគប្រចាំឆ្នាំ, ចំណាត់ថ្នាក់, ជាប់/ធ្លាក់.

**Formulas (defaults, all configurable in Settings → ពិន្ទុ):**
- `average = (sum of entered scores / sum of maxScore of subjects that have a score) × scale`, scale default **50** (options 10/20/50/100). Option "count blank as 0" (default off).
- `monthlyAvgInSemester = mean(monthly averages of the semester's months that have data)`.
- `semesterAvg = (monthlyAvgInSemester × wMonthly + examAvg × wExam) / (wMonthly + wExam)`, default weights 1 and 1.
- `annualAvg = (sem1Avg × w1 + sem2Avg × w2) / (w1 + w2)`, default 1 and 1.
- Pass if average ≥ scale / 2.
- Rank: standard competition ranking (1, 2, 2, 4); students without data get no rank.
- Round display to 2 decimals; keep full precision internally.
- Semester months default: S1 = វិច្ឆិកា, ធ្នូ, មករា, កុម្ភៈ (exam មីនា); S2 = មេសា, ឧសភា, មិថុនា (exam កក្កដា). Editable.
Write Vitest tests for every formula, including ties, blanks and changed subject lists.

**Printing/export** for each tab: A4 landscape print layout matching the photos (vertical rotated subject headers, numbered columns 1…15, header line with school/class/month/year and ប្រុស/ស្រី/សរុប box, signature block), Excel export (merged multi-level headers, vertical text in header cells), PDF export. Month picker chooses which month(s).

### 6.4 កាតសិស្ស (Student cards) — copy the card app **completely**
- Port these from `D:\កាតសិស្ស System` with minimal changes: `CardCanvasRenderer.ts`, `pdfService.ts`, `components/card/*`, `components/designer/*`, `components/generate/*`, `components/print/*`, `db/defaultTemplates.ts`, `types/template.ts`, `types/print.ts`, `utils/*` (cardSizes, khmerNumerals, formatters, photo, assets, flourish/emblem data URIs), `public/fonts`, `public/images`, and their tests in `utils/__tests__`.
- Replace the card app's own student store with KruDesk's `students` table: user picks a class → selects students (all / some) → previews → generates the A4 PDF exactly as before (sizes, duplex offsets, cutting guides, 300 DPI).
- Feed school name, director name and academic year from KruDesk `profile`; class name from the class.
- The rendered card must be **pixel-identical** to the original app. All ported tests must pass.

### 6.5 ការកំណត់ (Settings)
Sections: ព័ត៌មានគ្រូ និងសាលា · ពិន្ទុ (scale, weights, blank rule, semester months) · វត្តមាន (rest weekdays, holidays list) · បង្ហាញ (light/dark/system, Khmer numerals on/off) · **Backup & Restore** (export one `.json` file with all stores, photos as base64, a schema version; import with preview + "replace all" / "merge"; adapt the card app's `backupService.ts`) · លុបទិន្នន័យទាំងអស់ (double confirm).

## 7. Shared export dialog
One `ExportDialog` component used everywhere: choose format (Excel / PDF / Print), class, month(s) or semester. File names in Khmer, e.g. `បញ្ជីហៅឈ្មោះ_៧ក_វិច្ឆិកា_២០២៦.xlsx`. Khmer month names: មករា កុម្ភៈ មីនា មេសា ឧសភា មិថុនា កក្កដា សីហា កញ្ញា តុលា វិច្ឆិកា ធ្នូ. Use Khmer numerals on printed documents (utility from the card app).

## 8. Project structure
```
src/
  app/ (App.tsx, routes as view state like the card app)
  components/common/   (Apple* UI kit copied from card app)
  components/layout/   (Sidebar, Header, MobileBottomNav, Onboarding)
  features/students/ attendance/ scores/ cards/ settings/ dashboard/
  print/               (print-layout components: AttendanceSheet, MonthlyScoreSheet, SemesterSheet)
  services/            (excelExport.ts, pdfExport.ts, backup.ts, + ported card services)
  lib/                 (grading.ts, attendance.ts, khmerDate.ts)  ← pure, tested
  db/                  (database.ts, presets.ts)
  store/               (zustand)
```

## 9. Phases (stop and report after each)
0. Scaffold: Vite + TS + Tailwind + fonts + PWA + `base: '/KruDesk/'` + GitHub Actions deploy workflow. `npm run build` passes.
1. Apple layout, sidebar, header pickers, onboarding, settings (profile), backup/restore.
2. Classes + students CRUD, photo, Excel import/export.
3. Attendance grid, summary, print layout, Excel/PDF export.
4. Scores: subjects editor + presets, monthly, semester exams, semester/annual summary, formulas + tests, print/export.
5. Port the student card module and wire it to KruDesk data; all ported tests green.
6. Dashboard, dark mode, mobile polish, empty states, performance check with 45 students × 31 days × 18 subjects, final build, README (Khmer) explaining how to deploy and how to back up data.

## 10. Quality bar
- No TypeScript errors, no console errors, `npm test` green.
- Every print layout visually checked against the reference photos.
- Khmer renders correctly everywhere (screen, print, PDF, Excel).
- Data survives reload; backup → wipe → restore returns identical data.
- Do not invent extra features beyond this brief; if something is ambiguous, ask me.
