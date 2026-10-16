import { StudentBooklet, StudentSubjectReport, StudentATLSkillRatings, ATLLevel, ClassStudent } from '../types';
import { getEvaluations, getSubmissionsForEvaluation } from './onlineEvaluationService';
import { convertGoogleDriveUrl } from './studentRosterService';

export { convertGoogleDriveUrl };

export const BOOKLET_SUBJECTS = [
  'Langue et littérature (Français)',
  'Acquisition de langue (اللغة العربية)',
  'Acquisition de langues (Anglais)',
  'Individus et sociétés',
  'Sciences',
  'Mathématiques',
  'Art visuel',
  'Éducation physique et sportive',
  'Design',
] as const;

export interface SubjectCriteriaMeta {
  A: string;
  B: string;
  C: string;
  D: string;
}

export const SUBJECT_CRITERIA_NAMES: Record<string, SubjectCriteriaMeta> = {
  'Langue et littérature (Français)': {
    A: 'Analyse',
    B: 'Organisation',
    C: 'Production de texte',
    D: 'Utilisation de la langue',
  },
  'Langue et littérature': {
    A: 'Analyse',
    B: 'Organisation',
    C: 'Production de texte',
    D: 'Utilisation de la langue',
  },
  'Acquisition de langue (اللغة العربية)': {
    A: 'الاستماع',
    B: 'القراءة',
    C: 'التحدث',
    D: 'الكتابة',
  },
  'Acquisition de langues (Anglais)': {
    A: 'Listening',
    B: 'Reading',
    C: 'Speaking',
    D: 'Writing',
  },
  'Acquisition de langues': {
    A: 'Listening',
    B: 'Reading',
    C: 'Speaking',
    D: 'Writing',
  },
  'Individus et sociétés': {
    A: 'Connaissances et compréhension',
    B: 'Recherche',
    C: 'Communication',
    D: 'Pensée critique',
  },
  'Sciences': {
    A: 'Connaissances et compréhension',
    B: 'Recherche et élaboration',
    C: 'Traitement et évaluation',
    D: 'Réflexion sur les répercussions',
  },
  'Mathématiques': {
    A: 'Connaissances et compréhension',
    B: 'Recherche de modèles',
    C: 'Communication',
    D: 'Application des mathématiques',
  },
  'Art visuel': {
    A: 'Connaissances et compréhension',
    B: 'Développement des compétences',
    C: 'Pensée créative',
    D: 'Réaction',
  },
  'Arts': {
    A: 'Connaissances et compréhension',
    B: 'Développement des compétences',
    C: 'Pensée créative',
    D: 'Réaction',
  },
  'Éducation physique et sportive': {
    A: 'Connaissances et compréhension',
    B: 'Planification',
    C: 'Application et exécution',
    D: 'Réflexion et amélioration',
  },
  'Éducation physique et à la santé': {
    A: 'Connaissances et compréhension',
    B: 'Planification',
    C: 'Application et exécution',
    D: 'Réflexion et amélioration',
  },
  'Design': {
    A: 'Recherche et analyse',
    B: 'Développement des idées',
    C: 'Création de la solution',
    D: 'Évaluation',
  },
};

export const DEFAULT_SCHOOL_INFO = {
  name: 'LES ÉCOLES INTERNATIONALES AL KAWTHAR',
  address: 'Route du roi Abdul Aziz, quartier AL muhammadiya',
  phone: '+966 50 635 9280',
  website: 'www.alkawthar.edu.sa',
  licenseNumber: '٤ ٣ ٥ ١ ٤ ٤ ۰ ١ ۰ ٧ (4351440107)',
};

