import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Download,
  GraduationCap,
  Layers,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Dexie from 'dexie';
import { db } from '../../db/database';
import { getPresetSubjects, mergeSubjectsWithPreset, type PresetKey } from '../../db/presets';
import {
  countSubjectScoreEntries,
  createPermanentSubjectId,
  deleteSubjectWithScores,
  getHighestScoresBySubject,
  saveClassSubjects,
} from '../../db/subjectRepo';
import { useAppStore } from '../../store/useAppStore';
import {
  DEFAULT_SCORE_CONFIG,
  type Profile,
  type SchoolClass,
  type ScoreConfig,
  type Student,
  type Subject,
} from '../../types/domain';
import { getActiveStudentsOrdered } from '../../lib/attendance';
import {
  collapseGroupedSubjects,
  computeCompetitionRanks,
  computeScoreRow,
  computeSemesterAnnualSummary,
  displayedAverageOrNull,
  formatAverage,
  gradeFor,
  isSubjectActive,
  isSubjectBonus,
  parseScoreInput,
  sortSubjects,
  type ScoreGrade,
  type SemesterStudentSummary,
} from '../../lib/grading';
import {
  formatKhmerMonthYear,
  getKhmerMonthName,
  parseYearMonth,
  resolveAcademicMonthKey,
} from '../../lib/khmerDate';
import { registerPendingSaveFlusher } from '../../lib/pendingSaves';
import { buildExportFileName } from '../../lib/exportFilename';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { AppleSegmentedControl } from '../../components/common/AppleSegmentedControl';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { ExportDialog, type ExportFormat } from '../../components/common/ExportDialog';
import {
  MonthlyScoreSheet,
  type MonthlyScoreSheetPageData,
} from '../../print/MonthlyScoreSheet';
import { SemesterSheet } from '../../print/SemesterSheet';
import {
  exportMonthlyScoreExcel,
  exportSemesterSummaryExcel,
} from '../../services/excelExport';
import {
  ensurePrintFontsReady,
  exportPrintNodesToPdf,
  nextPaint,
  type PaperSize,
} from '../../services/pdfExport';

interface ScoresViewProps {
  profile: Profile;
}

const EMPTY_NUM_RECORD: Record<string, number | null> = {};
const EMPTY_STR_RECORD: Record<string, string> = {};

interface ScoreGridRowProps {
  student: Student;
  rowIdx: number;
  sortedSubjects: Subject[];
  rowScores: Record<string, number | null>;
  rowDrafts: Record<string, string>;
  rowInvalids: Record<string, string>;
  total: number | null;
  average: number | null;
  passed: boolean | null;
  rank: number | null;
  grade: ScoreGrade | null;
  noteVal: string;
  useKhmerNumerals: boolean;
  averageDecimalMode?: 'truncate' | 'round';
  onCellChange: (studentRef: number, subj: Subject, rawText: string) => void;
  onCellBlur: (studentRef: number, subj: Subject) => void;
  onCellPaste: (
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) => void;
  onCellKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) => void;
  onNoteChange: (studentRef: number, noteText: string) => void;
}

