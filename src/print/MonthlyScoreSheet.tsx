import React from 'react';
import type { Profile, SchoolClass, ScoreConfig, Student } from '../types/domain';
import {
  buildSubjectColumnNumbers,
  buildSubjectHeaderSpans,
  computeCompetitionRanks,
  computeScoreRow,
  formatAverage,
  isSubjectActive,
  sortSubjects,
} from '../lib/grading';
import { getActiveStudentsOrdered } from '../lib/attendance';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { RotatedHeaderText } from './RotatedHeaderText';

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
  useKhmerDigits?: boolean;
}

const MAX_ROWS_PER_PAGE = 45;

export const MonthlyScoreSheet: React.FC<MonthlyScoreSheetProps> = ({
  cls,
  students,
  profile,
  sheets,
  scoreConfig,
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const sortedSubjects = sortSubjects(cls.subjects);
  const headerSpans = buildSubjectHeaderSpans(sortedSubjects);
  const columnNumbers = buildSubjectColumnNumbers(headerSpans);
  const hasAnyGroup = headerSpans.some((sp) => sp.subjects.length > 1 && sp.group);

  return (
    <div className="bg-white text-black font-battambang">
      {sheets.map((sheet, sIdx) => {
        const activeStudents = getActiveStudentsOrdered(students, sheet.monthKey);
        const maleCount = activeStudents.filter((s) => s.gender === 'ប្រុស').length;
        const femaleCount = activeStudents.filter((s) => s.gender === 'ស្រី').length;

        const computed = activeStudents.map((st) => {
          const scoreRecord = (st.id !== undefined && sheet.scoresByStudent.get(st.id)) || {};
          const row = computeScoreRow(scoreRecord, sortedSubjects, scoreConfig);
          return {
            studentRef: st.id ?? -1,
            status: st.status,
            ...row,
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

        const firstPageCount = Math.max(1, studentPages[0].items.length);
        const isDense = firstPageCount > 36;
        const rowHeightMm = isDense ? 2.85 : 3.9;
        const fontSizePt = isDense ? 6.8 : 8.2;
        const headerHeightMm = isDense ? 17.5 : 24;
        const signGapMm = isDense ? 9 : 16;

        // Calculate available width per subject column (~174mm for subjects)
        const subjectCount = Math.max(1, sortedSubjects.length);
        const fixedWidthMm = 6.5 + 15.5 + 35 + 6 + 10.5 + 10.5 + 9.5 + 15; // ~108.5mm
        const usableWidthMm = 285 - fixedWidthMm;
        const subjectColWidthMm = Math.max(7.5, Math.min(16, usableWidthMm / subjectCount));

        return studentPages.map((pg, pageIdx) => {
          const isLastPageOfSheet = pageIdx === studentPages.length - 1;
          const isVeryLastPage = sIdx === sheets.length - 1 && isLastPageOfSheet;

          return (
            <div
              key={`${sheet.id}-${pageIdx}`}
              data-print-page
              style={{
                width: '297mm',
                height: '210mm',
                padding: '3.5mm 6mm',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
                pageBreakAfter: !isVeryLastPage ? 'always' : 'auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Header matching reference/01_monthly_scores.webp */}
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="text-[9pt] flex flex-wrap items-center gap-x-3">
                    <span>
                      <strong className="font-bold">{profile.schoolName}</strong>
                    </span>
                    <span>
                      ថ្នាក់ទី <strong>{cls.name}</strong>
                    </span>
                    <span>
                      <strong>{sheet.periodLabel}</strong>
                    </span>
                    <span>
                      ឆ្នាំសិក្សា <strong>{fmt(cls.academicYear)}</strong>
                    </span>
                  </div>

                  <div
                    style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
                    className="text-[10.5pt] shrink-0"
                  >
                    {sheet.title}
                  </div>

                  <table className="border-collapse text-[8pt] shrink-0">
                    <thead>
                      <tr>
                        <th className="border border-black px-2 py-0.5 bg-slate-100 font-bold">
                          ប្រុស
                        </th>
                        <th className="border border-black px-2 py-0.5 bg-slate-100 font-bold">
                          ស្រី
                        </th>
                        <th className="border border-black px-2 py-0.5 bg-slate-100 font-bold">
                          សរុប
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-black px-2 py-0.5 text-center font-bold">
                          {fmt(maleCount)}
                        </td>
                        <td className="border border-black px-2 py-0.5 text-center font-bold">
                          {fmt(femaleCount)}
                        </td>
                        <td className="border border-black px-2 py-0.5 text-center font-bold">
                          {fmt(activeStudents.length)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Score Table */}
                <table
                  className="w-full border-collapse"
                  style={{ fontSize: `${fontSizePt}pt`, tableLayout: 'fixed', lineHeight: 1 }}
                >
                  <thead>
                    <tr className="bg-slate-100">
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold"
                        style={{ width: '6.5mm' }}
                      >
                        ល.រ
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold"
                        style={{ width: '15.5mm' }}
                      >
                        អត្តលេខ
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black px-1 text-left font-bold"
                        style={{ width: '35mm' }}
                      >
                        គោត្តនាម និងនាម
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold"
                        style={{ width: '6mm' }}
                      >
                        ភេទ
                      </th>

                      {headerSpans.map((span) =>
                        span.subjects.length > 1 && span.group ? (
                          <th
                            key={span.key}
                            colSpan={span.subjects.length}
                            className="border border-black text-center font-bold px-0.5 py-0.5"
                            style={{ fontSize: '6.8pt', height: '4.2mm' }}
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
                              heightMm={hasAnyGroup ? headerHeightMm + 4.2 : headerHeightMm}
                              widthMm={subjectColWidthMm - 0.5}
                              fontSizePt={6.3}
                            />
                          </th>
                        )
                      )}

                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black p-0 align-middle"
                        style={{ width: '10.5mm' }}
                      >
                        <RotatedHeaderText
                          text="ពិន្ទុសរុប"
                          heightMm={hasAnyGroup ? headerHeightMm + 4.2 : headerHeightMm}
                          widthMm={10}
                          fontSizePt={6.8}
                        />
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black p-0 align-middle"
                        style={{ width: '10.5mm' }}
                      >
                        <RotatedHeaderText
                          text="មធ្យមភាគ"
                          heightMm={hasAnyGroup ? headerHeightMm + 4.2 : headerHeightMm}
                          widthMm={10}
                          fontSizePt={6.8}
                        />
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black p-0 align-middle"
                        style={{ width: '9.5mm' }}
                      >
                        <RotatedHeaderText
                          text="ចំណាត់ថ្នាក់"
                          heightMm={hasAnyGroup ? headerHeightMm + 4.2 : headerHeightMm}
                          widthMm={9}
                          fontSizePt={6.6}
                        />
                      </th>
                      <th
                        rowSpan={hasAnyGroup ? 2 : 1}
                        className="border border-black text-center font-bold px-0.5"
                        style={{ width: '15mm', fontSize: '7pt' }}
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
                                widthMm={subjectColWidthMm - 0.5}
                                fontSizePt={6.3}
                              />
                            </th>
                          ))}
                      </tr>
                    )}

                    {/* Paper-form subject column numbers: grouped spans share one merged number (1..15 + blank extras) */}
                    <tr className="bg-slate-50" style={{ height: '3.2mm', fontSize: '6.5pt' }}>
                      <th colSpan={4} className="border border-black text-right px-1.5 font-medium">
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
                          <td className="border border-black text-center font-mono text-[6.3pt] truncate px-0.5 py-0 leading-none">
                            {fmt(student.studentId)}
                          </td>
                          <td className="border border-black px-1 py-0 truncate font-medium leading-none">
                            {student.nameKm}
                          </td>
                          <td className="border border-black text-center leading-none p-0">
                            {student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                          </td>

                          {sortedSubjects.map((subj) => {
                            const val = isSubjectActive(subj) ? scoreRecord[subj.id] : undefined;
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
                          <td className="border border-black px-0.5 truncate text-[6.5pt] leading-none">
                            {note}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isLastPageOfSheet ? (
                <div className="flex items-end justify-between text-[8.5pt] px-8 pt-1">
                  <div className="text-center">
                    <div>បានឃើញ និងឯកភាព</div>
                    <div className="font-bold">នាយកសាលា</div>
                    <div style={{ height: `${signGapMm}mm` }} />
                    <div className="font-bold">{profile.directorName}</div>
                  </div>

                  {studentPages.length > 1 && (
                    <div className="text-[8pt] text-slate-500">
                      ទំព័រ {fmt(pageIdx + 1)} / {fmt(studentPages.length)}
                    </div>
                  )}

                  <div className="text-center">
                    <div>ធ្វើនៅ…………ថ្ងៃទី………ខែ………ឆ្នាំ………</div>
                    <div className="font-bold">គ្រូបន្ទុកថ្នាក់</div>
                    <div style={{ height: `${signGapMm}mm` }} />
                    <div className="font-bold">{profile.teacherName}</div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-[8pt] text-slate-500 pt-1">
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
