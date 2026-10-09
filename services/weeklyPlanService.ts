import { WeeklyPlan, WeeklyPlanDay, WeeklyPlanItem, SchoolSection } from '../types';
import { isArabicText } from '../constants';
import { getCurrentUser } from './authService';

const STORAGE_PREFIX = 'alkawthar_weekly_plan_';

// ── Liste des enseignants stricts par section ──────────────────────────────
export const TEACHERS_BY_SECTION: Record<SchoolSection, { name: string; subjects: string[] }[]> = {
  Garçons: [
    { name: 'Majed', subjects: ['الدراسات الإسلامية', 'Individus et sociétés'] },
    { name: 'Mohamed', subjects: ['Mathématiques', 'Maths'] },
    { name: 'Anouar', subjects: ['Design', 'Technologie'] },
    { name: 'Mohamed Ali', subjects: ['Éducation physique et à la santé', 'EPS'] },
    { name: 'Imad', subjects: ['اللغة العربية', 'Langue et littérature'] },
    { name: 'Kenneh', subjects: ['Acquisition de langues', 'Anglais'] },
    { name: 'Karim', subjects: ['Sciences', 'Physique-Chimie'] },
    { name: 'Youssef', subjects: ['Langue et littérature', 'L.L'] },
    { name: 'Tarek', subjects: ['Arts', 'Arts visuels'] },
  ],
  Filles: [
    { name: 'Nesrine', subjects: ['Langue et littérature', 'L.L', 'Français'] },
    { name: 'Samira', subjects: ['Mathématiques', 'Maths'] },
    { name: 'Fatima', subjects: ['الدراسات الإسلامية', 'Éducation islamique'] },
    { name: 'Hajar', subjects: ['اللغة العربية', 'Langue arabe'] },
    { name: 'Amina', subjects: ['Acquisition de langues', 'Anglais'] },
    { name: 'Nour', subjects: ['Sciences', 'SVT'] },
    { name: 'Salma', subjects: ['Design', 'Informatique'] },
    { name: 'Mariam', subjects: ['Éducation physique et à la santé', 'EPS'] },
    { name: 'Leila', subjects: ['Arts', 'Arts visuels'] },
  ],
};

/**
 * Retourne la liste des enseignants autorisés pour une section spécifique
 */
export function getTeachersForSection(section: SchoolSection, subject?: string): string[] {
  const teachers = TEACHERS_BY_SECTION[section] || [];
  if (!subject) return teachers.map(t => t.name);

  const cleanSubj = subject.toLowerCase().trim();
  const matched = teachers.filter(t =>
    t.subjects.some(s => cleanSubj.includes(s.toLowerCase()) || s.toLowerCase().includes(cleanSubj))
  );

  if (matched.length > 0) return matched.map(t => t.name);
  return teachers.map(t => t.name);
}

/**
 * Trouve l'enseignant par défaut pour une matière et une section
 */
export function getDefaultTeacher(section: SchoolSection, subject: string): string {
  const clean = subject.toLowerCase().trim();
  if (section === 'Garçons') {
    if (clean.includes('islam') || clean.includes('إسلام') || clean.includes('دراسات')) return 'Majed';
    if (clean.includes('math')) return 'Mohamed';
    if (clean.includes('design') || clean.includes('informatique')) return 'Anouar';
    if (clean.includes('eps') || clean.includes('sport') || clean.includes('physique')) return 'Mohamed Ali';
    if (clean.includes('arabe') || clean.includes('عربي')) return 'Imad';
    if (clean.includes('anglais') || clean.includes('english') || clean.includes('acquisition')) return 'Kenneh';
    if (clean.includes('l.l') || clean.includes('littérature') || clean.includes('francais')) return 'Youssef';
    if (clean.includes('science')) return 'Karim';
    return 'Mohamed';
  } else {
    // Section Filles
    if (clean.includes('l.l') || clean.includes('littérature') || clean.includes('francais')) return 'Nesrine';
    if (clean.includes('islam') || clean.includes('إسلام') || clean.includes('دراسات')) return 'Fatima';
    if (clean.includes('math')) return 'Samira';
    if (clean.includes('arabe') || clean.includes('عربي')) return 'Hajar';
    if (clean.includes('anglais') || clean.includes('english')) return 'Amina';
    if (clean.includes('design')) return 'Salma';
    if (clean.includes('eps')) return 'Mariam';
    if (clean.includes('science')) return 'Nour';
    return 'Nesrine';
  }
}

