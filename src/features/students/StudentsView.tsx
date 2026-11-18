import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDownAZ,
  Plus,
  Users,
  ArrowLeft,
  Search,
  Edit,
  Trash2,
  Copy,
  FileSpreadsheet,
  Download,
  User,
  GraduationCap,
} from 'lucide-react';
import { db } from '../../db/database';
import {
  deleteClassCascade,
  deleteStudentCascade,
  duplicateClassStructure,
  getClassCascadeCounts,
  sortClassStudentsAlphabetically,
  type ClassCascadeCounts,
} from '../../db/classStudentRepo';
import { compareKhmerNames } from '../../lib/khmerSort';
import { useAppStore } from '../../store/useAppStore';
import type { Profile, SchoolClass, Student, StudentStatus } from '../../types/domain';
import { AppleCard } from '../../components/common/AppleCard';
import { AppleButton } from '../../components/common/AppleButton';
import { AppleBadge } from '../../components/common/AppleBadge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { ExportDialog, type ExportFormat } from '../../components/common/ExportDialog';
import { ClassFormModal } from './ClassFormModal';
import { StudentFormModal } from './StudentFormModal';
import { ExcelImportModal } from './ExcelImportModal';
import { downloadStudentImportTemplate } from '../../services/excelImport';
import { exportStudentListExcel } from '../../services/excelExport';
import { ensurePrintFontsReady, exportPrintNodesToPdf, nextPaint } from '../../services/pdfExport';
import { StudentListSheet } from '../../print/StudentListSheet';
import { toArabicNumerals, toKhmerNumerals } from '../../utils/khmerNumerals';

interface StudentsViewProps {
  profile: Profile;
}

type SortKey = 'order' | 'nameKm' | 'studentId' | 'gender';

const StudentPhotoThumb: React.FC<{ blob?: Blob; name: string }> = ({ blob, name }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return;
    }
    const objUrl = URL.createObjectURL(blob);
    setUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [blob]);

  if (!url) {
    return (
      <div className="w-[27px] h-[36px] rounded bg-[#f5f5f7] dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.1] flex items-center justify-center text-[#86868b] shrink-0">
        <User size={14} />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      className="w-[27px] h-[36px] rounded object-cover border border-black/[0.08] dark:border-white/[0.1] shrink-0"
    />
  );
};

