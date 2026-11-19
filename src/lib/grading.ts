import type {
  AverageDecimalMode,
  MonthlyScore,
  ScoreConfig,
  SemesterExam,
  Student,
  Subject,
} from '../types/domain';
import { resolveAcademicMonthKey } from './khmerDate';
import { toArabicNumerals } from '../utils/khmerNumerals';

export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export function isSubjectActive(subject: Pick<Subject, 'isActive'>): boolean {
  return subject.isActive !== false;
}

export function isSubjectBonus(subject: Pick<Subject, 'isBonus'>): boolean {
  return subject.isBonus === true;
}

export function gradeFor(average: number | null): ScoreGrade | null {
  if (average === null || !Number.isFinite(average)) return null;
  if (average >= 45) return 'A';
  if (average >= 40) return 'B';
  if (average >= 35) return 'C';
  if (average >= 30) return 'D';
  if (average >= 25) return 'E';
  return 'F';
}

export interface ScoreParseResult {
  valid: boolean;
  value: number | null;
}

export interface ComputedScoreRow {
  total: number | null;
  maxScoreUsed: number;
  average: number | null;
  passed: boolean | null;
  grade: ScoreGrade | null;
}

export interface RankedScoreRow extends ComputedScoreRow {
  studentRef: number;
  rank: number | null;
}

export interface SubjectHeaderSpan {
  key: string;
  group?: string;
  subjects: Subject[];
}

export interface CollapsedSubject extends Subject {
  partIds: string[];
  parts: Subject[];
  isGroup: boolean;
}

export interface CollapsedSubjectScore {
  score: number | null;
  maxScore: number;
  maxScoreUsed: number;
  average: number | null;
}

export interface SemesterStudentSummary {
  student: Student;
  sem1ExamScores: Record<string, number | null>;
  sem1SubjectRanks: Record<string, number | null>;
  sem1ExamTotal: number | null;
  sem1MonthlySum: number | null;
  sem1MonthlyAvg: number | null;
  sem1ExamAvg: number | null;
  sem1Avg: number | null;
  sem1Rank: number | null;
  sem1Grade: ScoreGrade | null;

  sem2ExamScores: Record<string, number | null>;
  sem2SubjectRanks: Record<string, number | null>;
  sem2ExamTotal: number | null;
  sem2MonthlySum: number | null;
  sem2MonthlyAvg: number | null;
  sem2ExamAvg: number | null;
  sem2Avg: number | null;
  sem2Rank: number | null;
  sem2Grade: ScoreGrade | null;

  annualAvg: number | null;
  annualRank: number | null;
  annualPassed: boolean | null;
  annualGrade: ScoreGrade | null;
}

/**
 * Parses a score cell string: accepts Khmer or Arabic digits and '.' or ',' decimals.
 * Blank string returns { valid: true, value: null } (blank != 0).
 * Values < 0, > maxScore, or non-numeric return { valid: false, value: null }.
 */
export function parseScoreInput(raw: string, maxScore: number): ScoreParseResult {
  const normalized = toArabicNumerals(raw).trim().replace(/,/g, '.');
  if (normalized === '') {
    return { valid: true, value: null };
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return { valid: false, value: null };
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0 || num > maxScore) {
    return { valid: false, value: null };
  }
  return { valid: true, value: num };
}

export function sortSubjects(subjects: Subject[]): Subject[] {
  return [...subjects].sort((a, b) => a.order - b.order);
}

/**
 * Groups consecutive subjects that share the same non-empty `group` into merged
 * parent headers (e.g. អក្សរសាស្ត្រខ្មែរ over សរសេរតាមអាន + តែងសេចក្ដី).
 */
export function buildSubjectHeaderSpans(subjects: Subject[]): SubjectHeaderSpan[] {
  const ordered = sortSubjects(subjects);
  const spans: SubjectHeaderSpan[] = [];

  for (const sub of ordered) {
    const grp = sub.group?.trim() || undefined;
    const prev = spans[spans.length - 1];
    if (grp && prev && prev.group === grp) {
      prev.subjects.push(sub);
    } else {
      spans.push({
        key: grp ? `grp:${grp}:${sub.id}` : `sub:${sub.id}`,
        group: grp,
        subjects: [sub],
      });
    }
  }

  return spans;
}

/**
 * Collapses subjects sharing the same `group` (e.g. សរសេរតាមអាន 50 + តែងសេចក្ដី 50 -> អក្សរសាស្ត្រខ្មែរ 100)
 * into a single logical subject for per-subject semester summary columns, ranks, and averages.
 */
