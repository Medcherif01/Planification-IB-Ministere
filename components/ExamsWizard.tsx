import React, { useState } from 'react';
import { Exam, ExamGrade } from '../types';
import { Check, ChevronRight, Loader2, Download, ArrowLeft, FileText, Calendar, BookOpen, User, ClipboardCheck } from 'lucide-react';
import { generateExam } from '../services/examGeminiService';
import { exportExamToWord, exportExamCorrectionToWord } from '../services/examWordExportService';
import { saveExamToDatabase } from '../services/examDatabaseService';

interface ExamsWizardProps {
  onBack: () => void;
}

enum ExamType {
  EXAMEN = 'Examen',
  EVALUATION = 'Évaluation'
}

// Classes PEI et lycée
const EXAM_GRADES: { value: ExamGrade; label: string }[] = [
  { value: ExamGrade.SIXIEME, label: 'PEI1 (6ème)' },
  { value: ExamGrade.CINQUIEME, label: 'PEI2 (5ème)' },
  { value: ExamGrade.QUATRIEME, label: 'PEI3 (4ème)' },
  { value: ExamGrade.TROISIEME, label: 'PEI4 (3ème)' },
  { value: ExamGrade.SECONDE, label: 'PEI5 (Seconde)' },
  { value: ExamGrade.PREMIERE, label: '1ère' },
  { value: ExamGrade.TERMINALE, label: 'Terminale' }
];

// Matières disponibles par niveau (Programme français)
const COLLEGE_SUBJECTS = [
  'Français',
  'Anglais',
  'Mathématiques',
  'SVT',
  'Physique-Chimie',
  'Histoire-Géographie-EMC',
  'Technologie'
];

const LYCEE_SUBJECTS = [
  'Français',
  'Anglais',
  'Mathématiques',
  'SVT',
  'Physique-Chimie',
  'Histoire-Géographie-EMC',
  'Sciences Numériques et Technologiques (SNT)',
  'Sciences Économiques et Sociales (SES)'
];

const getSubjectsForGrade = (grade: ExamGrade): string[] => {
  // Lycée: Seconde, 1ère, Terminale
  if (grade === ExamGrade.SECONDE || grade === ExamGrade.PREMIERE || grade === ExamGrade.TERMINALE) {
    return LYCEE_SUBJECTS;
  }
  // Pour 6ème, exclure Physique-Chimie
  if (grade === ExamGrade.SIXIEME) {
    return COLLEGE_SUBJECTS.filter(s => !s.includes('Physique-Chimie'));
  }
  // Collège: 5ème, 4ème, 3ème
  return COLLEGE_SUBJECTS;
};