export const StudentsView: React.FC<StudentsViewProps> = ({ profile }) => {
  const { selectedClassId, setSelectedClassId, useKhmerNumerals, addToast } = useAppStore();

  const classes = useLiveQuery(async () => {
    const list = await db.classes.toArray();
    return list.sort((a, b) => a.createdAt - b.createdAt);
  }, []);

  const allStudents = useLiveQuery(() => db.students.toArray(), []);

  // Sub-view mode: 'grid' (class cards) or 'detail' (students inside selected class)
  const [viewMode, setViewMode] = useState<'grid' | 'detail'>('grid');
  const [activeDetailClassId, setActiveDetailClassId] = useState<number | null>(null);

  // Modals state
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [classToEdit, setClassToEdit] = useState<SchoolClass | null>(null);

  const [classToDelete, setClassToDelete] = useState<SchoolClass | null>(null);
  const [classCascadeCounts, setClassCascadeCounts] = useState<ClassCascadeCounts | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);

  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Table filter/sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StudentStatus>('all');
  const [sortBy, setSortBy] = useState<SortKey>('order');

  // Print / PDF stage
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const [printPayload, setPrintPayload] = useState<{
    cls: SchoolClass;
    students: Student[];
  } | null>(null);

  const fmtNum = (val: number | string) =>
    useKhmerNumerals ? toKhmerNumerals(val) : toArabicNumerals(String(val));

  const currentClass = useMemo(() => {
    if (!classes) return undefined;
    return classes.find((c) => c.id === activeDetailClassId) || undefined;
  }, [classes, activeDetailClassId]);

  // If the user switches out of a deleted class, return to grid
  useEffect(() => {
    if (viewMode === 'detail' && classes && !currentClass) {
      setViewMode('grid');
      setActiveDetailClassId(null);
    }
  }, [viewMode, classes, currentClass]);

  const classStudentStats = useMemo(() => {
    const map = new Map<number, { total: number; female: number; male: number }>();
    if (!allStudents) return map;
    for (const s of allStudents) {
      const entry = map.get(s.classId) || { total: 0, female: 0, male: 0 };
      entry.total++;
      if (s.gender === 'ស្រី') entry.female++;
      else entry.male++;
      map.set(s.classId, entry);
    }
    return map;
  }, [allStudents]);

  const classStudents = useMemo(() => {
    if (!allStudents || activeDetailClassId === null) return [];
    return allStudents
      .filter((s) => s.classId === activeDetailClassId)
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }, [allStudents, activeDetailClassId]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = classStudents.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.nameKm.toLowerCase().includes(q) ||
        (s.nameEn && s.nameEn.toLowerCase().includes(q)) ||
        s.studentId.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q))
      );
    });

    if (sortBy === 'order') return list;
    return [...list].sort((a, b) => {
      if (sortBy === 'nameKm') return compareKhmerNames(a.nameKm, b.nameKm);
      if (sortBy === 'studentId') return a.studentId.localeCompare(b.studentId);
      return a.gender.localeCompare(b.gender, 'km');
    });
  }, [classStudents, searchQuery, statusFilter, sortBy]);

  const openClassDetail = (cls: SchoolClass) => {
    if (cls.id === undefined) return;
    setActiveDetailClassId(cls.id);
    setSelectedClassId(cls.id);
    setViewMode('detail');
    setSearchQuery('');
    setStatusFilter('all');
    setSortBy('order');
  };

  const handleRequestDeleteClass = async (cls: SchoolClass) => {
    if (cls.id === undefined) return;
    const counts = await getClassCascadeCounts(cls.id);
    setClassCascadeCounts(counts);
    setClassToDelete(cls);
  };

  const handleConfirmDeleteClass = async () => {
    if (!classToDelete?.id) return;
    setIsDeletingClass(true);
    try {
      const deletedId = classToDelete.id;
      await deleteClassCascade(deletedId);
      if (selectedClassId === deletedId) setSelectedClassId(null);
      if (activeDetailClassId === deletedId) {
        setActiveDetailClassId(null);
        setViewMode('grid');
      }
      addToast({
        type: 'info',
        title: `បានលុបថ្នាក់ទី ${classToDelete.name}`,
        message: 'ទិន្នន័យពាក់ព័ន្ធទាំងអស់ត្រូវបានលុបរួចរាល់។',
      });
      setClassToDelete(null);
      setClassCascadeCounts(null);
    } finally {
      setIsDeletingClass(false);
    }
  };

  const handleDuplicateClass = async (cls: SchoolClass) => {
    if (!cls.id) return;
    const newId = await duplicateClassStructure(cls.id);
    setSelectedClassId(newId);
    addToast({
      type: 'success',
      title: 'បានចម្លងរចនាសម្ព័ន្ធថ្នាក់',
      message: 'មុខវិជ្ជា និងការកំណត់ថ្នាក់ត្រូវបានចម្លង (គ្មានសិស្ស)។',
    });
  };

  const handleConfirmDeleteStudent = async () => {
    if (!studentToDelete?.id) return;
    setIsDeletingStudent(true);
    try {
      await deleteStudentCascade(studentToDelete.id);
      addToast({
        type: 'info',
        title: `បានលុបសិស្ស ${studentToDelete.nameKm}`,
        message: 'ទិន្នន័យវត្តមាន/ពិន្ទុត្រូវបានលុប និងតម្រៀបលេខរៀងឡើងវិញ។',
      });
      setStudentToDelete(null);
    } finally {
      setIsDeletingStudent(false);
    }
  };

  const handleExport = async ({ format, classId }: { format: ExportFormat; classId: number }) => {
    const cls = classes?.find((c) => c.id === classId);
    if (!cls) return;
    const clsStudents = (allStudents || [])
      .filter((s) => s.classId === classId)
      .sort((a, b) => a.order - b.order);

    if (format === 'excel') {
      const fileName = await exportStudentListExcel(cls, clsStudents, profile, useKhmerNumerals);
      addToast({
        type: 'success',
        title: 'នាំចេញ Excel ជោគជ័យ!',
        message: fileName,
      });
      return;
    }

    // Mount print sheet for PDF or window.print()
    setPrintPayload({ cls, students: clsStudents });

    // Wait for React commit + layout
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
      const fileName = `បញ្ជីឈ្មោះសិស្ស_${cls.name}_${fmtNum(cls.academicYear)}.pdf`;
      await exportPrintNodesToPdf(pageNodes, {
        fileName,
        orientation: 'landscape',
        pixelRatio: 3,
      });
      setPrintPayload(null);
      addToast({
        type: 'success',
        title: 'នាំចេញ PDF ជោគជ័យ!',
        message: fileName,
      });
    }
  };

  const statusLabel = (st: StudentStatus) => {
    if (st === 'active') return <AppleBadge variant="green" size="sm">កំពុងរៀន</AppleBadge>;
    if (st === 'dropped') return <AppleBadge variant="red" size="sm">បោះបង់</AppleBadge>;
    return <AppleBadge variant="orange" size="sm">ផ្ទេរចេញ</AppleBadge>;
  };

  const maleCount = classStudents.filter((s) => s.gender === 'ប្រុស').length;
  const femaleCount = classStudents.filter((s) => s.gender === 'ស្រី').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {viewMode === 'grid' || !currentClass ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul tracking-wide">
                ថ្នាក់រៀន និងសិស្ស
              </h1>
              <p className="text-xs text-[#86868b] dark:text-[#98989d] mt-1">
                ជ្រើសរើសថ្នាក់ដើម្បីគ្រប់គ្រងបញ្ជីឈ្មោះសិស្ស ឬបង្កើតថ្នាក់ថ្មី
              </p>
            </div>

            <AppleButton
              variant="primary"
              size="sm"
              icon={<Plus size={16} />}
              onClick={() => {
                setClassToEdit(null);
                setIsClassModalOpen(true);
              }}
            >
              បង្កើតថ្នាក់
            </AppleButton>
          </div>

          {!classes || classes.length === 0 ? (
            <EmptyState
              icon={<GraduationCap size={28} />}
              title="មិនទាន់មានថ្នាក់រៀននៅឡើយទេ"
              hint="ចាប់ផ្ដើមដោយបង្កើតថ្នាក់រៀនដំបូងរបស់អ្នក (ឧ. ៧ក) រួចបញ្ចូលឈ្មោះសិស្ស។"
              actionLabel="បង្កើតថ្នាក់"
              actionIcon={<Plus size={15} />}
              onAction={() => {
                setClassToEdit(null);
                setIsClassModalOpen(true);
              }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {classes.map((cls) => {
                const stats = cls.id ? classStudentStats.get(cls.id) : undefined;
                const total = stats?.total ?? 0;
                const female = stats?.female ?? 0;
                return (
                  <AppleCard key={cls.id} className="flex flex-col justify-between" noPadding>
                    <div
                      onClick={() => openClassDetail(cls)}
                      className="p-5 cursor-pointer hover:bg-[#f5f5f7]/60 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0"
                            style={{ backgroundColor: cls.color || '#0071e3' }}
                          />
                          <div className="min-w-0">
                            <h3 className="text-base font-bold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
                              ថ្នាក់ទី {cls.name}
                            </h3>
                            <p className="text-xs text-[#86868b] mt-0.5">
                              ឆ្នាំសិក្សា {cls.academicYear}
                            </p>
                          </div>
                        </div>
                        <AppleBadge variant="blue" size="sm">
                          ថ្នាក់ {fmtNum(cls.gradeLevel)}
                        </AppleBadge>
                      </div>

                      <div className="mt-4 pt-3 border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between text-xs">
                        <span className="text-[#6e6e73] dark:text-[#98989d]">
                          សិស្សសរុប{' '}
                          <b className="text-[#1d1d1f] dark:text-[#f5f5f7]">{fmtNum(total)}</b>{' '}
                          នាក់
                        </span>
                        <span className="text-[#6e6e73] dark:text-[#98989d]">
                          ស្រី <b className="text-[#1d1d1f] dark:text-[#f5f5f7]">{fmtNum(female)}</b>{' '}
                          នាក់
                        </span>
                      </div>
                    </div>

                    <div className="px-4 py-2.5 bg-[#fafafc] dark:bg-white/[0.03] border-t border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openClassDetail(cls)}
                        className="text-xs font-semibold text-[#0071e3] hover:underline"
                      >
                        មើលបញ្ជីសិស្ស →
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="កែសម្រួលថ្នាក់"
                          aria-label={`កែសម្រួលថ្នាក់ ${cls.name}`}
                          onClick={() => {
                            setClassToEdit(cls);
                            setIsClassModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.05] dark:text-[#98989d] dark:hover:text-white dark:hover:bg-white/[0.08]"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          title="ចម្លងរចនាសម្ព័ន្ធថ្នាក់"
                          aria-label={`ចម្លងថ្នាក់ ${cls.name}`}
                          onClick={() => handleDuplicateClass(cls)}
                          className="p-1.5 rounded-lg text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-black/[0.05] dark:text-[#98989d] dark:hover:text-white dark:hover:bg-white/[0.08]"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          title="លុបថ្នាក់"
                          aria-label={`លុបថ្នាក់ ${cls.name}`}
                          onClick={() => handleRequestDeleteClass(cls)}
                          className="p-1.5 rounded-lg text-[#6e6e73] hover:text-[#ff3b30] hover:bg-red-50 dark:text-[#98989d] dark:hover:text-[#ff453a] dark:hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </AppleCard>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Class Detail View */
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <AppleButton
                variant="secondary"
                size="sm"
                icon={<ArrowLeft size={15} />}
                onClick={() => setViewMode('grid')}
              >
                ថ្នាក់ទាំងអស់
              </AppleButton>

              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: currentClass.color || '#0071e3' }}
                />
                <h1 className="text-lg font-bold text-[#1d1d1f] dark:text-[#f5f5f7] font-moul truncate">
                  ថ្នាក់ទី {currentClass.name}
                </h1>
              </div>

              <div className="hidden sm:flex items-center gap-1.5">
                <AppleBadge variant="blue" size="sm">
                  ប្រុស៖ {fmtNum(maleCount)}
                </AppleBadge>
                <AppleBadge variant="orange" size="sm">
                  ស្រី៖ {fmtNum(femaleCount)}
                </AppleBadge>
                <AppleBadge variant="gray" size="sm">
                  សរុប៖ {fmtNum(classStudents.length)}
                </AppleBadge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AppleButton
                variant="secondary"
                size="sm"
                icon={<FileSpreadsheet size={14} />}
                onClick={() => setIsImportModalOpen(true)}
              >
                នាំចូល Excel
              </AppleButton>
              <AppleButton
                variant="secondary"
                size="sm"
                icon={<Download size={14} />}
                onClick={() => setIsExportOpen(true)}
              >
                នាំចេញ
              </AppleButton>
              <AppleButton
                variant="primary"
                size="sm"
                icon={<Plus size={15} />}
                onClick={() => {
                  setStudentToEdit(null);
                  setIsStudentModalOpen(true);
                }}
              >
                បន្ថែមសិស្ស
              </AppleButton>
            </div>
          </div>

          {/* Mobile counts */}
          <div className="flex sm:hidden items-center gap-2">
            <AppleBadge variant="blue" size="sm">
              ប្រុស៖ {fmtNum(maleCount)}
            </AppleBadge>
            <AppleBadge variant="orange" size="sm">
              ស្រី៖ {fmtNum(femaleCount)}
            </AppleBadge>
            <AppleBadge variant="gray" size="sm">
              សរុប៖ {fmtNum(classStudents.length)}
            </AppleBadge>
          </div>

          {/* Search, status filter, sort */}
          <AppleCard noPadding>
            <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ស្វែងរកឈ្មោះ អត្តលេខ ឬលេខទូរស័ព្ទ..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.06] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="ច្រោះតាមស្ថានភាព"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | StudentStatus)}
                  className="px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.06] dark:border-white/[0.08] focus:outline-none"
                >
                  <option value="all" className="dark:bg-[#1c1c1e]">ស្ថានភាព៖ ទាំងអស់</option>
                  <option value="active" className="dark:bg-[#1c1c1e]">កំពុងរៀន</option>
                  <option value="dropped" className="dark:bg-[#1c1c1e]">បោះបង់</option>
                  <option value="transferred" className="dark:bg-[#1c1c1e]">ផ្ទេរចេញ</option>
                </select>

                <select
                  aria-label="តម្រៀបតាម"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="px-3 py-2 rounded-xl text-xs bg-[#f5f5f7] dark:bg-white/[0.06] text-[#1d1d1f] dark:text-[#f5f5f7] border border-black/[0.06] dark:border-white/[0.08] focus:outline-none"
                >
                  <option value="order" className="dark:bg-[#1c1c1e]">តម្រៀប៖ លេខរៀង (ក–អ)</option>
                  <option value="nameKm" className="dark:bg-[#1c1c1e]">តម្រៀប៖ ឈ្មោះ (ក–អ)</option>
                  <option value="studentId" className="dark:bg-[#1c1c1e]">តម្រៀប៖ អត្តលេខ</option>
                  <option value="gender" className="dark:bg-[#1c1c1e]">តម្រៀប៖ ភេទ</option>
                </select>

                <AppleButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<ArrowDownAZ size={14} />}
                  onClick={async () => {
                    if (!currentClass.id) return;
                    await sortClassStudentsAlphabetically(currentClass.id);
                    setSortBy('order');
                    addToast({
                      type: 'success',
                      title: 'បានតម្រៀបឈ្មោះតាមអក្សរខ្មែរ (ក–អ)',
                    });
                  }}
                >
                  តម្រៀប ក–អ
                </AppleButton>
              </div>
            </div>

            {classStudents.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Users size={30} className="mx-auto text-[#0071e3] opacity-80" />
                <div className="text-sm font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                  មិនទាន់មានសិស្សក្នុងថ្នាក់ទី {currentClass.name} នៅឡើយទេ
                </div>
                <p className="text-xs text-[#86868b]">
                  បន្ថែមសិស្សម្នាក់ៗ ឬនាំចូលពីឯកសារ Excel គំរូ។
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <AppleButton
                    variant="primary"
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={() => {
                      setStudentToEdit(null);
                      setIsStudentModalOpen(true);
                    }}
                  >
                    បន្ថែមសិស្ស
                  </AppleButton>
                  <AppleButton
                    variant="secondary"
                    size="sm"
                    icon={<FileSpreadsheet size={14} />}
                    onClick={() => setIsImportModalOpen(true)}
                  >
                    នាំចូល Excel
                  </AppleButton>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-[#f5f5f7]/80 dark:bg-white/[0.04] text-[#6e6e73] dark:text-[#98989d]">
                    <tr className="text-left border-b border-black/[0.05] dark:border-white/[0.06]">
                      <th className="px-3 py-2.5 font-semibold w-14 text-center">ល.រ</th>
                      <th className="px-2 py-2.5 font-semibold w-12">រូប</th>
                      <th className="px-3 py-2.5 font-semibold">អត្តលេខ</th>
                      <th className="px-3 py-2.5 font-semibold">គោត្តនាម និងនាម</th>
                      <th className="px-3 py-2.5 font-semibold text-center">ភេទ</th>
                      <th className="px-3 py-2.5 font-semibold text-center">ថ្ងៃកំណើត</th>
                      <th className="px-3 py-2.5 font-semibold">ទូរស័ព្ទ</th>
                      <th className="px-3 py-2.5 font-semibold text-center">ស្ថានភាព</th>
                      <th className="px-3 py-2.5 font-semibold text-right">សកម្មភាព</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                    {filteredStudents.map((s) => (
                      <tr
                        key={s.id}
                        className="hover:bg-[#f5f5f7]/60 dark:hover:bg-white/[0.03] transition-colors"
                      >
                        <td className="px-3 py-2 text-center font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                          {fmtNum(s.order)}
                        </td>
                        <td className="px-2 py-2">
                          <StudentPhotoThumb blob={s.photoBlob} name={s.nameKm} />
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-[#6e6e73] dark:text-[#a1a1a6]">
                          {s.studentId}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                            {s.nameKm}
                          </div>
                          {s.nameEn && (
                            <div className="text-[10px] text-[#86868b]">{s.nameEn}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">{s.gender}</td>
                        <td className="px-3 py-2 text-center">
                          {s.dateOfBirth ? fmtNum(s.dateOfBirth) : '—'}
                        </td>
                        <td className="px-3 py-2 text-[#6e6e73] dark:text-[#a1a1a6]">
                          {s.phone || '—'}
                        </td>
                        <td className="px-3 py-2 text-center">{statusLabel(s.status)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title="កែសម្រួល"
                              aria-label={`កែសម្រួល ${s.nameKm}`}
                              onClick={() => {
                                setStudentToEdit(s);
                                setIsStudentModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-[#6e6e73] hover:text-[#0071e3] hover:bg-blue-50 dark:text-[#98989d] dark:hover:bg-blue-500/15"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              title="លុបសិស្ស"
                              aria-label={`លុប ${s.nameKm}`}
                              onClick={() => setStudentToDelete(s)}
                              className="p-1.5 rounded-lg text-[#6e6e73] hover:text-[#ff3b30] hover:bg-red-50 dark:text-[#98989d] dark:hover:bg-red-500/15"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
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

      {/* Modals */}
      <ClassFormModal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        defaultAcademicYear={profile.academicYear}
        classToEdit={classToEdit}
        onSaved={(cid, isNew) => {
          setSelectedClassId(cid);
          addToast({
            type: 'success',
            title: isNew ? 'បានបង្កើតថ្នាក់ថ្មី' : 'បានកែសម្រួលថ្នាក់',
          });
        }}
      />

      {currentClass?.id !== undefined && (
        <>
          <StudentFormModal
            isOpen={isStudentModalOpen}
            onClose={() => setIsStudentModalOpen(false)}
            classId={currentClass.id}
            studentToEdit={studentToEdit}
            onSaved={() => {
              addToast({
                type: 'success',
                title: studentToEdit ? 'បានកែសម្រួលព័ត៌មានសិស្ស' : 'បានបន្ថែមសិស្សថ្មី',
              });
            }}
          />

          <ExcelImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            targetClass={currentClass}
            onImported={(imported, skipped) => {
              addToast({
                type: 'success',
                title: `បាននាំចូលសិស្ស ${fmtNum(imported)} នាក់`,
                message:
                  skipped > 0
                    ? `បានរំលងអត្តលេខស្ទួនចំនួន ${fmtNum(skipped)} នាក់។`
                    : undefined,
              });
            }}
          />
        </>
      )}

      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title="នាំចេញបញ្ជីឈ្មោះសិស្ស"
        classes={classes || []}
        defaultClassId={currentClass?.id ?? selectedClassId}
        onExport={handleExport}
      />

      {/* Delete Class Confirm (shows cascade counts) */}
      <ConfirmDialog
        isOpen={classToDelete !== null}
        onClose={() => {
          setClassToDelete(null);
          setClassCascadeCounts(null);
        }}
        onConfirm={handleConfirmDeleteClass}
        title={`លុបថ្នាក់ទី ${classToDelete?.name || ''}`}
        message={
          classCascadeCounts
            ? `តើអ្នកពិតជាចង់លុបថ្នាក់ទី ${classToDelete?.name} មែនទេ? ទិន្នន័យខាងក្រោមនឹងត្រូវលុបទាំងអស់ក្នុងពេលតែមួយ៖ សិស្ស ${fmtNum(classCascadeCounts.studentsCount)} នាក់, វត្តមាន ${fmtNum(classCascadeCounts.attendanceCount)}, ពិន្ទុប្រចាំខែ ${fmtNum(classCascadeCounts.monthlyScoresCount)}, ប្រឡងឆមាស ${fmtNum(classCascadeCounts.semesterExamsCount)}។`
            : 'តើអ្នកពិតជាចង់លុបថ្នាក់នេះមែនទេ?'
        }
        confirmLabel={isDeletingClass ? 'កំពុងលុប...' : 'លុបថ្នាក់'}
        isLoading={isDeletingClass}
      />

      {/* Delete Student Confirm */}
      <ConfirmDialog
        isOpen={studentToDelete !== null}
        onClose={() => setStudentToDelete(null)}
        onConfirm={handleConfirmDeleteStudent}
        title={`លុបសិស្ស ${studentToDelete?.nameKm || ''}`}
        message={`តើអ្នកពិតជាចង់លុបសិស្ស "${studentToDelete?.nameKm}" (អត្តលេខ ${studentToDelete?.studentId}) មែនទេ? កំណត់ត្រាវត្តមាន និងពិន្ទុរបស់សិស្សនេះនឹងត្រូវលុបផងដែរ ហើយលេខរៀងសិស្សនឹងតម្រៀបឡើងវិញ ១..n។`}
        confirmLabel={isDeletingStudent ? 'កំពុងលុប...' : 'លុបសិស្ស'}
        isLoading={isDeletingStudent}
      />

      {/* Offscreen stage for html-to-image PDF export + print portal */}
      {printPayload && (
        <>
          <div
            ref={pdfStageRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: '-12000px',
              top: 0,
              pointerEvents: 'none',
              zIndex: -1,
            }}
            className="print:hidden"
          >
            <StudentListSheet
              cls={printPayload.cls}
              students={printPayload.students}
              profile={profile}
              useKhmerDigits={useKhmerNumerals}
            />
          </div>

          <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
            <StudentListSheet
              cls={printPayload.cls}
              students={printPayload.students}
              profile={profile}
              useKhmerDigits={useKhmerNumerals}
            />
          </div>
        </>
      )}
    </div>
  );
};