export function collapseGroupedSubjects(subjects: Subject[]): CollapsedSubject[] {
  const ordered = sortSubjects(subjects);
  const result: CollapsedSubject[] = [];
  const groupIndexByName = new Map<string, number>();

  for (const sub of ordered) {
    const grp = sub.group?.trim() || undefined;
    if (grp) {
      const existingIdx = groupIndexByName.get(grp);
      if (existingIdx !== undefined) {
        const target = result[existingIdx];
        target.maxScore += sub.maxScore;
        target.partIds.push(sub.id);
        target.parts.push(sub);
      } else {
        groupIndexByName.set(grp, result.length);
        result.push({
          id: `grp:${grp}`,
          name: grp,
          group: grp,
          maxScore: sub.maxScore,
          order: sub.order,
          partIds: [sub.id],
          parts: [sub],
          isGroup: true,
        });
      }
    } else {
      result.push({
        ...sub,
        partIds: [sub.id],
        parts: [sub],
        isGroup: false,
      });
    }
  }

  return result;
}

/**
 * Computes the collapsed score, effective maxScore, and scaled average for one subject or group.
 * - If ALL parts are blank -> { score: null, average: null }.
 * - If SOME parts have a score -> sums parts and follows `countBlankAsZero` for missing parts' maxScore.
 */
export function computeCollapsedSubjectScore(
  subject: CollapsedSubject,
  scores: Record<string, number | null> | undefined,
  config: Pick<ScoreConfig, 'scale' | 'countBlankAsZero'>
): CollapsedSubjectScore {
  let scoreSum = 0;
  let enteredMax = 0;
  let missingMax = 0;
  let hasAnyScore = false;

  for (const part of subject.parts) {
    if (!isSubjectActive(part)) continue;
    const raw = scores?.[part.id];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      hasAnyScore = true;
      scoreSum += raw;
      enteredMax += part.maxScore;
    } else {
      missingMax += part.maxScore;
    }
  }

  if (!hasAnyScore) {
    return {
      score: null,
      maxScore: subject.maxScore,
      maxScoreUsed: 0,
      average: null,
    };
  }

  const maxScoreUsed = config.countBlankAsZero ? enteredMax + missingMax : enteredMax;
  const average = maxScoreUsed > 0 ? (scoreSum / maxScoreUsed) * config.scale : null;

  return {
    score: scoreSum,
    maxScore: subject.maxScore,
    maxScoreUsed,
    average,
  };
}

export function collapseScoresBySubject(
  subjects: Subject[],
  scores: Record<string, number | null> | undefined,
  config: Pick<ScoreConfig, 'scale' | 'countBlankAsZero'>
): Record<string, CollapsedSubjectScore> {
  const collapsed = collapseGroupedSubjects(subjects);
  const out: Record<string, CollapsedSubjectScore> = {};
  for (const sub of collapsed) {
    out[sub.id] = computeCollapsedSubjectScore(sub, scores, config);
  }
  return out;
}

export interface SubjectColumnNumberCell {
  key: string;
  colSpan: number;
  columnNumber: number | null; // null for blank unrenamed extra columns
}

/**
 * Generates paper-form column numbers where a grouped parent span (e.g. អក្សរសាស្ត្រខ្មែរ
 * covering សរសេរតាមអាន + តែងសេចក្ដី) shares ONE number spanning its sub-columns,
 * yielding 1..15 plus unnumbered blank slots for unrenamed preset extras (`extra_*`).
 */
export function buildSubjectColumnNumbers(
  spans: SubjectHeaderSpan[]
): SubjectColumnNumberCell[] {
  let num = 1;
  return spans.map((span) => {
    const singleSubj = span.subjects.length === 1 ? span.subjects[0] : null;
    const isBlankExtra =
      singleSubj !== null &&
      singleSubj.id.startsWith('extra_') &&
      singleSubj.name.startsWith('មុខវិជ្ជាបន្ថែម');

    return {
      key: `colnum-${span.key}`,
      colSpan: span.subjects.length,
      columnNumber: isBlankExtra ? null : num++,
    };
  });
}

/**
 * Computes total and scaled average for one student on a monthly or semester exam sheet.
 * Keeps full floating-point precision internally; display should round to 2 decimals.
 */