export const IB_GRADE_DESCRIPTORS = [
  {
    grade: 7,
    boundary: '28-32',
    descriptor:
      "L’apprenant produit des travaux de haute qualité, souvent innovants. Il communique une compréhension complète de concepts et des contextes. Il fait constamment preuve d'une pensée critique et créative sophistiquée. Souvent, il transfère les connaissances et les compétences avec indépendance et expertise dans une variété de situations réelles et non réels complexes.",
  },
  {
    grade: 6,
    boundary: '24-27',
    descriptor:
      "L’apprenant produit des travaux de haute qualité, parfois novateurs. Il communique une compréhension approfondie des concepts et des contextes. Il fait preuve d'une pensée critique et créative, souvent sophistiquée. Il utilise les connaissances et les compétences dans des situations réelles et non réelles familières et inconnues, souvent en toute indépendance.",
  },
  {
    grade: 5,
    boundary: '19-23',
    descriptor:
      "L’apprenant produit généralement un travail de haute qualité. Il communique une bonne compréhension des concepts et des contextes. Il fait preuve d'une pensée critique et créative, parfois avec sophistication. Il utilise les connaissances et les compétences dans des situations réelles et non réelles familières et, avec le soutien, dans certaines situations réelles inconnues.",
  },
  {
    grade: 4,
    boundary: '15-18',
    descriptor:
      "L’apprenant produit un travail de qualité. Il communique une compréhension de base de la plupart des concepts et des contextes avec peu d’incompréhensions et des lacunes mineures. Il fait souvent preuve d'une pensée critique et créative fondamentale. Il utilise les connaissances et les compétences avec une certaine souplesse dans des situations en classe familières, mais nécessite un soutien dans des situations inconnues.",
  },
  {
    grade: 3,
    boundary: '10-14',
    descriptor:
      "L’apprenant produit un travail de qualité acceptable. Il communique une compréhension de base de nombreux concepts et contextes, avec parfois des incompréhensions ou des lacunes importantes. Il commence à démontrer quelques pensées critiques et créatives de base. Il est souvent inflexible dans l’utilisation des connaissances et des compétences, nécessitant un soutien même dans des situations de classe familières.",
  },
  {
    grade: 2,
    boundary: '6-9',
    descriptor:
      "L’apprenant produit des travaux de qualité limitée. Il exprime des incompréhensions ou des lacunes importantes dans la compréhension de nombreux concepts et contextes. Il fait rarement preuve de pensée critique ou créative. Généralement, il est inflexible dans l'utilisation des connaissances et des compétences et les applique rarement.",
  },
  {
    grade: 1,
    boundary: '0-5',
    descriptor:
      "L’apprenant produit des travaux de qualité très limitée. Il transmet de nombreux incompréhensions ou manques de compréhension de la plupart des concepts et des contextes. Il démontre très rarement une pensée critique ou créative. Il est très inflexible, utilisant rarement les connaissances ou les compétences.",
  },
];

export const ATL_DESCRIPTORS: { code: ATLLevel; label: string; description: string }[] = [
  { code: 'E', label: 'Excellent', description: "Les progrès de l’apprenant par rapport à l’ATL dépassent les attentes." },
  { code: 'A', label: 'Acquis', description: "Les progrès de l’apprenant par rapport à l’ATL répondent aux attentes." },
  { code: 'PA', label: 'Partiellement Acquis', description: "Les progrès de l’apprenant par rapport à l’ATL se rapprochent des attentes." },
  { code: 'I', label: 'Insuffisant', description: "Les progrès de l’apprenant par rapport à l’ATL sont inférieurs aux attentes." },
];

/**
 * Calcule la note finale IB (1 à 7) à partir du seuil total sur 32
 */
export function calculateIBFinalGrade(totalOutOf32: number | null | undefined): number {
  if (totalOutOf32 === null || totalOutOf32 === undefined || isNaN(totalOutOf32)) return 0;
  const score = Math.round(totalOutOf32);
  if (score >= 28) return 7;
  if (score >= 24) return 6;
  if (score >= 19) return 5;
  if (score >= 15) return 4;
  if (score >= 10) return 3;
  if (score >= 6) return 2;
  return score > 0 ? 1 : 0;
}

const LOCAL_STORAGE_KEY = 'alkawthar_student_booklets_v1';

function loadLocalBooklets(): Record<string, StudentBooklet> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalBooklets(store: Record<string, StudentBooklet>): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn('Erreur sauvegarde localStorage livrets:', e);
  }
}