const ExamsWizard: React.FC<ExamsWizardProps> = ({ onBack }) => {
  const [step, setStep] = useState(1);
  const [grade, setGrade] = useState<ExamGrade | ''>('');
  const [subject, setSubject] = useState('');
  const [examType, setExamType] = useState<ExamType | ''>('');
  const [semester, setSemester] = useState<'1' | '2' | ''>('');
  const [chapters, setChapters] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [examDate, setExamDate] = useState(''); // Nouvelle date de l'examen
  const [generating, setGenerating] = useState(false);
  const [generatedExam, setGeneratedExam] = useState<Exam | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingCorrection, setExportingCorrection] = useState(false);

  const availableSubjects = grade ? getSubjectsForGrade(grade) : [];

  const handleNext = () => {
    if (step === 1 && !grade) {
      alert('Veuillez sélectionner une classe');
      return;
    }
    if (step === 2 && !subject) {
      alert('Veuillez sélectionner une matière');
      return;
    }
    if (step === 3 && (!examType || !semester)) {
      alert('Veuillez sélectionner le type et le semestre');
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    if (step === 1) {
      onBack();
    } else {
      setStep(step - 1);
    }
  };

  const handleGenerate = async () => {
    if (!grade || !subject || !examType || !semester || !chapters.trim()) {
      alert('Veuillez saisir les chapitres');
      return;
    }

    setGenerating(true);
    try {
      const exam = await generateExam({
        subject,
        grade,
        semester: `Semestre ${semester}` as any,
        chapters,
        teacherName: teacherName || undefined,
        className: grade,
        examType: examType as 'Examen' | 'Évaluation' // NOUVEAU: Passer le type
      });
      
      // CORRECTION: S'assurer que subject et grade sont correctement assignés
      exam.title = `${examType} de ${subject} - ${grade}`;
      exam.subject = subject; // IMPORTANT: Assigner explicitement
      exam.grade = grade; // IMPORTANT: Assigner explicitement
      exam.semester = `Semestre ${semester}` as any;
      exam.teacherName = teacherName || '';
      exam.className = grade;
      exam.date = examDate || ''; // Assigner la date saisie
      
      // NOUVEAU: Sauvegarder automatiquement dans la base de données
      try {
        console.log('💾 Sauvegarde automatique de l\'examen généré...');
        await saveExamToDatabase(exam);
        console.log('✅ Examen sauvegardé automatiquement');
      } catch (saveError) {
        console.error('⚠️ Erreur lors de la sauvegarde automatique (non bloquant):', saveError);
      }
      
      setGeneratedExam(exam);
      setStep(5); // Aller à l'étape de prévisualisation
    } catch (error: any) {
      alert(`Erreur lors de la génération: ${error.message}`);
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    if (!generatedExam) return;

    // LOG de débogage AVANT l'export
    console.log('📤 [EXPORT] Début export - generatedExam.subject =', generatedExam.subject);
    console.log('📤 [EXPORT] Type de subject =', typeof generatedExam.subject);
    console.log('📤 [EXPORT] Examen complet =', JSON.stringify(generatedExam, null, 2));

    setExporting(true);
    try {
      // CORRECTION: Utiliser le template Google Docs exclusivement
      await exportExamToWord(generatedExam);
      alert('✅ Examen exporté avec succès (template Google Docs)!');
    } catch (error: any) {
      alert(`Erreur lors de l'export: ${error.message}`);
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCorrection = async () => {
    if (!generatedExam) return;

    setExportingCorrection(true);
    try {
      // CORRECTION: Utiliser le template Google Docs exclusivement
      await exportExamCorrectionToWord(generatedExam);
      alert('✅ Correction exportée avec succès (template Google Docs)!');
    } catch (error: any) {
      alert(`Erreur lors de l'export de la correction: ${error.message}`);
      console.error(error);
    } finally {
      setExportingCorrection(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setGrade('');
    setSubject('');
    setExamType('');
    setSemester('');
    setChapters('');
    setTeacherName('');
    setExamDate('');
    setGeneratedExam(null);
  };

  // Barre de progression
  const renderProgressBar = () => {
    const steps = ['Classe', 'Matière', 'Type & Semestre', 'Chapitres', 'Prévisualisation'];
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const isActive = step === stepNumber;
            const isCompleted = step > stepNumber;
            
            return (
              <React.Fragment key={stepNumber}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isActive
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isCompleted ? <Check size={20} /> : stepNumber}
                  </div>
                  <span className={`text-xs mt-2 ${isActive ? 'text-violet-600 font-semibold' : 'text-slate-500'}`}>
                    {label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 rounded ${
                      step > stepNumber ? 'bg-green-500' : 'bg-slate-200'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="text-violet-600" size={32} />
              Générateur d'Examens et Évaluations
            </h1>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
            >
              <ArrowLeft size={18} />
              Retour
            </button>
          </div>
          {renderProgressBar()}
        </div>

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Étape 1: Choix de la classe */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-4">Choisissez la classe</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {EXAM_GRADES.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGrade(g.value)}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      grade === g.value
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold">{g.label}</div>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleNext}
                  disabled={!grade}
                  className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                >
                  Suivant
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Étape 2: Choix de la matière */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-4">Choisissez la matière</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableSubjects.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSubject(s)}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      subject === s
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold">{s}</div>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
                >
                  <ArrowLeft size={18} />
                  Précédent
                </button>
                <button
                  onClick={handleNext}
                  disabled={!subject}
                  className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                >
                  Suivant
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Étape 3: Type et Semestre */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-6">Type et Semestre</h2>
              
              <div className="space-y-6">
                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                    <ClipboardCheck size={18} />
                    Type *
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.values(ExamType).map((type) => (
                      <button
                        key={type}
                        onClick={() => setExamType(type)}
                        className={`p-4 border-2 rounded-lg transition-all ${
                          examType === type
                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                            : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-semibold">{type}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Semestre */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                    <Calendar size={18} />
                    Semestre *
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setSemester('1')}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        semester === '1'
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-semibold">Semestre 1</div>
                    </button>
                    <button
                      onClick={() => setSemester('2')}
                      className={`p-4 border-2 rounded-lg transition-all ${
                        semester === '2'
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-semibold">Semestre 2</div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
                >
                  <ArrowLeft size={18} />
                  Précédent
                </button>
                <button
                  onClick={handleNext}
                  disabled={!examType || !semester}
                  className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                >
                  Suivant
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Étape 4: Chapitres */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-6">Chapitres et Informations</h2>
              
              <div className="space-y-6">
                {/* Chapitres */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <BookOpen size={18} />
                    Chapitres / Sujets à couvrir *
                  </label>
                  <textarea
                    value={chapters}
                    onChange={(e) => setChapters(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition min-h-[150px]"
                    placeholder="Ex: Chapitre 1: Les fractions, Chapitre 2: Les équations, Chapitre 3: La géométrie..."
                    required
                  />
                </div>

                {/* Nom de l'enseignant */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <User size={18} />
                    Nom de l'enseignant (optionnel)
                  </label>
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition"
                    placeholder="Nom et prénom de l'enseignant"
                  />
                </div>

                {/* Date de l'examen */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <Calendar size={18} />
                    Date de l'examen / évaluation (optionnel)
                  </label>
                  <input
                    type="text"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition"
                    placeholder="JJ/MM/AAAA (ex: 15/03/2026)"
                  />
                  <p className="text-xs text-slate-500 mt-1">Format: Jour/Mois/Année (ex: 15/03/2026)</p>
                </div>
              </div>

              <div className="mt-8 flex justify-between">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
                >
                  <ArrowLeft size={18} />
                  Précédent
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !chapters.trim()}
                  className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                >
                  {generating ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Génération en cours...
                    </>
                  ) : (
                    <>
                      Générer l'{examType?.toLowerCase() || 'examen'}
                      <FileText size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Étape 5: Prévisualisation */}
          {step === 5 && generatedExam && (
            <div>
              <h2 className="text-xl font-semibold text-slate-800 mb-6">Prévisualisation de l'{examType?.toLowerCase() || 'examen'}</h2>
              
              <div className="space-y-6">
                {/* En-tête */}
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">{generatedExam.title}</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><strong>Classe:</strong> {generatedExam.grade}</div>
                    <div><strong>Durée:</strong> {generatedExam.duration}</div>
                    <div><strong>Enseignant:</strong> {generatedExam.teacherName || '..............................'}</div>
                    <div><strong>Semestre:</strong> {generatedExam.semester}</div>
                    <div><strong>Total:</strong> /{generatedExam.totalPoints} points</div>
                    <div><strong>Difficulté:</strong> {generatedExam.difficulty}</div>
                  </div>
                </div>

                {/* Ressources */}
                {generatedExam.resources && generatedExam.resources.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-3">📚 Ressources</h4>
                    {generatedExam.resources.map((resource, index) => (
                      <div key={index} className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="font-semibold text-blue-800 mb-2">{resource.title}</div>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap">{resource.content}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Questions */}
                <div>
                  <h4 className="font-semibold text-slate-800 mb-3">📝 Questions ({generatedExam.questions.length})</h4>
                  {generatedExam.questions.map((question, index) => (
                    <div key={question.id} className="mb-6 p-5 bg-white rounded-lg border-2 border-slate-200">
                      <div className="flex justify-between items-start mb-3">
                        <div className="font-semibold text-slate-800">
                          Question {index + 1}: {question.title}
                          {question.isDifferentiation && <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">⭐ Différenciation</span>}
                        </div>
                        <span className="text-sm font-semibold text-violet-600">{question.points} pts</span>
                      </div>
                      <div className="text-sm text-slate-600 mb-2">Type: {question.type}</div>
                      <div
                        className="text-slate-700 exam-preview-content"
                        dangerouslySetInnerHTML={{ __html: question.content?.replace(/\n/g, '<br/>') || '' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex justify-between items-center">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
                >
                  Créer un nouvel {examType?.toLowerCase() || 'examen'}
                </button>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleExport}
                    disabled={exporting || exportingCorrection}
                    className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                  >
                    {exporting ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Export en cours...
                      </>
                    ) : (
                      <>
                        <Download size={18} />
                        Télécharger l'examen
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleExportCorrection}
                    disabled={exporting || exportingCorrection}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                  >
                    {exportingCorrection ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Export correction...
                      </>
                    ) : (
                      <>
                        <Download size={18} />
                        Télécharger la correction
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamsWizard;