export function computeScoreRow(
  scores: Record<string, number | null> | undefined,
  subjects: Subject[],
  config: Pick<ScoreConfig, 'scale' | 'countBlankAsZero'>
): ComputedScoreRow {
  const ordered = sortSubjects(subjects).filter(isSubjectActive);
  let total = 0;
  let maxSum = 0;
  let hasStandardScore = false;

  for (const sub of ordered) {
    const raw = scores?.[sub.id];
    const hasNumeric = typeof raw === 'number' && Number.isFinite(raw);

    if (isSubjectBonus(sub)) {
      if (hasNumeric) {
        total += Math.max(0, raw - sub.maxScore / 2);
      }
      continue;
    }

    if (hasNumeric) {
      total += raw;
      maxSum += sub.maxScore;
      hasStandardScore = true;
    } else if (config.countBlankAsZero) {
      maxSum += sub.maxScore;
    }
  }

  if (!hasStandardScore || maxSum <= 0) {
    return {
      total: null,
      maxScoreUsed: 0,
      average: null,
      passed: null,
      grade: null,
    };
  }

  const average = (total / maxSum) * config.scale;
  return {
    total,
    maxScoreUsed: maxSum,
    average,
    passed: average >= config.scale / 2,
    grade: gradeFor(average),
  };
}

/**
 * Standard competition ranking (1, 2, 2, 4). Items with value === null get null (unranked).
 */
export function computeCompetitionRanks(
  items: Array<{ id: number; value: number | null }>
): Map<number, number | null> {
  const ranks = new Map<number, number | null>();
  const valid = items
    .filter((i): i is { id: number; value: number } => i.value !== null && Number.isFinite(i.value))
    .sort((a, b) => b.value - a.value);

  for (const item of items) {
    if (item.value === null || !Number.isFinite(item.value)) {
      ranks.set(item.id, null);
    }
  }

  let currentRank = 0;
  let prevValue: number | null = null;
  for (let i = 0; i < valid.length; i++) {
    const item = valid[i];
    if (prevValue === null || Math.abs(item.value - prevValue) > 1e-12) {
      currentRank = i + 1;
      prevValue = item.value;
    }
    ranks.set(item.id, currentRank);
  }

  return ranks;
}

export function computeWeightedAverage(
  a: number | null,
  wA: number,
  b: number | null,
  wB: number
): number | null {
  const totalWeight = wA + wB;
  if (totalWeight <= 0) return null;
  if (wA === 0 && b !== null) return b;
  if (wB === 0 && a !== null) return a;
  if (a === null || b === null) return null;
  return (a * wA + b * wB) / totalWeight;
}

export function formatAverage(
  value: number | null,
  mode: AverageDecimalMode = 'truncate'
): string {
  if (value === null || !Number.isFinite(value)) return '';
  if (mode === 'round') {
    return value.toFixed(2);
  }
  const truncated = Math.floor(value * 100 + 1e-9) / 100;
  return truncated.toFixed(2);
}

export function formatScoreDecimal(
  value: number | null,
  mode: AverageDecimalMode = 'truncate'
): string {
  return formatAverage(value, mode);
}

/**
 * Computes the complete Semester 1, Semester 2, and Annual summary table for a class.
 * Only students included in `rankedStudentIds` (typically status === 'active') receive ranks.
 */