/**
 * Normalise le nom de la matière vers le standard du livret scolaire
 */
export function matchBookletSubject(subjectName: string): string {
  const norm = subjectName.trim().toLowerCase();
  if (norm.includes('langue et litt') || norm === 'français' || norm === 'francais') {
    return 'Langue et littérature (Français)';
  }
  if (norm.includes('arabe') || norm.includes('arab') || norm.includes('عربي')) {
    return 'Acquisition de langue (اللغة العربية)';
  }
  if (norm.includes('anglais') || norm.includes('english') || norm.includes('langue anglaise')) {
    return 'Acquisition de langues (Anglais)';
  }
  if (norm.includes('individu') || norm.includes('société') || norm.includes('histoire') || norm.includes('géo')) {
    return 'Individus et sociétés';
  }
  if (norm.includes('science') || norm.includes('physique') || norm.includes('chimie') || norm.includes('svt') || norm.includes('biologie')) {
    return 'Sciences';
  }
  if (norm.includes('math')) {
    return 'Mathématiques';
  }
  if (norm.includes('art') || norm.includes('dessin') || norm.includes('visuel')) {
    return 'Art visuel';
  }
  if (norm.includes('sport') || norm.includes('eps') || norm.includes('physique et sportive') || norm.includes('santé')) {
    return 'Éducation physique et sportive';
  }
  if (norm.includes('design') || norm.includes('techno') || norm.includes('ingénierie')) {
    return 'Design';
  }
  return subjectName.trim();
}

/**
 * Crée un livret d'élève vide et pré-rempli pour la classe et le trimestre
 */
