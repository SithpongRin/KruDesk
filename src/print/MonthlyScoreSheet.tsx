import React from 'react';
import type { Profile, SchoolClass, ScoreConfig, Student } from '../types/domain';
import {
  buildSubjectColumnNumbers,
  buildSubjectHeaderSpans,
  computeCompetitionRanks,
  computeScoreRow,
  displayedAverageOrNull,
  formatAverage,
  isSubjectActive,
  sortSubjects,
} from '../lib/grading';
import { getActiveStudentsOrdered } from '../lib/attendance';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import type { PageOrientation } from '../services/pdfExport';
import { RotatedHeaderText } from './RotatedHeaderText';
import { DocumentSignature, estimateSignatureBlockHeightMm } from './DocumentSignature';
import { FitText, estimateWrappedLines, paginateByRowHeight } from './FitText';
import { usePrintLayoutStore } from '../store/usePrintLayoutStore';

export interface MonthlyScoreSheetPageData {
  id: string;
  title: string; // e.g., 'បញ្ជីពិន្ទុប្រចាំខែ' or 'បញ្ជីពិន្ទុប្រឡងឆមាសទី 1'
  periodLabel: string; // e.g., 'ខែ វិច្ឆិកា ឆ្នាំ 2026' or 'ឆមាសទី 1'
  monthKey?: string; // YYYY-MM if monthly
  scoresByStudent: Map<number, Record<string, number | null>>;
  notesByStudent?: Map<number, string>;
}

interface MonthlyScoreSheetProps {
  cls: SchoolClass;
  students: Student[];
  profile: Profile;
  sheets: MonthlyScoreSheetPageData[];
  scoreConfig: ScoreConfig;
  orientation?: PageOrientation;
  useKhmerDigits?: boolean;
}

const MAX_ROWS_PER_PAGE = 45;

/**
 * Landscape layout tiers by rows on the page: above 39 rows the compact header and 3.15 mm rows;
 * 26–39 rows the middle tier (7.5pt), at most 25 the large tier (measured 2026-11-24).
 * Portrait keeps 39 / 30.
 */
const LANDSCAPE_DENSE_ROWS = 39;
const LANDSCAPE_COMPACT_ROWS = 25;

/**
 * Signature block under the table, by rows on the page. The gap is the room left for the
 * handwritten signatures of the teacher and the director (2026-11-24): 14 mm on a full 40–45-row
 * landscape page, 14 mm at 36–39 rows (middle tier with tighter cells), 16 mm at 26–35 rows,
 * 20 mm otherwise.
 */
function signLayoutForRows(isPortrait: boolean, rows: number) {
  if (isPortrait) return { gapMm: 20, fontPt: 10.5, marginTopMm: 1.5, ptMm: undefined };
  if (rows > LANDSCAPE_DENSE_ROWS) return { gapMm: 14, fontPt: 7.8, marginTopMm: 0, ptMm: 0.8 };
  if (rows > 35) return { gapMm: 14, fontPt: 9.5, marginTopMm: 0, ptMm: 0.8 };
  if (rows > LANDSCAPE_COMPACT_ROWS) return { gapMm: 16, fontPt: 9.5, marginTopMm: 0, ptMm: 1.2 };
  return { gapMm: 20, fontPt: 10.0, marginTopMm: 1, ptMm: undefined };
}

/** Height left for the rows and the signature (page minus padding, title, table header), measured. */
function rowsAndSignMm(isPortrait: boolean, rows: number): number {
  if (isPortrait) return 260;
  return rows > LANDSCAPE_DENSE_ROWS ? 178 : rows > LANDSCAPE_COMPACT_ROWS ? 170.5 : 167;
}

/** Height of the signature block (with its top margin) — what the last page must keep free. */
function signBlockMm(isPortrait: boolean, rows: number): number {
  const sign = signLayoutForRows(isPortrait, rows);
  return (
    sign.marginTopMm +
    estimateSignatureBlockHeightMm({ gapMm: sign.gapMm, fontSizePt: sign.fontPt, ptMm: sign.ptMm })
  );
}

