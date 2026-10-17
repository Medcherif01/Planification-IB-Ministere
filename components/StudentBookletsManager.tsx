import React, { useState, useEffect, useMemo } from 'react';
import {
  StudentBooklet,
  ClassStudent,
  ATLLevel,
} from '../types';
import type { AppUser } from '../services/authService';
import {
  BOOKLET_SUBJECTS,
  SUBJECT_CRITERIA_NAMES,
  ATL_DESCRIPTORS,
  calculateIBFinalGrade,
  createDefaultBooklet,
  fetchBooklets,
  saveBooklet,
  importStudentScoresFromOnlineEvaluations,
  generateBookletObservationWithAI,
  matchBookletSubject,
  updateStudentInBooklets,
} from '../services/studentBookletService';
import { fetchAllStudents, updateStudentProfile, convertGoogleDriveUrl } from '../services/studentRosterService';
import { PEI_GRADES } from '../constants';
import { StudentBookletPrintModal } from './StudentBookletPrintModal';
import {
  Award,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileCheck,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Layers,
  Link2,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Upload,
  User,
  Users,
  Wand2,
  X,
} from 'lucide-react';

interface StudentBookletsManagerProps {
  currentUser?: AppUser | null;
  initialGrade?: string;
  onClose: () => void;
}