export function computeSemesterAnnualSummary(params: {
  students: Student[];
  subjects: Subject[];
  academicYear: string;
  monthlyRecords: MonthlyScore[];
  semesterExams: SemesterExam[];
  config: ScoreConfig;
}): SemesterStudentSummary[] {
  const { students, subjects, academicYear, monthlyRecords, semesterExams, config } = params;
  const orderedSubjects = sortSubjects(subjects).filter(isSubjectActive);
  const collapsedSubjects = collapseGroupedSubjects(orderedSubjects);

  const sem1MonthKeys = config.sem1Months.map((m) => resolveAcademicMonthKey(academicYear, m));
  const sem2MonthKeys = config.sem2Months.map((m) => resolveAcademicMonthKey(academicYear, m));

  // Index monthly scores by `${studentRef}|${month}`
  const monthlyByKey = new Map<string, MonthlyScore>();
  for (const rec of monthlyRecords) {
    monthlyByKey.set(`${rec.studentRef}|${rec.month}`, rec);
  }

  // Index semester exams by `${studentRef}|${semester}`
  const examByKey = new Map<string, SemesterExam>();
  for (const ex of semesterExams) {
    examByKey.set(`${ex.studentRef}|${ex.semester}`, ex);
  }

  const sumOf = (vals: number[]): number | null =>
    vals.length === 0 ? null : vals.reduce((acc, v) => acc + v, 0);
  const meanOf = (vals: number[]): number | null =>
    vals.length === 0 ? null : vals.reduce((acc, v) => acc + v, 0) / vals.length;

  const drafts = students.map((student) => {
    const sid = student.id!;
    const sem1Avgs: number[] = [];
    for (const mk of sem1MonthKeys) {
      const rec = monthlyByKey.get(`${sid}|${mk}`);
      const row = computeScoreRow(rec?.scores, orderedSubjects, config);
      if (row.average !== null) sem1Avgs.push(row.average);
    }

    const sem2Avgs: number[] = [];
    for (const mk of sem2MonthKeys) {
      const rec = monthlyByKey.get(`${sid}|${mk}`);
      const row = computeScoreRow(rec?.scores, orderedSubjects, config);
      if (row.average !== null) sem2Avgs.push(row.average);
    }

    const ex1 = examByKey.get(`${sid}|1`);
    const ex2 = examByKey.get(`${sid}|2`);

    const ex1Row = computeScoreRow(ex1?.scores, orderedSubjects, config);
    const ex2Row = computeScoreRow(ex2?.scores, orderedSubjects, config);

    const sem1MonthlySum = sumOf(sem1Avgs);
    const sem2MonthlySum = sumOf(sem2Avgs);
    const sem1MonthlyAvg = meanOf(sem1Avgs);
    const sem2MonthlyAvg = meanOf(sem2Avgs);

    const sem1Avg = computeWeightedAverage(
      sem1MonthlyAvg,
      config.wMonthly,
      ex1Row.average,
      config.wExam
    );
    const sem2Avg = computeWeightedAverage(
      sem2MonthlyAvg,
      config.wMonthly,
      ex2Row.average,
      config.wExam
    );
    const annualAvg = computeWeightedAverage(sem1Avg, config.wSem1, sem2Avg, config.wSem2);

    const sem1ExamScores: Record<string, number | null> = {};
    const sem2ExamScores: Record<string, number | null> = {};
    for (const sub of collapsedSubjects) {
      sem1ExamScores[sub.id] = computeCollapsedSubjectScore(sub, ex1?.scores, config).score;
      sem2ExamScores[sub.id] = computeCollapsedSubjectScore(sub, ex2?.scores, config).score;
    }

    return {
      student,
      sem1ExamScores,
      sem1ExamTotal: ex1Row.total,
      sem1MonthlySum,
      sem1MonthlyAvg,
      sem1ExamAvg: ex1Row.average,
      sem1Avg,
      sem1Grade: gradeFor(sem1Avg),
      sem2ExamScores,
      sem2ExamTotal: ex2Row.total,
      sem2MonthlySum,
      sem2MonthlyAvg,
      sem2ExamAvg: ex2Row.average,
      sem2Avg,
      sem2Grade: gradeFor(sem2Avg),
      annualAvg,
      annualPassed: annualAvg !== null ? annualAvg >= config.scale / 2 : null,
      annualGrade: gradeFor(annualAvg),
    };
  });

  // Only 'active' students are ranked
  const rankActive = (getVal: (d: (typeof drafts)[number]) => number | null) =>
    computeCompetitionRanks(
      drafts
        .filter((d) => d.student.status === 'active' && d.student.id !== undefined)
        .map((d) => ({ id: d.student.id!, value: getVal(d) }))
    );

  const sem1Ranks = rankActive((d) => d.sem1Avg);
  const sem2Ranks = rankActive((d) => d.sem2Avg);
  const annualRanks = rankActive((d) => d.annualAvg);

  const sem1SubjectRankMaps = new Map<string, Map<number, number | null>>();
  const sem2SubjectRankMaps = new Map<string, Map<number, number | null>>();
  for (const sub of collapsedSubjects) {
    sem1SubjectRankMaps.set(
      sub.id,
      rankActive((d) => {
        const v = d.sem1ExamScores[sub.id];
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      })
    );
    sem2SubjectRankMaps.set(
      sub.id,
      rankActive((d) => {
        const v = d.sem2ExamScores[sub.id];
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
      })
    );
  }

  return drafts.map((d) => {
    const sid = d.student.id!;
    const sem1SubjectRanks: Record<string, number | null> = {};
    const sem2SubjectRanks: Record<string, number | null> = {};
    for (const sub of collapsedSubjects) {
      sem1SubjectRanks[sub.id] = sem1SubjectRankMaps.get(sub.id)?.get(sid) ?? null;
      sem2SubjectRanks[sub.id] = sem2SubjectRankMaps.get(sub.id)?.get(sid) ?? null;
    }

    return {
      ...d,
      sem1SubjectRanks,
      sem1Rank: sem1Ranks.get(sid) ?? null,
      sem2SubjectRanks,
      sem2Rank: sem2Ranks.get(sid) ?? null,
      annualRank: annualRanks.get(sid) ?? null,
    };
  });
}
