import React from 'react';
import type { Profile, SchoolClass, ScoreConfig } from '../types/domain';
import {
  collapseGroupedSubjects,
  formatAverage,
  isSubjectActive,
  type SemesterStudentSummary,
} from '../lib/grading';
import type { PaperSize } from '../services/pdfExport';
import { toArabicNumerals, toKhmerNumerals } from '../utils/khmerNumerals';
import { RotatedHeaderText } from './RotatedHeaderText';
import { DocumentSignature, estimateSignatureBlockHeightMm } from './DocumentSignature';
import { FitText, estimateWrappedLines, paginateByRowHeight } from './FitText';

interface SemesterSheetProps {
  cls: SchoolClass;
  profile: Profile;
  summaries: SemesterStudentSummary[];
  scoreConfig: ScoreConfig;
  paperSize?: PaperSize;
  useKhmerDigits?: boolean;
}

const MAX_ROWS_PER_PAGE = 45;

/**
 * A4 layout tiers by rows on the page. Above 35 rows the compact header and 3.1 mm rows are needed
 * for the table plus the signing gap to fit; 26–35 rows use the middle tier (measured 2026-11-24).
 */
const DENSE_ROWS = 35;
const COMPACT_ROWS = 25;

/**
 * Signature block on an A4 page, by rows on the page. The gap is the room left for the
 * handwritten signatures of the teacher and the director (2026-11-24: at least 14 mm on a full
 * 36–45-row page, 16 mm from 26–35 rows, 20 mm otherwise).
 */
function signLayoutForRows(rows: number) {
  if (rows > DENSE_ROWS) return { gapMm: 14, fontPt: 7.8, marginTopMm: 0, ptMm: 0.8 };
  if (rows > COMPACT_ROWS) return { gapMm: 16, fontPt: 9.5, marginTopMm: 0.5, ptMm: 1.2 };
  return { gapMm: 20, fontPt: 10.5, marginTopMm: 2, ptMm: undefined };
}

/** Height left for the rows and the signature on an A4 page (page minus padding, title, header). */
function a4RowsAndSignMm(rows: number): number {
  return rows > DENSE_ROWS ? 175 : rows > COMPACT_ROWS ? 164 : 159;
}

/** The single A3 page has room for a full signing gap. */
const A3_SIGN = { gapMm: 18, fontPt: 10, marginTopMm: 2, ptMm: undefined };

/** Height of a signature block (with its top margin) — what the last page must keep free. */
function signBlockMm(sign: ReturnType<typeof signLayoutForRows>): number {
  return (
    sign.marginTopMm +
    estimateSignatureBlockHeightMm({ gapMm: sign.gapMm, fontSizePt: sign.fontPt, ptMm: sign.ptMm })
  );
}

