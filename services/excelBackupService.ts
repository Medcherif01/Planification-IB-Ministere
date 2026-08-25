import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { SUBJECTS, PEI_GRADES } from '../constants';
import type { UnitPlan, ServiceActionPlan, Exam } from '../types';
import type { InterdisciplinaryUnit } from './geminiService';
import type { AppUser, ModificationRequest } from './authService';
import { loadAllPlansForGrade, loadPlansFromDatabase } from './databaseService';
import { listUsers } from './authService';
import { loadExamsFromDatabase } from './examDatabaseService';

// ─────────────────────────────────────────────────────────────────────────────
// Structure des statistiques d'import/export
// ─────────────────────────────────────────────────────────────────────────────
export interface BackupStats {
  units: number;
  interdisciplinary: number;
  sea: number;
  users: number;
  requests: number;
  exams: number;
  criteria: number;
  calendars: number;
  errors: string[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  stats: BackupStats;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT COMPLET EN EXCEL (.XLSX) MULTI-FEUILLES
// ─────────────────────────────────────────────────────────────────────────────
export const exportAllDataToExcel = async (
  onProgress?: (step: string, percent: number) => void
): Promise<Blob> => {
  onProgress?.('Collecte de toutes les données...', 10);

  // ── 1. Collecter tous les plans d'unités (MongoDB + localStorage) ───────────
  const allUnitsMap = new Map<string, UnitPlan>();

  // a) Charger depuis l'API MongoDB
  for (const grade of PEI_GRADES) {
    try {
      const gradePlans = await loadAllPlansForGrade(grade);
      for (const p of gradePlans) {
        const uniqueKey = `${p.subject}_${p.gradeLevel}_${p.title}`.toLowerCase();
        allUnitsMap.set(p.id || uniqueKey, p);
      }
    } catch (e) {
      console.warn(`[Excel Export] Erreur chargement unités pour ${grade}:`, e);
    }
  }

  // b) Compléter avec le localStorage
  for (const grade of PEI_GRADES) {
    for (const subject of SUBJECTS) {
      const localKey = `plans_${subject}_${grade}`;
      const raw = localStorage.getItem(localKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const p of parsed) {
              const uniqueKey = `${p.subject || subject}_${p.gradeLevel || grade}_${p.title}`.toLowerCase();
              const existingId = p.id || uniqueKey;
              if (!allUnitsMap.has(existingId)) {
                allUnitsMap.set(existingId, {
                  ...p,
                  subject: p.subject || subject,
                  gradeLevel: p.gradeLevel || grade,
                });
              }
            }
          }
        } catch (_) {}
      }
    }
  }

  const allUnits = Array.from(allUnitsMap.values());
  onProgress?.('Collecte des unités interdisciplinaires et SEA...', 35);

  // ── 2. Collecter les unités interdisciplinaires ─────────────────────────────
  let allInter: InterdisciplinaryUnit[] = [];
  try {
    const rawInter = localStorage.getItem('interdisciplinary_units');
    if (rawInter) allInter = JSON.parse(rawInter);
  } catch (_) {}

  // ── 3. Collecter les projets Service et Action (SEA) ────────────────────────
  let allSEA: ServiceActionPlan[] = [];
  try {
    const rawSEA = localStorage.getItem('sea_plans');
    if (rawSEA) allSEA = JSON.parse(rawSEA);
  } catch (_) {}

  onProgress?.('Collecte des enseignants et demandes...', 55);

  // ── 4. Collecter les utilisateurs / enseignants ────────────────────────────
  let allUsers: AppUser[] = [];
  try {
    allUsers = await listUsers();
  } catch (_) {
    try {
      const rawUsers = localStorage.getItem('app_users');
      if (rawUsers) allUsers = JSON.parse(rawUsers);
    } catch (_) {}
  }

  // ── 5. Collecter les demandes de modification ──────────────────────────────
  let allRequests: ModificationRequest[] = [];
  try {
    const res = await fetch('/api/modification-requests');
    if (res.ok) allRequests = await res.json();
  } catch (_) {
    try {
      const rawReq = localStorage.getItem('modification_requests');
      if (rawReq) allRequests = JSON.parse(rawReq);
    } catch (_) {}
  }

  onProgress?.('Collecte des examens et critères...', 75);

  // ── 6. Collecter les examens ────────────────────────────────────────────────
  let allExams: Exam[] = [];
  try {
    allExams = await loadExamsFromDatabase();
  } catch (_) {
    try {
      const rawExams = localStorage.getItem('saved_exams');
      if (rawExams) allExams = JSON.parse(rawExams);
    } catch (_) {}
  }

  // ── 7. Collecter les critères personnalisés ─────────────────────────────────
  let allCriteria: any[] = [];
  try {
    const res = await fetch('/api/ib-criteria');
    if (res.ok) allCriteria = await res.json();
  } catch (_) {
    try {
      const rawCrit = localStorage.getItem('custom_ib_criteria');
      if (rawCrit) allCriteria = JSON.parse(rawCrit);
    } catch (_) {}
  }

  // ── 8. Collecter les calendriers annuels ─────────────────────────────────────
  const allCalendars: any[] = [];
  for (const grade of PEI_GRADES) {
    try {
      const calKey = `annual_calendar_${grade}`;
      const rawCal = localStorage.getItem(calKey);
      if (rawCal) {
        const parsed = JSON.parse(rawCal);
        allCalendars.push({
          grade,
          schoolYear: parsed.schoolYear || '2026/2027',
          entriesCount: parsed.entries?.length || 0,
          data: parsed,
        });
      }
    } catch (_) {}
  }

  onProgress?.('Génération du classeur Excel...', 90);

  // ── CRÉATION DU CLASSEUR EXCEL (WORKBOOK) ──────────────────────────────────
  const wb = XLSX.utils.book_new();

  // ── FEUILLE 1 : Plans d'Unités PEI ─────────────────────────────────────────
  const unitsRows = allUnits.map(p => {
    const rawObjectives = Array.isArray(p.objectives) ? p.objectives.join(', ') : (p.objectives || '');
    const rawAtl = Array.isArray(p.atlSkills) ? p.atlSkills.join('\n') : (p.atlSkills || '');
    const rawRelated = Array.isArray(p.relatedConcepts) ? p.relatedConcepts.join(', ') : (p.relatedConcepts || '');
    const factualQ = Array.isArray(p.inquiryQuestions?.factual) ? p.inquiryQuestions.factual.join('\n') : (p.inquiryQuestions?.factual || '');
    const conceptualQ = Array.isArray(p.inquiryQuestions?.conceptual) ? p.inquiryQuestions.conceptual.join('\n') : (p.inquiryQuestions?.conceptual || '');
    const debatableQ = Array.isArray(p.inquiryQuestions?.debatable) ? p.inquiryQuestions.debatable.join('\n') : (p.inquiryQuestions?.debatable || '');

    return {
      'ID_Unité': p.id || '',
      'Titre': p.title || '',
      'Matière': p.subject || '',
      'Niveau_Classe': p.gradeLevel || '',
      'Enseignant': p.teacherName || '',
      'Durée': p.duration || '',
      'Année_Scolaire': p.schoolYear || '2026/2027',
      'Nb_Heures': p.numberOfHours || '',
      'Nb_Périodes': p.numberOfPeriods || '',
      'Date_Début': p.startDate || '',
      'Date_Fin': p.endDate || '',
      'Concept_Clé': p.keyConcept || '',
      'Concepts_Connexes': rawRelated,
      'Contexte_Mondial': p.globalContext || '',
      'Énoncé_de_Recherche': p.statementOfInquiry || '',
      'Questions_Factuelles': factualQ,
      'Questions_Conceptuelles': conceptualQ,
      'Questions_Débat': debatableQ,
      'Objectifs_IB': rawObjectives,
      'Compétences_ATL': rawAtl,
      'Contenu_Notions': p.content || '',
      'Processus_Apprentissage': p.learningExperiences || '',
      'Nb_Séances': p.sessions?.length || 0,
      'Évaluation_Formative': p.formativeAssessment || '',
      'Évaluation_Sommative': p.summativeAssessment || '',
      'Différenciation': p.differentiation || '',
      'Ressources': p.resources || '',
      'Réflexion_Avant': p.reflection?.prior || '',
      'Réflexion_Pendant': p.reflection?.during || '',
      'Réflexion_Après': p.reflection?.after || '',
      'Prérequis': p.prerequisites || '',
      'Score_IB': p.ibComplianceScore || '',
      'Dernière_Mise_à_Jour': p.lastDetailUpdate || new Date().toISOString(),
      '_full_data_json': JSON.stringify(p),
    };
  });

  const wsUnits = XLSX.utils.json_to_sheet(unitsRows);
  wsUnits['!cols'] = [
    { wch: 15 }, { wch: 35 }, { wch: 25 }, { wch: 12 }, { wch: 22 },
    { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 20 }, { wch: 25 }, { wch: 30 }, { wch: 40 },
    { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 30 },
    { wch: 35 }, { wch: 35 }, { wch: 12 }, { wch: 30 }, { wch: 30 },
    { wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
    { wch: 25 }, { wch: 10 }, { wch: 22 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsUnits, 'Unités PEI');

  // ── FEUILLE 2 : Unités Interdisciplinaires ──────────────────────────────────
  const interRows = allInter.map(item => ({
    'ID': item.id || '',
    'Niveau_Classe': item.grade || '',
    'Titre_Thème': item.title || '',
    'Matières_Impliquées': Array.isArray(item.disciplines) ? item.disciplines.join(', ') : '',
    'Enseignants': Array.isArray(item.teachers) ? item.teachers.join(', ') : '',
    'Concept_Clé': item.keyConcept || '',
    'Contexte_Mondial': item.globalContext || '',
    'Énoncé_de_Recherche': item.statementOfInquiry || '',
    'Objectifs_Partagés': Array.isArray(item.sharedObjectives) ? item.sharedObjectives.join('\n') : (item.sharedObjectives || ''),
    'Description_Projet': item.content || item.interdisciplinaryLearningProcess || '',
    'Évaluation_Sommative': item.summativeTask || '',
    'Date_Création': item.createdAt || new Date().toISOString(),
    '_full_data_json': JSON.stringify(item),
  }));

  const wsInter = XLSX.utils.json_to_sheet(interRows);
  wsInter['!cols'] = [
    { wch: 15 }, { wch: 12 }, { wch: 35 }, { wch: 30 }, { wch: 25 },
    { wch: 20 }, { wch: 30 }, { wch: 40 }, { wch: 35 }, { wch: 40 },
    { wch: 35 }, { wch: 22 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsInter, 'Interdisciplinaire');

  // ── FEUILLE 3 : Projets Service et Action (SEA) ────────────────────────────
  const seaRows = allSEA.map(item => ({
    'ID': item.id || '',
    'Niveau_Classe': item.grade || '',
    'Matière': item.subject || '',
    'Enseignant': item.teacherName || '',
    'Titre_Projet': item.title || '',
    'Unité_Source': item.sourceUnitTitle || '',
    'Types_Action': Array.isArray(item.actionTypes) ? item.actionTypes.join(', ') : '',
    'Besoin_Communautaire': item.communityNeed || '',
    'Description': item.projectDescription || '',
    'Objectifs_IB': Array.isArray(item.learningOutcomes) ? item.learningOutcomes.map(o => o.text).join('\n') : '',
    'Compétences_ATL': Array.isArray(item.atlSkills) ? item.atlSkills.join('\n') : '',
    'Critères_Réussite': Array.isArray(item.successCriteria) ? item.successCriteria.map(s => s.description).join('\n') : '',
    'Date_Création': item.createdAt || new Date().toISOString(),
    '_full_data_json': JSON.stringify(item),
  }));

  const wsSEA = XLSX.utils.json_to_sheet(seaRows);
  wsSEA['!cols'] = [
    { wch: 15 }, { wch: 12 }, { wch: 25 }, { wch: 22 }, { wch: 35 },
    { wch: 30 }, { wch: 25 }, { wch: 35 }, { wch: 40 }, { wch: 35 },
    { wch: 30 }, { wch: 35 }, { wch: 22 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSEA, 'Service et Action');

  // ── FEUILLE 4 : Enseignants & Utilisateurs ──────────────────────────────────
  const userRows = allUsers.map((u: any) => ({
    'ID': u.id || '',
    'Nom_Utilisateur': u.username || '',
    'Nom_Complet': u.displayName || '',
    'Rôle': u.role || 'teacher',
    'Matières_Attribuées': Array.isArray(u.subjects) ? u.subjects.join(', ') : (u.subjects || ''),
    'Actif': u.isActive !== false ? 'OUI' : 'NON',
    'Date_Création': u.createdAt || '',
    '_full_data_json': JSON.stringify(u),
  }));

  const wsUsers = XLSX.utils.json_to_sheet(userRows);
  wsUsers['!cols'] = [
    { wch: 15 }, { wch: 22 }, { wch: 25 }, { wch: 12 }, { wch: 40 },
    { wch: 10 }, { wch: 22 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsUsers, 'Enseignants & Utilisateurs');

  // ── FEUILLE 5 : Demandes de Modification ───────────────────────────────────
  const reqRows = allRequests.map((r: any) => ({
    'ID': r.id || '',
    'Nom_Utilisateur': r.teacherUsername || '',
    'Nom_Enseignant': r.teacherDisplayName || '',
    'Matière': r.subject || '',
    'Classe': r.grade || '',
    'Titre_Unité': r.unitTitle || '',
    'Description': r.description || '',
    'Statut': r.status || 'pending',
    'Note_Admin': r.adminNote || '',
    'Date_Création': r.createdAt || '',
    'Date_Mise_à_Jour': r.completedAt || r.approvedAt || '',
  }));

  const wsReq = XLSX.utils.json_to_sheet(reqRows);
  wsReq['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 22 }, { wch: 22 }, { wch: 12 },
    { wch: 30 }, { wch: 40 }, { wch: 12 }, { wch: 30 }, { wch: 22 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsReq, 'Demandes de Modification');

  // ── FEUILLE 6 : Examens & Évaluations ──────────────────────────────────────
  const examRows = allExams.map(ex => ({
    'ID': ex.id || '',
    'Matière': ex.subject || '',
    'Niveau_Classe': ex.grade || '',
    'Semestre': ex.semester || '',
    'Enseignant': ex.teacherName || '',
    'Nom_Classe': ex.className || '',
    'Titre': ex.title || '',
    'Durée': ex.duration || '',
    'Total_Points': ex.totalPoints || '',
    'Difficulté': ex.difficulty || '',
    'Style': ex.style || '',
    'Nb_Questions': ex.questions?.length || 0,
    'Date_Création': ex.createdAt ? new Date(ex.createdAt).toISOString() : '',
    '_full_data_json': JSON.stringify(ex),
  }));

  const wsExams = XLSX.utils.json_to_sheet(examRows);
  wsExams['!cols'] = [
    { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 22 },
    { wch: 15 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsExams, 'Examens & Évaluations');

  // ── FEUILLE 7 : Critères IB Personnalisés ──────────────────────────────────
  const critRows = allCriteria.map((c: any) => ({
    'ID': c.id || c._id || '',
    'Matière': c.subject || '',
    'Niveau': c.grade || '',
    'Critère': c.criterion || '',
    'Nom_Critère': c.criterionName || '',
    'Aspects': Array.isArray(c.strands) ? c.strands.join('\n') : (c.aspects || ''),
    'Dernière_Mise_à_Jour': c.lastUpdated || '',
    '_full_data_json': JSON.stringify(c),
  }));

  const wsCrit = XLSX.utils.json_to_sheet(critRows);
  wsCrit['!cols'] = [
    { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 25 },
    { wch: 40 }, { wch: 22 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCrit, 'Critères IB');

  // ── FEUILLE 8 : Calendriers Annuels ────────────────────────────────────────
  const calRows = allCalendars.map(cal => ({
    'Niveau_Classe': cal.grade || '',
    'Année_Scolaire': cal.schoolYear || '2026/2027',
    'Nb_Entrées': cal.entriesCount || 0,
    '_full_data_json': JSON.stringify(cal.data),
  }));

  const wsCal = XLSX.utils.json_to_sheet(calRows);
  wsCal['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCal, 'Calendriers');

  // ── ÉCRIRE LE FICHIER EXCEL ────────────────────────────────────────────────
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  onProgress?.('Téléchargement du fichier...', 100);
  return blob;
};

// ─────────────────────────────────────────────────────────────────────────────
// TÉLÉCHARGEMENT DIRECT DE LA SAUVEGARDE EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export const downloadCompleteExcelBackup = async (
  onProgress?: (step: string, percent: number) => void
): Promise<void> => {
  try {
    const blob = await exportAllDataToExcel(onProgress);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Sauvegarde_Complete_PEI_AlKawthar_${dateStr}.xlsx`;
    saveAs(blob, fileName);
  } catch (error: any) {
    console.error('Erreur export Excel complet:', error);
    alert(`Erreur lors de l'exportation Excel : ${error?.message || error}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTATION & RESTAURATION COMPLÈTE DEPUIS LE FICHIER EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export const importAllDataFromExcel = async (
  file: File,
  onProgress?: (step: string, percent: number) => void
): Promise<ImportResult> => {
  const stats: BackupStats = {
    units: 0,
    interdisciplinary: 0,
    sea: 0,
    users: 0,
    requests: 0,
    exams: 0,
    criteria: 0,
    calendars: 0,
    errors: [],
  };

  try {
    onProgress?.('Lecture du fichier Excel...', 10);
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    // ── 1. RESTAURER LES UNITÉS PEI ──────────────────────────────────────────
    const unitsSheetName = wb.SheetNames.find(n =>
      /unit[eé]s?|plans?/i.test(n)
    ) || wb.SheetNames[0];

    if (unitsSheetName) {
      onProgress?.('Restauration des unités PEI...', 25);
      const ws = wb.Sheets[unitsSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);

      // Grouper les unités par matière et grade
      const groupedPlans: Record<string, { subject: string; grade: string; plans: UnitPlan[] }> = {};

      for (const row of rawRows) {
        let plan: UnitPlan | null = null;

        // Si le champ JSON complet existe, l'utiliser en priorité
        if (row['_full_data_json'] || row['full_data_json'] || row['json']) {
          try {
            const parsed = JSON.parse(row['_full_data_json'] || row['full_data_json'] || row['json']);
            if (parsed && typeof parsed === 'object' && (parsed.title || parsed.subject)) {
              plan = parsed;
            }
          } catch (_) {}
        }

        // Sinon, reconstruire à partir des colonnes tabulaires
        if (!plan) {
          const title = row['Titre'] || row['titre'] || row['Title'] || row['title'] || '';
          const subject = row['Matière'] || row['Matiere'] || row['matiere'] || row['subject'] || '';
          const gradeLevel = row['Niveau_Classe'] || row['Niveau'] || row['Classe'] || row['grade'] || row['gradeLevel'] || '';

          if (!title || !subject || !gradeLevel) continue;

          plan = {
            id: row['ID_Unité'] || row['id'] || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title,
            subject,
            gradeLevel,
            teacherName: row['Enseignant'] || row['teacher'] || '',
            duration: row['Durée'] || row['duree'] || row['duration'] || '',
            schoolYear: row['Année_Scolaire'] || row['annee'] || '2026/2027',
            numberOfHours: row['Nb_Heures'] || '',
            numberOfPeriods: row['Nb_Périodes'] || '',
            startDate: row['Date_Début'] || '',
            endDate: row['Date_Fin'] || '',
            keyConcept: row['Concept_Clé'] || row['concept_cle'] || '',
            relatedConcepts: (row['Concepts_Connexes'] || '').split(/[,;]/).map((s: string) => s.trim()).filter(Boolean),
            globalContext: row['Contexte_Mondial'] || row['contexte_mondial'] || '',
            statementOfInquiry: row['Énoncé_de_Recherche'] || row['enonce_de_recherche'] || '',
            inquiryQuestions: {
              factual: (row['Questions_Factuelles'] || '').split(/[\n|]/).map((s: string) => s.trim()).filter(Boolean),
              conceptual: (row['Questions_Conceptuelles'] || '').split(/[\n|]/).map((s: string) => s.trim()).filter(Boolean),
              debatable: (row['Questions_Débat'] || '').split(/[\n|]/).map((s: string) => s.trim()).filter(Boolean),
            },
            objectives: (row['Objectifs_IB'] || '').split(/[,;]/).map((s: string) => s.trim()).filter(Boolean),
            atlSkills: (row['Compétences_ATL'] || '').split(/[\n;]/).map((s: string) => s.trim()).filter(Boolean),
            content: row['Contenu_Notions'] || row['contenu'] || '',
            learningExperiences: row['Processus_Apprentissage'] || row['processus'] || '',
            formativeAssessment: row['Évaluation_Formative'] || row['evaluation_formative'] || '',
            summativeAssessment: row['Évaluation_Sommative'] || row['evaluation_sommative'] || '',
            differentiation: row['Différenciation'] || row['differenciation'] || '',
            resources: row['Ressources'] || row['ressources'] || '',
            prerequisites: row['Prérequis'] || '',
            ibComplianceScore: Number(row['Score_IB']) || undefined,
            reflection: {
              prior: row['Réflexion_Avant'] || '',
              during: row['Réflexion_Pendant'] || '',
              after: row['Réflexion_Après'] || '',
            },
            generatedAssessmentDocument: '',
            assessments: [],
          };
        }

        if (plan && plan.subject && plan.gradeLevel) {
          const groupKey = `${plan.subject}_${plan.gradeLevel}`;
          if (!groupedPlans[groupKey]) {
            groupedPlans[groupKey] = {
              subject: plan.subject,
              grade: plan.gradeLevel,
              plans: [],
            };
          }
          groupedPlans[groupKey].plans.push(plan);
          stats.units++;
        }
      }

      // Sauvegarder les groupes de plans vers l'API et le localStorage
      for (const groupKey of Object.keys(groupedPlans)) {
        const { subject, grade, plans } = groupedPlans[groupKey];
        // a) localStorage cache
        try {
          const localKey = `plans_${subject}_${grade}`;
          localStorage.setItem(localKey, JSON.stringify(plans));
        } catch (_) {}

        // b) API MongoDB
        try {
          await fetch('/api/planifications', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User-Role': 'admin',
              'X-Import-Mode': 'restore',
            },
            body: JSON.stringify({ subject, grade, plans }),
          });
        } catch (err: any) {
          stats.errors.push(`Erreur API pour ${subject} - ${grade}: ${err?.message || err}`);
        }
      }
    }

    // ── 2. RESTAURER LES UNITÉS INTERDISCIPLINAIRES ──────────────────────────
    const interSheetName = wb.SheetNames.find(n => /inter/i.test(n));
    if (interSheetName) {
      onProgress?.('Restauration des unités interdisciplinaires...', 45);
      const ws = wb.Sheets[interSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredInter: InterdisciplinaryUnit[] = [];

      for (const row of rawRows) {
        let item: InterdisciplinaryUnit | null = null;
        if (row['_full_data_json']) {
          try { item = JSON.parse(row['_full_data_json']); } catch (_) {}
        }
        if (!item) {
          const themeTitle = row['Titre_Thème'] || row['Titre'] || '';
          const grade = row['Niveau_Classe'] || row['Niveau'] || '';
          if (themeTitle && grade) {
            item = {
              id: row['ID'] || `inter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              grade,
              themeTitle,
              subjects: (row['Matières_Impliquées'] || '').split(/[,;]/).map((s: string) => s.trim()).filter(Boolean),
              teachers: (row['Enseignants'] || '').split(/[,;]/).map((s: string) => s.trim()).filter(Boolean),
              keyConcept: row['Concept_Clé'] || '',
              globalContext: row['Contexte_Mondial'] || '',
              statementOfInquiry: row['Énoncé_de_Recherche'] || '',
              sharedObjectives: (row['Objectifs_Partagés'] || '').split('\n').filter(Boolean),
              projectDescription: row['Description_Projet'] || '',
              summativeAssessment: row['Évaluation_Sommative'] || '',
              createdAt: row['Date_Création'] || new Date().toISOString(),
            } as any;
          }
        }
        if (item) {
          restoredInter.push(item);
          stats.interdisciplinary++;
        }
      }

      if (restoredInter.length > 0) {
        try {
          const existing: InterdisciplinaryUnit[] = JSON.parse(localStorage.getItem('interdisciplinary_units') || '[]');
          const merged = [...existing.filter(e => !restoredInter.some(r => r.id === e.id)), ...restoredInter];
          localStorage.setItem('interdisciplinary_units', JSON.stringify(merged));
        } catch (_) {}
      }
    }

    // ── 3. RESTAURER SERVICE ET ACTION (SEA) ─────────────────────────────────
    const seaSheetName = wb.SheetNames.find(n => /service|sea|action/i.test(n));
    if (seaSheetName) {
      onProgress?.('Restauration des projets Service et Action...', 60);
      const ws = wb.Sheets[seaSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredSEA: ServiceActionPlan[] = [];

      for (const row of rawRows) {
        let item: ServiceActionPlan | null = null;
        if (row['_full_data_json']) {
          try { item = JSON.parse(row['_full_data_json']); } catch (_) {}
        }
        if (!item) {
          const projectTitle = row['Titre_Projet'] || row['Titre'] || '';
          const grade = row['Niveau_Classe'] || row['Niveau'] || '';
          if (projectTitle && grade) {
            item = {
              id: row['ID'] || `sea_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              grade,
              subject: row['Matière'] || '',
              teacherName: row['Enseignant'] || '',
              projectTitle,
              unitTitle: row['Unité_Source'] || '',
              actionTypes: (row['Types_Action'] || '').split(/[,;]/).map((s: string) => s.trim()).filter(Boolean),
              communityNeed: row['Besoin_Communautaire'] || '',
              description: row['Description'] || '',
              learningOutcomes: (row['Objectifs_IB'] || '').split('\n').filter(Boolean),
              atlSkills: (row['Compétences_ATL'] || '').split('\n').filter(Boolean),
              successCriteria: (row['Critères_Réussite'] || '').split('\n').filter(Boolean),
              createdAt: row['Date_Création'] || new Date().toISOString(),
            } as any;
          }
        }
        if (item) {
          restoredSEA.push(item);
          stats.sea++;
        }
      }

      if (restoredSEA.length > 0) {
        try {
          const existing: ServiceActionPlan[] = JSON.parse(localStorage.getItem('sea_plans') || '[]');
          const merged = [...existing.filter(e => !restoredSEA.some(r => r.id === e.id)), ...restoredSEA];
          localStorage.setItem('sea_plans', JSON.stringify(merged));
        } catch (_) {}
      }
    }

    // ── 4. RESTAURER LES ENSEIGNANTS / UTILISATEURS ────────────────────────────
    const usersSheetName = wb.SheetNames.find(n => /enseignants?|utilisateurs?|users?/i.test(n));
    if (usersSheetName) {
      onProgress?.('Restauration des enseignants...', 75);
      const ws = wb.Sheets[usersSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredUsers: AppUser[] = [];

      for (const row of rawRows) {
        let user: AppUser | null = null;
        if (row['_full_data_json']) {
          try { user = JSON.parse(row['_full_data_json']); } catch (_) {}
        }
        if (!user) {
          const username = row['Nom_Utilisateur'] || row['username'] || '';
          const displayName = row['Nom_Complet'] || row['displayName'] || '';
          if (username && displayName) {
            user = {
              id: row['ID'] || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              username,
              displayName,
              role: (row['Rôle'] || row['role'] || 'teacher') as any,
              subjects: (row['Matières_Attribuées'] || row['subjects'] || '').split(/[,;]/).map((s: string) => s.trim()).filter(Boolean),
            };
          }
        }
        if (user) {
          restoredUsers.push(user);
          stats.users++;

          // Tenter la création / mise à jour via l'API
          try {
            await fetch('/api/users', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-User-Role': 'admin',
              },
              body: JSON.stringify({
                action: 'create',
                userData: {
                  username: user.username,
                  displayName: user.displayName,
                  role: user.role,
                  subjects: user.subjects,
                  password: 'ChangeMe2026!', // mot de passe par défaut si nouveau
                },
              }),
            });
          } catch (_) {}
        }
      }

      if (restoredUsers.length > 0) {
        try {
          const existing: AppUser[] = JSON.parse(localStorage.getItem('app_users') || '[]');
          const merged = [...existing.filter(e => !restoredUsers.some(r => r.id === e.id)), ...restoredUsers];
          localStorage.setItem('app_users', JSON.stringify(merged));
        } catch (_) {}
      }
    }

    // ── 5. RESTAURER LES EXAMENS ──────────────────────────────────────────────
    const examSheetName = wb.SheetNames.find(n => /examens?|evaluations?/i.test(n));
    if (examSheetName) {
      onProgress?.('Restauration des examens...', 85);
      const ws = wb.Sheets[examSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredExams: Exam[] = [];

      for (const row of rawRows) {
        let exam: Exam | null = null;
        if (row['_full_data_json']) {
          try { exam = JSON.parse(row['_full_data_json']); } catch (_) {}
        }
        if (exam) {
          restoredExams.push(exam);
          stats.exams++;
          try {
            await fetch('/api/exams', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(exam),
            });
          } catch (_) {}
        }
      }

      if (restoredExams.length > 0) {
        try {
          const existing: Exam[] = JSON.parse(localStorage.getItem('saved_exams') || '[]');
          const merged = [...existing.filter(e => !restoredExams.some(r => r.id === e.id)), ...restoredExams];
          localStorage.setItem('saved_exams', JSON.stringify(merged));
        } catch (_) {}
      }
    }

    // ── 6. RESTAURER LES CALENDRIERS ANNUELS ──────────────────────────────────
    const calSheetName = wb.SheetNames.find(n => /calendriers?/i.test(n));
    if (calSheetName) {
      onProgress?.('Restauration des calendriers...', 92);
      const ws = wb.Sheets[calSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      for (const row of rawRows) {
        const grade = row['Niveau_Classe'] || row['grade'] || '';
        if (grade && row['_full_data_json']) {
          try {
            const data = JSON.parse(row['_full_data_json']);
            localStorage.setItem(`annual_calendar_${grade}`, JSON.stringify(data));
            stats.calendars++;
          } catch (_) {}
        }
      }
    }

    // ── 7. RESTAURER LES CRITÈRES IB ─────────────────────────────────────────
    const critSheetName = wb.SheetNames.find(n => /crit[eè]res?/i.test(n));
    if (critSheetName) {
      const ws = wb.Sheets[critSheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredCrit: any[] = [];
      for (const row of rawRows) {
        if (row['_full_data_json']) {
          try {
            const parsed = JSON.parse(row['_full_data_json']);
            restoredCrit.push(parsed);
            stats.criteria++;
          } catch (_) {}
        }
      }
      if (restoredCrit.length > 0) {
        try {
          localStorage.setItem('custom_ib_criteria', JSON.stringify(restoredCrit));
        } catch (_) {}
      }
    }

    onProgress?.('Restauration terminée avec succès !', 100);

    const totalRestored = stats.units + stats.interdisciplinary + stats.sea + stats.users + stats.exams;
    return {
      success: true,
      message: `Restauration réussie : ${stats.units} unité(s) PEI, ${stats.interdisciplinary} unité(s) inter., ${stats.sea} projet(s) SEA, ${stats.users} enseignant(s), ${stats.exams} examen(s) restaurés.`,
      stats,
    };
  } catch (error: any) {
    console.error('Erreur restauration Excel:', error);
    return {
      success: false,
      message: error?.message || 'Erreur lors de la lecture du fichier Excel.',
      stats,
    };
  }
};