export const StudentBookletsManager: React.FC<StudentBookletsManagerProps> = ({
  currentUser,
  initialGrade = 'PEI 4',
  onClose,
}) => {
  const isAdmin = currentUser?.role === 'admin';
  const userSubjects = useMemo(() => {
    if (isAdmin) return Array.from(BOOKLET_SUBJECTS);
    return (currentUser?.subjects || []).map(s => matchBookletSubject(s));
  }, [isAdmin, currentUser]);

  // Selected class, school year, term
  const [selectedGrade, setSelectedGrade] = useState<string>(initialGrade);
  const [schoolYear, setSchoolYear] = useState<string>('2026/2027');
  const [term, setTerm] = useState<string>('Semestre 1');

  // Selected subject for teacher contribution
  const [selectedSubject, setSelectedSubject] = useState<string>(() => {
    if (userSubjects.length > 0) return userSubjects[0];
    return 'Langue et littérature (Français)';
  });

  // Students and booklets state
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [booklets, setBooklets] = useState<Record<string, StudentBooklet>>({});
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string>('');

  // AI observation generation state
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [customAIGuidance, setCustomAIGuidance] = useState<string>('');
  const [showAIOptions, setShowAIOptions] = useState<boolean>(false);

  // Import from electronic evaluations state
  const [isImportingEvals, setIsImportingEvals] = useState<boolean>(false);
  const [importNotice, setImportNotice] = useState<string>('');

  // Print modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [printAllClass, setPrintAllClass] = useState<boolean>(false);

  // Edit student profile modal state (Nom, Date de naissance, Photo Drive)
  const [isEditStudentModalOpen, setIsEditStudentModalOpen] = useState<boolean>(false);
  const [editStudentName, setEditStudentName] = useState<string>('');
  const [editStudentBirthDate, setEditStudentBirthDate] = useState<string>('');
  const [editStudentNumber, setEditStudentNumber] = useState<string>('');
  const [editStudentPhotoUrl, setEditStudentPhotoUrl] = useState<string>('');
  const [editStudentIbLogoUrl, setEditStudentIbLogoUrl] = useState<string>('');
  const [isSavingStudentProfile, setIsSavingStudentProfile] = useState<boolean>(false);
  const [studentEditError, setStudentEditError] = useState<string>('');

  const handleOpenEditStudentModal = (stu: ClassStudent) => {
    const b = booklets[stu.id];
    setEditStudentName(stu.name || b?.studentName || '');
    setEditStudentBirthDate(stu.birthDate || b?.birthDate || '');
    setEditStudentNumber(stu.studentNumber || b?.studentNumber || '');
    setEditStudentPhotoUrl(stu.photoUrl || b?.photoUrl || '');
    setEditStudentIbLogoUrl(b?.ibLogoUrl || '');
    setStudentEditError('');
    setIsEditStudentModalOpen(true);
  };

  const handleSaveStudentProfile = async () => {
    if (!currentStudent) return;
    if (!editStudentName.trim()) {
      setStudentEditError("Le nom de l'élève est obligatoire.");
      return;
    }
    setIsSavingStudentProfile(true);
    setStudentEditError('');
    try {
      const convertedPhoto = convertGoogleDriveUrl(editStudentPhotoUrl);
      const convertedIbLogo = convertGoogleDriveUrl(editStudentIbLogoUrl);

      // 1. Mettre à jour l'élève dans le registre de classe
      const updatedStu = await updateStudentProfile(currentStudent.id, {
        name: editStudentName.trim(),
        birthDate: editStudentBirthDate.trim(),
        studentNumber: editStudentNumber.trim(),
        photoUrl: convertedPhoto,
      });

      if (updatedStu) {
        setStudents(prev => prev.map(s => (s.id === updatedStu.id ? updatedStu : s)));
      }

      // 2. Mettre à jour le livret actif
      if (currentBooklet) {
        const updatedBooklet: StudentBooklet = {
          ...currentBooklet,
          studentName: editStudentName.trim(),
          birthDate: editStudentBirthDate.trim(),
          studentNumber: editStudentNumber.trim(),
          photoUrl: convertedPhoto,
          ibLogoUrl: convertedIbLogo,
          updatedAt: new Date().toISOString(),
        };
        const saved = await saveBooklet(updatedBooklet);
        setBooklets(prev => ({ ...prev, [currentStudent.id]: saved }));
      }

      // 3. Synchroniser tous les livrets de cet élève
      await updateStudentInBooklets(currentStudent.id, {
        name: editStudentName.trim(),
        birthDate: editStudentBirthDate.trim(),
        photoUrl: convertedPhoto,
      });

      setSaveSuccessMsg(`✅ Fiche de "${editStudentName.trim()}" et livret mis à jour avec succès !`);
      setTimeout(() => setSaveSuccessMsg(''), 4000);
      setIsEditStudentModalOpen(false);
    } catch (err: any) {
      setStudentEditError(`Erreur: ${err?.message || err}`);
    } finally {
      setIsSavingStudentProfile(false);
    }
  };

  // Load students and booklets for selected grade, year, and term
  const loadData = async () => {
    setLoading(true);
    try {
      const roster = await fetchAllStudents(selectedGrade);
      setStudents(roster);

      const existingBooklets = await fetchBooklets(selectedGrade, schoolYear, term);
      const bookletsMap: Record<string, StudentBooklet> = {};

      // Match or generate default booklet for every student in the roster
      roster.forEach(stu => {
        const found = existingBooklets.find(
          b => b.studentId === stu.id || (stu.studentNumber && b.studentNumber === stu.studentNumber)
        );
        if (found) {
          bookletsMap[stu.id] = {
            ...found,
            studentName: stu.name || found.studentName,
            birthDate: stu.birthDate !== undefined && stu.birthDate !== '' ? stu.birthDate : found.birthDate,
            photoUrl: stu.photoUrl !== undefined && stu.photoUrl !== '' ? convertGoogleDriveUrl(stu.photoUrl) : convertGoogleDriveUrl(found.photoUrl),
            studentNumber: stu.studentNumber || found.studentNumber,
          };
        } else {
          bookletsMap[stu.id] = createDefaultBooklet(stu, selectedGrade, schoolYear, term);
        }
      });

      // Also include any booklets from server that might not be in local roster
      existingBooklets.forEach(b => {
        if (!bookletsMap[b.studentId]) {
          bookletsMap[b.studentId] = b;
        }
      });

      setBooklets(bookletsMap);

      // Select first student if none selected
      if (roster.length > 0 && !selectedStudentId) {
        setSelectedStudentId(roster[0].id);
      }
    } catch (e) {
      console.error('Erreur chargement livrets:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedGrade, schoolYear, term]);

  // Selected student and booklet
  const currentStudent = students.find(s => s.id === selectedStudentId) || students[0];
  const currentBooklet = currentStudent ? booklets[currentStudent.id] : null;

  // Selected subject report for current booklet
  const currentSubjectReport = currentBooklet?.subjects?.[selectedSubject] || {
    subject: selectedSubject,
    teacherName: currentUser?.displayName || '',
    criteria: {
      A: { name: SUBJECT_CRITERIA_NAMES[selectedSubject]?.A || 'Analyse', t1: null, t2: null, final: null },
      B: { name: SUBJECT_CRITERIA_NAMES[selectedSubject]?.B || 'Organisation', t1: null, t2: null, final: null },
      C: { name: SUBJECT_CRITERIA_NAMES[selectedSubject]?.C || 'Production', t1: null, t2: null, final: null },
      D: { name: SUBJECT_CRITERIA_NAMES[selectedSubject]?.D || 'Utilisation langue', t1: null, t2: null, final: null },
    },
    seuil32: null,
    finalGrade: null,
    observations: '',
  };

  // Selected ATL for current subject
  const currentSubjectATL = currentBooklet?.atlBySubject?.[selectedSubject] || {
    communication: 'A',
    collaboration: 'A',
    autogestion: 'A',
    recherche: 'A',
    reflexion: 'A',
  };

  // Filtered students for sidebar list
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const q = searchTerm.toLowerCase();
    return students.filter(
      s => s.name.toLowerCase().includes(q) || (s.studentNumber && s.studentNumber.toLowerCase().includes(q))
    );
  }, [students, searchTerm]);

  // Handlers for modifying booklet
  const handleUpdateCriteria = (criterion: 'A' | 'B' | 'C' | 'D', field: 't1' | 't2' | 'final', value: string) => {
    if (!currentStudent || !currentBooklet) return;

    const numValue = value === '' ? null : Math.max(0, Math.min(8, Number(value) || 0));

    const updatedCriteria = {
      ...currentSubjectReport.criteria,
      [criterion]: {
        ...currentSubjectReport.criteria[criterion],
        [field]: numValue,
        // Auto-update final if final not manually overridden and t1 is set
        final: field === 'final' ? numValue : (field === 't1' ? numValue : currentSubjectReport.criteria[criterion].final),
      },
    };

    // Recompute sum seuil /32
    const scoreA = updatedCriteria.A.final ?? updatedCriteria.A.t1 ?? 0;
    const scoreB = updatedCriteria.B.final ?? updatedCriteria.B.t1 ?? 0;
    const scoreC = updatedCriteria.C.final ?? updatedCriteria.C.t1 ?? 0;
    const scoreD = updatedCriteria.D.final ?? updatedCriteria.D.t1 ?? 0;
    const totalSeuil = scoreA + scoreB + scoreC + scoreD;
    const finalGrade = calculateIBFinalGrade(totalSeuil);

    const updatedSubjectReport = {
      ...currentSubjectReport,
      teacherName: currentSubjectReport.teacherName || currentUser?.displayName || '',
      criteria: updatedCriteria,
      seuil32: totalSeuil,
      finalGrade,
    };

    const updatedBooklet: StudentBooklet = {
      ...currentBooklet,
      subjects: {
        ...currentBooklet.subjects,
        [selectedSubject]: updatedSubjectReport,
      },
    };

    setBooklets(prev => ({ ...prev, [currentStudent.id]: updatedBooklet }));
  };

  const handleUpdateATL = (skill: keyof typeof currentSubjectATL, value: ATLLevel) => {
    if (!currentStudent || !currentBooklet) return;

    const updatedATL = {
      ...currentSubjectATL,
      [skill]: value,
    };

    const updatedBooklet: StudentBooklet = {
      ...currentBooklet,
      atlBySubject: {
        ...currentBooklet.atlBySubject,
        [selectedSubject]: updatedATL,
      },
    };

    setBooklets(prev => ({ ...prev, [currentStudent.id]: updatedBooklet }));
  };

  const handleUpdateObservation = (text: string) => {
    if (!currentStudent || !currentBooklet) return;

    const updatedSubjectReport = {
      ...currentSubjectReport,
      teacherName: currentSubjectReport.teacherName || currentUser?.displayName || '',
      observations: text,
    };

    const updatedBooklet: StudentBooklet = {
      ...currentBooklet,
      subjects: {
        ...currentBooklet.subjects,
        [selectedSubject]: updatedSubjectReport,
      },
    };

    setBooklets(prev => ({ ...prev, [currentStudent.id]: updatedBooklet }));
  };

  const handleUpdateTeacherName = (name: string) => {
    if (!currentStudent || !currentBooklet) return;

    const updatedSubjectReport = {
      ...currentSubjectReport,
      teacherName: name,
    };

    const updatedBooklet: StudentBooklet = {
      ...currentBooklet,
      subjects: {
        ...currentBooklet.subjects,
        [selectedSubject]: updatedSubjectReport,
      },
    };

    setBooklets(prev => ({ ...prev, [currentStudent.id]: updatedBooklet }));
  };

  // Save current student booklet
  const handleSaveCurrentBooklet = async () => {
    if (!currentStudent || !currentBooklet) return;
    setSaving(true);
    setSaveSuccessMsg('');
    try {
      const saved = await saveBooklet(currentBooklet);
      setBooklets(prev => ({ ...prev, [currentStudent.id]: saved }));
      setSaveSuccessMsg(`✅ Livret de "${currentStudent.name}" enregistré avec succès !`);
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    } catch (e: any) {
      alert(`Erreur de sauvegarde: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  // Import student notes from online evaluations
  const handleImportElectronicScores = async () => {
    if (!currentStudent || !currentBooklet) return;
    setIsImportingEvals(true);
    setImportNotice('');
    try {
      const res = await importStudentScoresFromOnlineEvaluations(
        selectedGrade,
        selectedSubject,
        currentStudent.studentNumber,
        currentStudent.name,
        term
      );

      if (res.evalCount === 0) {
        setImportNotice(
          `Aucune copie notée trouvée pour ${currentStudent.name} dans la matière "${selectedSubject}" (${term}). Saisie manuelle conservée.`
        );
        return;
      }

      // Update criteria (Règle IB : meilleure note par critère parmi les unités du semestre)
      const isSem2 = term.includes('2');
      const newCriteria = { ...currentSubjectReport.criteria };
      if (res.criteria.A !== undefined) {
        newCriteria.A = {
          ...newCriteria.A,
          [isSem2 ? 't2' : 't1']: res.criteria.A,
          final: res.criteria.A,
        };
      }
      if (res.criteria.B !== undefined) {
        newCriteria.B = {
          ...newCriteria.B,
          [isSem2 ? 't2' : 't1']: res.criteria.B,
          final: res.criteria.B,
        };
      }
      if (res.criteria.C !== undefined) {
        newCriteria.C = {
          ...newCriteria.C,
          [isSem2 ? 't2' : 't1']: res.criteria.C,
          final: res.criteria.C,
        };
      }
      if (res.criteria.D !== undefined) {
        newCriteria.D = {
          ...newCriteria.D,
          [isSem2 ? 't2' : 't1']: res.criteria.D,
          final: res.criteria.D,
        };
      }

      const total = res.seuil32;
      const finalGrade = res.finalGrade;

      let observation = currentSubjectReport.observations;
      if (res.extractedComments.length > 0 && !observation) {
        observation = res.extractedComments.join('\n');
      }

      const updatedReport = {
        ...currentSubjectReport,
        criteria: newCriteria,
        seuil32: total,
        finalGrade,
        observations: observation,
        teacherName: currentSubjectReport.teacherName || currentUser?.displayName || '',
      };

      const updatedBooklet: StudentBooklet = {
        ...currentBooklet,
        subjects: {
          ...currentBooklet.subjects,
          [selectedSubject]: updatedReport,
        },
      };

      setBooklets(prev => ({ ...prev, [currentStudent.id]: updatedBooklet }));
      setImportNotice(
        `✅ Notes ${term} importées depuis ${res.evalCount} évaluation(s) ! Règle IB appliquée : la meilleure note par critère parmi les unités a été accordée. Seuil /32 : ${total}, Note finale : ${finalGrade}/8.`
      );
      setTimeout(() => setImportNotice(''), 6000);
    } catch (e: any) {
      alert(`Erreur lors de l'import : ${e?.message || e}`);
    } finally {
      setIsImportingEvals(false);
    }
  };

  // Generate AI observation
  const handleGenerateAIObservation = async () => {
    if (!currentStudent || !currentBooklet) return;
    setIsGeneratingAI(true);
    try {
      const generated = await generateBookletObservationWithAI({
        studentName: currentStudent.name,
        grade: selectedGrade,
        subject: selectedSubject,
        teacherName: currentSubjectReport.teacherName || currentUser?.displayName,
        criteriaScores: {
          A: currentSubjectReport.criteria.A.final ?? currentSubjectReport.criteria.A.t1,
          B: currentSubjectReport.criteria.B.final ?? currentSubjectReport.criteria.B.t1,
          C: currentSubjectReport.criteria.C.final ?? currentSubjectReport.criteria.C.t1,
          D: currentSubjectReport.criteria.D.final ?? currentSubjectReport.criteria.D.t1,
        },
        atlRatings: currentSubjectATL,
        term,
        customGuidance: customAIGuidance,
      });

      handleUpdateObservation(generated);
      setShowAIOptions(false);
    } catch (e: any) {
      alert(`Erreur IA : ${e?.message || e}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // List of all booklets for batch printing
  const allClassBooklets = useMemo(() => {
    return students.map(s => booklets[s.id] || createDefaultBooklet(s, selectedGrade, schoolYear, term));
  }, [students, booklets, selectedGrade, schoolYear, term]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900">
      {/* ── Top Bar ── */}
      <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white shadow-xl px-4 py-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
              title="Retour à l'accueil"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-white p-0.5 overflow-hidden shadow-inner flex items-center justify-center">
              <img src="/logo-alkawtar.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-wide flex items-center gap-2">
                <BookOpen size={18} />
                Livrets Scolaires PEI — {isAdmin ? 'Administration Centrale' : 'Espace Enseignant'}
              </h1>
              <p className="text-xs text-blue-200">
                Al-Kawthar • {selectedGrade} • {term} • {schoolYear}
              </p>
            </div>
          </div>

          {/* Quick Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Class Grade */}
            <div className="flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-lg text-xs font-semibold">
              <span>Classe :</span>
              <select
                value={selectedGrade}
                onChange={e => setSelectedGrade(e.target.value)}
                className="bg-slate-900/40 text-white rounded px-2 py-0.5 outline-none border border-white/20 font-bold"
              >
                {PEI_GRADES.map(g => (
                  <option key={g} value={g} className="bg-slate-800 text-white">
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* School Year */}
            <div className="flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-lg text-xs font-semibold">
              <span>Année :</span>
              <select
                value={schoolYear}
                onChange={e => setSchoolYear(e.target.value)}
                className="bg-slate-900/40 text-white rounded px-2 py-0.5 outline-none border border-white/20 font-bold"
              >
                <option value="2026/2027" className="bg-slate-800 text-white">2026/2027</option>
                <option value="2027/2028" className="bg-slate-800 text-white">2027/2028</option>
              </select>
            </div>

            {/* Semester */}
            <div className="flex items-center gap-1 bg-white/15 px-2.5 py-1 rounded-lg text-xs font-semibold">
              <span>Semestre :</span>
              <select
                value={term}
                onChange={e => setTerm(e.target.value)}
                className="bg-slate-900/40 text-white rounded px-2 py-0.5 outline-none border border-white/20 font-bold"
              >
                <option value="Semestre 1" className="bg-slate-800 text-white">Semestre 1</option>
                <option value="Semestre 2" className="bg-slate-800 text-white">Semestre 2</option>
              </select>
            </div>

            {/* Action buttons: Print preview */}
            <button
              onClick={() => {
                setPrintAllClass(false);
                setIsPrintModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-xs font-bold transition shadow-sm"
              title="Aperçu et impression du livret scolaire officiel de cet élève"
            >
              <Eye size={14} />
              Aperçu PDF Élève
            </button>

            {isAdmin && (
              <button
                onClick={() => {
                  setPrintAllClass(true);
                  setIsPrintModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
                title="Imprimer ou exporter en PDF tous les livrets de la classe en un clic"
              >
                <Printer size={14} />
                Imprimer Toute la Classe
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Layout: Sidebar Students List + Content Form ── */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col md:flex-row gap-4 p-4">
        {/* Left column: Student roster list */}
        <div className="w-full md:w-80 flex-shrink-0 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-120px)] sticky top-20">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Users size={16} className="text-blue-600" />
                Élèves de {selectedGrade}
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-bold">
                  {students.length}
                </span>
              </h2>
              <button
                onClick={loadData}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                title="Actualiser la liste"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Search filter */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un élève..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-slate-50"
              />
            </div>
          </div>

          {/* Student list */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
                Chargement des élèves...
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs p-4">
                Aucun élève trouvé pour {selectedGrade}.
                {isAdmin && <p className="mt-1 text-blue-600">Importez des élèves depuis l'Admin.</p>}
              </div>
            ) : (
              filteredStudents.map((stu, idx) => {
                const isSelected = stu.id === selectedStudentId;
                const b = booklets[stu.id];
                const subReport = b?.subjects?.[selectedSubject];
                const hasScore = subReport && subReport.finalGrade && subReport.finalGrade > 0;

                const photoSrc = convertGoogleDriveUrl(stu.photoUrl || b?.photoUrl);
                return (
                  <button
                    key={stu.id}
                    onClick={() => setSelectedStudentId(stu.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-blue-50 border border-blue-300 text-blue-900 shadow-xs'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-blue-100 border border-slate-200 shrink-0 flex items-center justify-center text-xs font-bold text-blue-800 shadow-2xs">
                        {photoSrc ? (
                          <img
                            src={photoSrc}
                            alt={stu.name}
                            className="w-full h-full object-cover"
                            onError={e => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span>{stu.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-xs truncate">
                          {idx + 1}. {stu.name}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {stu.studentNumber || `Élève #${idx + 1}`}
                          {stu.birthDate && <span className="ml-1 text-[10px] text-slate-400 font-sans">· {stu.birthDate}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      {hasScore ? (
                        <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                          <CheckCircle size={10} />
                          {subReport.finalGrade}/8
                        </span>
                      ) : (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          En attente
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right column: Subject Contribution Editor */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col p-5 md:p-7 space-y-6">
          {currentStudent && currentBooklet ? (
            <>
              {/* Header of selected student */}
              <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative group">
                    <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center text-xl border-2 border-blue-300 shadow-sm overflow-hidden">
                      {convertGoogleDriveUrl(currentStudent.photoUrl || currentBooklet.photoUrl) ? (
                        <img
                          src={convertGoogleDriveUrl(currentStudent.photoUrl || currentBooklet.photoUrl)}
                          alt={currentStudent.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        currentStudent.name.charAt(0)
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditStudentModal(currentStudent)}
                        className="absolute -bottom-1 -right-1 p-1 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow transition"
                        title="Changer la photo (Google Drive)"
                      >
                        <Camera size={12} />
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black text-slate-800">{currentStudent.name}</h2>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleOpenEditStudentModal(currentStudent)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-[11px] font-bold transition shadow-2xs"
                          title="Modifier le nom, date de naissance ou photo Drive de cet élève"
                        >
                          <Edit2 size={12} />
                          Modifier la fiche élève
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Matricule : <span className="font-mono font-bold text-slate-700">{currentStudent.studentNumber || '—'}</span>
                      <span className="mx-1.5 text-slate-300">•</span>
                      Né(e) le : <span className="font-semibold text-slate-700">{currentStudent.birthDate || currentBooklet.birthDate || 'Non renseignée'}</span>
                      <span className="mx-1.5 text-slate-300">•</span>
                      Classe : <span className="font-semibold text-blue-700">{selectedGrade}</span>
                    </p>
                  </div>
                </div>

                {/* Save button */}
                <div className="flex items-center gap-2">
                  {saveSuccessMsg && (
                    <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                      {saveSuccessMsg}
                    </span>
                  )}
                  <button
                    onClick={handleSaveCurrentBooklet}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Enregistrer les contributions
                  </button>
                </div>
              </div>

              {/* Subject Selector Tabs */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                  Matière d'évaluation :
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {BOOKLET_SUBJECTS.map(sub => {
                    const isAllowed = isAdmin || userSubjects.includes(sub);
                    const isSelected = selectedSubject === sub;
                    return (
                      <button
                        key={sub}
                        onClick={() => setSelectedSubject(sub)}
                        disabled={!isAllowed}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-sm'
                            : isAllowed
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                        }`}
                      >
                        {sub}
                        {!isAllowed && <span className="text-[9px]">(Verrouillé)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Section 1 : Critères Initiaux (Compétences Approche de l'Apprentissage) ── */}
              <div className="bg-sky-50/60 border border-sky-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-sm text-[#0f3f63] flex items-center gap-2">
                      <GraduationCap size={18} className="text-sky-600" />
                      Critères Initiaux — Compétences Approches de l'Apprentissage (ATL)
                    </h3>
                    <p className="text-xs text-sky-800 mt-0.5">
                      Chaque enseignant renseigne les compétences ATL de l'élève pour sa matière (E: Excellent, A: Acquis, PA: Partiellement Acquis, I: Insuffisant).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                  {(
                    [
                      ['communication', 'Communication'],
                      ['collaboration', 'Collaboration'],
                      ['autogestion', 'Autogestion'],
                      ['recherche', 'Recherche'],
                      ['reflexion', 'Réflexion'],
                    ] as const
                  ).map(([key, label]) => {
                    const currentVal = currentSubjectATL[key] || 'A';
                    return (
                      <div key={key} className="bg-white p-3 rounded-xl border border-sky-200 shadow-2xs">
                        <label className="block text-xs font-bold text-slate-800 mb-1">{label}</label>
                        <select
                          value={currentVal}
                          onChange={e => handleUpdateATL(key, e.target.value as ATLLevel)}
                          className="w-full text-xs font-bold p-1.5 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-sky-500 bg-slate-50"
                        >
                          <option value="E">E — Excellent</option>
                          <option value="A">A — Acquis</option>
                          <option value="PA">PA — Partiellement Acquis</option>
                          <option value="I">I — Insuffisant</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Section 2 : Notes par Critère IB & Seuil /32 ── */}
              <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                      <Award size={18} className="text-blue-600" />
                      Notes par Critère IB & Note Finale ({selectedSubject})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Saisissez les notes /8 manuellement ou importez-les directement depuis les évaluations électroniques corrigées.
                    </p>
                  </div>

                  {/* Bouton Import Evals */}
                  <button
                    onClick={handleImportElectronicScores}
                    disabled={isImportingEvals}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
                  >
                    {isImportingEvals ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    Importer depuis les Évals en ligne
                  </button>
                </div>

                {importNotice && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs rounded-xl font-medium">
                    {importNotice}
                  </div>
                )}

                {/* Nom de l'enseignant */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                    Enseignant(e) responsable :
                  </label>
                  <input
                    type="text"
                    value={currentSubjectReport.teacherName}
                    onChange={e => handleUpdateTeacherName(e.target.value)}
                    placeholder="Nom et prénom de l'enseignant"
                    className="flex-1 max-w-sm px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Grille des critères A, B, C, D */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse border border-slate-300 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 font-bold text-center border-b border-slate-300">
                        <th className="p-2.5 text-left border-r border-slate-300 w-12">Critère</th>
                        <th className="p-2.5 text-left border-r border-slate-300">Intitulé officiel</th>
                        <th className="p-2.5 border-r border-slate-300 w-28">Trimestre 1 (/8)</th>
                        <th className="p-2.5 border-r border-slate-300 w-28">Trimestre 2 (/8)</th>
                        <th className="p-2.5 border-r border-slate-300 w-28">Niveau Final (/8)</th>
                        <th className="p-2.5 border-r border-slate-300 w-28 bg-blue-50/50">Seuil (/32)</th>
                        <th className="p-2.5 w-24 bg-blue-100 text-blue-900">Note Finale (/8)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['A', 'B', 'C', 'D'] as const).map((critLetter, idx) => {
                        const critData = currentSubjectReport.criteria[critLetter];
                        return (
                          <tr key={critLetter} className="border-b border-slate-200 text-slate-800 text-center">
                            <td className="p-2 border-r border-slate-300 font-bold bg-slate-50">{critLetter}</td>
                            <td className="p-2 border-r border-slate-300 text-left font-medium text-slate-900">
                              {critData.name}
                            </td>
                            <td className="p-2 border-r border-slate-300">
                              <input
                                type="number"
                                min={0}
                                max={8}
                                value={critData.t1 ?? ''}
                                onChange={e => handleUpdateCriteria(critLetter, 't1', e.target.value)}
                                placeholder="—"
                                className="w-16 p-1 text-center font-bold text-xs border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-2 border-r border-slate-300">
                              <input
                                type="number"
                                min={0}
                                max={8}
                                value={critData.t2 ?? ''}
                                onChange={e => handleUpdateCriteria(critLetter, 't2', e.target.value)}
                                placeholder="—"
                                className="w-16 p-1 text-center font-bold text-xs border border-slate-300 rounded outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-2 border-r border-slate-300">
                              <input
                                type="number"
                                min={0}
                                max={8}
                                value={critData.final ?? ''}
                                onChange={e => handleUpdateCriteria(critLetter, 'final', e.target.value)}
                                placeholder="—"
                                className="w-16 p-1 text-center font-bold text-xs border border-blue-400 bg-blue-50/40 rounded outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            {idx === 0 && (
                              <>
                                <td rowSpan={4} className="p-3 border-r border-slate-300 font-black text-xl bg-slate-50 text-slate-800">
                                  {currentSubjectReport.seuil32 ?? 0}
                                  <span className="text-[10px] text-slate-400 block font-normal">sur 32</span>
                                </td>
                                <td rowSpan={4} className="p-3 font-black text-2xl bg-blue-50 text-blue-900">
                                  {currentSubjectReport.finalGrade ?? 0}
                                  <span className="text-[10px] text-blue-600 block font-bold">Niveau IB (1-7/8)</span>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Section 3 : Observations Pédagogiques Narratives ── */}
              <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                      <FileCheck size={18} className="text-indigo-600" />
                      Observations Pédagogiques de l'Enseignant ({selectedSubject})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Commentaire personnalisé, bienveillant et constructif destiné au bulletin officiel des parents.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAIOptions(!showAIOptions)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold rounded-xl shadow-xs hover:from-violet-500 hover:to-indigo-500 transition"
                    >
                      <Wand2 size={14} />
                      ✨ Rédiger avec l'IA Gemini
                    </button>
                  </div>
                </div>

                {/* AI Guidance Box */}
                {showAIOptions && (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-violet-900">
                      Consigne ou orientation particulière pour l'IA (optionnelle) :
                    </p>
                    <input
                      type="text"
                      placeholder="Ex: Encourager davantage l'expression orale, féliciter pour la rigueur des devoirs..."
                      value={customAIGuidance}
                      onChange={e => setCustomAIGuidance(e.target.value)}
                      className="w-full text-xs p-2 border border-violet-300 rounded-lg outline-none bg-white"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleGenerateAIObservation}
                        disabled={isGeneratingAI}
                        className="px-4 py-1.5 bg-violet-700 hover:bg-violet-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition"
                      >
                        {isGeneratingAI ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        Générer l'observation
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  rows={5}
                  value={currentSubjectReport.observations}
                  onChange={e => handleUpdateObservation(e.target.value)}
                  placeholder={`Rédigez ici votre observation pédagogique pour ${currentStudent.name} en ${selectedSubject}...`}
                  className="w-full p-3.5 text-xs sm:text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed font-sans"
                />
              </div>

              {/* Bottom save bar */}
              <div className="pt-2 flex justify-between items-center">
                <button
                  onClick={() => {
                    const currentIdx = filteredStudents.findIndex(s => s.id === selectedStudentId);
                    if (currentIdx > 0) setSelectedStudentId(filteredStudents[currentIdx - 1].id);
                  }}
                  disabled={filteredStudents.findIndex(s => s.id === selectedStudentId) <= 0}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> Élève précédent
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveCurrentBooklet}
                    disabled={saving}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-2"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Enregistrer les contributions
                  </button>
                </div>

                <button
                  onClick={() => {
                    const currentIdx = filteredStudents.findIndex(s => s.id === selectedStudentId);
                    if (currentIdx >= 0 && currentIdx < filteredStudents.length - 1) {
                      setSelectedStudentId(filteredStudents[currentIdx + 1].id);
                    }
                  }}
                  disabled={
                    filteredStudents.findIndex(s => s.id === selectedStudentId) >= filteredStudents.length - 1
                  }
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-1"
                >
                  Élève suivant <ChevronRight size={14} />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-24 text-slate-400">
              <Users size={36} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-semibold">Sélectionnez un élève dans la liste à gauche pour commencer.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Modification Fiche Élève (Nom, Date de naissance, Image Drive) ── */}
      {isEditStudentModalOpen && currentStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-fadeIn">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <User size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    Modifier la fiche élève
                  </h3>
                  <p className="text-xs text-blue-200">
                    {currentStudent.name} • {selectedGrade}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditStudentModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                handleSaveStudentProfile();
              }}
              className="p-6 space-y-4"
            >
              {studentEditError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                  {studentEditError}
                </div>
              )}

              {/* Nom et Prénom */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Nom et Prénom de l'élève *
                </label>
                <input
                  type="text"
                  required
                  value={editStudentName}
                  onChange={e => setEditStudentName(e.target.value)}
                  placeholder="Ex: Adam Benali"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>

              {/* Matricule & Date de naissance */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    N° Matricule / Code
                  </label>
                  <input
                    type="text"
                    value={editStudentNumber}
                    onChange={e => setEditStudentNumber(e.target.value)}
                    placeholder="Ex: PEI4-001"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Date de naissance
                  </label>
                  <input
                    type="text"
                    value={editStudentBirthDate}
                    onChange={e => setEditStudentBirthDate(e.target.value)}
                    placeholder="Ex: 15/12/2012"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Format: JJ/MM/AAAA</span>
                </div>
              </div>

              {/* Photo de l'élève (Lien Google Drive / URL) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1 flex items-center justify-between">
                  <span>Photo de l'élève (Lien Google Drive ou URL)</span>
                  <span className="text-[11px] text-blue-600 font-normal">Lien Drive automatique</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editStudentPhotoUrl}
                    onChange={e => setEditStudentPhotoUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing ou URL d'image"
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <Link2 size={15} className="absolute left-3 top-2.5 text-slate-400" />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Collez le lien de partage Google Drive de la photo.</span>
                  <label className="cursor-pointer text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
                    <Upload size={12} />
                    <span>Photo locale</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = ev => {
                            if (ev.target?.result) {
                              setEditStudentPhotoUrl(ev.target.result as string);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>

                {/* Aperçu direct de l'image */}
                {editStudentPhotoUrl && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                    <div className="w-16 h-20 rounded-lg overflow-hidden border border-slate-300 bg-white shrink-0 flex items-center justify-center shadow-xs">
                      <img
                        src={convertGoogleDriveUrl(editStudentPhotoUrl)}
                        alt="Aperçu photo"
                        className="w-full h-full object-cover"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 flex items-center gap-1 text-emerald-700">
                        <CheckCircle size={13} /> Photo prête pour le livret
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {editStudentPhotoUrl.includes('drive.google.com') ? 'Lien Google Drive converti avec succès' : 'URL image'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditStudentPhotoUrl('')}
                        className="text-[10px] text-rose-600 hover:text-rose-800 font-bold mt-1"
                      >
                        Supprimer la photo
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Option Logo IB World School personnalisé */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Logo IB World School (Optionnel : Lien Google Drive)</span>
                  <span className="text-[10px] text-slate-400">Par défaut : Logo officiel IB</span>
                </label>
                <input
                  type="text"
                  value={editStudentIbLogoUrl}
                  onChange={e => setEditStudentIbLogoUrl(e.target.value)}
                  placeholder="Laissez vide pour utiliser le logo officiel IB ou collez un lien Drive"
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-slate-50"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditStudentModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingStudentProfile}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isSavingStudentProfile ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Enregistrer et Synchroniser le Livret
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Impression / Export PDF ── */}
      <StudentBookletPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        booklets={printAllClass ? allClassBooklets : currentBooklet ? [currentBooklet] : []}
        initialIndex={printAllClass ? Math.max(0, students.findIndex(s => s.id === selectedStudentId)) : 0}
      />
    </div>
  );
};

export default StudentBookletsManager;