export function createDefaultBooklet(
  student: ClassStudent,
  grade: string,
  schoolYear: string = '2025/2026',
  term: string = '1er trimestre',
  defaultTeachers: Record<string, string> = {}
): StudentBooklet {
  const normGrade = grade.trim();
  const id = `booklet_${normGrade.replace(/\s+/g, '')}_${schoolYear.replace(/\//g, '_')}_${term.replace(/\s+/g, '')}_${student.id}`;

  const defaultAtl: Record<string, StudentATLSkillRatings> = {};
  const defaultSubjects: Record<string, StudentSubjectReport> = {};

  BOOKLET_SUBJECTS.forEach(sub => {
    defaultAtl[sub] = {
      communication: 'A',
      collaboration: 'A',
      autogestion: 'A',
      recherche: 'A',
      reflexion: 'A',
    };

    const criteriaMeta = SUBJECT_CRITERIA_NAMES[sub] || {
      A: 'Connaissances et compréhension',
      B: 'Recherche et développement',
      C: 'Communication',
      D: 'Pensée critique',
    };

    defaultSubjects[sub] = {
      subject: sub,
      teacherName: defaultTeachers[sub] || '',
      criteria: {
        A: { name: criteriaMeta.A, t1: null, t2: null, final: null },
        B: { name: criteriaMeta.B, t1: null, t2: null, final: null },
        C: { name: criteriaMeta.C, t1: null, t2: null, final: null },
        D: { name: criteriaMeta.D, t1: null, t2: null, final: null },
      },
      seuil32: null,
      finalGrade: null,
      observations: '',
    };
  });

  return {
    id,
    grade: normGrade,
    schoolYear,
    term,
    studentId: student.id,
    studentName: student.name,
    studentNumber: student.studentNumber,
    birthDate: student.birthDate || '',
    photoUrl: convertGoogleDriveUrl(student.photoUrl || ''),
    licenseNumber: DEFAULT_SCHOOL_INFO.licenseNumber,
    schoolName: DEFAULT_SCHOOL_INFO.name,
    schoolAddress: DEFAULT_SCHOOL_INFO.address,
    schoolPhone: DEFAULT_SCHOOL_INFO.phone,
    schoolWebsite: DEFAULT_SCHOOL_INFO.website,
    directorSignature: '',
    parentSignature: '',
    directorComment: '',
    parentComment: '',
    atlBySubject: defaultAtl,
    subjects: defaultSubjects,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Met à jour les informations de l'élève (nom, date de naissance, photo Drive)
 * dans tous les livrets scolaires existants de cet élève
 */
export async function updateStudentInBooklets(
  studentId: string,
  updates: { name?: string; birthDate?: string; photoUrl?: string }
): Promise<void> {
  const store = loadLocalBooklets();
  let modified = false;

  for (const b of Object.values(store)) {
    if (b.studentId === studentId) {
      if (updates.name !== undefined) b.studentName = updates.name.trim();
      if (updates.birthDate !== undefined) b.birthDate = updates.birthDate.trim();
      if (updates.photoUrl !== undefined) b.photoUrl = convertGoogleDriveUrl(updates.photoUrl);
      b.updatedAt = new Date().toISOString();
      modified = true;
      try {
        await saveBooklet(b);
      } catch (e) {
        console.warn('Erreur synchro livret après mise à jour élève:', e);
      }
    }
  }

  if (modified) {
    saveLocalBooklets(store);
  }
}

/**
 * Récupère tous les livrets d'une classe pour une année et un trimestre
 */
export async function fetchBooklets(
  grade: string,
  schoolYear: string = '2025/2026',
  term: string = '1er trimestre'
): Promise<StudentBooklet[]> {
  const normGrade = grade.trim();
  const localStore = loadLocalBooklets();
  const localList = Object.values(localStore).filter(
    b => b.grade?.toLowerCase() === normGrade.toLowerCase() &&
         b.schoolYear === schoolYear &&
         b.term === term
  );

  try {
    const url = `/api/student-booklets?grade=${encodeURIComponent(normGrade)}&schoolYear=${encodeURIComponent(schoolYear)}&term=${encodeURIComponent(term)}`;
    const res = await fetch(url);
    if (res.ok) {
      const serverList: StudentBooklet[] = await res.json();
      if (Array.isArray(serverList) && serverList.length > 0) {
        // Sync to local
        serverList.forEach(b => {
          if (b && b.id) localStore[b.id] = b;
        });
        saveLocalBooklets(localStore);
        return serverList;
      }
    }
  } catch (err) {
    console.warn('API livrets indisponible, utilisation du cache local:', err);
  }

  return localList;
}

/**
 * Sauvegarde un livret d'élève
 */
export async function saveBooklet(booklet: StudentBooklet): Promise<StudentBooklet> {
  const updated: StudentBooklet = {
    ...booklet,
    updatedAt: new Date().toISOString(),
  };

  // Local sync first
  const localStore = loadLocalBooklets();
  localStore[updated.id] = updated;
  saveLocalBooklets(localStore);

  // Server sync
  try {
    const res = await fetch('/api/student-booklets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.booklet) return data.booklet;
    }
  } catch (err) {
    console.warn('Erreur synchronisation serveur livret:', err);
  }

  return updated;
}

/**
 * Importe automatiquement les notes obtenues par un élève lors des évaluations électroniques
 */
export async function importStudentScoresFromOnlineEvaluations(
  grade: string,
  subject: string,
  studentNumber: string,
  studentName: string
): Promise<{
  criteria: { A?: number; B?: number; C?: number; D?: number };
  seuil32: number;
  finalGrade: number;
  extractedComments: string[];
  evalCount: number;
}> {
  const allEvals = await getEvaluations();
  const normGrade = grade.trim().toLowerCase();
  const targetSubject = matchBookletSubject(subject);

  // Filtrer les évaluations correspondantes
  const matchedEvals = allEvals.filter(ev => {
    const evGrade = (ev.grade || '').trim().toLowerCase();
    const evSub = matchBookletSubject(ev.subject || '');
    return evGrade === normGrade && evSub === targetSubject;
  });

  const criteriaScoresAccumulator: Record<'A' | 'B' | 'C' | 'D', number[]> = {
    A: [],
    B: [],
    C: [],
    D: [],
  };
  const comments: string[] = [];
  let matchingSubmissionsCount = 0;

  for (const ev of matchedEvals) {
    try {
      const subs = await getSubmissionsForEvaluation(ev.id);
      const studentSub = subs.find(s => {
        const matMatch = studentNumber && s.studentNumber && s.studentNumber.trim().toUpperCase() === studentNumber.trim().toUpperCase();
        const nameMatch = studentName && s.studentName && s.studentName.trim().toLowerCase() === studentName.trim().toLowerCase();
        return matMatch || nameMatch;
      });

      if (studentSub) {
        matchingSubmissionsCount++;
        // Extraire notes par critère
        if (studentSub.criteriaScores) {
          (['A', 'B', 'C', 'D'] as const).forEach(crit => {
            const sc = studentSub.criteriaScores?.[crit];
            if (typeof sc === 'number' && !isNaN(sc) && sc > 0) {
              criteriaScoresAccumulator[crit].push(sc);
            }
          });
        }

        // Commentaires éventuels
        if (studentSub.overallFeedback && studentSub.overallFeedback.trim()) {
          comments.push(studentSub.overallFeedback.trim());
        }
      }
    } catch {}
  }

  const computedCriteria: { A?: number; B?: number; C?: number; D?: number } = {};
  (['A', 'B', 'C', 'D'] as const).forEach(crit => {
    const list = criteriaScoresAccumulator[crit];
    if (list.length > 0) {
      // Dernière note ou moyenne arrondie
      const avg = Math.round(list.reduce((s, v) => s + v, 0) / list.length);
      computedCriteria[crit] = Math.min(8, Math.max(1, avg));
    }
  });

  const total = (computedCriteria.A || 0) + (computedCriteria.B || 0) + (computedCriteria.C || 0) + (computedCriteria.D || 0);
  const finalGrade = calculateIBFinalGrade(total);

  return {
    criteria: computedCriteria,
    seuil32: total,
    finalGrade,
    extractedComments: comments,
    evalCount: matchingSubmissionsCount,
  };
}

/**
 * Génère une observation officielle pour le livret scolaire avec l'IA Gemini
 */
export async function generateBookletObservationWithAI(params: {
  studentName: string;
  grade: string;
  subject: string;
  teacherName?: string;
  criteriaScores: { A?: number | null; B?: number | null; C?: number | null; D?: number | null };
  atlRatings?: StudentATLSkillRatings;
  term?: string;
  customGuidance?: string;
}): Promise<string> {
  const { studentName, grade, subject, teacherName, criteriaScores, atlRatings, term, customGuidance } = params;

  const isArabic = subject.includes('العربية') || subject.includes('Arabe');
  const isEnglish = subject.includes('Anglais') || subject.includes('English');

  let prompt = '';
  let systemInstruction = '';

  if (isArabic) {
    systemInstruction = `أنت أستاذ خبير في برنامج السنوات المتوسطة (MYP) للبكالوريا الدولية (IB).
اكتب ملاحظة تقييمية وتربوية رسمية وشخصية لدفتر الدرجات المدرسي (Livret Scolaire PEI) للتلميذ ${studentName}.
الشروط الإلزامية:
1. الكتابة باللغة العربية الفصحى الأنيقة والمهنية (أسلوب التقرير المدرسي الرسمي للبكالوريا الدولية).
2. إبراز نقاط القوة ومستوى التحكم في معايير المادة الأربعة (الاستماع، القراءة، التحدث، الكتابة) ومهارات التعلم (ATL).
3. تقديم نصائح تشجيعية وتوجيهية لتحقيق المزيد من التقدم في الفصل القادم.
4. عدم تكرار الدرجات بالأرقام بشكل جاف، بل تحويلها إلى تقييم نوعي راقٍ وبناء (حوالي 4 إلى 6 أسطر).
5. عدم استخدام علامات التنسيق بالنجوم (markdown asterisks) أو الأقواس الغريبة.`;

    prompt = `التلميذ: ${studentName}
الصف: ${grade}
المادة: ${subject}
الفصل: ${term || 'الفصل الأول'}
الأستاذ: ${teacherName || ''}
درجات المعايير (من 8): الاستماع=${criteriaScores.A ?? 'جيد'}، القراءة=${criteriaScores.B ?? 'جيد'}، التحدث=${criteriaScores.C ?? 'جيد'}، الكتابة=${criteriaScores.D ?? 'جيد'}.
${customGuidance ? `توجيه خاص من الأستاذ: ${customGuidance}` : ''}`;
  } else if (isEnglish) {
    systemInstruction = `You are an expert International Baccalaureate (IB) Middle Years Programme (MYP) educator.
Write a formal, comprehensive, encouraging, and personalized narrative observation for the official IB MYP Student Report Card (Livret Scolaire) for ${studentName}.
CRITICAL MANDATORY RULES:
1. Write 100% in professional English.
2. Synthesize student performance across the 4 IB criteria (Listening, Reading, Speaking, Writing) and ATL skills (Communication, Self-management, Collaboration, Research, Thinking).
3. Balance praise for strengths, active engagement in class, analytical progress, with constructive guidance for continued excellence.
4. Keep the text between 4 and 7 lines of fluent, elegant prose (no bullet points, no markdown asterisks).`;

    prompt = `Student: ${studentName}
Class: ${grade}
Subject: ${subject}
Term: ${term || 'Term 1'}
Teacher: ${teacherName || ''}
Criteria scores (out of 8): Criterion A=${criteriaScores.A ?? 7}, Criterion B=${criteriaScores.B ?? 7}, Criterion C=${criteriaScores.C ?? 7}, Criterion D=${criteriaScores.D ?? 7}.
${atlRatings ? `ATL Skills: Communication=${atlRatings.communication}, Collaboration=${atlRatings.collaboration}, Self-management=${atlRatings.autogestion}` : ''}
${customGuidance ? `Teacher Note: ${customGuidance}` : ''}`;
  } else {
    systemInstruction = `Tu es un enseignant expert du Programme d'Éducation Intermédiaire (PEI) du Baccalauréat International (IB).
Rédige une observation pédagogique officielle, personnalisée, constructive et bienveillante pour le livret scolaire (bulletin officiel IB) de l'élève ${studentName} dans la matière "${subject}".
RÈGLES IMPÉRATIVES :
1. Rédiger en français soutenu et élégant (style bulletin officiel IB d'excellence).
2. Analyser les progrès de l'élève par rapport aux 4 critères IB de la matière et aux compétences d'approche de l'apprentissage (ATL : communication, recherche, pensée, autogestion, collaboration).
3. Mettre en valeur l'attitude de chercheur, la rigueur, la participation et donner un conseil précis pour le prochain trimestre.
4. Longueur : 4 à 6 phrases fluides (environ 60 à 90 mots), sans puces, sans astérisques markdown ni listes de notes brutes.`;

    prompt = `Élève : ${studentName}
Classe : ${grade}
Matière : ${subject}
Période : ${term || '1er trimestre'}
Enseignant(e) : ${teacherName || ''}
Notes critères (/8) : Critère A=${criteriaScores.A ?? 7}, Critère B=${criteriaScores.B ?? 7}, Critère C=${criteriaScores.C ?? 7}, Critère D=${criteriaScores.D ?? 7}.
${atlRatings ? `Compétences ATL : Communication=${atlRatings.communication}, Collaboration=${atlRatings.collaboration}, Autogestion=${atlRatings.autogestion}, Recherche=${atlRatings.recherche}, Réflexion=${atlRatings.reflexion}` : ''}
${customGuidance ? `Consigne particulière de l'enseignant : ${customGuidance}` : ''}`;
  }

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: prompt,
      systemInstruction,
      generationConfig: {
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || `Erreur génération commentaire IA (${res.status})`);
  }

  const data = await res.json();
  const rawText: string = data.text || '';
  // Clean markdown asterisks and leading/trailing quotes
  return rawText.replace(/\*\*/g, '').replace(/^["']|["']$/g, '').trim();
}
