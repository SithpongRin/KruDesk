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
import { DocumentSignature } from './DocumentSignature';
import { FitText, estimateWrappedLines, paginateByRowHeight } from './FitText';

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
        const padVMm = isPortrait ? 4 : activeStudents.length > 39 ? 1.6 : 2.5;
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
          ? activeStudents.length > 39
            ? 4.1
            : activeStudents.length > 30
              ? 4.4
              : 4.8
          : activeStudents.length > 39
            ? 2.95
            : activeStudents.length > 30
              ? 3.3
              : 3.9;
        const studentPages = paginateByRowHeight({
          items: activeStudents,
          maxRowsPerPage: MAX_ROWS_PER_PAGE,
          nonLastPageBudgetMm: isPortrait ? 240 : 172,
          lastPageBudgetMm: isPortrait ? 225 : 160,
          getRowHeightMm: (st) => {
            const note = (st.id !== undefined && sheet.notesByStudent?.get(st.id)) || '';
            const nameLines = estimateWrappedLines(st.nameKm, cols.name - 1.5, 6.0, 2);
            const idLines = estimateWrappedLines(fmt(st.studentId), cols.id - 1, 6.0, 2);
            const noteLines = estimateWrappedLines(note, cols.note - 1.5, 5.5, 3);
            const lines = Math.max(nameLines, idLines, noteLines);
            const singleH = isPortrait
              ? Math.max(denseSingleRowMm, 3.8)
              : activeStudents.length > 39
                ? 3.35
                : Math.max(denseSingleRowMm, 3.6);
            if (lines <= 1) return singleH;
            const lineH = noteLines >= lines && noteLines > nameLines ? 3.1 : 3.35;
            return Math.max(singleH, lines * lineH);
          },
        });

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
          const pageRowCount = pg.items.length;

          // Adaptive typography & spacing tuned for A4 landscape (205mm usable height)
          // and A4 portrait (289mm usable height), accounting for Khmer Battambang glyph height
          // so the signature sits snugly right under the table without drifting or clipping.
          const rowHeightMm = isPortrait
            ? pageRowCount > 39
              ? 3.9
              : pageRowCount > 30
                ? 4.4
                : 4.8
            : pageRowCount > 39
              ? 3.15
              : pageRowCount > 30
                ? 3.4
                : 3.9;
          const fontSizePt = isPortrait
            ? pageRowCount > 39
              ? 7.0
              : subjectCount > 13
                ? 7.5
                : 8.4
            : pageRowCount > 39
              ? 7.0
              : pageRowCount > 30
                ? 7.5
                : 8.8;
          const headerHeightMm = isPortrait
            ? 23
            : pageRowCount > 39
              ? 11.0
              : pageRowCount > 30
                ? 14.5
                : 16.5;
          const groupHeaderMm = isPortrait ? 4.4 : pageRowCount > 39 ? 2.8 : 3.2;
          const headerFontPt = isPortrait
            ? subjectCount > 13
              ? 7.0
              : 7.6
            : pageRowCount > 39
              ? 7.0
              : pageRowCount > 30
                ? 7.4
                : 8.2;
          const baseIdFontPt = isPortrait
            ? subjectCount > 13
              ? 7.5
              : 7.8
            : pageRowCount > 39
              ? 7.0
              : pageRowCount > 30
                ? 7.5
                : 8.0;
          const idFontPt = baseIdFontPt;
          const signFontPt = isPortrait
            ? 10.5
            : pageRowCount > 39
              ? 7.8
              : pageRowCount > 30
                ? 9.5
                : 10.0;
          const signGapMm = isPortrait
            ? 12
            : pageRowCount > 39
              ? 3
              : pageRowCount > 30
                ? 6
                : 8;
          // DocumentSignature already has pt-2 (~2mm), so keep extra margin small
          const signMarginTopMm = isPortrait
            ? 1.5
            : pageRowCount > 39
              ? 0
              : pageRowCount > 30
                ? 0.5
                : 2;

          return (
            <div
              key={`${sheet.id}-${pageIdx}`}
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
            >
              <div>
                {/* Header */}
                <div className={`flex items-center justify-between ${pageRowCount > 39 ? 'mb-0.5' : 'mb-1'} gap-2`}>
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
                        <th className={`border border-black px-1.5 ${pageRowCount > 39 ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>
                          ប្រុស
                        </th>
                        <th className={`border border-black px-1.5 ${pageRowCount > 39 ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>
                          ស្រី
                        </th>
                        <th className={`border border-black px-1.5 ${pageRowCount > 39 ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>
                          សរុប
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className={`border border-black px-1.5 ${pageRowCount > 39 ? 'py-0' : 'py-0.5'} text-center font-bold`}>
                          {fmt(maleCount)}
                        </td>
                        <td className={`border border-black px-1.5 ${pageRowCount > 39 ? 'py-0' : 'py-0.5'} text-center font-bold`}>
                          {fmt(femaleCount)}
                        </td>
                        <td className={`border border-black px-1.5 ${pageRowCount > 39 ? 'py-0' : 'py-0.5'} text-center font-bold`}>
                          {fmt(activeStudents.length)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Score Table */}
                <table
                  className="w-full border-collapse"
                  style={{
                    fontSize: `${fontSizePt}pt`,
                    tableLayout: 'fixed',
                    lineHeight: pageRowCount > 39 ? 1.1 : 1.15,
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
                      style={{ height: pageRowCount > 39 ? '2.8mm' : '3.4mm', fontSize: `${Math.max(7.0, fontSizePt - 0.5)}pt` }}
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
                            <FitText text={fmt(student.studentId)} basePt={idFontPt} minPt={6.0} lineHeight={pageRowCount > 39 ? 1.12 : 1.25} />
                          </td>
                          <td className="border border-black px-1.5 py-0 font-medium">
                            <FitText text={student.nameKm} basePt={fontSizePt} minPt={6.0} lineHeight={pageRowCount > 39 ? 1.12 : 1.25} />
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
                            <FitText text={note} basePt={idFontPt} minPt={5.5} lineHeight={pageRowCount > 39 ? 1.12 : 1.25} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isLastPageOfSheet ? (
                <div style={{ marginTop: `${signMarginTopMm}mm` }}>
                  <DocumentSignature
                    profile={profile}
                    fontSizePt={signFontPt}
                    gapMm={signGapMm}
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
          );
        });
      })}
    </div>
  );
};