/**
 * Modèle type exact conforme au modèle Al Kawthar pour une semaine donnée
 */
export function createDefaultWeeklyPlan(
  section: SchoolSection,
  grade: string,
  weekNumber: number = 7,
  semester: number = 1
): WeeklyPlan {
  const normGrade = grade.includes('Garçons') || grade.includes('Filles')
    ? grade
    : `${grade} ${section}`;

  // Exemple exact Dimanche 11 Octobre 2026 à Jeudi 15 Octobre 2026
  const isGarcons = section === 'Garçons';

  const dimancheItems: WeeklyPlanItem[] = [
    {
      id: 'item_sun_1',
      period: 'P1',
      subject: 'الدراسات الإسلامية',
      teacherName: isGarcons ? 'Majed' : 'Fatima',
      classworkTitle: '',
      classworkDescription: 'القرآن الكريم : حفظ سورة التكوير من آية (19) إلى (21)',
      support: '',
      homework: 'حفظ سورة التكوير من آية (19) إلى (21) ليوم الخميس القادم',
      hasHomework: true,
    },
    {
      id: 'item_sun_2',
      period: 'P2',
      subject: 'Maths',
      teacherName: isGarcons ? 'Mohamed' : 'Samira',
      classworkTitle: 'Tracer une doite perpendiculaire',
      classworkDescription: "Correction des devoirs et faire des exercices d'application",
      support: 'Templin maths page 36',
      homework: "Faire les exercices 15 et 16 page 10 de cahier d'exercices phare maths",
      hasHomework: true,
    },
    {
      id: 'item_sun_3',
      period: 'P3',
      subject: 'Design',
      teacherName: isGarcons ? 'Anouar' : 'Salma',
      classworkTitle: 'Chapitre 2: Microsoft Word',
      classworkDescription: 'Saisir un document sans aucun formatage-',
      support: "Ordinateur Salle d'informatique",
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_sun_4',
      period: 'P4',
      subject: 'EPS',
      teacherName: isGarcons ? 'Mohamed Ali' : 'Mariam',
      classworkTitle: 'Conduite de balle et passes',
      classworkDescription: 'Exercices de passes et de contrôle du ballon.',
      support: '',
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_sun_5',
      period: 'P5',
      subject: 'L.L',
      // Pour les Garçons: STRICTEMENT pas Nesrine! Un enseignant masculin (Youssef).
      // Pour les Filles: Nesrine!
      teacherName: isGarcons ? 'Youssef' : 'Nesrine',
      classworkTitle: 'Unité 1 : Monstres et Merveilles : Contes et Mythes',
      classworkDescription: "Conjugaison : Le passé simple de l'indicatif",
      support: "Support : Grammaire Cahier d'exercices P 80",
      homework: "Faire l'exercice 5, 6 et 7 de la page 81, Grammaire cahier d'exercices",
      hasHomework: true,
    },
    {
      id: 'item_sun_6',
      period: 'P6',
      subject: 'اللغة العربية',
      teacherName: isGarcons ? 'Imad' : 'Hajar',
      classworkTitle: '',
      classworkDescription: 'درس : الهمزة المتطرفة من ص (78 إلى 80)',
      support: '',
      homework: 'نسخ + إملاء الجمل المحددة • حل سؤال رقم (4) ص (82) ليوم الأربعاء',
      hasHomework: true,
    },
    {
      id: 'item_sun_7',
      period: 'P8',
      subject: 'Anglais',
      teacherName: isGarcons ? 'Kenneh' : 'Amina',
      classworkTitle: 'Grammar',
      classworkDescription: 'Present perfect and simple past (Dictée prévue : CB p. 28 "from going to the country")',
      support: 'SB p. 27, WB p. 25',
      homework: '',
      hasHomework: false,
    },
  ];

  // Lundi
  const lundiItems: WeeklyPlanItem[] = [
    {
      id: 'item_mon_1',
      period: 'P1',
      subject: 'Maths',
      teacherName: isGarcons ? 'Mohamed' : 'Samira',
      classworkTitle: 'Propriétés des droites perpendiculaires',
      classworkDescription: "Démonstrations géométriques simples et construction sur cahier",
      support: 'Manuel page 38',
      homework: 'Exercice 18 page 39',
      hasHomework: true,
    },
    {
      id: 'item_mon_2',
      period: 'P2',
      subject: 'Sciences',
      teacherName: isGarcons ? 'Karim' : 'Nour',
      classworkTitle: 'Les mélanges et solutions',
      classworkDescription: 'Expérience en laboratoire : filtration et décantation',
      support: 'Fiche TP n°3',
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_mon_3',
      period: 'P3',
      subject: 'اللغة العربية',
      teacherName: isGarcons ? 'Imad' : 'Hajar',
      classworkTitle: '',
      classworkDescription: 'قراءة نص : من عجائب الطبيعة ص (84)',
      support: 'الكتاب المدرسي ص 84',
      homework: 'قراءة النص بطلاقة والإجابة عن أسئلة الفهم (1-3)',
      hasHomework: true,
    },
    {
      id: 'item_mon_4',
      period: 'P4',
      subject: 'L.L',
      teacherName: isGarcons ? 'Youssef' : 'Nesrine',
      classworkTitle: 'Les créatures légendaires',
      classworkDescription: "Lecture analytique de l'extrait d'Ulysse et le Cyclope",
      support: 'Recueil de contes p. 45',
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_mon_5',
      period: 'P5',
      subject: 'Anglais',
      teacherName: isGarcons ? 'Kenneh' : 'Amina',
      classworkTitle: 'Reading & Vocabulary',
      classworkDescription: 'Unit 3: Exploration adventures - reading comprehension',
      support: 'Student Book p. 30',
      homework: 'Workbook p. 26 exercises 1 to 4',
      hasHomework: true,
    },
    {
      id: 'item_mon_6',
      period: 'P6',
      subject: 'Design',
      teacherName: isGarcons ? 'Anouar' : 'Salma',
      classworkTitle: 'Mise en page de document',
      classworkDescription: 'Application des styles, en-têtes et pieds de page',
      support: 'Fichier exemple sur Teams',
      homework: '',
      hasHomework: false,
    },
  ];

  // Mardi
  const mardiItems: WeeklyPlanItem[] = [
    {
      id: 'item_tue_1',
      period: 'P1',
      subject: 'الدراسات الإسلامية',
      teacherName: isGarcons ? 'Majed' : 'Fatima',
      classworkTitle: '',
      classworkDescription: 'الحديث الشريف : فضل تلاوة القرآن الكريم',
      support: 'كتاب الدراسات ص 32',
      homework: 'حفظ الحديث الشريف مع شرح المعاني',
      hasHomework: true,
    },
    {
      id: 'item_tue_2',
      period: 'P2',
      subject: 'Maths',
      teacherName: isGarcons ? 'Mohamed' : 'Samira',
      classworkTitle: 'Médiatrice d’un segment',
      classworkDescription: 'Propriété caractéristique et tracé au compas',
      support: 'Cahier d’exercices p. 12',
      homework: 'Exercices 5 et 6 p. 13',
      hasHomework: true,
    },
    {
      id: 'item_tue_3',
      period: 'P3',
      subject: 'Individus et sociétés',
      teacherName: isGarcons ? 'Majed' : 'Fatima',
      classworkTitle: 'Les civilisations anciennes',
      classworkDescription: "Étude d'une carte historique de la Mésopotamie",
      support: 'Atlas historique p. 18',
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_tue_4',
      period: 'P4',
      subject: 'Sciences',
      teacherName: isGarcons ? 'Karim' : 'Nour',
      classworkTitle: 'La masse et le volume',
      classworkDescription: "Calculs de masse volumique et mesures à l'éprouvette",
      support: 'Manuel Sciences p. 50',
      homework: 'Exercice 4 p. 52',
      hasHomework: true,
    },
    {
      id: 'item_tue_5',
      period: 'P5',
      subject: 'اللغة العربية',
      teacherName: isGarcons ? 'Imad' : 'Hajar',
      classworkTitle: '',
      classworkDescription: 'قواعد : المبتدأ والخبر وأنواعهما ص (88)',
      support: 'دفتر القواعد ص 40',
      homework: 'إعراب الجمل في التمرين رقم (2) ص (89)',
      hasHomework: true,
    },
  ];

  // Mercredi
  const mercrediItems: WeeklyPlanItem[] = [
    {
      id: 'item_wed_1',
      period: 'P1',
      subject: 'L.L',
      teacherName: isGarcons ? 'Youssef' : 'Nesrine',
      classworkTitle: 'Écriture créative',
      classworkDescription: "Rédaction du portrait d'un monstre mythologique",
      support: 'Grille critère B & D',
      homework: 'Finaliser le premier jet du portrait',
      hasHomework: true,
    },
    {
      id: 'item_wed_2',
      period: 'P2',
      subject: 'Maths',
      teacherName: isGarcons ? 'Mohamed' : 'Samira',
      classworkTitle: 'Évaluation formative',
      classworkDescription: 'Droites perpendiculaires et parallèles',
      support: 'Fiche d’exercices bilan',
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_wed_3',
      period: 'P3',
      subject: 'Anglais',
      teacherName: isGarcons ? 'Kenneh' : 'Amina',
      classworkTitle: 'Listening & Speaking',
      classworkDescription: 'Podcast discussion on renewable energies',
      support: 'Audio Track 14, SB p. 32',
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_wed_4',
      period: 'P4',
      subject: 'Arts',
      teacherName: isGarcons ? 'Tarek' : 'Leila',
      classworkTitle: 'Perspective et ombres',
      classworkDescription: 'Dessin à un point de fuite sur feuille canson',
      support: 'Matériel à dessin personnel',
      homework: 'Terminer la mise en ombre du croquis',
      hasHomework: true,
    },
    {
      id: 'item_wed_5',
      period: 'P5',
      subject: 'EPS',
      teacherName: isGarcons ? 'Mohamed Ali' : 'Mariam',
      classworkTitle: 'Tournoi et jeu dirigé',
      classworkDescription: 'Application des règles d’arbitrage et esprit d’équipe',
      support: 'Terrain de sport',
      homework: '',
      hasHomework: false,
    },
  ];

  // Jeudi
  const jeudiItems: WeeklyPlanItem[] = [
    {
      id: 'item_thu_1',
      period: 'P1',
      subject: 'الدراسات الإسلامية',
      teacherName: isGarcons ? 'Majed' : 'Fatima',
      classworkTitle: '',
      classworkDescription: 'تسميع سورة التكوير ومراجعة التجويد',
      support: 'المصحف الشريف',
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_thu_2',
      period: 'P2',
      subject: 'Sciences',
      teacherName: isGarcons ? 'Karim' : 'Nour',
      classworkTitle: 'Bilan de chapitre',
      classworkDescription: 'Carte mentale récapitulative des états de la matière',
      support: 'Cahier de cours',
      homework: 'Réviser pour le devoir surveillé',
      hasHomework: true,
    },
    {
      id: 'item_thu_3',
      period: 'P3',
      subject: 'اللغة العربية',
      teacherName: isGarcons ? 'Imad' : 'Hajar',
      classworkTitle: '',
      classworkDescription: 'تعبير كتابي : كتابة قصة خيالية قصيرة',
      support: 'ورقة الأنشطة ص 92',
      homework: '',
      hasHomework: false,
    },
    {
      id: 'item_thu_4',
      period: 'P4',
      subject: 'Anglais',
      teacherName: isGarcons ? 'Kenneh' : 'Amina',
      classworkTitle: 'Weekly Quiz & Spelling',
      classworkDescription: 'Dictation test and vocabulary checkpoint',
      support: 'Vocabulary sheet week 7',
      homework: '',
      hasHomework: false,
    },
  ];

  return {
    id: `weekly_${section}_${normGrade.replace(/\s+/g, '_')}_w${weekNumber}_s${semester}`,
    section,
    grade: normGrade,
    weekNumber,
    semester,
    startDate: '2026-10-11',
    endDate: '2026-10-15',
    dateRangeText: 'du Dimanche 11 Octobre 2026 à Jeudi 15 Octobre 2026',
    days: [
      {
        dayNameFr: 'Dimanche',
        dayNameAr: 'الأحد',
        dateFormattedFr: 'Dimanche 11 Octobre 2026',
        items: dimancheItems,
      },
      {
        dayNameFr: 'Lundi',
        dayNameAr: 'الإثنين',
        dateFormattedFr: 'Lundi 12 Octobre 2026',
        items: lundiItems,
      },
      {
        dayNameFr: 'Mardi',
        dayNameAr: 'الثلاثاء',
        dateFormattedFr: 'Mardi 13 Octobre 2026',
        items: mardiItems,
      },
      {
        dayNameFr: 'Mercredi',
        dayNameAr: 'الأربعاء',
        dateFormattedFr: 'Mercredi 14 Octobre 2026',
        items: mercrediItems,
      },
      {
        dayNameFr: 'Jeudi',
        dayNameAr: 'الخميس',
        dateFormattedFr: 'Jeudi 15 Octobre 2026',
        items: jeudiItems,
      },
    ],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Sépare définitivement les sections et assainit tout plan :
 * - Section Garçons : Strictement des enseignants masculins (Youssef, Mohamed, Majed, Anouar, Mohamed Ali, Imad, Kenneh, Karim, Tarek)
 * - Section Filles : Strictement des enseignantes féminines (Nesrine, Samira, Fatima, Hajar, Amina, Nour, Salma, Mariam, Leila)
 * - Remplace automatiquement tout cours ou enseignant de l'autre section qui se serait glissé par erreur
 */
export function sanitizeWeeklyPlanBySection(plan: WeeklyPlan, section: SchoolSection): WeeklyPlan {
  const isGarcons = section === 'Garçons';
  const allowed = (TEACHERS_BY_SECTION[section] || []).map(t => t.name.toLowerCase());
  const otherSection: SchoolSection = isGarcons ? 'Filles' : 'Garçons';
  const forbidden = (TEACHERS_BY_SECTION[otherSection] || []).map(t => t.name.toLowerCase());

  const newDays = (plan.days || []).map(day => ({
    ...day,
    items: (day.items || []).map(item => {
      let tName = (item.teacherName || '').trim();
      const lower = tName.toLowerCase();
      // Si l'enseignant est interdit (appartient à l'autre section) ou inconnu dans la section active
      if (!tName || forbidden.includes(lower) || !allowed.includes(lower)) {
        tName = getDefaultTeacher(section, item.subject);
      }
      return {
        ...item,
        teacherName: tName,
      };
    }),
  }));

  const cleanGrade = plan.grade.replace(/Garçons|Filles/g, '').trim();
  const normGrade = `${cleanGrade} ${section}`;

  return {
    ...plan,
    section,
    grade: normGrade,
    days: newDays,
  };
}

/**
 * Récupère le plan hebdomadaire depuis le stockage avec séparation stricte des sections
 */
export async function loadWeeklyPlan(
  section: SchoolSection,
  grade: string,
  weekNumber: number = 7,
  semester: number = 1
): Promise<WeeklyPlan> {
  const cleanGrade = grade.replace(/Garçons|Filles/g, '').trim() || 'PEI 1';
  const normGrade = `${cleanGrade} ${section}`;

  const key = `${STORAGE_PREFIX}${section}_${normGrade.replace(/\s+/g, '_')}_w${weekNumber}_s${semester}`;

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.days)) {
        // ASSAINISSEMENT OBLIGATOIRE : Éliminer définitivement toute interférence de l'autre section
        const sanitized = sanitizeWeeklyPlanBySection(parsed as WeeklyPlan, section);
        return sanitized;
      }
    }
  } catch (e) {
    console.warn('[WeeklyPlan] Erreur lecture locale:', e);
  }

  // Si aucun plan sauvegardé, générer le modèle type par défaut officiel
  const defaultPlan = createDefaultWeeklyPlan(section, grade, weekNumber, semester);
  saveWeeklyPlan(defaultPlan).catch(() => {});
  return defaultPlan;
}

/**
 * Sauvegarde le plan hebdomadaire après assainissement strict de la section
 */
export async function saveWeeklyPlan(plan: WeeklyPlan): Promise<boolean> {
  const sanitized = sanitizeWeeklyPlanBySection(plan, plan.section);
  const key = `${STORAGE_PREFIX}${sanitized.section}_${sanitized.grade.replace(/\s+/g, '_')}_w${sanitized.weekNumber}_s${sanitized.semester}`;
  const withUpdate: WeeklyPlan = {
    ...sanitized,
    lastUpdated: new Date().toISOString(),
  };

  try {
    localStorage.setItem(key, JSON.stringify(withUpdate));
    window.dispatchEvent(new CustomEvent('weekly_plan_updated', { detail: withUpdate }));
    return true;
  } catch (e) {
    console.error('[WeeklyPlan] Erreur sauvegarde:', e);
    return false;
  }
}