const ScoreGridRow = memo<ScoreGridRowProps>(
  ({
    student,
    rowIdx,
    sortedSubjects,
    rowScores,
    rowDrafts,
    rowInvalids,
    total,
    average,
    passed,
    rank,
    grade,
    noteVal,
    useKhmerNumerals,
    averageDecimalMode,
    onCellChange,
    onCellBlur,
    onCellPaste,
    onCellKeyDown,
    onNoteChange,
  }) => {
    const fmt = (val: number | string) =>
      useKhmerNumerals ? toKhmerNumerals(val) : toArabicNumerals(String(val));
    const studentRef = student.id!;

    return (
      <tr className="hover:bg-[#f5f5f7]/60 dark:hover:bg-white/[0.03] border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0">
        <td className="sticky left-0 z-10 bg-white dark:bg-[#1c1c1e] border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center text-[#86868b]">
          {fmt(rowIdx + 1)}
        </td>
        <td className="sticky left-10 z-10 bg-white dark:bg-[#1c1c1e] border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-1 font-medium text-[#1d1d1f] dark:text-[#f5f5f7] whitespace-nowrap">
          {student.nameKm}
          {student.status !== 'active' && (
            <span className="ml-1 text-[10px] text-[#ff9500]">(ឈប់)</span>
          )}
        </td>
        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center text-[#86868b]">
          {student.gender === 'ប្រុស' ? 'ប' : 'ស'}
        </td>

        {sortedSubjects.map((subj, colIdx) => {
          const errMsg = rowInvalids[subj.id];
          const hasDraft = Object.prototype.hasOwnProperty.call(rowDrafts, subj.id);
          const numVal = rowScores[subj.id];
          const displayVal = hasDraft
            ? rowDrafts[subj.id]
            : typeof numVal === 'number' && !Number.isNaN(numVal)
              ? String(numVal)
              : '';

          return (
            <td
              key={subj.id}
              className="border-r border-black/[0.06] dark:border-white/[0.08] p-0.5"
            >
              <input
                type="text"
                inputMode="decimal"
                data-score-cell={`${rowIdx}-${colIdx}`}
                aria-label={`${student.nameKm} - ${subj.name}`}
                value={displayVal}
                title={errMsg || `អតិបរមា ${subj.maxScore}`}
                onChange={(e) => onCellChange(studentRef, subj, e.target.value)}
                onBlur={() => onCellBlur(studentRef, subj)}
                onPaste={(e) => onCellPaste(e, rowIdx, colIdx)}
                onKeyDown={(e) => onCellKeyDown(e, rowIdx, colIdx)}
                className={`w-full px-1.5 py-1.5 rounded-lg text-center text-xs font-medium focus:outline-none focus:ring-2 transition-colors ${
                  errMsg
                    ? 'bg-red-50 dark:bg-red-500/20 text-[#ff3b30] ring-1 ring-[#ff3b30] focus:ring-[#ff3b30]'
                    : 'bg-transparent hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] focus:bg-white dark:focus:bg-[#2c2c2e] focus:ring-[#0071e3]'
                }`}
              />
            </td>
          );
        })}

        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center font-semibold bg-[#f7faff] dark:bg-blue-500/[0.04]">
          {total !== null
            ? fmt(Number.isInteger(total) ? total : total.toFixed(1))
            : '—'}
        </td>
        <td
          className={`border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center font-bold bg-[#f7faff] dark:bg-blue-500/[0.04] ${
            passed === false
              ? 'text-[#ff3b30]'
              : passed === true
                ? 'text-[#34c759]'
                : 'text-[#86868b]'
          }`}
        >
          {average !== null ? fmt(formatAverage(average, averageDecimalMode)) : '—'}
        </td>
        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center font-bold text-[#0071e3] bg-[#f7faff] dark:bg-blue-500/[0.04]">
          {rank !== null ? fmt(rank) : '—'}
        </td>
        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1 text-center font-bold bg-[#f7faff] dark:bg-blue-500/[0.04]">
          {grade ?? '—'}
        </td>
        <td className="p-0.5">
          <input
            type="text"
            aria-label={`សេចក្ដីផ្សេងៗ ${student.nameKm}`}
            value={noteVal}
            onChange={(e) => onNoteChange(studentRef, e.target.value)}
            placeholder="..."
            className="w-full px-1.5 py-1.5 rounded-lg text-xs bg-transparent hover:bg-[#f5f5f7] dark:hover:bg-white/[0.06] focus:bg-white dark:focus:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
          />
        </td>
      </tr>
    );
  }
);
ScoreGridRow.displayName = 'ScoreGridRow';

type ScoreTab = 'monthly' | 'exam' | 'semester' | 'subjects';

interface DeleteSubjectPromptState {
  subject: Subject;
  monthlyCount: number;
  examCount: number;
  totalCount: number;
}

type PrintStageState =
  | {
      kind: 'monthly';
      cls: SchoolClass;
      students: Student[];
      sheets: MonthlyScoreSheetPageData[];
    }
  | {
      kind: 'semester';
      cls: SchoolClass;
      summaries: SemesterStudentSummary[];
      paperSize: PaperSize;
    };

export const ScoresView: React.FC<ScoresViewProps> = ({ profile }) => {
  const {
    selectedClassId,
    setSelectedClassId,
    selectedMonth,
    setSelectedMonth,
    useKhmerNumerals,
    addToast,
    setActiveView,
  } = useAppStore();

  const fmtNum = useCallback(
    (val: number | string) =>
      useKhmerNumerals ? toKhmerNumerals(val) : toArabicNumerals(String(val)),
    [useKhmerNumerals]
  );

  const [activeTab, setActiveTab] = useState<ScoreTab>('monthly');
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(1);
  const [showDetailedSubjectCols, setShowDetailedSubjectCols] = useState(false);

  const classes = useLiveQuery(async () => {
    const list = await db.classes.toArray();
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }, []);

  const currentClass = useMemo(() => {
    if (!classes || classes.length === 0) return undefined;
    return classes.find((c) => c.id === selectedClassId) ?? classes[0];
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (classes && classes.length > 0 && !classes.some((c) => c.id === selectedClassId)) {
      if (classes[0].id !== undefined) setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId, setSelectedClassId]);

  const scoreCfgRow = useLiveQuery(() => db.settings.get('scoreConfig'), []);
  const scoreConfig: ScoreConfig = useMemo(
    () => ({
      ...DEFAULT_SCORE_CONFIG,
      ...((scoreCfgRow?.value as Partial<ScoreConfig> | undefined) ?? {}),
    }),
    [scoreCfgRow]
  );

  const allStudents = useLiveQuery(async () => {
    if (!currentClass?.id) return [];
    const list = await db.students.where('classId').equals(currentClass.id).toArray();
    return list.sort((a, b) => a.order - b.order);
  }, [currentClass?.id]);

  const sortedSubjects = useMemo(
    () => sortSubjects(currentClass?.subjects ?? []),
    [currentClass?.subjects]
  );

  const activeSubjects = useMemo(
    () => sortedSubjects.filter(isSubjectActive),
    [sortedSubjects]
  );

  const collapsedSubjects = useMemo(
    () => collapseGroupedSubjects(activeSubjects),
    [activeSubjects]
  );

  const liveCoefficientInfo = useMemo(() => {
    const standardMaxSum = activeSubjects
      .filter((s) => !isSubjectBonus(s))
      .reduce((acc, s) => acc + s.maxScore, 0);
    return {
      standardMaxSum,
      coefficient: standardMaxSum / 50,
    };
  }, [activeSubjects]);

  const groupMaxTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of sortedSubjects) {
      const grp = s.group?.trim();
      if (grp) {
        totals.set(grp, (totals.get(grp) ?? 0) + s.maxScore);
      }
    }
    return totals;
  }, [sortedSubjects]);

  const activeStudents = useMemo(() => {
    if (!allStudents) return [];
    if (activeTab === 'monthly') {
      return getActiveStudentsOrdered(allStudents, selectedMonth);
    }
    return getActiveStudentsOrdered(allStudents);
  }, [allStudents, activeTab, selectedMonth]);

  // Grid entry state (for monthly or semester exam tab)
  const [scoresByStudent, setScoresByStudent] = useState<
    Map<number, Record<string, number | null>>
  >(new Map());
  const [notesByStudent, setNotesByStudent] = useState<Map<number, string>>(new Map());
  const [draftCells, setDraftCells] = useState<Map<number, Record<string, string>>>(new Map());
  const [invalidCells, setInvalidCells] = useState<Map<number, Record<string, string>>>(
    new Map()
  );
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const scoresRef = useRef(scoresByStudent);
  const notesRef = useRef(notesByStudent);
  const draftsRef = useRef(draftCells);
  const invalidsRef = useRef(invalidCells);
  const activeStudentsRef = useRef(activeStudents);
  const sortedSubjectsRef = useRef(sortedSubjects);

  scoresRef.current = scoresByStudent;
  notesRef.current = notesByStudent;
  draftsRef.current = draftCells;
  invalidsRef.current = invalidCells;
  activeStudentsRef.current = activeStudents;
  sortedSubjectsRef.current = activeSubjects;

  const dirtyStudentsRef = useRef<Set<number>>(new Set());
  const debounceTimerRef = useRef<number | null>(null);
  const entryContextRef = useRef<{
    tab: 'monthly' | 'exam';
    classId: number | undefined;
    month: string;
    semester: 1 | 2;
    scores: Map<number, Record<string, number | null>>;
    notes: Map<number, string>;
  }>({
    tab: 'monthly',
    classId: currentClass?.id,
    month: selectedMonth,
    semester: selectedSemester,
    scores: new Map(),
    notes: new Map(),
  });

  // Sync mutable refs with latest grid state
  useEffect(() => {
    if (activeTab === 'monthly' || activeTab === 'exam') {
      entryContextRef.current = {
        tab: activeTab,
        classId: currentClass?.id,
        month: selectedMonth,
        semester: selectedSemester,
        scores: scoresByStudent,
        notes: notesByStudent,
      };
    }
  }, [activeTab, currentClass?.id, selectedMonth, selectedSemester, scoresByStudent, notesByStudent]);

  const flushPendingSaves = useCallback(async () => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const dirtyIds = Array.from(dirtyStudentsRef.current);
    if (dirtyIds.length === 0) return;

    const ctx = entryContextRef.current;
    if (!ctx.classId) return;

    dirtyStudentsRef.current.clear();
    setSaveState('saving');

    try {
      if (ctx.tab === 'monthly') {
        const records = dirtyIds.map((studentRef) => ({
          classId: ctx.classId!,
          studentRef,
          month: ctx.month,
          scores: ctx.scores.get(studentRef) ?? {},
          note: ctx.notes.get(studentRef) || undefined,
        }));
        await db.monthlyScores.bulkPut(records);
      } else {
        const records = dirtyIds.map((studentRef) => ({
          classId: ctx.classId!,
          studentRef,
          semester: ctx.semester,
          scores: ctx.scores.get(studentRef) ?? {},
          note: ctx.notes.get(studentRef) || undefined,
        }));
        await db.semesterExams.bulkPut(records);
      }
      setSaveState('saved');
    } catch (err) {
      console.error('Failed to flush scores', err);
      // Restore dirty ids so next attempt can retry
      dirtyIds.forEach((id) => dirtyStudentsRef.current.add(id));
      addToast({ type: 'error', title: 'មានបញ្ហាក្នុងការរក្សាទុកពិន្ទុ' });
    }
  }, [addToast]);

  const scheduleAutosave = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    setSaveState('saving');
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void flushPendingSaves();
    }, 350);
  }, [flushPendingSaves]);

  // Flush on visibilitychange, pagehide, unmount, and global PWA update prompt
  useEffect(() => {
    const unregister = registerPendingSaveFlusher(flushPendingSaves);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void flushPendingSaves();
      }
    };
    const onPageHide = () => {
      void flushPendingSaves();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      unregister();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void flushPendingSaves();
    };
  }, [flushPendingSaves]);

  // Load monthly or semester exam scores whenever scope changes
  useEffect(() => {
    let cancelled = false;
    const classId = currentClass?.id;
    if (!classId || (activeTab !== 'monthly' && activeTab !== 'exam')) return;

    const load = async () => {
      const nextScores = new Map<number, Record<string, number | null>>();
      const nextNotes = new Map<number, string>();

      if (activeTab === 'monthly') {
        const rows = await db.monthlyScores
          .where('[classId+month]')
          .equals([classId, selectedMonth])
          .toArray();
        for (const r of rows) {
          nextScores.set(r.studentRef, { ...r.scores });
          if (r.note) nextNotes.set(r.studentRef, r.note);
        }
      } else {
        const rows = await db.semesterExams
          .where('[classId+semester]')
          .equals([classId, selectedSemester])
          .toArray();
        for (const r of rows) {
          nextScores.set(r.studentRef, { ...r.scores });
          if (r.note) nextNotes.set(r.studentRef, r.note);
        }
      }

      if (cancelled) return;
      dirtyStudentsRef.current.clear();
      setDraftCells(new Map());
      setInvalidCells(new Map());
      setScoresByStudent(nextScores);
      setNotesByStudent(nextNotes);
      setSaveState('idle');
    };

    void load();
    return () => {
      cancelled = true;
      void flushPendingSaves();
    };
  }, [currentClass?.id, activeTab, selectedMonth, selectedSemester, flushPendingSaves]);

  // Safe scope switchers that flush pending saves BEFORE switching
  const handleSwitchTab = async (nextTab: ScoreTab) => {
    await flushPendingSaves();
    setActiveTab(nextTab);
  };

  const handleChangeMonth = async (nextMonth: string) => {
    await flushPendingSaves();
    setSelectedMonth(nextMonth);
  };

  const handleChangeSemester = async (nextSem: 1 | 2) => {
    await flushPendingSaves();
    setSelectedSemester(nextSem);
  };

  // Academic month chips for current academic year
  const academicMonthOptions = useMemo(() => {
    const yearStr = currentClass?.academicYear || profile.academicYear || '2026-2027';
    // Typical Cambodian school year: Nov, Dec, Jan..Aug + Oct
    const order = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    return order.map((m) => resolveAcademicMonthKey(yearStr, m));
  }, [currentClass?.academicYear, profile.academicYear]);

  // Apply raw cell edit (used by onChange and multi-cell Excel paste)
  const applyCellInput = useCallback(
    (
      studentRef: number,
      subj: Subject,
      rawText: string,
      nextScoresMap: Map<number, Record<string, number | null>>,
      nextDraftsMap: Map<number, Record<string, string>>,
      nextInvalidsMap: Map<number, Record<string, string>>
    ) => {
      const parsed = parseScoreInput(rawText, subj.maxScore);
      const prevRowDrafts = nextDraftsMap.get(studentRef) ?? {};
      const nextRowDrafts = { ...prevRowDrafts, [subj.id]: rawText };
      nextDraftsMap.set(studentRef, nextRowDrafts);

      const prevRowInvalids = nextInvalidsMap.get(studentRef) ?? {};
      const nextRowInvalids = { ...prevRowInvalids };

      if (!parsed.valid) {
        nextRowInvalids[subj.id] = `ពិន្ទុមិនត្រឹមត្រូវ៖ ត្រូវនៅចន្លោះ 0 ដល់ ${subj.maxScore}`;
        nextInvalidsMap.set(studentRef, nextRowInvalids);
        return false;
      }

      if (Object.prototype.hasOwnProperty.call(nextRowInvalids, subj.id)) {
        delete nextRowInvalids[subj.id];
        if (Object.keys(nextRowInvalids).length === 0) nextInvalidsMap.delete(studentRef);
        else nextInvalidsMap.set(studentRef, nextRowInvalids);
      }

      const prevRow = nextScoresMap.get(studentRef) ?? {};
      const nextRow = { ...prevRow };
      if (parsed.value === null) {
        delete nextRow[subj.id];
      } else {
        nextRow[subj.id] = parsed.value;
      }
      nextScoresMap.set(studentRef, nextRow);
      dirtyStudentsRef.current.add(studentRef);
      return true;
    },
    []
  );

  const handleCellChange = useCallback(
    (studentRef: number, subj: Subject, rawText: string) => {
      const nextScores = new Map(scoresRef.current);
      const nextDrafts = new Map(draftsRef.current);
      const nextInvalids = new Map(invalidsRef.current);

      const valid = applyCellInput(studentRef, subj, rawText, nextScores, nextDrafts, nextInvalids);

      draftsRef.current = nextDrafts;
      invalidsRef.current = nextInvalids;
      setDraftCells(nextDrafts);
      setInvalidCells(nextInvalids);
      if (valid) {
        scoresRef.current = nextScores;
        setScoresByStudent(nextScores);
        entryContextRef.current = {
          ...entryContextRef.current,
          scores: nextScores,
        };
        scheduleAutosave();
      }
    },
    [applyCellInput, scheduleAutosave]
  );

  const handleCellBlur = useCallback((studentRef: number, subj: Subject) => {
    const rowInvalids = invalidsRef.current.get(studentRef);
    if (rowInvalids && Object.prototype.hasOwnProperty.call(rowInvalids, subj.id)) return;

    setDraftCells((prev) => {
      const rowDrafts = prev.get(studentRef);
      if (!rowDrafts || !Object.prototype.hasOwnProperty.call(rowDrafts, subj.id)) return prev;
      const nextDrafts = new Map(prev);
      const nextRowDrafts = { ...rowDrafts };
      delete nextRowDrafts[subj.id];
      if (Object.keys(nextRowDrafts).length === 0) nextDrafts.delete(studentRef);
      else nextDrafts.set(studentRef, nextRowDrafts);
      return nextDrafts;
    });
  }, []);

  const handleNoteChange = useCallback(
    (studentRef: number, noteText: string) => {
      const nextNotes = new Map(notesRef.current);
      nextNotes.set(studentRef, noteText);
      notesRef.current = nextNotes;
      setNotesByStudent(nextNotes);
      dirtyStudentsRef.current.add(studentRef);
      entryContextRef.current = {
        ...entryContextRef.current,
        notes: nextNotes,
      };
      scheduleAutosave();
    },
    [scheduleAutosave]
  );

  const handleCellPaste = useCallback(
    (
      e: React.ClipboardEvent<HTMLInputElement>,
      startRowIdx: number,
      startColIdx: number
    ) => {
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;

      if (text.includes('\t') || text.includes('\n')) {
        e.preventDefault();
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        if (lines.length > 1 && lines[lines.length - 1] === '') {
          lines.pop();
        }

        const nextScores = new Map(scoresRef.current);
        const nextDrafts = new Map(draftsRef.current);
        const nextInvalids = new Map(invalidsRef.current);
        let appliedCount = 0;
        let rejectedCount = 0;

        const studentsList = activeStudentsRef.current;
        const subjectsList = sortedSubjectsRef.current;

        lines.forEach((line, rOff) => {
          const targetStudent = studentsList[startRowIdx + rOff];
          if (!targetStudent?.id) return;
          const cols = line.split('\t');
          cols.forEach((rawCell, cOff) => {
            const targetSubj = subjectsList[startColIdx + cOff];
            if (!targetSubj) return;
            const ok = applyCellInput(
              targetStudent.id!,
              targetSubj,
              rawCell.trim(),
              nextScores,
              nextDrafts,
              nextInvalids
            );
            if (ok) appliedCount++;
            else rejectedCount++;
          });
        });

        draftsRef.current = nextDrafts;
        invalidsRef.current = nextInvalids;
        scoresRef.current = nextScores;
        setDraftCells(nextDrafts);
        setInvalidCells(nextInvalids);
        setScoresByStudent(nextScores);
        entryContextRef.current = {
          ...entryContextRef.current,
          scores: nextScores,
        };
        if (appliedCount > 0) {
          void flushPendingSaves();
        }
        addToast({
          type: rejectedCount > 0 ? 'info' : 'success',
          title: `បាន Paste ${fmtNum(appliedCount)} ក្រឡា`,
          message:
            rejectedCount > 0
              ? `មាន ${fmtNum(rejectedCount)} ក្រឡាមិនត្រឹមត្រូវ (សម្គាល់ពណ៌ក្រហម)`
              : undefined,
        });
      }
    },
    [applyCellInput, flushPendingSaves, addToast, fmtNum]
  );

  const handleCellKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      rowIdx: number,
      colIdx: number
    ) => {
      let dr = 0;
      let dc = 0;
      if (e.key === 'Enter') {
        e.preventDefault();
        dr = e.shiftKey ? -1 : 1;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        dr = 1;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dr = -1;
      } else if (e.key === 'ArrowRight') {
        const el = e.currentTarget;
        if (el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
          e.preventDefault();
          dc = 1;
        }
      } else if (e.key === 'ArrowLeft') {
        const el = e.currentTarget;
        if (el.selectionStart === 0 && el.selectionEnd === 0) {
          e.preventDefault();
          dc = -1;
        }
      }

      if (dr === 0 && dc === 0) return;
      const nr = Math.max(0, Math.min(activeStudentsRef.current.length - 1, rowIdx + dr));
      const nc = Math.max(0, Math.min(sortedSubjectsRef.current.length - 1, colIdx + dc));
      const target = document.querySelector<HTMLInputElement>(`[data-score-cell="${nr}-${nc}"]`);
      if (target) {
        target.focus();
        target.select();
      }
    },
    []
  );

  const invalidCellCount = useMemo(() => {
    let cnt = 0;
    for (const rec of invalidCells.values()) {
      cnt += Object.keys(rec).length;
    }
    return cnt;
  }, [invalidCells]);

  // Live computed totals, averages & competition ranks (active students only)
  const rankedByStudent = useMemo(() => {
    const mode = scoreConfig.averageDecimalMode ?? 'truncate';
    const computed = activeStudents.map((st) => {
      const rec = (st.id !== undefined && scoresByStudent.get(st.id)) || {};
      const row = computeScoreRow(rec, activeSubjects, scoreConfig);
      const dispAvg = displayedAverageOrNull(row.average, mode);
      return {
        studentRef: st.id ?? -1,
        status: st.status,
        ...row,
        average: dispAvg,
        passed: dispAvg !== null ? dispAvg >= scoreConfig.scale / 2 : null,
        grade: gradeFor(dispAvg),
      };
    });
    // Only rank students whose status === 'active'
    const rankLookup = computeCompetitionRanks(
      computed
        .filter((r) => r.status === 'active')
        .map((r) => ({ id: r.studentRef, value: r.average }))
    );

    return new Map(
      computed.map((r) => [
        r.studentRef,
        {
          total: r.total,
          maxScoreUsed: r.maxScoreUsed,
          average: r.average,
          passed: r.passed,
          grade: r.grade,
          rank: r.status === 'active' ? rankLookup.get(r.studentRef) ?? null : null,
        },
      ])
    );
  }, [activeStudents, scoresByStudent, activeSubjects, scoreConfig]);

  const gridStats = useMemo(() => {
    const avgs = Array.from(rankedByStudent.values())
      .map((r) => r.average)
      .filter((v): v is number => v !== null);
    const passed = Array.from(rankedByStudent.values()).filter((r) => r.passed === true).length;
    const failed = Array.from(rankedByStudent.values()).filter((r) => r.passed === false).length;
    const classAvg = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    const maxAvg = avgs.length > 0 ? Math.max(...avgs) : null;
    const male = activeStudents.filter((s) => s.gender === 'ប្រុស').length;
    const female = activeStudents.filter((s) => s.gender === 'ស្រី').length;
    return { male, female, passed, failed, classAvg, maxAvg };
  }, [rankedByStudent, activeStudents]);

  // Semester + Annual summary live computation (for Semester tab)
  const allClassMonthlyScores = useLiveQuery(async () => {
    if (!currentClass?.id || activeTab !== 'semester') return [];
    return db.monthlyScores
      .where('[classId+month]')
      .between([currentClass.id, Dexie.minKey], [currentClass.id, Dexie.maxKey])
      .toArray();
  }, [currentClass?.id, activeTab]);

  const allClassSemesterExams = useLiveQuery(async () => {
    if (!currentClass?.id || activeTab !== 'semester') return [];
    return db.semesterExams
      .where('[classId+semester]')
      .between([currentClass.id, Dexie.minKey], [currentClass.id, Dexie.maxKey])
      .toArray();
  }, [currentClass?.id, activeTab]);

  const semesterSummaries = useMemo(() => {
    if (!currentClass || activeTab !== 'semester' || !allStudents) return [];
    return computeSemesterAnnualSummary({
      students: allStudents,
      subjects: sortedSubjects,
      academicYear: currentClass.academicYear,
      monthlyRecords: allClassMonthlyScores ?? [],
      semesterExams: allClassSemesterExams ?? [],
      config: scoreConfig,
    });
  }, [
    currentClass,
    activeTab,
    allStudents,
    sortedSubjects,
    allClassMonthlyScores,
    allClassSemesterExams,
    scoreConfig,
  ]);

  const semesterStats = useMemo(() => {
    const passAnnual = semesterSummaries.filter((s) => s.annualPassed === true).length;
    const failAnnual = semesterSummaries.filter((s) => s.annualPassed === false).length;
    const annualAvgs = semesterSummaries
      .map((s) => s.annualAvg)
      .filter((v): v is number => v !== null);
    const meanAnnual =
      annualAvgs.length > 0 ? annualAvgs.reduce((a, b) => a + b, 0) / annualAvgs.length : null;
    return { passAnnual, failAnnual, meanAnnual };
  }, [semesterSummaries]);

  // Subject Manager state
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjGroup, setNewSubjGroup] = useState('');
  const [newSubjMax, setNewSubjMax] = useState('50');
  const [deleteSubjPrompt, setDeleteSubjPrompt] = useState<DeleteSubjectPromptState | null>(null);
  const [presetReplaceConfirm, setPresetReplaceConfirm] = useState<PresetKey | null>(null);

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClass?.id || !newSubjName.trim()) return;
    const maxScoreVal = Number(newSubjMax);
    const nextSubject: Subject = {
      id: createPermanentSubjectId(),
      name: newSubjName.trim(),
      ...(newSubjGroup.trim() ? { group: newSubjGroup.trim() } : {}),
      maxScore: Number.isFinite(maxScoreVal) && maxScoreVal > 0 ? maxScoreVal : 50,
      order: sortedSubjects.length + 1,
    };
    await saveClassSubjects(currentClass.id, [...sortedSubjects, nextSubject]);
    setNewSubjName('');
    setNewSubjGroup('');
    setNewSubjMax('50');
    addToast({ type: 'success', title: 'បានបន្ថែមមុខវិជ្ជាថ្មី' });
  };

  const [deactivateWarning, setDeactivateWarning] = useState<{
    subjectId: string;
    message: string;
  } | null>(null);

  const handleUpdateSubjectField = async (
    subjId: string,
    patch: Partial<Pick<Subject, 'name' | 'group' | 'maxScore' | 'isActive' | 'isBonus'>>
  ) => {
    if (!currentClass?.id) return;
    const next = sortedSubjects.map((s) =>
      s.id === subjId ? { ...s, ...patch } : s
    );
    await saveClassSubjects(currentClass.id, next);
  };

  const handleToggleSubjectActive = async (subj: Subject, nextActive: boolean) => {
    if (!currentClass?.id) return;
    await handleUpdateSubjectField(subj.id, { isActive: nextActive ? undefined : false });
    if (!nextActive) {
      const usage = await countSubjectScoreEntries(currentClass.id, subj.id);
      if (usage.totalCount > 0) {
        setDeactivateWarning({
          subjectId: subj.id,
          message: `មុខវិជ្ជា «${subj.name}» មានពិន្ទុ ${fmtNum(
            usage.totalCount
          )} កំណត់ត្រា — ពិន្ទុត្រូវបានរក្សាទុក ប៉ុន្តែមិនរាប់បញ្ចូលក្នុងការគណនាទេ។`,
        });
      }
    } else if (deactivateWarning?.subjectId === subj.id) {
      setDeactivateWarning(null);
    }
  };

  const handleMoveSubject = async (idx: number, dir: -1 | 1) => {
    if (!currentClass?.id) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= sortedSubjects.length) return;
    const next = [...sortedSubjects];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    await saveClassSubjects(currentClass.id, next);
  };

  const handleRequestDeleteSubject = async (subj: Subject) => {
    if (!currentClass?.id) return;
    const usage = await countSubjectScoreEntries(currentClass.id, subj.id);
    setDeleteSubjPrompt({
      subject: subj,
      ...usage,
    });
  };

  const handleConfirmDeleteSubject = async () => {
    if (!currentClass?.id || !deleteSubjPrompt) return;
    const { subject } = deleteSubjPrompt;
    await deleteSubjectWithScores(currentClass.id, subject.id);
    setDeleteSubjPrompt(null);
    addToast({
      type: 'success',
      title: `បានលុបមុខវិជ្ជា "${subject.name}"`,
    });
  };

  const handleApplyPreset = async (presetKey: PresetKey) => {
    if (!currentClass?.id) return;
    try {
      const highest = await getHighestScoresBySubject(currentClass.id);
      const { subjects: merged, keptMaxScores } = mergeSubjectsWithPreset(
        currentClass.subjects ?? [],
        getPresetSubjects(presetKey),
        highest
      );
      await saveClassSubjects(currentClass.id, merged);
      addToast({
        type: 'success',
        title: 'បានអនុវត្តគំរូមុខវិជ្ជា',
        message:
          keptMaxScores.length > 0
            ? `ពិន្ទុដែលបានបញ្ចូលនៅដដែល។ មិនបានបន្ថយពិន្ទុអតិបរមារបស់៖ ${keptMaxScores
                .map((k) => `${k.name} (មានពិន្ទុ ${k.highestScore})`)
                .join(', ')} — សូមពិនិត្យពិន្ទុទាំងនោះ។`
            : 'ពិន្ទុដែលបានបញ្ចូលនៅដដែល។ កំណែនេះអនុវត្តសម្រាប់តែថ្នាក់នេះប៉ុណ្ណោះ។',
      });
    } catch (err) {
      console.error('Apply subject preset failed', err);
      addToast({ type: 'error', title: 'មិនអាចអនុវត្តគំរូមុខវិជ្ជាបានទេ' });
    } finally {
      setPresetReplaceConfirm(null);
    }
  };

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const [printStage, setPrintStage] = useState<PrintStageState | null>(null);

  const handleExport = async ({
    format,
    classId,
    months,
    paperSize = 'A4',
  }: {
    format: ExportFormat;
    classId: number;
    months: string[];
    paperSize?: PaperSize;
  }) => {
    await flushPendingSaves();
    const cls = classes?.find((c) => c.id === classId);
    if (!cls) return;
    const students = await db.students.where('classId').equals(classId).toArray();
    const sortedClsStudents = [...students].sort((a, b) => a.order - b.order);

    try {
    if (activeTab === 'semester') {
      const [mRows, eRows] = await Promise.all([
        db.monthlyScores
          .where('[classId+month]')
          .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
          .toArray(),
        db.semesterExams
          .where('[classId+semester]')
          .between([classId, Dexie.minKey], [classId, Dexie.maxKey])
          .toArray(),
      ]);

      const summaries = computeSemesterAnnualSummary({
        students: sortedClsStudents,
        subjects: cls.subjects,
        academicYear: cls.academicYear,
        monthlyRecords: mRows,
        semesterExams: eRows,
        config: scoreConfig,
      });

      if (format === 'excel') {
        const fileName = await exportSemesterSummaryExcel({
          cls,
          profile,
          summaries,
          scoreConfig,
          useKhmerDigits: useKhmerNumerals,
        });
        addToast({ type: 'success', title: 'នាំចេញ Excel ជោគជ័យ!', message: fileName });
        return;
      }

      setPrintStage({ kind: 'semester', cls, summaries, paperSize });
      await new Promise((r) => setTimeout(r, 80));
      await nextPaint();

      if (format === 'print') {
        await ensurePrintFontsReady();
        window.print();
        return;
      }

      if (format === 'pdf') {
        const stage = pdfStageRef.current;
        if (!stage) return;
        const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
        const fileName = buildExportFileName({
          document: 'តារាងស្រង់ពិន្ទុឆមាស',
          className: cls.name,
          year: cls.academicYear,
          ext: 'pdf',
          useKhmerDigits: useKhmerNumerals,
        });
        await exportPrintNodesToPdf(pageNodes, {
          fileName,
          orientation: 'landscape',
          pageSize: paperSize,
          pixelRatio: paperSize === 'A3' ? 2.5 : 3,
        });
        setPrintStage(null);
        addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
        return;
      }
      return;
    }

    // Monthly or Exam export
    let sheets: MonthlyScoreSheetPageData[] = [];
    let filePrefix = 'បញ្ជីពិន្ទុប្រចាំខែ';

    if (activeTab === 'exam') {
      filePrefix = `បញ្ជីពិន្ទុប្រឡងឆមាសទី${fmtNum(selectedSemester)}`;
      const examRows = await db.semesterExams
        .where('[classId+semester]')
        .equals([classId, selectedSemester])
        .toArray();
      const scoresMap = new Map<number, Record<string, number | null>>();
      const notesMap = new Map<number, string>();
      for (const r of examRows) {
        scoresMap.set(r.studentRef, { ...r.scores });
        if (r.note) notesMap.set(r.studentRef, r.note);
      }
      sheets = [
        {
          id: `exam-${selectedSemester}`,
          title: `បញ្ជីពិន្ទុប្រឡងឆមាសទី ${fmtNum(selectedSemester)}`,
          periodLabel: `ឆមាសទី ${fmtNum(selectedSemester)}`,
          scoresByStudent: scoresMap,
          notesByStudent: notesMap,
        },
      ];
    } else {
      for (const m of months) {
        const rows = await db.monthlyScores
          .where('[classId+month]')
          .equals([classId, m])
          .toArray();
        const scoresMap = new Map<number, Record<string, number | null>>();
        const notesMap = new Map<number, string>();
        for (const r of rows) {
          scoresMap.set(r.studentRef, { ...r.scores });
          if (r.note) notesMap.set(r.studentRef, r.note);
        }
        const p = parseYearMonth(m);
        sheets.push({
          id: m,
          title: 'បញ្ជីពិន្ទុប្រចាំខែ',
          periodLabel: `ខែ ${getKhmerMonthName(p.month)} ឆ្នាំ ${fmtNum(p.year)}`,
          monthKey: m,
          scoresByStudent: scoresMap,
          notesByStudent: notesMap,
        });
      }
    }

    if (format === 'excel') {
      const fileName = await exportMonthlyScoreExcel({
        cls,
        students: sortedClsStudents,
        profile,
        sheets,
        scoreConfig,
        fileNamePrefix: filePrefix,
        useKhmerDigits: useKhmerNumerals,
      });
      addToast({ type: 'success', title: 'នាំចេញ Excel ជោគជ័យ!', message: fileName });
      return;
    }

    setPrintStage({ kind: 'monthly', cls, students: sortedClsStudents, sheets });
    await new Promise((r) => setTimeout(r, 80));
    await nextPaint();

    if (format === 'print') {
      await ensurePrintFontsReady();
      window.print();
      return;
    }

    if (format === 'pdf') {
      const stage = pdfStageRef.current;
      if (!stage) return;
      const pageNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-print-page]'));
      const fileName =
        activeTab === 'exam'
          ? buildExportFileName({
              document: filePrefix,
              className: cls.name,
              year: cls.academicYear,
              ext: 'pdf',
              useKhmerDigits: useKhmerNumerals,
            })
          : months.length === 1
            ? buildExportFileName({
                document: filePrefix,
                className: cls.name,
                month: months[0],
                ext: 'pdf',
                useKhmerDigits: useKhmerNumerals,
              })
            : buildExportFileName({
                document: filePrefix,
                className: cls.name,
                month: `${months.length}ខែ`,
                year: cls.academicYear,
                ext: 'pdf',
                useKhmerDigits: useKhmerNumerals,
              });
      await exportPrintNodesToPdf(pageNodes, {
        fileName,
        orientation: 'landscape',
        pageSize: 'A4',
        pixelRatio: 3,
      });
      addToast({ type: 'success', title: 'នាំចេញ PDF ជោគជ័យ!', message: fileName });
    }
    } catch (err) {
      console.error('Scores export failed:', err);
      addToast({
        type: 'error',
        title: 'នាំចេញមិនបានសម្រេច',
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      if (format !== 'print') setPrintStage(null);
    }
  };

  if (!classes || classes.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <EmptyState
          icon={<GraduationCap size={28} />}
          title="មិនទាន់មានថ្នាក់រៀន"
          hint="សូមបង្កើតថ្នាក់រៀន និងបន្ថែមសិស្សជាមុនសិន ដើម្បីចាប់ផ្ដើមបញ្ចូលពិន្ទុ។"
          actionLabel="ទៅកាន់សិស្ស និងថ្នាក់"
          onAction={() => setActiveView('students')}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
              បញ្ជីពិន្ទុ
            </h1>
            {currentClass && (
              <AppleBadge variant="blue" size="sm">
                ថ្នាក់ទី {currentClass.name} ({fmtNum(currentClass.academicYear)})
              </AppleBadge>
            )}
            <AppleBadge variant="gray" size="sm">
              មធ្យម /{fmtNum(scoreConfig.scale)}
            </AppleBadge>
            {(activeTab === 'monthly' || activeTab === 'exam') && saveState === 'saving' && (
              <span className="text-xs text-[#ff9500] font-medium">កំពុងរក្សាទុក...</span>
            )}
            {(activeTab === 'monthly' || activeTab === 'exam') && saveState === 'saved' && (
              <span className="inline-flex items-center gap-1 text-xs text-[#34c759] font-medium">
                <Check size={13} />
                បានរក្សាទុក
              </span>
            )}
          </div>
          <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
            បញ្ចូលពិន្ទុប្រចាំខែ ប្រឡងឆមាស ស្រង់លទ្ធផលឆមាស/ឆ្នាំ និងគ្រប់គ្រងមុខវិជ្ជាប្រចាំថ្នាក់
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <AppleSegmentedControl
            value={activeTab}
            onChange={(val) => void handleSwitchTab(val as ScoreTab)}
            options={[
              { value: 'monthly', label: 'ប្រចាំខែ' },
              { value: 'exam', label: 'ប្រឡងឆមាស' },
              { value: 'semester', label: 'ស្រង់ពិន្ទុឆមាស/ឆ្នាំ' },
              { value: 'subjects', label: 'មុខវិជ្ជា' },
            ]}
          />

          {activeTab !== 'subjects' && (
            <AppleButton
              variant="primary"
              size="sm"
              icon={<Download size={15} />}
              onClick={() => setExportOpen(true)}
            >
              នាំចេញ
            </AppleButton>
          )}
        </div>
      </div>

      {/* Period Selector & Stats Bar (Monthly / Exam) */}
      {(activeTab === 'monthly' || activeTab === 'exam') && (
        <AppleCard className="p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {activeTab === 'monthly' ? (
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="scores-month-select"
                    className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]"
                  >
                    ខែបញ្ចូលពិន្ទុ៖
                  </label>
                  <select
                    id="scores-month-select"
                    value={selectedMonth}
                    onChange={(e) => void handleChangeMonth(e.target.value)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  >
                    {(academicMonthOptions.includes(selectedMonth)
                      ? academicMonthOptions
                      : [selectedMonth, ...academicMonthOptions]
                    ).map((ym) => (
                      <option key={ym} value={ym} className="dark:bg-[#1c1c1e]">
                        {formatKhmerMonthYear(ym, useKhmerNumerals)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                    ជ្រើសរើសឆមាស៖
                  </span>
                  <AppleSegmentedControl
                    value={String(selectedSemester)}
                    onChange={(v) => void handleChangeSemester(Number(v) as 1 | 2)}
                    options={[
                      { value: '1', label: `ប្រឡងឆមាសទី ${fmtNum(1)}` },
                      { value: '2', label: `ប្រឡងឆមាសទី ${fmtNum(2)}` },
                    ]}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <AppleBadge variant="gray" size="sm">
                  សិស្ស {fmtNum(activeStudents.length)} (ប {fmtNum(gridStats.male)} / ស{' '}
                  {fmtNum(gridStats.female)})
                </AppleBadge>
                <AppleBadge variant="green" size="sm">
                  ជាប់ {fmtNum(gridStats.passed)}
                </AppleBadge>
                <AppleBadge variant="red" size="sm">
                  ធ្លាក់ {fmtNum(gridStats.failed)}
                </AppleBadge>
                {gridStats.classAvg !== null && (
                  <AppleBadge variant="blue" size="sm">
                    មធ្យមថ្នាក់ {fmtNum(formatAverage(gridStats.classAvg, scoreConfig.averageDecimalMode))}
                  </AppleBadge>
                )}
              </div>
            </div>

            <div className="text-[11px] text-[#86868b] dark:text-[#98989d]">
              គាំទ្រលេខខ្មែរ/អារ៉ាប់ (. ឬ ,) និង Paste ពី Excel ផ្ទាល់
              {invalidCellCount > 0 && (
                <span className="ml-2 text-[#ff3b30] font-semibold">
                  • ក្រឡាមិនត្រឹមត្រូវ៖ {fmtNum(invalidCellCount)}
                </span>
              )}
            </div>
          </div>

          {/* Score Entry Table */}
          {activeStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#86868b]">
              មិនទាន់មានសិស្សសកម្មក្នុងថ្នាក់នេះទេ។
            </div>
          ) : activeSubjects.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm text-[#86868b]">មិនទាន់មានមុខវិជ្ជាសកម្មសម្រាប់ថ្នាក់នេះទេ។</p>
              <AppleButton
                size="sm"
                variant="secondary"
                onClick={() => void handleSwitchTab('subjects')}
              >
                កំណត់មុខវិជ្ជា
              </AppleButton>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-black/[0.08] dark:border-white/[0.1]">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7]">
                    <th className="sticky left-0 z-20 bg-[#f5f5f7] dark:bg-[#242426] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2.5 text-center w-10">
                      ល.រ
                    </th>
                    <th className="sticky left-10 z-20 bg-[#f5f5f7] dark:bg-[#242426] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2.5 text-left min-w-[155px]">
                      គោត្តនាម និងនាម
                    </th>
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2.5 text-center min-w-[44px] whitespace-nowrap">
                      ភេទ
                    </th>

                    {activeSubjects.map((subj) => (
                      <th
                        key={subj.id}
                        className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-center min-w-[78px] whitespace-nowrap"
                        title={`${subj.name} (អតិបរមា ${subj.maxScore})`}
                      >
                        <div className="font-semibold leading-tight whitespace-nowrap">
                          {subj.name}
                        </div>
                        <div className="text-[10px] text-[#86868b] font-normal mt-0.5 whitespace-nowrap">
                          /{fmtNum(subj.maxScore)}
                          {isSubjectBonus(subj) ? ' (បន្ថែម)' : ''}
                        </div>
                      </th>
                    ))}

                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center min-w-[68px] bg-[#eef5ff] dark:bg-blue-500/10">
                      ពិន្ទុសរុប
                    </th>
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center min-w-[68px] bg-[#eef5ff] dark:bg-blue-500/10">
                      មធ្យម
                    </th>
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center min-w-[62px] bg-[#eef5ff] dark:bg-blue-500/10">
                      ចំណាត់
                    </th>
                    <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center min-w-[56px] bg-[#eef5ff] dark:bg-blue-500/10">
                      និទ្ទេស
                    </th>
                    <th className="border-b border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-left min-w-[110px]">
                      ផ្សេងៗ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeStudents.map((student, rowIdx) => {
                    const studentRef = student.id!;
                    const summary = rankedByStudent.get(studentRef);

                    return (
                      <ScoreGridRow
                        key={studentRef}
                        student={student}
                        rowIdx={rowIdx}
                        sortedSubjects={activeSubjects}
                        rowScores={scoresByStudent.get(studentRef) ?? EMPTY_NUM_RECORD}
                        rowDrafts={draftCells.get(studentRef) ?? EMPTY_STR_RECORD}
                        rowInvalids={invalidCells.get(studentRef) ?? EMPTY_STR_RECORD}
                        total={summary?.total ?? null}
                        average={summary?.average ?? null}
                        passed={summary?.passed ?? null}
                        rank={summary?.rank ?? null}
                        grade={summary?.grade ?? null}
                        noteVal={notesByStudent.get(studentRef) ?? ''}
                        useKhmerNumerals={useKhmerNumerals}
                        averageDecimalMode={scoreConfig.averageDecimalMode}
                        onCellChange={handleCellChange}
                        onCellBlur={handleCellBlur}
                        onCellPaste={handleCellPaste}
                        onCellKeyDown={handleCellKeyDown}
                        onNoteChange={handleNoteChange}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AppleCard>
      )}

      {/* Semester + Annual Summary Tab */}
      {activeTab === 'semester' && currentClass && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AppleCard className="p-4">
              <div className="text-xs text-[#86868b]">សិស្សសរុប (សកម្ម)</div>
              <div className="text-2xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] mt-1">
                {fmtNum(semesterSummaries.length)}
              </div>
            </AppleCard>
            <AppleCard className="p-4">
              <div className="text-xs text-[#86868b]">ជាប់ប្រចាំឆ្នាំ</div>
              <div className="text-2xl font-bold text-[#34c759] mt-1">
                {fmtNum(semesterStats.passAnnual)}
              </div>
            </AppleCard>
            <AppleCard className="p-4">
              <div className="text-xs text-[#86868b]">ធ្លាក់ប្រចាំឆ្នាំ</div>
              <div className="text-2xl font-bold text-[#ff3b30] mt-1">
                {fmtNum(semesterStats.failAnnual)}
              </div>
            </AppleCard>
            <AppleCard className="p-4">
              <div className="text-xs text-[#86868b]">មធ្យមភាគប្រចាំឆ្នាំថ្នាក់</div>
              <div className="text-2xl font-bold text-[#0071e3] mt-1">
                {semesterStats.meanAnnual !== null
                  ? fmtNum(formatAverage(semesterStats.meanAnnual, scoreConfig.averageDecimalMode))
                  : '—'}
              </div>
            </AppleCard>
          </div>

          <AppleCard
            title="តារាងស្រង់ពិន្ទុប្រចាំឆមាស និងប្រចាំឆ្នាំ"
            subtitle={`ឆមាសទី ${fmtNum(1)} (${scoreConfig.sem1Months
              .map((m) => resolveAcademicMonthKey(currentClass.academicYear, m))
              .join(', ')}) • ឆមាសទី ${fmtNum(2)} (${scoreConfig.sem2Months
              .map((m) => resolveAcademicMonthKey(currentClass.academicYear, m))
              .join(', ')})`}
            headerAction={
              <div className="flex items-center gap-2">
                <AppleButton
                  size="sm"
                  variant={showDetailedSubjectCols ? 'primary' : 'secondary'}
                  icon={<Layers size={14} />}
                  onClick={() => setShowDetailedSubjectCols((v) => !v)}
                >
                  {showDetailedSubjectCols ? 'បង្រួមមុខវិជ្ជា' : 'បង្ហាញពិន្ទុតាមមុខវិជ្ជា'}
                </AppleButton>
                <AppleButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setActiveView('settings')}
                >
                  កំណត់ខែ & មេគុណ
                </AppleButton>
              </div>
            }
          >
            {semesterSummaries.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#86868b]">
                មិនទាន់មានទិន្នន័យសិស្សទេ។
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-black/[0.08] dark:border-white/[0.1]">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f5f5f7] dark:bg-white/[0.06]">
                      <th
                        rowSpan={2}
                        className="sticky left-0 z-20 bg-[#f5f5f7] dark:bg-[#242426] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center"
                      >
                        ល.រ
                      </th>
                      <th
                        rowSpan={2}
                        className="sticky left-10 z-20 bg-[#f5f5f7] dark:bg-[#242426] border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2.5 py-2 text-left min-w-[150px]"
                      >
                        គោត្តនាម និងនាម
                      </th>
                      <th
                        rowSpan={2}
                        className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center"
                      >
                        ភេទ
                      </th>

                      <th
                        colSpan={
                          (showDetailedSubjectCols ? collapsedSubjects.length * 2 : 0) + 5
                        }
                        className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center font-bold bg-[#eef5ff] dark:bg-blue-500/10"
                      >
                        ឆមាសទី {fmtNum(1)}
                      </th>
                      <th
                        colSpan={
                          (showDetailedSubjectCols ? collapsedSubjects.length * 2 : 0) + 5
                        }
                        className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center font-bold bg-[#f2fbf4] dark:bg-emerald-500/10"
                      >
                        ឆមាសទី {fmtNum(2)}
                      </th>
                      <th
                        colSpan={4}
                        className="border-b border-black/[0.08] dark:border-white/[0.1] px-2 py-2 text-center font-bold bg-[#fff8ec] dark:bg-amber-500/10"
                      >
                        លទ្ធផលប្រចាំឆ្នាំ
                      </th>
                    </tr>

                    <tr className="bg-[#fafafa] dark:bg-white/[0.04] text-[11px]">
                      {[1, 2].map((sem) => (
                        <React.Fragment key={`h-sem-${sem}`}>
                          {showDetailedSubjectCols &&
                            collapsedSubjects.flatMap((s) => [
                              <th
                                key={`h-${sem}-${s.id}-p`}
                                className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap"
                                title={`${s.name} (${fmtNum(s.maxScore)})`}
                              >
                                {s.name} (ព)
                              </th>,
                              <th
                                key={`h-${sem}-${s.id}-r`}
                                className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-1 py-1.5 text-center text-[#86868b]"
                              >
                                ចំ
                              </th>,
                            ])}
                          <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap">
                            សរុបប្រឡង
                          </th>
                          <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap">
                            មធ្យមខែ
                          </th>
                          <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap">
                            មធ្យមប្រឡង
                          </th>
                          <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap font-bold">
                            មធ្យមឆមាស
                          </th>
                          <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap font-bold">
                            ចំណាត់ថ្នាក់
                          </th>
                        </React.Fragment>
                      ))}

                      <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap font-bold">
                        មធ្យមឆ្នាំ
                      </th>
                      <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap font-bold">
                        ចំណាត់ថ្នាក់
                      </th>
                      <th className="border-b border-r border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap font-bold">
                        និទ្ទេស
                      </th>
                      <th className="border-b border-black/[0.08] dark:border-white/[0.1] px-2 py-1.5 text-center whitespace-nowrap font-bold">
                        លទ្ធផល
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {semesterSummaries.map((row, idx) => (
                      <tr
                        key={row.student.id ?? idx}
                        className="border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0 hover:bg-[#f5f5f7]/60 dark:hover:bg-white/[0.03]"
                      >
                        <td className="sticky left-0 z-10 bg-white dark:bg-[#1c1c1e] border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center text-[#86868b]">
                          {fmtNum(idx + 1)}
                        </td>
                        <td className="sticky left-10 z-10 bg-white dark:bg-[#1c1c1e] border-r border-black/[0.06] dark:border-white/[0.08] px-2.5 py-1.5 font-medium whitespace-nowrap">
                          {row.student.nameKm}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center text-[#86868b]">
                          {row.student.gender === 'ប្រុស' ? 'ប' : 'ស'}
                        </td>

                        {/* Sem 1 */}
                        {showDetailedSubjectCols &&
                          collapsedSubjects.flatMap((s) => [
                            <td
                              key={`s1-${s.id}-p`}
                              className="border-r border-black/[0.06] dark:border-white/[0.08] px-1.5 py-1.5 text-center"
                            >
                              {row.sem1ExamScores[s.id] !== null &&
                              row.sem1ExamScores[s.id] !== undefined
                                ? fmtNum(row.sem1ExamScores[s.id]!)
                                : '—'}
                            </td>,
                            <td
                              key={`s1-${s.id}-r`}
                              className="border-r border-black/[0.06] dark:border-white/[0.08] px-1 py-1.5 text-center text-[#86868b]"
                            >
                              {row.sem1SubjectRanks[s.id] ? fmtNum(row.sem1SubjectRanks[s.id]!) : ''}
                            </td>,
                          ])}
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center">
                          {row.sem1ExamTotal !== null
                            ? fmtNum(
                                Number.isInteger(row.sem1ExamTotal)
                                  ? row.sem1ExamTotal
                                  : row.sem1ExamTotal.toFixed(1)
                              )
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center">
                          {row.sem1MonthlyAvg !== null
                            ? fmtNum(formatAverage(row.sem1MonthlyAvg, scoreConfig.averageDecimalMode))
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center">
                          {row.sem1ExamAvg !== null
                            ? fmtNum(formatAverage(row.sem1ExamAvg, scoreConfig.averageDecimalMode))
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-bold">
                          {row.sem1Avg !== null
                            ? fmtNum(formatAverage(row.sem1Avg, scoreConfig.averageDecimalMode))
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-bold text-[#0071e3]">
                          {row.sem1Rank !== null ? fmtNum(row.sem1Rank) : '—'}
                        </td>

                        {/* Sem 2 */}
                        {showDetailedSubjectCols &&
                          collapsedSubjects.flatMap((s) => [
                            <td
                              key={`s2-${s.id}-p`}
                              className="border-r border-black/[0.06] dark:border-white/[0.08] px-1.5 py-1.5 text-center"
                            >
                              {row.sem2ExamScores[s.id] !== null &&
                              row.sem2ExamScores[s.id] !== undefined
                                ? fmtNum(row.sem2ExamScores[s.id]!)
                                : '—'}
                            </td>,
                            <td
                              key={`s2-${s.id}-r`}
                              className="border-r border-black/[0.06] dark:border-white/[0.08] px-1 py-1.5 text-center text-[#86868b]"
                            >
                              {row.sem2SubjectRanks[s.id] ? fmtNum(row.sem2SubjectRanks[s.id]!) : ''}
                            </td>,
                          ])}
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center">
                          {row.sem2ExamTotal !== null
                            ? fmtNum(
                                Number.isInteger(row.sem2ExamTotal)
                                  ? row.sem2ExamTotal
                                  : row.sem2ExamTotal.toFixed(1)
                              )
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center">
                          {row.sem2MonthlyAvg !== null
                            ? fmtNum(formatAverage(row.sem2MonthlyAvg, scoreConfig.averageDecimalMode))
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center">
                          {row.sem2ExamAvg !== null
                            ? fmtNum(formatAverage(row.sem2ExamAvg, scoreConfig.averageDecimalMode))
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-bold">
                          {row.sem2Avg !== null
                            ? fmtNum(formatAverage(row.sem2Avg, scoreConfig.averageDecimalMode))
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-bold text-[#0071e3]">
                          {row.sem2Rank !== null ? fmtNum(row.sem2Rank) : '—'}
                        </td>

                        {/* Annual */}
                        <td
                          className={`border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-bold ${
                            row.annualPassed === false
                              ? 'text-[#ff3b30]'
                              : row.annualPassed === true
                                ? 'text-[#34c759]'
                                : ''
                          }`}
                        >
                          {row.annualAvg !== null
                            ? fmtNum(formatAverage(row.annualAvg, scoreConfig.averageDecimalMode))
                            : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-bold text-[#0071e3]">
                          {row.annualRank !== null ? fmtNum(row.annualRank) : '—'}
                        </td>
                        <td className="border-r border-black/[0.06] dark:border-white/[0.08] px-2 py-1.5 text-center font-bold">
                          {row.annualGrade ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {row.annualPassed === true ? (
                            <AppleBadge variant="green" size="sm">
                              ជាប់
                            </AppleBadge>
                          ) : row.annualPassed === false ? (
                            <AppleBadge variant="red" size="sm">
                              ធ្លាក់
                            </AppleBadge>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AppleCard>
        </div>
      )}

      {/* Subject Manager Tab (per-class, permanent IDs) */}
      {activeTab === 'subjects' && currentClass && (
        <div className="space-y-4">
          <AppleCard
            title={
              <span className="flex items-center gap-2">
                <BookOpen size={17} className="text-[#0071e3]" />
                <span>មុខវិជ្ជាសម្រាប់ថ្នាក់ទី {currentClass.name}</span>
              </span>
            }
            subtitle="លេខសម្គាល់មុខវិជ្ជាត្រូវបានរក្សាអចិន្ត្រៃយ៍ — ការប្ដូរឈ្មោះ ឬលំដាប់រក្សាពិន្ទុទាំងអស់។ ការកែថ្នាក់នេះមិនប៉ះពាល់ថ្នាក់ដទៃទេ។"
            headerAction={
              <div className="flex flex-wrap gap-2">
                <AppleButton
                  size="sm"
                  variant="secondary"
                  icon={<Sparkles size={14} />}
                  onClick={() => setPresetReplaceConfirm('lower-secondary')}
                >
                  គំរូអនុវិទ្យាល័យ
                </AppleButton>
                <AppleButton
                  size="sm"
                  variant="secondary"
                  icon={<Sparkles size={14} />}
                  onClick={() => setPresetReplaceConfirm('upper-secondary')}
                >
                  គំរូវិទ្យាល័យ
                </AppleButton>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Add Subject Form */}
              <form onSubmit={handleAddSubject} className="flex flex-wrap items-end gap-2.5">
                <div className="flex-1 min-w-[180px]">
                  <label
                    htmlFor="new-subject-name"
                    className="block text-[11px] font-semibold text-[#86868b] mb-1"
                  >
                    ឈ្មោះមុខវិជ្ជាថ្មី
                  </label>
                  <input
                    id="new-subject-name"
                    type="text"
                    value={newSubjName}
                    onChange={(e) => setNewSubjName(e.target.value)}
                    placeholder="ឧ. រូបវិទ្យា"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  />
                </div>
                <div className="w-44">
                  <label
                    htmlFor="new-subject-group"
                    className="block text-[11px] font-semibold text-[#86868b] mb-1"
                  >
                    ក្រុមមុខវិជ្ជា (ស្រេចចិត្ត)
                  </label>
                  <input
                    id="new-subject-group"
                    type="text"
                    value={newSubjGroup}
                    onChange={(e) => setNewSubjGroup(e.target.value)}
                    placeholder="ឧ. អក្សរសាស្ត្រខ្មែរ"
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  />
                </div>
                <div className="w-28">
                  <label
                    htmlFor="new-subject-max"
                    className="block text-[11px] font-semibold text-[#86868b] mb-1"
                  >
                    ពិន្ទុអតិបរមា
                  </label>
                  <input
                    id="new-subject-max"
                    type="number"
                    min={1}
                    value={newSubjMax}
                    onChange={(e) => setNewSubjMax(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                  />
                </div>
                <AppleButton
                  type="submit"
                  size="sm"
                  variant="primary"
                  icon={<Plus size={14} />}
                  disabled={!newSubjName.trim()}
                >
                  បន្ថែមមុខវិជ្ជា
                </AppleButton>
              </form>

              {/* Subject Rows */}
              <div className="overflow-x-auto rounded-2xl border border-black/[0.08] dark:border-white/[0.1]">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7]">
                      <th className="px-3 py-2.5 text-center w-12">ល.រ</th>
                      <th className="px-3 py-2.5 text-center w-16">ប្រើ</th>
                      <th className="px-3 py-2.5 text-left">ឈ្មោះមុខវិជ្ជា</th>
                      <th className="px-3 py-2.5 text-left w-48">ក្រុមមុខវិជ្ជា</th>
                      <th className="px-3 py-2.5 text-center w-28">ពិន្ទុអតិបរមា</th>
                      <th className="px-3 py-2.5 text-center w-28">លំដាប់</th>
                      <th className="px-3 py-2.5 text-center w-20">លុប</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSubjects.map((subj, idx) => {
                      const active = isSubjectActive(subj);
                      return (
                      <tr
                        key={subj.id}
                        className={`border-t border-black/[0.06] dark:border-white/[0.08] ${
                          active ? '' : 'opacity-60'
                        }`}
                      >
                        <td className="px-3 py-2 text-center font-medium text-[#86868b]">
                          {fmtNum(idx + 1)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            aria-label={`ប្រើ ${subj.name}`}
                            checked={active}
                            onChange={(e) =>
                              void handleToggleSubjectActive(subj, e.target.checked)
                            }
                            className="h-4 w-4 accent-[#0071e3] cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            aria-label={`ឈ្មោះមុខវិជ្ជា ${subj.name}`}
                            defaultValue={subj.name}
                            onBlur={(e) => {
                              const nextName = e.target.value.trim();
                              if (nextName && nextName !== subj.name) {
                                void handleUpdateSubjectField(subj.id, { name: nextName });
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-[#f5f5f7]/70 dark:bg-white/[0.05] text-[#1d1d1f] dark:text-[#f5f5f7] border border-transparent focus:border-[#0071e3] focus:outline-none"
                          />
                          {subj.id === 'foreign_lang' && (
                            <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-[#6e6e73] dark:text-[#98989d] cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isSubjectBonus(subj)}
                                onChange={(e) =>
                                  void handleUpdateSubjectField(subj.id, {
                                    isBonus: e.target.checked ? true : undefined,
                                  })
                                }
                                className="h-3.5 w-3.5 accent-[#0071e3]"
                              />
                              <span>ពិន្ទុបន្ថែម (យកតែលើសពាក់កណ្ដាល)</span>
                            </label>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            aria-label={`ក្រុមមុខវិជ្ជា ${subj.name}`}
                            defaultValue={subj.group ?? ''}
                            placeholder="—"
                            onBlur={(e) => {
                              const nextGroup = e.target.value.trim() || undefined;
                              if (nextGroup !== subj.group) {
                                void handleUpdateSubjectField(subj.id, { group: nextGroup });
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-[#f5f5f7]/70 dark:bg-white/[0.05] text-[#1d1d1f] dark:text-[#f5f5f7] border border-transparent focus:border-[#0071e3] focus:outline-none"
                          />
                          {subj.group?.trim() && (
                            <div className="mt-0.5 px-1 text-[10px] font-medium text-[#0071e3] dark:text-[#64d2ff]">
                              សរុប {fmtNum(groupMaxTotals.get(subj.group.trim()) ?? subj.maxScore)}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            min={1}
                            aria-label={`អតិបរមា ${subj.name}`}
                            defaultValue={subj.maxScore}
                            onBlur={(e) => {
                              const val = Number(e.target.value);
                              if (Number.isFinite(val) && val > 0 && val !== subj.maxScore) {
                                void handleUpdateSubjectField(subj.id, { maxScore: val });
                              }
                            }}
                            className="w-20 px-2 py-1.5 rounded-xl text-xs text-center bg-[#f5f5f7]/70 dark:bg-white/[0.05] text-[#1d1d1f] dark:text-[#f5f5f7] border border-transparent focus:border-[#0071e3] focus:outline-none"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              aria-label="រំកិលឡើង"
                              disabled={idx === 0}
                              onClick={() => void handleMoveSubject(idx, -1)}
                              className="p-1.5 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.08] disabled:opacity-30"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label="រំកិលចុះ"
                              disabled={idx === sortedSubjects.length - 1}
                              onClick={() => void handleMoveSubject(idx, 1)}
                              className="p-1.5 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.08] disabled:opacity-30"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            aria-label={`លុប ${subj.name}`}
                            onClick={() => void handleRequestDeleteSubject(subj)}
                            className="p-1.5 rounded-lg text-[#ff3b30] hover:bg-red-50 dark:hover:bg-red-500/15"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {deactivateWarning && (
                <div
                  data-testid="deactivate-subject-warning"
                  className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300/60 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300"
                >
                  {deactivateWarning.message}
                </div>
              )}

              <div
                data-testid="live-subject-coefficient"
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#f5f5f7] dark:bg-white/[0.04] text-xs text-[#1d1d1f] dark:text-[#f5f5f7]"
              >
                <span className="font-semibold">
                  មេគុណ៖{' '}
                  {fmtNum(
                    Number.isInteger(liveCoefficientInfo.coefficient)
                      ? liveCoefficientInfo.coefficient
                      : liveCoefficientInfo.coefficient.toFixed(2)
                  )}
                </span>
                <span className="text-[#86868b]">
                  សរុបពិន្ទុមុខវិជ្ជាគោល {fmtNum(liveCoefficientInfo.standardMaxSum)} ÷{' '}
                  {fmtNum(50)}
                </span>
              </div>
            </div>
          </AppleCard>
        </div>
      )}

      {/* Delete Subject Confirmation showing exact existing score count */}
      <ConfirmDialog
        isOpen={Boolean(deleteSubjPrompt)}
        onClose={() => setDeleteSubjPrompt(null)}
        onConfirm={() => void handleConfirmDeleteSubject()}
        title="បញ្ជាក់ការលុបមុខវិជ្ជា"
        variant="danger"
        confirmLabel="លុបមុខវិជ្ជា"
        message={
          deleteSubjPrompt
            ? deleteSubjPrompt.totalCount > 0
              ? `មុខវិជ្ជា "${deleteSubjPrompt.subject.name}" មានពិន្ទុចំនួន ${fmtNum(
                  deleteSubjPrompt.totalCount
                )} កំណត់ត្រា (${fmtNum(deleteSubjPrompt.monthlyCount)} ប្រចាំខែ, ${fmtNum(
                  deleteSubjPrompt.examCount
                )} ប្រឡងឆមាស)។ តើអ្នកពិតជាចង់លុបមុខវិជ្ជា និងពិន្ទុទាំងនោះមែនទេ?`
              : `តើអ្នកចង់លុបមុខវិជ្ជា "${deleteSubjPrompt.subject.name}" ចេញពីថ្នាក់នេះមែនទេ?`
            : ''
        }
      />

      {/* Preset Replace Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(presetReplaceConfirm)}
        onClose={() => setPresetReplaceConfirm(null)}
        onConfirm={() => presetReplaceConfirm && void handleApplyPreset(presetReplaceConfirm)}
        title="កែបញ្ជីមុខវិជ្ជាតាមគំរូ?"
        variant="primary"
        confirmLabel="យល់ព្រមប្រើគំរូ"
        message="ឈ្មោះ ពិន្ទុអតិបរមា និងលំដាប់មុខវិជ្ជានឹងត្រូវកែតាមគំរូ សម្រាប់តែថ្នាក់នេះ។ ពិន្ទុដែលបានបញ្ចូលរួចមិនបាត់ទេ ហើយមុខវិជ្ជាដែលអ្នកបន្ថែមខ្លួនឯងនៅដដែល។"
      />

      {/* Export Dialog */}
      <ExportDialog
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        title={
          activeTab === 'semester'
            ? 'នាំចេញតារាងស្រង់ពិន្ទុឆមាស/ឆ្នាំ'
            : activeTab === 'exam'
              ? `នាំចេញពិន្ទុប្រឡងឆមាសទី ${fmtNum(selectedSemester)}`
              : 'នាំចេញបញ្ជីពិន្ទុប្រចាំខែ'
        }
        classes={classes}
        defaultClassId={currentClass?.id ?? null}
        showMonthPicker={activeTab === 'monthly'}
        showPaperSizePicker={activeTab === 'semester'}
        defaultMonth={selectedMonth}
        onExport={handleExport}
      />

      {/* Off-screen PDF capture & print portal */}
      {printStage && (
        <>
          <div
            ref={pdfStageRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: '-14000px',
              top: 0,
              pointerEvents: 'none',
              zIndex: -1,
            }}
            className="print:hidden"
          >
            {printStage.kind === 'monthly' ? (
              <MonthlyScoreSheet
                cls={printStage.cls}
                students={printStage.students}
                profile={profile}
                sheets={printStage.sheets}
                scoreConfig={scoreConfig}
                useKhmerDigits={useKhmerNumerals}
              />
            ) : (
              <SemesterSheet
                cls={printStage.cls}
                profile={profile}
                summaries={printStage.summaries}
                scoreConfig={scoreConfig}
                paperSize={printStage.paperSize}
                useKhmerDigits={useKhmerNumerals}
              />
            )}
          </div>

          <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
            {printStage.kind === 'monthly' ? (
              <MonthlyScoreSheet
                cls={printStage.cls}
                students={printStage.students}
                profile={profile}
                sheets={printStage.sheets}
                scoreConfig={scoreConfig}
                useKhmerDigits={useKhmerNumerals}
              />
            ) : (
              <SemesterSheet
                cls={printStage.cls}
                profile={profile}
                summaries={printStage.summaries}
                scoreConfig={scoreConfig}
                paperSize={printStage.paperSize}
                useKhmerDigits={useKhmerNumerals}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};