export const SemesterSheet: React.FC<SemesterSheetProps> = ({
  cls,
  profile,
  summaries,
  scoreConfig,
  paperSize = 'A4',
  useKhmerDigits = false,
}) => {
  const fmt = (val: number | string) =>
    useKhmerDigits ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const fmtScore = (val: number | null | undefined, digits = 2) => {
    if (val === null || val === undefined || Number.isNaN(val)) return '';
    if (digits === 0) return fmt(Math.round(val));
    return fmt(
      digits === 2 ? formatAverage(val, scoreConfig.averageDecimalMode) : val.toFixed(digits)
    );
  };

  const fmtRawScore = (val: number | null | undefined) => {
    if (val === null || val === undefined || Number.isNaN(val)) return '';
    return fmt(Number.isInteger(val) ? val : Number(val.toFixed(1)));
  };

  const sortedSubjects = collapseGroupedSubjects(cls.subjects.filter(isSubjectActive));
  const maleCount = summaries.filter((s) => s.student.gender === 'ប្រុស').length;
  const femaleCount = summaries.filter((s) => s.student.gender === 'ស្រី').length;

  const isA3Paper = paperSize === 'A3';
  const baseRowEstMm = isA3Paper
    ? summaries.length > 36
      ? 4.4
      : 5.2
    : summaries.length > DENSE_ROWS
      ? 2.95
      : summaries.length > COMPACT_ROWS
        ? 3.35
        : 3.9;
  const chunks = paginateByRowHeight({
    items: summaries,
    maxRowsPerPage: MAX_ROWS_PER_PAGE,
    nonLastPageBudgetMm: isA3Paper ? 245 : 172,
    // Same room as a middle page, minus the signature block instead of the page-number line.
    lastPageBudgetMm: isA3Paper
      ? 268 - signBlockMm(A3_SIGN)
      : a4RowsAndSignMm(summaries.length) - signBlockMm(signLayoutForRows(summaries.length)),
    getRowHeightMm: (row) => {
      const nameLines = estimateWrappedLines(row.student.nameKm, 39.5, 6.0, 2);
      const dense = !isA3Paper && summaries.length > DENSE_ROWS;
      // Rendered: dense 3.1 mm, middle 3.45–3.6 mm, otherwise 4.1–4.4 mm (cells keep their padding).
      const singleH = isA3Paper
        ? baseRowEstMm
        : dense
          ? 3.15
          : summaries.length > COMPACT_ROWS
            ? 3.6
            : 4.4;
      return nameLines > 1 ? Math.max(singleH, nameLines * (dense ? 2.5 : 3.35)) : singleH;
    },
  });

  const renderHeader = (subtitle: string, compact = false) => (
    <div className={`flex items-center justify-between ${compact ? 'mb-0.5' : 'mb-1'} gap-2`}>
      <div className="text-[8.8pt] flex flex-wrap items-center gap-x-3">
        <span>
          <strong className="font-bold">{profile.schoolName}</strong>
        </span>
        <span>
          ថ្នាក់ទី <strong>{cls.name}</strong>
        </span>
        <span>
          ឆ្នាំសិក្សា <strong>{fmt(cls.academicYear)}</strong>
        </span>
        <span>
          មាត្រដ្ឋាន <strong>/{fmt(scoreConfig.scale)}</strong>
        </span>
      </div>

      <div
        style={{ fontFamily: "'Moul', 'Khmer OS Muol Light', serif" }}
        className="text-[10pt] shrink-0"
      >
        {subtitle}
      </div>

      <table className="border-collapse text-[7.8pt] shrink-0">
        <thead>
          <tr>
            <th className={`border border-black px-2 ${compact ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>ប្រុស</th>
            <th className={`border border-black px-2 ${compact ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>ស្រី</th>
            <th className={`border border-black px-2 ${compact ? 'py-0' : 'py-0.5'} bg-slate-100 font-bold`}>សរុប</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={`border border-black px-2 ${compact ? 'py-0' : 'py-0.5'} text-center font-bold`}>
              {fmt(maleCount)}
            </td>
            <td className={`border border-black px-2 ${compact ? 'py-0' : 'py-0.5'} text-center font-bold`}>
              {fmt(femaleCount)}
            </td>
            <td className={`border border-black px-2 ${compact ? 'py-0' : 'py-0.5'} text-center font-bold`}>
              {fmt(summaries.length)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderSignature = (sign: ReturnType<typeof signLayoutForRows>, pageLabel: string) => (
    <div style={{ marginTop: `${sign.marginTopMm}mm` }}>
      <DocumentSignature
        profile={profile}
        fontSizePt={sign.fontPt}
        gapMm={sign.gapMm}
        ptMm={sign.ptMm}
        middle={<div className="text-[8.5pt] text-slate-500">{pageLabel}</div>}
      />
    </div>
  );

  if (paperSize === 'A3') {
    // 1 single A3 landscape page (420mm x 297mm) combining S1 + S2 + Annual
    const subjCount = Math.max(1, sortedSubjects.length);
    // Exact column budget across 408mm usable width:
    // student (6 + 30 + 5 = 41) + Sem1 summaries (8.8*4 + 7.4 = 42.6) + Sem2 summaries (42.6) + Annual (8.8 + 7.4 + 8 = 24.2) = 150.4mm
    const fixedA3Mm = 53 + 42.6 + 42.6 + 24.7;
    const pairWidthMm = Math.max(5.8, Math.min(11.5, (408 - fixedA3Mm) / (subjCount * 2)));
    const scoreW = pairWidthMm * 0.56;
    const rankW = pairWidthMm * 0.44;

    return (
      <div className="bg-white text-black font-battambang">
        {chunks.map((chunk, chunkIdx) => {
          const isVeryLast = chunkIdx === chunks.length - 1;
          const isDense = chunk.items.length > 36;
          const rowHeightMm = isDense ? 4.4 : 5.2;
          const headerHeightMm = 24;

          return (
            <div
              key={`a3-${chunkIdx}`}
              data-print-page
              style={{
                width: '420mm',
                height: '297mm',
                padding: '5mm 6mm',
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
                pageBreakAfter: !isVeryLast ? 'always' : 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div>
                {renderHeader('តារាងស្រង់ពិន្ទុប្រចាំឆមាស និងប្រចាំឆ្នាំ')}

                <table
                  className="w-full border-collapse"
                  style={{ fontSize: '7.5pt', tableLayout: 'fixed', lineHeight: 1.15 }}
                >
                  <thead>
                    <tr className="bg-slate-100">
                      <th rowSpan={3} className="border border-black text-center font-bold" style={{ width: '6.5mm' }}>
                        ល.រ
                      </th>
                      <th rowSpan={3} className="border border-black px-1 text-left font-bold" style={{ width: '41mm' }}>
                        គោត្តនាម និងនាម
                      </th>
                      <th rowSpan={3} className="border border-black text-center font-bold" style={{ width: '5.5mm' }}>
                        ភេទ
                      </th>

                      <th
                        colSpan={sortedSubjects.length * 2 + 5}
                        className="border border-black text-center font-bold py-0.5"
                      >
                        ឆមាសទី {fmt(1)}
                      </th>
                      <th
                        colSpan={sortedSubjects.length * 2 + 5}
                        className="border border-black text-center font-bold py-0.5"
                      >
                        ឆមាសទី {fmt(2)}
                      </th>
                      <th colSpan={3} className="border border-black text-center font-bold py-0.5">
                        លទ្ធផលប្រចាំឆ្នាំ
                      </th>
                    </tr>

                    <tr className="bg-slate-100">
                      {[1, 2].map((sem) => (
                        <React.Fragment key={`sem-grp-${sem}`}>
                          {sortedSubjects.map((subj) => (
                            <th
                              key={`s${sem}-${subj.id}`}
                              colSpan={2}
                              className="border border-black p-0 align-middle"
                              style={{ width: `${pairWidthMm}mm` }}
                            >
                              <RotatedHeaderText
                                text={subj.name}
                                heightMm={headerHeightMm}
                                widthMm={pairWidthMm - 0.4}
                                fontSizePt={7.0}
                              />
                            </th>
                          ))}
                          <th rowSpan={2} className="border border-black p-0" style={{ width: '8.8mm' }}>
                            <RotatedHeaderText text="សរុបប្រឡង" heightMm={headerHeightMm + 4} widthMm={8.2} fontSizePt={7.0} />
                          </th>
                          <th rowSpan={2} className="border border-black p-0" style={{ width: '8.8mm' }}>
                            <RotatedHeaderText text="មធ្យមខែ" heightMm={headerHeightMm + 4} widthMm={8.2} fontSizePt={7.0} />
                          </th>
                          <th rowSpan={2} className="border border-black p-0" style={{ width: '8.8mm' }}>
                            <RotatedHeaderText text="មធ្យមប្រឡង" heightMm={headerHeightMm + 4} widthMm={8.2} fontSizePt={7.0} />
                          </th>
                          <th rowSpan={2} className="border border-black p-0" style={{ width: '8.8mm' }}>
                            <RotatedHeaderText text="មធ្យមឆមាស" heightMm={headerHeightMm + 4} widthMm={8.2} fontSizePt={7.0} />
                          </th>
                          <th rowSpan={2} className="border border-black p-0" style={{ width: '7.4mm' }}>
                            <RotatedHeaderText text="ចំណាត់ថ្នាក់" heightMm={headerHeightMm + 4} widthMm={7} fontSizePt={7.0} />
                          </th>
                        </React.Fragment>
                      ))}

                      <th rowSpan={2} className="border border-black p-0" style={{ width: '8.8mm' }}>
                        <RotatedHeaderText text="មធ្យមប្រចាំឆ្នាំ" heightMm={headerHeightMm + 4} widthMm={8.2} fontSizePt={7.0} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '7.4mm' }}>
                        <RotatedHeaderText text="ចំណាត់ថ្នាក់ឆ្នាំ" heightMm={headerHeightMm + 4} widthMm={7} fontSizePt={7.0} />
                      </th>
                      <th rowSpan={2} className="border border-black text-center font-bold" style={{ width: '8.5mm', fontSize: '7pt' }}>
                        ផ្សេងៗ
                      </th>
                    </tr>

                    <tr className="bg-slate-50" style={{ height: '4.2mm', fontSize: '7pt' }}>
                      {[1, 2].flatMap((sem) =>
                        sortedSubjects.flatMap((subj) => [
                          <th key={`s${sem}-${subj.id}-p`} className="border border-black text-center p-0" style={{ width: `${scoreW}mm` }}>
                            ព
                          </th>,
                          <th key={`s${sem}-${subj.id}-r`} className="border border-black text-center p-0" style={{ width: `${rankW}mm` }}>
                            ច
                          </th>,
                        ])
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {chunk.items.map((row, idx) => {
                      const rowNum = chunk.startIndex + idx + 1;
                      return (
                        <tr key={row.student.id ?? rowNum} style={{ height: `${rowHeightMm}mm` }}>
                          <td className="border border-black text-center">{fmt(rowNum)}</td>
                          <td className="border border-black px-1 font-medium">
                            <FitText text={row.student.nameKm} basePt={7.5} minPt={6.0} lineHeight={1.25} />
                          </td>
                          <td className="border border-black text-center">
                            {row.student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                          </td>

                          {/* Semester 1 */}
                          {sortedSubjects.flatMap((subj) => [
                            <td key={`a3-1-${subj.id}-p`} className="border border-black text-center px-0">
                              {fmtRawScore(row.sem1ExamScores[subj.id])}
                            </td>,
                            <td key={`a3-1-${subj.id}-r`} className="border border-black text-center text-slate-600 px-0">
                              {row.sem1SubjectRanks[subj.id] ? fmt(row.sem1SubjectRanks[subj.id]!) : ''}
                            </td>,
                          ])}
                          <td className="border border-black text-center font-medium">
                            {fmtRawScore(row.sem1ExamTotal)}
                          </td>
                          <td className="border border-black text-center">
                            {fmtScore(row.sem1MonthlyAvg, 2)}
                          </td>
                          <td className="border border-black text-center">
                            {fmtScore(row.sem1ExamAvg, 2)}
                          </td>
                          <td className="border border-black text-center font-semibold">
                            {fmtScore(row.sem1Avg, 2)}
                          </td>
                          <td className="border border-black text-center font-bold">
                            {row.sem1Rank ? fmt(row.sem1Rank) : ''}
                          </td>

                          {/* Semester 2 */}
                          {sortedSubjects.flatMap((subj) => [
                            <td key={`a3-2-${subj.id}-p`} className="border border-black text-center px-0">
                              {fmtRawScore(row.sem2ExamScores[subj.id])}
                            </td>,
                            <td key={`a3-2-${subj.id}-r`} className="border border-black text-center text-slate-600 px-0">
                              {row.sem2SubjectRanks[subj.id] ? fmt(row.sem2SubjectRanks[subj.id]!) : ''}
                            </td>,
                          ])}
                          <td className="border border-black text-center font-medium">
                            {fmtRawScore(row.sem2ExamTotal)}
                          </td>
                          <td className="border border-black text-center">
                            {fmtScore(row.sem2MonthlyAvg, 2)}
                          </td>
                          <td className="border border-black text-center">
                            {fmtScore(row.sem2ExamAvg, 2)}
                          </td>
                          <td className="border border-black text-center font-semibold">
                            {fmtScore(row.sem2Avg, 2)}
                          </td>
                          <td className="border border-black text-center font-bold">
                            {row.sem2Rank ? fmt(row.sem2Rank) : ''}
                          </td>

                          {/* Annual */}
                          <td
                            className={`border border-black text-center font-bold ${
                              row.annualPassed === false ? 'text-red-700' : ''
                            }`}
                          >
                            {fmtScore(row.annualAvg, 2)}
                          </td>
                          <td className="border border-black text-center font-bold">
                            {row.annualRank ? fmt(row.annualRank) : ''}
                          </td>
                          <td className="border border-black text-center">
                            {row.annualPassed === true
                              ? 'ជាប់'
                              : row.annualPassed === false
                                ? 'ធ្លាក់'
                                : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isVeryLast
                ? renderSignature(A3_SIGN, `ទំព័រ ${fmt(chunkIdx + 1)} / ${fmt(chunks.length)}`)
                : (
                  <div className="mt-auto text-center text-[8.5pt] text-slate-500 pt-1">
                    ទំព័រ {fmt(chunkIdx + 1)} / {fmt(chunks.length)}
                  </div>
                )}
            </div>
          );
        })}
      </div>
    );
  }

  // Default A4 Landscape: Page 1 = Semester 1, Page 2 = Semester 2 + Annual Result + Signature
  const subjCount = Math.max(1, sortedSubjects.length);
  const fixedPage1Mm = 6.5 + 41 + 5.5 + 49; // student + 5 sem summaries = 102mm
  const pairWidthP1 = Math.max(8, Math.min(18, (285 - fixedPage1Mm) / subjCount));

  const fixedPage2Mm = 6.5 + 41 + 5.5 + 47 + 25; // + 3 annual cols = 125mm
  const pairWidthP2 = Math.max(7.2, Math.min(16, (285 - fixedPage2Mm) / subjCount));

  return (
    <div className="bg-white text-black font-battambang">
      {chunks.map((chunk, chunkIdx) => {
        const isLastChunk = chunkIdx === chunks.length - 1;
        const pageRowCount = chunk.items.length;
        const rowHeightMm = pageRowCount > DENSE_ROWS ? 3.1 : pageRowCount > COMPACT_ROWS ? 3.45 : 3.9;
        const fontSizePt = pageRowCount > DENSE_ROWS ? 7.0 : pageRowCount > COMPACT_ROWS ? 7.6 : 8.2;
        const headerHeightMm = pageRowCount > DENSE_ROWS ? 11.5 : pageRowCount > COMPACT_ROWS ? 18 : 22;
        const headerFontPt = pageRowCount > DENSE_ROWS ? 7.0 : pageRowCount > COMPACT_ROWS ? 7.2 : 7.5;
        const sign = signLayoutForRows(pageRowCount);
        const a4PadVMm = pageRowCount > DENSE_ROWS ? 1.8 : 2.5;

        return (
          <React.Fragment key={`a4-${chunkIdx}`}>
            {/* Page 1: Semester 1 */}
            <div
              data-print-page
              style={{
                width: '297mm',
                height: '210mm',
                padding: `${a4PadVMm}mm 6mm`,
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
                pageBreakAfter: 'always',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div>
                {renderHeader(`តារាងស្រង់ពិន្ទុប្រចាំឆមាសទី ${fmt(1)}`, pageRowCount > DENSE_ROWS)}

                <table
                  // 31+ rows: no default cell padding, so the rows still leave room to sign.
                  className={`w-full border-collapse ${pageRowCount > COMPACT_ROWS ? '[&_td]:py-0' : ''}`}
                  style={{
                    fontSize: `${fontSizePt}pt`,
                    tableLayout: 'fixed',
                    lineHeight: pageRowCount > DENSE_ROWS ? 1.1 : 1.15,
                  }}
                >
                  <thead>
                    <tr className="bg-slate-100">
                      <th rowSpan={3} className="border border-black text-center font-bold" style={{ width: '6.5mm' }}>
                        ល.រ
                      </th>
                      <th rowSpan={3} className="border border-black px-1 text-left font-bold" style={{ width: '41mm' }}>
                        គោត្តនាម និងនាម
                      </th>
                      <th rowSpan={3} className="border border-black text-center font-bold" style={{ width: '5.5mm' }}>
                        ភេទ
                      </th>
                      <th
                        colSpan={sortedSubjects.length * 2 + 5}
                        className="border border-black text-center font-bold py-0.5"
                      >
                        ឆមាសទី {fmt(1)} — ពិន្ទុប្រឡងឆមាស និងលទ្ធផលប្រចាំឆមាស
                      </th>
                    </tr>

                    <tr className="bg-slate-100">
                      {sortedSubjects.map((subj) => (
                        <th
                          key={`p1-s-${subj.id}`}
                          colSpan={2}
                          className="border border-black p-0 align-middle"
                          style={{ width: `${pairWidthP1}mm` }}
                        >
                          <RotatedHeaderText
                            text={subj.name}
                            heightMm={headerHeightMm}
                            widthMm={Math.min(16, pairWidthP1 - 0.6)}
                            fontSizePt={headerFontPt}
                          />
                        </th>
                      ))}
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '10.2mm' }}>
                        <RotatedHeaderText text="សរុបពិន្ទុប្រឡង" heightMm={headerHeightMm + 3.6} widthMm={9.5} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '9.8mm' }}>
                        <RotatedHeaderText text="មធ្យមប្រចាំខែ" heightMm={headerHeightMm + 3.6} widthMm={9.2} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '9.8mm' }}>
                        <RotatedHeaderText text="មធ្យមប្រឡង" heightMm={headerHeightMm + 3.6} widthMm={9.2} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '10.2mm' }}>
                        <RotatedHeaderText text="មធ្យមឆមាស" heightMm={headerHeightMm + 3.6} widthMm={9.5} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '9mm' }}>
                        <RotatedHeaderText text="ចំណាត់ថ្នាក់" heightMm={headerHeightMm + 3.6} widthMm={8.4} fontSizePt={Math.max(7.0, headerFontPt)} />
                      </th>
                    </tr>

                    <tr className="bg-slate-50" style={{ height: pageRowCount > DENSE_ROWS ? '3.0mm' : '3.8mm', fontSize: `${Math.max(7.0, fontSizePt - 0.5)}pt` }}>
                      {sortedSubjects.flatMap((subj) => [
                        <th key={`p1-p-${subj.id}`} className="border border-black text-center font-bold">
                          ពិន្ទុ
                        </th>,
                        <th key={`p1-r-${subj.id}`} className="border border-black text-center font-medium">
                          ចំ
                        </th>,
                      ])}
                    </tr>
                  </thead>

                  <tbody>
                    {chunk.items.map((row, idx) => {
                      const rowNum = chunk.startIndex + idx + 1;
                      return (
                        <tr key={row.student.id ?? rowNum} style={{ height: `${rowHeightMm}mm` }}>
                          <td className="border border-black text-center">{fmt(rowNum)}</td>
                          <td className="border border-black px-1 font-medium">
                            <FitText text={row.student.nameKm} basePt={fontSizePt} minPt={6.0} lineHeight={pageRowCount > DENSE_ROWS ? 1.12 : 1.25} />
                          </td>
                          <td className="border border-black text-center">
                            {row.student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                          </td>

                          {sortedSubjects.flatMap((subj) => [
                            <td key={`p1-d-p-${subj.id}`} className="border border-black text-center px-0">
                              {fmtRawScore(row.sem1ExamScores[subj.id])}
                            </td>,
                            <td key={`p1-d-r-${subj.id}`} className="border border-black text-center text-slate-600 px-0">
                              {row.sem1SubjectRanks[subj.id] ? fmt(row.sem1SubjectRanks[subj.id]!) : ''}
                            </td>,
                          ])}

                          <td className="border border-black text-center font-semibold">
                            {fmtRawScore(row.sem1ExamTotal)}
                          </td>
                          <td className="border border-black text-center">
                            {fmtScore(row.sem1MonthlyAvg, 2)}
                          </td>
                          <td className="border border-black text-center">
                            {fmtScore(row.sem1ExamAvg, 2)}
                          </td>
                          <td
                            className={`border border-black text-center font-bold ${
                              row.sem1Avg !== null && row.sem1Avg < scoreConfig.scale / 2
                                ? 'text-red-700'
                                : ''
                            }`}
                          >
                            {fmtScore(row.sem1Avg, 2)}
                          </td>
                          <td className="border border-black text-center font-bold">
                            {row.sem1Rank ? fmt(row.sem1Rank) : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-auto text-center text-[8.5pt] text-slate-500 pt-1">
                ទំព័រ {fmt(chunkIdx * 2 + 1)} / {fmt(chunks.length * 2)} (ឆមាសទី {fmt(1)})
              </div>
            </div>

            {/* Page 2: Semester 2 + Annual Result + Signature */}
            <div
              data-print-page
              style={{
                width: '297mm',
                height: '210mm',
                padding: `${a4PadVMm}mm 6mm`,
                boxSizing: 'border-box',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: "'Battambang', 'Khmer OS Battambang', sans-serif",
                pageBreakAfter: !isLastChunk ? 'always' : 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div>
                {renderHeader(`តារាងស្រង់ពិន្ទុប្រចាំឆមាសទី ${fmt(2)} និងប្រចាំឆ្នាំ`, pageRowCount > DENSE_ROWS)}

                <table
                  // 31+ rows: no default cell padding, so the rows still leave room to sign.
                  className={`w-full border-collapse ${pageRowCount > COMPACT_ROWS ? '[&_td]:py-0' : ''}`}
                  style={{
                    fontSize: `${fontSizePt}pt`,
                    tableLayout: 'fixed',
                    lineHeight: pageRowCount > DENSE_ROWS ? 1.1 : 1.15,
                  }}
                >
                  <thead>
                    <tr className="bg-slate-100">
                      <th rowSpan={3} className="border border-black text-center font-bold" style={{ width: '6.5mm' }}>
                        ល.រ
                      </th>
                      <th rowSpan={3} className="border border-black px-1 text-left font-bold" style={{ width: '41mm' }}>
                        គោត្តនាម និងនាម
                      </th>
                      <th rowSpan={3} className="border border-black text-center font-bold" style={{ width: '5.5mm' }}>
                        ភេទ
                      </th>
                      <th
                        colSpan={sortedSubjects.length * 2 + 5}
                        className="border border-black text-center font-bold py-0.5"
                      >
                        ឆមាសទី {fmt(2)}
                      </th>
                      <th
                        colSpan={3}
                        className="border border-black text-center font-bold py-0.5 bg-slate-200"
                      >
                        លទ្ធផលប្រចាំឆ្នាំ
                      </th>
                    </tr>

                    <tr className="bg-slate-100">
                      {sortedSubjects.map((subj) => (
                        <th
                          key={`p2-s-${subj.id}`}
                          colSpan={2}
                          className="border border-black p-0 align-middle"
                          style={{ width: `${pairWidthP2}mm` }}
                        >
                          <RotatedHeaderText
                            text={subj.name}
                            heightMm={headerHeightMm}
                            widthMm={Math.min(15, pairWidthP2 - 0.6)}
                            fontSizePt={headerFontPt}
                          />
                        </th>
                      ))}
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '9.8mm' }}>
                        <RotatedHeaderText text="សរុបពិន្ទុប្រឡង" heightMm={headerHeightMm + 3.6} widthMm={9.2} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '9.5mm' }}>
                        <RotatedHeaderText text="មធ្យមប្រចាំខែ" heightMm={headerHeightMm + 3.6} widthMm={9} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '9.5mm' }}>
                        <RotatedHeaderText text="មធ្យមប្រឡង" heightMm={headerHeightMm + 3.6} widthMm={9} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '9.5mm' }}>
                        <RotatedHeaderText text="មធ្យមឆមាស" heightMm={headerHeightMm + 3.6} widthMm={9} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0" style={{ width: '8.7mm' }}>
                        <RotatedHeaderText text="ចំណាត់ថ្នាក់" heightMm={headerHeightMm + 3.6} widthMm={8.2} fontSizePt={Math.max(7.0, headerFontPt)} />
                      </th>

                      <th rowSpan={2} className="border border-black p-0 bg-slate-200" style={{ width: '9.5mm' }}>
                        <RotatedHeaderText text="មធ្យមប្រចាំឆ្នាំ" heightMm={headerHeightMm + 3.6} widthMm={9} fontSizePt={headerFontPt} />
                      </th>
                      <th rowSpan={2} className="border border-black p-0 bg-slate-200" style={{ width: '8mm' }}>
                        <RotatedHeaderText text="ចំណាត់ថ្នាក់ឆ្នាំ" heightMm={headerHeightMm + 3.6} widthMm={7.4} fontSizePt={Math.max(7.0, headerFontPt)} />
                      </th>
                      <th rowSpan={2} className="border border-black text-center font-bold bg-slate-200" style={{ width: '7.5mm', fontSize: `${Math.max(7.0, headerFontPt)}pt` }}>
                        លទ្ធផល
                      </th>
                    </tr>

                    <tr className="bg-slate-50" style={{ height: pageRowCount > DENSE_ROWS ? '3.0mm' : '3.8mm', fontSize: `${Math.max(7.0, fontSizePt - 0.5)}pt` }}>
                      {sortedSubjects.flatMap((subj) => [
                        <th key={`p2-p-${subj.id}`} className="border border-black text-center font-bold">
                          ពិន្ទុ
                        </th>,
                        <th key={`p2-r-${subj.id}`} className="border border-black text-center font-medium">
                          ចំ
                        </th>,
                      ])}
                    </tr>
                  </thead>

                  <tbody>
                    {chunk.items.map((row, idx) => {
                      const rowNum = chunk.startIndex + idx + 1;
                      return (
                        <tr key={row.student.id ?? rowNum} style={{ height: `${rowHeightMm}mm` }}>
                          <td className="border border-black text-center">{fmt(rowNum)}</td>
                          <td className="border border-black px-1 font-medium">
                            <FitText text={row.student.nameKm} basePt={fontSizePt} minPt={6.0} lineHeight={pageRowCount > DENSE_ROWS ? 1.12 : 1.25} />
                          </td>
                          <td className="border border-black text-center">
                            {row.student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                          </td>

                          {sortedSubjects.flatMap((subj) => [
                            <td key={`p2-d-p-${subj.id}`} className="border border-black text-center px-0">
                              {fmtRawScore(row.sem2ExamScores[subj.id])}
                            </td>,
                            <td key={`p2-d-r-${subj.id}`} className="border border-black text-center text-slate-600 px-0">
                              {row.sem2SubjectRanks[subj.id] ? fmt(row.sem2SubjectRanks[subj.id]!) : ''}
                            </td>,
                          ])}

                          <td className="border border-black text-center font-semibold">
                            {fmtRawScore(row.sem2ExamTotal)}
                          </td>
                          <td className="border border-black text-center">
                            {fmtScore(row.sem2MonthlyAvg, 2)}
                          </td>
                          <td className="border border-black text-center">
                            {fmtScore(row.sem2ExamAvg, 2)}
                          </td>
                          <td className="border border-black text-center font-bold">
                            {fmtScore(row.sem2Avg, 2)}
                          </td>
                          <td className="border border-black text-center font-bold">
                            {row.sem2Rank ? fmt(row.sem2Rank) : ''}
                          </td>

                          <td
                            className={`border border-black text-center font-bold ${
                              row.annualPassed === false ? 'text-red-700' : ''
                            }`}
                          >
                            {fmtScore(row.annualAvg, 2)}
                          </td>
                          <td className="border border-black text-center font-bold">
                            {row.annualRank ? fmt(row.annualRank) : ''}
                          </td>
                          <td className="border border-black text-center">
                            {row.annualPassed === true
                              ? 'ជាប់'
                              : row.annualPassed === false
                                ? 'ធ្លាក់'
                                : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isLastChunk
                ? renderSignature(sign, `ទំព័រ ${fmt(chunkIdx * 2 + 2)} / ${fmt(chunks.length * 2)}`)
                : (
                  <div className="mt-auto text-center text-[8.5pt] text-slate-500 pt-1">
                    ទំព័រ {fmt(chunkIdx * 2 + 2)} / {fmt(chunks.length * 2)}
                  </div>
                )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