export const MonthlyScoreSheet: React.FC<MonthlyScoreSheetProps> = ({
  cls,
  students,
  profile,
  sheets,
  scoreConfig,
  orientation = 'landscape',
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));
  // «បង្រួមដាក់ក្នុង ១ ទំព័រ»: every row on one page, scaled to fit by fitPageToOnePage.
  const fitOnePage = usePrintLayoutStore((s) => s.fitOnePage);

  const sortedSubjects = sortSubjects(cls.subjects).filter(isSubjectActive);
  const headerSpans = buildSubjectHeaderSpans(sortedSubjects);
  const columnNumbers = buildSubjectColumnNumbers(headerSpans);
  const hasAnyGroup = headerSpans.some((sp) => sp.subjects.length > 1 && sp.group);

  return (
    <div className="bg-white text-black font-battambang">
      {sheets.map((sheet, sIdx) => {
        const activeStudents = getActiveStudentsOrdered(students, sheet.monthKey);
        const maleCount = activeStudents.filter((s) => s.gender === 'ប្រុស').length;
        const femaleCount = activeStudents.filter((s) => s.gender === 'ស្រី').length;

        const mode = scoreConfig.averageDecimalMode ?? 'truncate';
        const computed = activeStudents.map((st) => {
          const scoreRecord = (st.id !== undefined && sheet.scoresByStudent.get(st.id)) || {};
          const row = computeScoreRow(scoreRecord, sortedSubjects, scoreConfig);
          return {
            studentRef: st.id ?? -1,
            status: st.status,
            ...row,
            average: displayedAverageOrNull(row.average, mode),
          };
        });
        const rankMap = computeCompetitionRanks(
          computed
            .filter((r) => r.status === 'active')
            .map((r) => ({ id: r.studentRef, value: r.average }))
        );
        const rankByStudent = new Map(
          computed.map((r) => [
            r.studentRef,
            {
              ...r,
              rank: r.status === 'active' ? rankMap.get(r.studentRef) ?? null : null,
            },
          ])
        );

        const isPortrait = orientation === 'portrait';
        const pageWidthMm = isPortrait ? 210 : 297;
        const pageHeightMm = isPortrait ? 297 : 210;
        const denseRows = isPortrait ? 39 : LANDSCAPE_DENSE_ROWS;
        const compactRows = isPortrait ? 30 : LANDSCAPE_COMPACT_ROWS;
        const padVMm = isPortrait ? 4 : activeStudents.length > denseRows ? 1.6 : 2.5;
        const padHMm = isPortrait ? 5 : 6;
        const innerWidthMm = pageWidthMm - padHMm * 2;

        const hasLongStudentId = activeStudents.some((s) => (s.studentId || '').length > 8);
        const cols = isPortrait
          ? hasLongStudentId
            ? { no: 6, id: 19.5, name: 31, sex: 5.5, total: 10, avg: 10, rank: 9, note: 11 }
            : { no: 6, id: 12.5, name: 34, sex: 5.5, total: 10, avg: 10, rank: 9, note: 13 }
          : hasLongStudentId
            ? { no: 6.5, id: 22, name: 41, sex: 6, total: 11, avg: 11, rank: 10, note: 16.5 }
            : { no: 6.5, id: 17, name: 42, sex: 6, total: 11, avg: 11, rank: 10, note: 18.5 };

        const denseSingleRowMm = isPortrait
          ? activeStudents.length > denseRows
            ? 4.1
            : activeStudents.length > compactRows
              ? 4.4
              : 4.8
          : activeStudents.length > denseRows
            ? 2.95
            : activeStudents.length > compactRows
              ? 3.3
              : 3.9;
        const splitPages = paginateByRowHeight({
          items: activeStudents,
          maxRowsPerPage: MAX_ROWS_PER_PAGE,
          // Landscape middle page: measured 166.8 mm for rows above the page-number line.
          nonLastPageBudgetMm: isPortrait ? 240 : 162,
          // Same room as a middle page, minus the signature block instead of the page-number line.
          lastPageBudgetMm:
            rowsAndSignMm(isPortrait, activeStudents.length) -
            signBlockMm(isPortrait, activeStudents.length),
          getRowHeightMm: (st) => {
            const note = (st.id !== undefined && sheet.notesByStudent?.get(st.id)) || '';
            const nameLines = estimateWrappedLines(st.nameKm, cols.name - 1.5, 6.0, 2);
            const idLines = estimateWrappedLines(fmt(st.studentId), cols.id - 1, 6.0, 2);
            const noteLines = estimateWrappedLines(note, cols.note - 1.5, 5.5, 3);
            const lines = Math.max(nameLines, idLines, noteLines);
            const singleH = isPortrait
              ? Math.max(denseSingleRowMm, 3.8)
              : activeStudents.length > denseRows
                ? 3.2 // rendered 3.15 mm (cells have no padding)
                : activeStudents.length > 35
                  ? 3.42 // rendered 3.4 mm (tighter cells)
                  : activeStudents.length > compactRows
                  ? 3.6 // rendered 3.6 mm
                  : 4.4; // rendered 4.4 mm
            if (lines <= 1) return singleH;
            const dense = !isPortrait && activeStudents.length > 35;
            // From 36 rows (tighter cells): a 2-line name or note renders about 4.6–5 mm.
            // Portrait: a 3-line note renders 10.5 mm (3.5 mm per line).
            const lineH = dense
              ? 2.5
              : isPortrait
                ? 3.5
                : noteLines >= lines && noteLines > nameLines
                  ? 3.1
                  : 3.35;
            return Math.max(singleH, lines * lineH);
          },
        });
        const studentPages = fitOnePage
          ? [{ items: activeStudents, startIndex: 0 }]
          : splitPages;

        // Calculate available width per subject column
        const subjectCount = Math.max(1, sortedSubjects.length);
        const fixedWidthMm =
          cols.no + cols.id + cols.name + cols.sex + cols.total + cols.avg + cols.rank + cols.note;
        const usableWidthMm = innerWidthMm - fixedWidthMm;
        const subjectColWidthMm = Math.max(isPortrait ? 5.6 : 7.5, usableWidthMm / subjectCount);
        const rotatedBoxWidthMm = Math.min(
          isPortrait ? 12 : 18,
          Math.max(5.0, subjectColWidthMm - 0.6)
        );

        return studentPages.map((pg, pageIdx) => {
          const isLastPageOfSheet = pageIdx === studentPages.length - 1;
          const isVeryLastPage = sIdx === sheets.length - 1 && isLastPageOfSheet;
          // Layout tier (fonts, row height, signing gap) follows the class size, not the rows on this
          // page: every page of a split sheet looks the same and matches the pagination estimates.
          const tierRows = activeStudents.length;

          // Adaptive typography & spacing tuned for A4 landscape (205mm usable height)
          // and A4 portrait (289mm usable height), accounting for Khmer Battambang glyph height
          // so the signature sits snugly right under the table without drifting or clipping.
          const rowHeightMm = isPortrait
            ? tierRows > denseRows
              ? 3.9
              : tierRows > compactRows
                ? 4.4
                : 4.8
            : tierRows > denseRows
              ? 3.15
              : tierRows > compactRows
                ? 3.4
                : 3.9;
          const fontSizePt = isPortrait
            ? tierRows > denseRows
              ? 7.0
              : subjectCount > 13
                ? 7.5
                : 8.4
            : tierRows > denseRows
              ? 7.0
              : tierRows > compactRows
                ? 7.5
                : 8.8;
          const headerHeightMm = isPortrait
            ? 23
            : tierRows > denseRows
              ? 11.0
              : tierRows > compactRows
                ? 14.5
                : 16.5;
          const groupHeaderMm = isPortrait ? 4.4 : tierRows > denseRows ? 2.8 : 3.2;
          const headerFontPt = isPortrait
            ? subjectCount > 13
              ? 7.0
              : 7.6
            : tierRows > denseRows
              ? 7.0
              : tierRows > compactRows
                ? 7.4
                : 8.2;
          const baseIdFontPt = isPortrait
            ? subjectCount > 13
              ? 7.5
              : 7.8
            : tierRows > denseRows
              ? 7.0
              : tierRows > compactRows
                ? 7.5
                : 8.0;
          const idFontPt = baseIdFontPt;
          const sign = signLayoutForRows(isPortrait, tierRows);
          // Tighter line boxes from 36 rows (landscape) so the rows leave room for the signatures.
          const tightCells = isPortrait ? tierRows > denseRows : tierRows > 35;

          return (
            <div
              // Mode in the key: switching «១ ទំព័រ» remounts the page, dropping fit styles/data-fit-scale.
              key={`${fitOnePage ? 'fit' : 'flow'}-${sheet.id}-${pageIdx}`}
              data-print-page
              style={{
                width: `${pageWidthMm}mm`,
                height: `${pageHeightMm}mm`,
                padding: `${padVMm}mm ${padHMm}mm`,
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
                pageBreakAfter: !isVeryLastPage ? 'always' : 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
              data-can-fit-one-page={!fitOnePage && studentPages.length > 1 ? '1' : undefined}
            >
              <div data-fit-body className={fitOnePage ? 'flex flex-col' : 'flex flex-col flex-1'}>
              <div>
                {/* Header */}
                <div className={`flex items-center justify-between ${tierRows > denseRows ? 'mb-0.5' : 'mb-1'} gap-2`}>
                  <div
                    className={`${
                      isPortrait ? 'text-[8.5pt] gap-x-2.5' : 'text-[9.5pt] gap-x-3'
                    } flex flex-wrap items-center`}
                  >
                    <span>
                      <strong className="font-bold">{profile.schoolName}</strong>
                    </span>
                    <span>
                      ថ្នាក់ទី <strong>{cls.name}</strong>
                    </span>
                    <span>
                      ឆ្នាំសិក្សា <strong>{fmt(cls.academicYear)}</strong>
                    </span>
                  </div>

                  <div
                    style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                    className={`${isPortrait ? 'text-[10.5pt]' : 'text-[11.5pt]'} shrink-0`}
                  >
                    {sheet.title}
                  </div>

                  <table
                    className={`border-collapse ${isPortrait ? 'text-[7.5pt]' : 'text-[8.2pt]'} shrink-0`}
                  >
                    <thead>
                      <tr>
                        <th className={`border border-black px-1.5 ${tierRows > denseRows ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>
                          ប្រុស
                        </th>
                        <th className={`border border-black px-1.5 ${tierRows > denseRows ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>
                          ស្រី
                        </th>
                        <th className={`border border-black px-1.5 ${tierRows > denseRows ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>
                          សរុប
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className={`border border-black px-1.5 ${tierRows > denseRows ? 'py-0' : 'py-0.5'} text-center font-bold`}>
                          {fmt(maleCount)}
                        </td>
                        <td className={`border border-black px-1.5 ${tierRows > denseRows ? 'py-0' : 'py-0.5'} text-center font-bold`}>
                          {fmt(femaleCount)}
                        </td>
                        <td className={`border border-black px-1.5 ${tierRows > denseRows ? 'py-0' : 'py-0.5'} text-center font-bold`}>
                          {fmt(activeStudents.length)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Score Table */}
                <table
                  // Landscape 26+ rows: no default cell padding, so the rows still leave room to sign.
                  className={`w-full border-collapse ${!isPortrait && tierRows > compactRows ? '[&_td]:py-0' : ''}`}
                  style={{
                    fontSize: `${fontSizePt}pt`,
                    tableLayout: 'fixed',
                    lineHeight: tierRows > denseRows ? 1.1 : 1.15,
                  }}
                >
                  <thead>
                    <tr className="bg-slate-100">
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold"
                        style={{ width: `${cols.no}mm` }}
                      >
                        ល.រ
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold"
                        style={{ width: `${cols.id}mm` }}
                      >
                        អត្តលេខ
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black px-1.5 text-left font-bold"
                        style={{ width: `${cols.name}mm` }}
                      >
                        គោត្តនាម និងនាម
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold"
                        style={{ width: `${cols.sex}mm` }}
                      >
                        ភេទ
                      </th>

                      {headerSpans.map((span) =>
                        span.subjects.length > 1 && span.group ? (
                          <th
                            key={span.key}
                            colSpan={span.subjects.length}
                            className="border border-black text-center font-bold px-0.5 py-0"
                            style={{ fontSize: `${headerFontPt}pt`, height: `${groupHeaderMm}mm` }}
                          >
                            {span.group}
                          </th>
                        ) : (
                          <th
                            key={span.key}
                            rowSpan={hasAnyGroup ? 2 : 1}
                            className="border border-black p-0 align-middle"
                            style={{ width: `${subjectColWidthMm}mm` }}
                          >
                            <RotatedHeaderText
                              text={span.subjects[0].name}
                              heightMm={hasAnyGroup ? headerHeightMm + groupHeaderMm : headerHeightMm}
                              widthMm={rotatedBoxWidthMm}
                              fontSizePt={headerFontPt}
                            />
                          </th>
                        )
                      )}

                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black p-0 align-middle"
                        style={{ width: `${cols.total}mm` }}
                      >
                        <RotatedHeaderText
                          text="ពិន្ទុសរុប"
                          heightMm={hasAnyGroup ? headerHeightMm + groupHeaderMm : headerHeightMm}
                          widthMm={cols.total - 0.8}
                          fontSizePt={headerFontPt}
                        />
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black p-0 align-middle"
                        style={{ width: `${cols.avg}mm` }}
                      >
                        <RotatedHeaderText
                          text="មធ្យមភាគ"
                          heightMm={hasAnyGroup ? headerHeightMm + groupHeaderMm : headerHeightMm}
                          widthMm={cols.avg - 0.8}
                          fontSizePt={headerFontPt}
                        />
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black p-0 align-middle"
                        style={{ width: `${cols.rank}mm` }}
                      >
                        <RotatedHeaderText
                          text="ចំណាត់ថ្នាក់"
                          heightMm={hasAnyGroup ? headerHeightMm + groupHeaderMm : headerHeightMm}
                          widthMm={cols.rank - 0.8}
                          fontSizePt={Math.max(7.0, headerFontPt - 0.2)}
                        />
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold px-0.5"
                        style={{ width: `${cols.note}mm`, fontSize: `${Math.max(7.0, headerFontPt - 0.2)}pt` }}
                      >
                        សេចក្ដីផ្សេងៗ
                      </th>
                    </tr>

                    {hasAnyGroup && (
                      <tr className="bg-slate-100">
                        {headerSpans
                          .filter((sp) => sp.subjects.length > 1 && sp.group)
                          .flatMap((sp) => sp.subjects)
                          .map((subj) => (
                            <th
                              key={subj.id}
                              className="border border-black p-0 align-middle"
                              style={{ width: `${subjectColWidthMm}mm` }}
                            >
                              <RotatedHeaderText
                                text={subj.name}
                                heightMm={headerHeightMm}
                                widthMm={rotatedBoxWidthMm}
                                fontSizePt={headerFontPt}
                              />
                            </th>
                          ))}
                      </tr>
                    )}

                    {/* Paper-form subject column numbers: grouped spans share one merged number */}
                    <tr
                      className="bg-slate-50"
                      style={{ height: tierRows > denseRows ? '2.8mm' : '3.4mm', fontSize: `${Math.max(7.0, fontSizePt - 0.5)}pt` }}
                    >
                      <th colSpan={4} className="border border-black text-center px-1.5 font-medium">
                        លេខរៀងមុខវិជ្ជា
                      </th>
                      {columnNumbers.map((colNum) => (
                        <th
                          key={colNum.key}
                          colSpan={colNum.colSpan}
                          className="border border-black text-center font-bold"
                        >
                          {colNum.columnNumber !== null ? fmt(colNum.columnNumber) : ''}
                        </th>
                      ))}
                      <th colSpan={4} className="border border-black text-center font-normal">
                        /{fmt(scoreConfig.scale)}
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {pg.items.map((student, idx) => {
                      const rowNum = pg.startIndex + idx + 1;
                      const scoreRecord =
                        (student.id !== undefined && sheet.scoresByStudent.get(student.id)) || {};
                      const ranked =
                        student.id !== undefined ? rankByStudent.get(student.id) : undefined;
                      const note =
                        (student.id !== undefined && sheet.notesByStudent?.get(student.id)) || '';

                      return (
                        <tr
                          key={student.id ?? rowNum}
                          style={{ height: `${rowHeightMm}mm` }}
                        >
                          <td className="border border-black text-center p-0">
                            {fmt(rowNum)}
                          </td>
                          <td
                            className="border border-black text-center font-mono px-0.5 py-0"
                            style={{ fontSize: `${idFontPt}pt` }}
                          >
                            <FitText text={fmt(student.studentId)} basePt={idFontPt} minPt={6.0} lineHeight={tightCells ? 1.12 : 1.25} />
                          </td>
                          <td className="border border-black px-1.5 py-0 font-medium">
                            <FitText text={student.nameKm} basePt={fontSizePt} minPt={6.0} lineHeight={tightCells ? 1.12 : 1.25} />
                          </td>
                          <td className="border border-black text-center p-0">
                            {student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                          </td>

                          {sortedSubjects.map((subj) => {
                            const val = scoreRecord[subj.id];
                            return (
                              <td
                                key={`${student.id}-${subj.id}`}
                                className="border border-black text-center p-0"
                              >
                                {typeof val === 'number' && !Number.isNaN(val)
                                  ? fmt(
                                      Number.isInteger(val)
                                        ? val
                                        : Number(val.toFixed(1))
                                    )
                                  : ''}
                              </td>
                            );
                          })}

                          <td className="border border-black text-center font-semibold p-0">
                            {ranked?.total !== null && ranked?.total !== undefined
                              ? fmt(
                                  Number.isInteger(ranked.total)
                                    ? ranked.total
                                    : ranked.total.toFixed(1)
                                )
                              : ''}
                          </td>
                          <td
                            className={`border border-black text-center font-semibold ${
                              ranked?.passed === false ? 'text-red-700' : ''
                            }`}
                          >
                            {ranked?.average !== null && ranked?.average !== undefined
                              ? fmt(formatAverage(ranked.average, scoreConfig.averageDecimalMode))
                              : ''}
                          </td>
                          <td className="border border-black text-center font-bold">
                            {ranked?.rank !== null && ranked?.rank !== undefined
                              ? fmt(ranked.rank)
                              : ''}
                          </td>
                          <td
                            className="border border-black px-1"
                            style={{ fontSize: `${idFontPt}pt` }}
                          >
                            <FitText text={note} basePt={idFontPt} minPt={5.5} lineHeight={tightCells ? 1.12 : 1.25} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isLastPageOfSheet ? (
                <div style={{ marginTop: `${sign.marginTopMm}mm` }}>
                  <DocumentSignature
                    profile={profile}
                    fontSizePt={sign.fontPt}
                    gapMm={sign.gapMm}
                    ptMm={sign.ptMm}
                    middle={
                      studentPages.length > 1 && (
                        <div className="text-[8.5pt] text-slate-500">
                          ទំព័រ {fmt(pageIdx + 1)} / {fmt(studentPages.length)}
                        </div>
                      )
                    }
                  />
                </div>
              ) : (
                <div className="mt-auto text-center text-[8.5pt] text-slate-500 pt-1">
                  ទំព័រ {fmt(pageIdx + 1)} / {fmt(studentPages.length)}
                </div>
              )}
              </div>
            </div>
          );
        });
      })}
    </div>
  );
};
