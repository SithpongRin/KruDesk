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

        const studentPages: Array<{ items: Student[]; startIndex: number }> = [];
        for (let i = 0; i < activeStudents.length; i += MAX_ROWS_PER_PAGE) {
          studentPages.push({
            items: activeStudents.slice(i, i + MAX_ROWS_PER_PAGE),
            startIndex: i,
          });
        }
        if (studentPages.length === 0) {
          studentPages.push({ items: [], startIndex: 0 });
        }

        const isPortrait = orientation === 'portrait';
        const pageWidthMm = isPortrait ? 210 : 297;
        const pageHeightMm = isPortrait ? 297 : 210;
        const padVMm = isPortrait ? 4 : 2.5;
        const padHMm = isPortrait ? 5 : 6;
        const innerWidthMm = pageWidthMm - padHMm * 2;

        const cols = isPortrait
          ? { no: 6, id: 12.5, name: 34, sex: 5.5, total: 10, avg: 10, rank: 9, note: 13 }
          : { no: 7.5, id: 17, name: 42, sex: 7, total: 12, avg: 12, rank: 11, note: 17.5 };

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
              ? 4.2
              : pageRowCount > 30
                ? 4.5
                : 5.0
            : pageRowCount > 39
              ? 2.75
              : pageRowCount > 30
                ? 3.0
                : 3.75;
          const fontSizePt = isPortrait
            ? subjectCount > 13
              ? 7.4
              : 8.4
            : pageRowCount > 39
              ? 7.1
              : pageRowCount > 30
                ? 7.6
                : 8.8;
          const headerHeightMm = isPortrait
            ? 23
            : pageRowCount > 39
              ? 15.5
              : pageRowCount > 30
                ? 16.5
                : 21;
          const groupHeaderMm = isPortrait ? 4.4 : 4.0;
          const headerFontPt = isPortrait
            ? subjectCount > 13
              ? 6.8
              : 7.6
            : pageRowCount > 39
              ? 6.9
              : pageRowCount > 30
                ? 7.3
                : 8.2;
          const idFontPt = isPortrait
            ? subjectCount > 13
              ? 6.8
              : 7.6
            : pageRowCount > 39
              ? 6.9
              : pageRowCount > 30
                ? 7.3
                : 8.0;
          const signFontPt = isPortrait
            ? 10.5
            : pageRowCount > 39
              ? 9.0
              : pageRowCount > 30
                ? 9.5
                : 10.5;
          const signGapMm = isPortrait
            ? 12
            : pageRowCount > 39
              ? 7
              : pageRowCount > 30
                ? 9
                : 13;
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
                <div className="flex items-center justify-between mb-1 gap-2">
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
                        <th className="border border-black px-1.5 py-0.5 bg-slate-100 font-bold">
                          ប្រុស
                        </th>
                        <th className="border border-black px-1.5 py-0.5 bg-slate-100 font-bold">
                          ស្រី
                        </th>
                        <th className="border border-black px-1.5 py-0.5 bg-slate-100 font-bold">
                          សរុប
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-black px-1.5 py-0.5 text-center font-bold">
                          {fmt(maleCount)}
                        </td>
                        <td className="border border-black px-1.5 py-0.5 text-center font-bold">
                          {fmt(femaleCount)}
                        </td>
                        <td className="border border-black px-1.5 py-0.5 text-center font-bold">
                          {fmt(activeStudents.length)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Score Table */}
                <table
                  className="w-full border-collapse"
                  style={{ fontSize: `${fontSizePt}pt`, tableLayout: 'fixed', lineHeight: 0.94 }}
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
                          fontSizePt={Math.max(6.6, headerFontPt - 0.2)}
                        />
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold px-0.5"
                        style={{ width: `${cols.note}mm`, fontSize: `${Math.max(6.6, headerFontPt - 0.2)}pt` }}
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
                      style={{ height: '3.2mm', fontSize: `${Math.max(6.6, fontSizePt - 0.6)}pt` }}
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
                          <td className="border border-black text-center leading-none p-0">
                            {fmt(rowNum)}
                          </td>
                          <td
                            className="border border-black text-center font-mono truncate px-0.5 py-0 leading-none"
                            style={{ fontSize: `${idFontPt}pt` }}
                          >
                            {fmt(student.studentId)}
                          </td>
                          <td className="border border-black px-1.5 py-0 truncate font-medium leading-none">
                            {student.nameKm}
                          </td>
                          <td className="border border-black text-center leading-none p-0">
                            {student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                          </td>

                          {sortedSubjects.map((subj) => {
                            const val = scoreRecord[subj.id];
                            return (
                              <td
                                key={`${student.id}-${subj.id}`}
                                className="border border-black text-center leading-none p-0"
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

                          <td className="border border-black text-center font-semibold leading-none p-0">
                            {ranked?.total !== null && ranked?.total !== undefined
                              ? fmt(
                                  Number.isInteger(ranked.total)
                                    ? ranked.total
                                    : ranked.total.toFixed(1)
                                )
                              : ''}
                          </td>
                          <td
                            className={`border border-black text-center font-semibold leading-none ${
                              ranked?.passed === false ? 'text-red-700' : ''
                            }`}
                          >
                            {ranked?.average !== null && ranked?.average !== undefined
                              ? fmt(formatAverage(ranked.average, scoreConfig.averageDecimalMode))
                              : ''}
                          </td>
                          <td className="border border-black text-center font-bold leading-none">
                            {ranked?.rank !== null && ranked?.rank !== undefined
                              ? fmt(ranked.rank)
                              : ''}
                          </td>
                          <td
                            className="border border-black px-1 truncate leading-none"
                            style={{ fontSize: `${idFontPt}pt` }}
                          >
                            {note}
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
