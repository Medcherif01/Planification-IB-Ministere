import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import FileSaver from "file-saver";
import JSZip from "jszip";
import {
  Document as DocxDocument,
  Paragraph,
  TextRun,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageOrientation,
  ShadingType,
  HeadingLevel,
  Packer,
} from "docx";
import { UnitPlan, AssessmentData, ServiceActionPlan } from "../types";
import { loadAllPlansForGrade, loadAllPlansForSubjectAllGrades } from "./databaseService";
import { generateOverviewForSubject, OverviewUnitRow, InterdisciplinaryUnit, AnnualCalendar, SCHOOL_WEEKS_2026_2027, SUBJECT_COLORS, CalendarEntry } from "./geminiService";

// Cache en mémoire des modèles Word téléchargés pour un export ultra-rapide
const templateCache: Record<string, ArrayBuffer> = {};

// ─────────────────────────────────────────────────────────────────────────────
// Chargement des templates Word via l'API backend (évite les problèmes CORS)
// L'API /api/template?type=plan|eval|exam télécharge le fichier côté serveur
// et le renvoie directement au frontend — aucun proxy tiers requis.
// ─────────────────────────────────────────────────────────────────────────────
const loadFile = async (templateType: 'plan' | 'eval' | 'exam'): Promise<ArrayBuffer> => {
  if (templateCache[templateType] && templateCache[templateType].byteLength > 100) {
    return templateCache[templateType];
  }

  console.log(`[WORD] Chargement du template "${templateType}"...`);

  try {
    const response = await fetch(`/api/template?type=${templateType}&t=${Date.now()}`, {
      cache: 'no-store',
    });

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength >= 100) {
        console.log(`[WORD] Template "${templateType}" chargé avec succès via API (${buffer.byteLength} bytes)`);
        templateCache[templateType] = buffer;
        return buffer;
      }
    }
  } catch (apiErr) {
    console.warn(`[WORD] Échec chargement API pour "${templateType}", essai fichier statique local:`, apiErr);
  }

  // Fallback: charger depuis le dossier public
  try {
    const localRes = await fetch(`/templates/${templateType}.docx`, { cache: 'no-store' });
    if (localRes.ok) {
      const localBuf = await localRes.arrayBuffer();
      if (localBuf.byteLength >= 100) {
        console.log(`[WORD] Template local "${templateType}" chargé avec succès (${localBuf.byteLength} bytes)`);
        templateCache[templateType] = localBuf;
        return localBuf;
      }
    }
  } catch (localErr) {
    console.warn(`[WORD] Échec chargement fichier local pour "${templateType}":`, localErr);
  }

  throw new Error(`Le modèle Word "${templateType}" est inaccessible. Veuillez vérifier votre connexion.`);
};

// Helper to remove characters that break Docxtemplater
const clean = (text: any): string => {
  if (text === null || text === undefined) return "";
  
  // Ensure text is string
  let str = String(text);
  
  // Replace curly braces to prevent them from being interpreted as tags
  return str.replace(/{/g, "[").replace(/}/g, "]");
};

// Helper to detect if subject is ART or EPS (bilingual)
const isBilingualSubject = (subject: string): boolean => {
  if (!subject) return false;
  const normalized = subject.toLowerCase().trim();
  return normalized.includes('arts') || 
         normalized.includes('art') || 
         normalized.includes('éducation physique') || 
         normalized.includes('eps') ||
         normalized.includes('santé');
};

// Helper to extract Arabic value from a field (supports direct _ar suffix or nested object)
const getArabicValue = (data: any, fieldName: string): string => {
  if (!data) return "";
  
  // Check for direct _ar suffix field
  if (data[fieldName + '_ar']) {
    return clean(data[fieldName + '_ar']);
  }
  
  return "";
};

const generateDocumentBlob = (templateContent: ArrayBuffer, data: any, _landscape = false): Blob => {
    let zip;
    try {
        zip = new PizZip(templateContent);
    } catch(e) {
        throw new Error("Le fichier modèle est corrompu.");
    }
    
    const doc = new Docxtemplater(zip, {
      paragraphLoop: false, // Must be false for table loops
      linebreaks: true,
      nullGetter: () => ""
    });

    try {
        doc.render(data);
    } catch (error: any) {
        if (error.properties && error.properties.errors) {
            const errorMessages = error.properties.errors.map((e: any) => {
                return `Tag error: ${e.tag} - ${e.message}`;
            }).join("\n");
            console.error("Template Errors:", errorMessages);
            throw new Error(`Erreur balises Word:\n${errorMessages}`);
        }
        throw error;
    }

    const generatedZip = doc.getZip();
    return generatedZip.generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
};

const generateDocument = async (templateType: 'plan' | 'eval' | 'exam', data: any, fileName: string, landscape = false) => {
  try {
    const content = await loadFile(templateType);
    const blob = generateDocumentBlob(content, data, landscape);
    const saveAs = (FileSaver as any).saveAs || FileSaver;
    saveAs(blob, fileName);
  } catch (error: any) {
    console.error("Error generating document:", error);
    alert("Erreur lors de la génération du document Word: " + error.message);
  }
};

// Map AssessmentData to Word Template format (with Arabic support for ART/EPS)
const mapAssessmentToTemplate = (plan: UnitPlan, ad: AssessmentData) => {
  const isBilingual = isBilingualSubject(plan.subject);
  
  const strands = (ad.strands && Array.isArray(ad.strands) && ad.strands.length > 0) 
    ? ad.strands 
    : ["(Aucun aspect défini)"];

  const rubrics = (ad.rubricRows && Array.isArray(ad.rubricRows) && ad.rubricRows.length > 0) 
    ? ad.rubricRows 
    : [
        { level: "1-8", descriptor: "(Aucune rubrique définie)" }
      ];

  const exercises = (ad.exercises && Array.isArray(ad.exercises) && ad.exercises.length > 0) 
    ? ad.exercises 
    : [
        { title: "Exercice 1", content: "(Aucun exercice généré)", criterionReference: "" }
      ];

  const baseData = {
    // Header Info
    classe: clean(plan.gradeLevel || "PEI"),
    matiere: clean(plan.subject || "Matière"),
    unite: clean(plan.title || "Unité"),
    enonce_de_recherche: clean(plan.statementOfInquiry),
    enonce: clean(plan.statementOfInquiry), // Alias for safety
    enseignant: clean(plan.teacherName),
    
    // Criterion Info
    critere: clean(ad.criterion || "A"),
    nom_critere: clean(ad.criterionName || "Connaissances"),
    lettre_critere: clean(ad.criterion || "A"), // Alias
    max: ad.maxPoints || 8,
    
    nom_objectif_specifique: clean(ad.criterionName), 

    // Table 2: Aspects / Strands Loop
    aspects: strands.map(s => ({ text: clean(s) })),

    // Table 3: Rubric / Niveaux Loop
    rubriques: rubrics.map(r => ({
        niveau: clean(r.level),
        descripteur: clean(r.descriptor)
    })),

    // Exercises List Loop
    // DOTS: 161 per line × 5 lines, line-spacing 1.5
    exercices: exercises.map((ex, index) => {
        // Strip redundant "Exercice N" prefix from title (template already numbers them)
        const rawTitle = clean(ex.title).replace(/^exercice\s*\d+\s*[:\-–—]?\s*/i, '').trim();
        // Strip "Critère X :" prefix from criterionReference (template shows criterion header separately)
        const rawRef = clean(ex.criterionReference).replace(/^crit[eè]re\s+[ABCD]\s*[:\-–—]\s*/i, '').trim();
        // Answer lines: 5 lines of exactly 161 dots each, separated by \n
        const DOT_LINE = '·'.repeat(161);
        const reponse_lines = Array(5).fill(DOT_LINE).join('\n');
        return {
            numero: index + 1,
            titre: rawTitle,
            contenu: clean(ex.content),
            ref: rawRef,
            reponse_lines,
        };
    })
  };
  
  // Add Arabic versions if bilingual
  if (isBilingual) {
    return {
      ...baseData,
      // Arabic versions
      unite_ar: getArabicValue(plan, 'title'),
      enonce_de_recherche_ar: getArabicValue(plan, 'statementOfInquiry'),
      enonce_ar: getArabicValue(plan, 'statementOfInquiry'),
      nom_critere_ar: getArabicValue(ad, 'criterionName'),
      nom_objectif_specifique_ar: getArabicValue(ad, 'criterionName'),
      
      // Table 2: Aspects Arabic
      aspects_ar: (ad as any).strands_ar 
        ? (ad as any).strands_ar.map((s: string) => ({ text: clean(s) }))
        : strands.map(() => ({ text: "(لم يتم تحديد الجانب)" })),
      
      // Table 3: Rubric Arabic
      rubriques_ar: rubrics.map((r, idx) => ({
        niveau: clean(r.level),
        descripteur_ar: (ad.rubricRows[idx] as any)?.descriptor_ar 
          ? clean((ad.rubricRows[idx] as any).descriptor_ar)
          : "(لم يتم تحديد الوصف)"
      })),
      
      // Exercises Arabic
      exercices_ar: exercises.map((ex, index) => {
        const rawTitleAr = (ex as any).title_ar ? clean((ex as any).title_ar).replace(/^exercice\s*\d+\s*[:\-–—]?\s*/i, '').trim() : "(تمرين)";
        const rawRefAr = (ex as any).criterionReference_ar ? clean((ex as any).criterionReference_ar).replace(/^crit[eè]re\s+[ABCD]\s*[:\-–—]\s*/i, '').trim() : "";
        const DOT_LINE_AR = '·'.repeat(161);
        const reponse_lines_ar = Array(5).fill(DOT_LINE_AR).join('\n');
        return {
          numero: index + 1,
          titre_ar: rawTitleAr,
          contenu_ar: (ex as any).content_ar ? clean((ex as any).content_ar) : "(المحتوى)",
          ref_ar: rawRefAr,
          reponse_lines: reponse_lines_ar,
        };
      })
    };
  }
  
  return baseData;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers pour construire les champs texte du template plan.docx
// ─────────────────────────────────────────────────────────────────────────────
const c = (v: any): string => {
  if (v === null || v === undefined) return '';
  return String(v).replace(/{/g, '[').replace(/}/g, ']');
};

const listTxt = (v: string[] | string | undefined): string => {
  if (!v) return '';
  const a = Array.isArray(v) ? v : [v];
  return a.filter(Boolean).join('\n');
};

// Lit les dates depuis le calendrier annuel sauvegardé en localStorage
const getCalendarDates = (plan: UnitPlan): { startDate: string; endDate: string } => {
  try {
    const grade = plan.gradeLevel || '';
    const calKey = `annual_calendar_${grade}`;
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(calKey) : null;
    if (!raw) return { startDate: plan.startDate || '', endDate: plan.endDate || '' };
    const cal = JSON.parse(raw);
    const entries: any[] = cal.entries || [];

    // Trouver toutes les semaines de cette unité (par titre)
    const title = (plan.title || '').toLowerCase().slice(0, 20);
    const subject = plan.subject || '';
    const matching = entries.filter(e =>
      e.subject === subject &&
      (e.unitTitle?.toLowerCase().includes(title) || title.includes(e.unitTitle?.toLowerCase().slice(0, 15)))
    );

    if (matching.length === 0) return { startDate: plan.startDate || '', endDate: plan.endDate || '' };

    const SCHOOL_WEEKS: Record<number, string> = {
      1:'30 Août 2026', 2:'06 Sept. 2026', 3:'13 Sept. 2026', 4:'20 Sept. 2026',
      5:'27 Sept. 2026', 6:'04 Oct. 2026', 7:'11 Oct. 2026', 8:'18 Oct. 2026',
      9:'25 Oct. 2026', 10:'01 Nov. 2026', 11:'08 Nov. 2026', 12:'15 Nov. 2026',
      13:'29 Nov. 2026', 14:'06 Déc. 2026', 15:'13 Déc. 2026', 16:'20 Déc. 2026',
      17:'27 Déc. 2026', 18:'03 Jan. 2027', 19:'17 Jan. 2027', 20:'24 Jan. 2027',
      21:'31 Jan. 2027', 22:'07 Fév. 2027', 23:'14 Fév. 2027', 24:'21 Fév. 2027',
      25:'14 Mars 2027', 26:'21 Mars 2027', 27:'28 Mars 2027', 28:'04 Avr. 2027',
      29:'11 Avr. 2027', 30:'18 Avr. 2027', 31:'25 Avr. 2027', 32:'02 Mai 2027',
      33:'23 Mai 2027', 34:'30 Mai 2027', 35:'06 Juin 2027', 36:'13 Juin 2027',
      37:'20 Juin 2027', 38:'27 Juin 2027',
    };
    const SCHOOL_WEEKS_END: Record<number, string> = {
      1:'03 Sept. 2026', 2:'10 Sept. 2026', 3:'17 Sept. 2026', 4:'24 Sept. 2026',
      5:'01 Oct. 2026', 6:'08 Oct. 2026', 7:'15 Oct. 2026', 8:'22 Oct. 2026',
      9:'29 Oct. 2026', 10:'05 Nov. 2026', 11:'12 Nov. 2026', 12:'19 Nov. 2026',
      13:'03 Déc. 2026', 14:'10 Déc. 2026', 15:'17 Déc. 2026', 16:'24 Déc. 2026',
      17:'31 Déc. 2026', 18:'07 Jan. 2027', 19:'21 Jan. 2027', 20:'28 Jan. 2027',
      21:'04 Fév. 2027', 22:'11 Fév. 2027', 23:'18 Fév. 2027', 24:'25 Fév. 2027',
      25:'18 Mars 2027', 26:'25 Mars 2027', 27:'01 Avr. 2027', 28:'08 Avr. 2027',
      29:'15 Avr. 2027', 30:'22 Avr. 2027', 31:'29 Avr. 2027', 32:'06 Mai 2027',
      33:'27 Mai 2027', 34:'03 Juin 2027', 35:'10 Juin 2027', 36:'17 Juin 2027',
      37:'24 Juin 2027', 38:'30 Juin 2027',
    };

    const weekNums = matching.filter(e => e.type === 'unit').map(e => e.weekNum).sort((a: number, b: number) => a - b);
    const minWeek = weekNums[0];
    const maxWeek = weekNums[weekNums.length - 1];

    return {
      startDate: SCHOOL_WEEKS[minWeek] || plan.startDate || '',
      endDate: SCHOOL_WEEKS_END[maxWeek] || plan.endDate || '',
    };
  } catch {
    return { startDate: plan.startDate || '', endDate: plan.endDate || '' };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IB CONFORMITY AUTO-CORRECTION
// Détecte et corrige automatiquement les non-conformités IB PEI avant l'export
// ─────────────────────────────────────────────────────────────────────────────
const applyIBConformityCorrections = (plan: UnitPlan): UnitPlan => {
  const p = { ...plan };

  // ── 1. Énoncé de recherche : doit être déclaratif (pas interrogatif), 15-35 mots ──
  if (p.statementOfInquiry) {
    let s = p.statementOfInquiry.trim();
    // Supprimer le point d'interrogation final (énoncé = déclaratif, pas une question)
    s = s.replace(/\?+\s*$/, '.');
    // Ajouter un point final si absent
    if (!/[.!]$/.test(s)) s += '.';
    // Mettre la 1ère lettre en majuscule
    s = s.charAt(0).toUpperCase() + s.slice(1);
    p.statementOfInquiry = s;
  }

  // ── 2. Concept clé : doit être un SEUL mot/concept IB approuvé (sans virgules) ──
  if (p.keyConcept && p.keyConcept.includes(',')) {
    // Ne garder que le premier concept si plusieurs sont listés
    p.keyConcept = p.keyConcept.split(',')[0].trim();
  }

  // ── 3. Concepts connexes : maximum 3 concepts connexes IB ──
  if (Array.isArray(p.relatedConcepts) && p.relatedConcepts.length > 3) {
    p.relatedConcepts = p.relatedConcepts.slice(0, 3);
  }

  // ── 4. Questions d'investigation : s'assurer que chaque type est présent ──
  if (!p.inquiryQuestions) {
    p.inquiryQuestions = { factual: [], conceptual: [], debatable: [] };
  }
  if (!Array.isArray(p.inquiryQuestions.factual)) {
    p.inquiryQuestions.factual = p.inquiryQuestions.factual ? [p.inquiryQuestions.factual as unknown as string] : [];
  }
  if (!Array.isArray(p.inquiryQuestions.conceptual)) {
    p.inquiryQuestions.conceptual = p.inquiryQuestions.conceptual ? [p.inquiryQuestions.conceptual as unknown as string] : [];
  }
  if (!Array.isArray(p.inquiryQuestions.debatable)) {
    p.inquiryQuestions.debatable = p.inquiryQuestions.debatable ? [p.inquiryQuestions.debatable as unknown as string] : [];
  }

  // ── 5. Questions : s'assurer qu'elles se terminent par ? ──
  const ensureQuestion = (q: string) => q.trim().endsWith('?') ? q.trim() : q.trim() + '?';
  p.inquiryQuestions.factual    = p.inquiryQuestions.factual.map(ensureQuestion);
  p.inquiryQuestions.conceptual = p.inquiryQuestions.conceptual.map(ensureQuestion);
  p.inquiryQuestions.debatable  = p.inquiryQuestions.debatable.map(ensureQuestion);

  // ── 6. Objectifs IB : normaliser le format (A, B, C, D seulement) ──
  if (Array.isArray(p.objectives)) {
    p.objectives = p.objectives
      .map(o => String(o).trim().toUpperCase().charAt(0))
      .filter(o => ['A', 'B', 'C', 'D'].includes(o))
      .filter((o, i, arr) => arr.indexOf(o) === i); // dédoublonner
  }

  // ── 7. ATL : s'assurer que les compétences ATL sont listées ──
  if (p.atlSkills && !Array.isArray(p.atlSkills)) {
    p.atlSkills = [p.atlSkills as unknown as string];
  }

  // ── 8. Durée : format cohérent ──
  if (p.duration && !/heures?|h\b|périodes?|semaines?/i.test(p.duration)) {
    // Si c'est juste un nombre, ajouter "heures"
    if (/^\d+$/.test(p.duration.trim())) {
      p.duration = p.duration.trim() + ' heures';
    }
  }

  return p;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTEUR DE DONNÉES POUR LE TEMPLATE OFFICIEL .DOCX
// ─────────────────────────────────────────────────────────────────────────────
export const buildUnitPlanTemplateData = (rawPlan: UnitPlan) => {
  const plan = applyIBConformityCorrections(rawPlan);
  const calDates = getCalendarDates(plan);
  const startDate = calDates.startDate || plan.startDate || '';
  const endDate   = calDates.endDate   || plan.endDate   || '';

  const objectives = Array.isArray(plan.objectives) ? plan.objectives : [];
  const atl = Array.isArray(plan.atlSkills) ? plan.atlSkills : (plan.atlSkills ? [plan.atlSkills as string] : []);
  const related = Array.isArray(plan.relatedConcepts) ? plan.relatedConcepts : [];

  const objectifsTxt = objectives.map(cr => {
    const d = plan.objectivesDetails?.find(x => x.criterion === cr);
    return `Critère ${cr}${d?.aspects ? ' – ' + d.aspects : ''}${d?.expectedLevel ? ' (niveau attendu : ' + d.expectedLevel + ')' : ''}`;
  }).join('\n') || c(plan.content?.slice(0, 200));

  const contenuTxt = [
    c(plan.content),
    plan.contentDetails?.knowledges      ? 'Connaissances : ' + c(plan.contentDetails.knowledges) : '',
    plan.contentDetails?.notions         ? 'Notions/Vocabulaire : ' + c(plan.contentDetails.notions || plan.contentDetails.vocabulary) : '',
    plan.contentDetails?.methods         ? 'Méthodes : ' + c(plan.contentDetails.methods) : '',
    plan.contentDetails?.disciplinarySkills ? 'Compétences disciplinaires : ' + c(plan.contentDetails.disciplinarySkills) : '',
    plan.contentDetails?.mandatoryContent   ? 'Contenu obligatoire IB : ' + c(plan.contentDetails.mandatoryContent) : '',
    plan.contentDetails?.nationalLinks      ? 'Liens programme national : ' + c(plan.contentDetails.nationalLinks) : '',
  ].filter(Boolean).join('\n\n');

  const processusBlocs: string[] = [];
  if (plan.learningProcess) {
    const lp = plan.learningProcess;
    if (lp.phase1_activation)  processusBlocs.push('Phase 1 – Activation des connaissances :\n' + c(lp.phase1_activation));
    if (lp.phase2_acquisition) processusBlocs.push('Phase 2 – Acquisition :\n' + c(lp.phase2_acquisition));
    if (lp.phase3_practice)    processusBlocs.push('Phase 3 – Mise en pratique :\n' + c(lp.phase3_practice));
    if (lp.phase4_transfer)    processusBlocs.push('Phase 4 – Transfert et application :\n' + c(lp.phase4_transfer));
    if (lp.phase5_reflection)  processusBlocs.push('Phase 5 – Réflexion :\n' + c(lp.phase5_reflection));
  }
  if (plan.teachingStrategies)  processusBlocs.push('Stratégies de l\'enseignant :\n' + c(plan.teachingStrategies));
  if (plan.studentActivities)   processusBlocs.push('Activités des élèves :\n' + c(plan.studentActivities));
  if (plan.learningExperiences) processusBlocs.push('Expériences d\'apprentissage :\n' + c(plan.learningExperiences));

  if (plan.sessions && plan.sessions.length > 0) {
    const sessionsText = plan.sessions.map(sess =>
      `Séance ${sess.numero} (${c(sess.duree)}) :\n` +
      `  Objectif : ${c(sess.objectifApprentissage)}\n` +
      `  Contenu : ${c(sess.contenu)}\n` +
      `  Activité : ${c(sess.activite)}\n` +
      `  ATL : ${c(sess.atl)}\n` +
      `  Éval. formative : ${c(sess.evaluationFormative)}\n` +
      `  Différenciation : ${c(sess.differenciation)}\n` +
      `  Ressources : ${c(sess.ressources)}`
    ).join('\n\n');
    processusBlocs.push('Séances détaillées :\n' + sessionsText);
  }

  const processusTxt = processusBlocs.join('\n\n') || c(plan.learningExperiences);

  const evalFormTxt = [
    c(plan.formativeAssessment),
    plan.objectivesDetails?.map(d => d.formativeAssessment ? `Critère ${d.criterion} : ${c(d.formativeAssessment)}` : '').filter(Boolean).join('\n') || '',
  ].filter(Boolean).join('\n\n');

  const evalSommTxt = [
    c(plan.summativeAssessment),
    objectives.length > 0 ? 'Critères évalués : ' + objectives.join(', ') : '',
    plan.summativeDetails?.consigne          ? 'Consigne : ' + c(plan.summativeDetails.consigne) : '',
    plan.summativeDetails?.productionAttendue ? 'Production attendue : ' + c(plan.summativeDetails.productionAttendue) : '',
    plan.summativeDetails?.duree             ? 'Durée : ' + c(plan.summativeDetails.duree) : '',
    plan.objectivesDetails?.map(d => d.summativeAssessment ? `Critère ${d.criterion} : ${c(d.summativeAssessment)}` : '').filter(Boolean).join('\n') || '',
  ].filter(Boolean).join('\n\n');

  const difftxt = [
    c(plan.differentiation),
    plan.differentiationDetails?.supportStudents ? [
      'Élèves en difficulté :',
      plan.differentiationDetails.supportStudents.vocabulary      ? '  - Soutien vocabulaire : ' + c(plan.differentiationDetails.supportStudents.vocabulary) : '',
      plan.differentiationDetails.supportStudents.visualSupports  ? '  - Supports visuels : ' + c(plan.differentiationDetails.supportStudents.visualSupports) : '',
      plan.differentiationDetails.supportStudents.models          ? '  - Modèles/étayage : ' + c(plan.differentiationDetails.supportStudents.models) : '',
      plan.differentiationDetails.supportStudents.adaptedInstructions ? '  - Instructions adaptées : ' + c(plan.differentiationDetails.supportStudents.adaptedInstructions) : '',
      plan.differentiationDetails.supportStudents.individualSupport   ? '  - Soutien individuel : ' + c(plan.differentiationDetails.supportStudents.individualSupport) : '',
      plan.differentiationDetails.supportStudents.extraTime           ? '  - Temps supplémentaire : ' + c(plan.differentiationDetails.supportStudents.extraTime) : '',
    ].filter(Boolean).join('\n') : '',
    plan.differentiationDetails?.advancedStudents ? [
      'Élèves avancés :',
      plan.differentiationDetails.advancedStudents.deepening         ? '  - Approfondissement : ' + c(plan.differentiationDetails.advancedStudents.deepening) : '',
      plan.differentiationDetails.advancedStudents.challenges        ? '  - Défis : ' + c(plan.differentiationDetails.advancedStudents.challenges) : '',
      plan.differentiationDetails.advancedStudents.autonomousResearch ? '  - Recherche autonome : ' + c(plan.differentiationDetails.advancedStudents.autonomousResearch) : '',
      plan.differentiationDetails.advancedStudents.transfer          ? '  - Transfert : ' + c(plan.differentiationDetails.advancedStudents.transfer) : '',
    ].filter(Boolean).join('\n') : '',
    plan.differentiationDetails?.contentDifferentiation  ? 'Différenciation du contenu : ' + c(plan.differentiationDetails.contentDifferentiation) : '',
    plan.differentiationDetails?.processDifferentiation  ? 'Différenciation du processus : ' + c(plan.differentiationDetails.processDifferentiation) : '',
    plan.differentiationDetails?.productDifferentiation  ? 'Différenciation de la production : ' + c(plan.differentiationDetails.productDifferentiation) : '',
  ].filter(Boolean).join('\n\n');

  const ressourcesTxt = [
    c(plan.resources),
    plan.sessions?.map(s => s.ressources ? `Séance ${s.numero} : ${c(s.ressources)}` : '').filter(Boolean).join('\n') || '',
  ].filter(Boolean).join('\n\n');

  const reflexionAvantTxt = [
    plan.reflectionDetails?.before ? [
      plan.reflectionDetails.before.priorKnowledge      ? 'Connaissances antérieures : ' + c(plan.reflectionDetails.before.priorKnowledge) : '',
      plan.reflectionDetails.before.studentNeeds        ? 'Besoins des élèves : ' + c(plan.reflectionDetails.before.studentNeeds) : '',
      plan.reflectionDetails.before.anticipatedDifficulties ? 'Difficultés anticipées : ' + c(plan.reflectionDetails.before.anticipatedDifficulties) : '',
      plan.reflectionDetails.before.relevance           ? 'Pertinence : ' + c(plan.reflectionDetails.before.relevance) : '',
      plan.reflectionDetails.before.plannedStrategies   ? 'Stratégies planifiées : ' + c(plan.reflectionDetails.before.plannedStrategies) : '',
      plan.reflectionDetails.before.plannedDifferentiation ? 'Différenciation prévue : ' + c(plan.reflectionDetails.before.plannedDifferentiation) : '',
      plan.reflectionDetails.before.expectedOutcomes    ? 'Résultats attendus : ' + c(plan.reflectionDetails.before.expectedOutcomes) : '',
    ].filter(Boolean).join('\n') : c(plan.reflection?.prior),
  ].filter(Boolean).join('\n');

  const reflexionPendantTxt = [
    plan.reflectionDetails?.during ? [
      plan.reflectionDetails.during.progressObserved      ? 'Progrès observés : ' + c(plan.reflectionDetails.during.progressObserved) : '',
      plan.reflectionDetails.during.difficulties          ? 'Difficultés rencontrées : ' + c(plan.reflectionDetails.during.difficulties) : '',
      plan.reflectionDetails.during.effectiveStrategies   ? 'Stratégies efficaces : ' + c(plan.reflectionDetails.during.effectiveStrategies) : '',
      plan.reflectionDetails.during.adjustmentsMade       ? 'Ajustements effectués : ' + c(plan.reflectionDetails.during.adjustmentsMade) : '',
      plan.reflectionDetails.during.studentParticipation  ? 'Participation élèves : ' + c(plan.reflectionDetails.during.studentParticipation) : '',
    ].filter(Boolean).join('\n') : c(plan.reflection?.during),
  ].filter(Boolean).join('\n');

  const reflexionApresTxt = [
    plan.reflectionDetails?.after ? [
      plan.reflectionDetails.after.achievedObjectives     ? 'Objectifs atteints : ' + c(plan.reflectionDetails.after.achievedObjectives) : '',
      plan.reflectionDetails.after.partialObjectives      ? 'Objectifs partiels : ' + c(plan.reflectionDetails.after.partialObjectives) : '',
      plan.reflectionDetails.after.studentDifficulties    ? 'Difficultés élèves : ' + c(plan.reflectionDetails.after.studentDifficulties) : '',
      plan.reflectionDetails.after.successes              ? 'Succès : ' + c(plan.reflectionDetails.after.successes) : '',
      plan.reflectionDetails.after.improvements           ? 'Points à améliorer : ' + c(plan.reflectionDetails.after.improvements) : '',
      plan.reflectionDetails.after.modificationsNext      ? 'Modifications pour la prochaine fois : ' + c(plan.reflectionDetails.after.modificationsNext) : '',
    ].filter(Boolean).join('\n') : c(plan.reflection?.after),
  ].filter(Boolean).join('\n');

  const prerequisTxt = [
    c(plan.prerequisites),
    plan.studentContext?.priorKnowledge      ? 'Connaissances antérieures : ' + c(plan.studentContext.priorKnowledge) : '',
    plan.studentContext?.acquiredSkills      ? 'Compétences acquises : ' + c(plan.studentContext.acquiredSkills) : '',
    plan.studentContext?.linksPreviousUnits  ? 'Liens unités précédentes : ' + c(plan.studentContext.linksPreviousUnits) : '',
    plan.studentContext?.specificNeeds       ? 'Besoins spécifiques : ' + c(plan.studentContext.specificNeeds) : '',
    plan.studentContext?.anticipatedDifficulties ? 'Difficultés anticipées : ' + c(plan.studentContext.anticipatedDifficulties) : '',
  ].filter(Boolean).join('\n');

  const coherenceTxt = [
    plan.verticalCoherenceText    ? 'Cohérence verticale : ' + c(plan.verticalCoherenceText) : '',
    plan.horizontalCoherenceText  ? 'Cohérence horizontale : ' + c(plan.horizontalCoherenceText) : '',
    plan.interdisciplinaryLinksText ? 'Liens interdisciplinaires : ' + c(plan.interdisciplinaryLinksText) : '',
  ].filter(Boolean).join('\n\n');

  const dureeTxt = [
    c(plan.duration),
    plan.numberOfHours   ? plan.numberOfHours + ' h' : '',
    plan.numberOfPeriods ? plan.numberOfPeriods + ' périodes' : '',
    startDate && endDate ? `Du ${startDate} au ${endDate}` : startDate ? `À partir du ${startDate}` : '',
  ].filter(Boolean).join(' — ');

  const dataDict = {
    // ── En-tête du plan (Page 1) ───────────────────────────────────────────────
    enseignant:               c(plan.teacherName || 'M. Mohamed Cherif'),
    Enseignant:               c(plan.teacherName || 'M. Mohamed Cherif'),
    ENSEIGNANT:               c(plan.teacherName || 'M. Mohamed Cherif'),
    enseignants:              c(plan.teacherName || 'M. Mohamed Cherif'),
    professeur:               c(plan.teacherName || 'M. Mohamed Cherif'),
    groupe_matiere:           c(plan.subject) + (plan.gradeLevel ? ' — ' + c(plan.gradeLevel) : ''),
    groupe_matieres:          c(plan.subject) + (plan.gradeLevel ? ' — ' + c(plan.gradeLevel) : ''),
    matiere:                  c(plan.subject),
    Matiere:                  c(plan.subject),
    MATIERE:                  c(plan.subject),
    discipline:               c(plan.subject),
    titre_unite:              c(plan.title),
    titre_de_lunite:          c(plan.title),
    unite:                    c(plan.title),
    titre:                    c(plan.title),
    Titre:                    c(plan.title),
    TITRE:                    c(plan.title),
    annee_pei:                c(plan.gradeLevel ? `${plan.gradeLevel} (${plan.schoolYear || '2026-2027'})` : (plan.schoolYear || '2026-2027')),
    annee:                    c(plan.schoolYear || '2026-2027'),
    niveau:                   c(plan.gradeLevel),
    classe:                   c(plan.gradeLevel),
    Classe:                   c(plan.gradeLevel),
    duree:                    dureeTxt || c(plan.duration) || '18 heures',
    duree_unite:              dureeTxt || c(plan.duration) || '18 heures',
    heures:                   c(plan.numberOfHours || plan.duration || '18'),
    periodes:                 c(plan.numberOfPeriods || ''),

    // ── Recherche : définition de l'objectif de l'unité ───────────────────────
    concept_cle:              c(plan.keyConcept) + (plan.keyConceptDefinition ? '\n' + c(plan.keyConceptDefinition) : ''),
    concept_clé:              c(plan.keyConcept) + (plan.keyConceptDefinition ? '\n' + c(plan.keyConceptDefinition) : ''),
    Concept_cle:              c(plan.keyConcept) + (plan.keyConceptDefinition ? '\n' + c(plan.keyConceptDefinition) : ''),
    concept_cle_definition:   c(plan.keyConceptDefinition || plan.keyConcept),
    concepts_connexes:        related.join(', ') || c(plan.relatedConcepts),
    concept_connexe:          related.join(', ') || c(plan.relatedConcepts),
    Concepts_connexes:        related.join(', ') || c(plan.relatedConcepts),
    contexte_mondial:         c(plan.globalContext) + (plan.globalContextAspects ? '\n' + c(plan.globalContextAspects) : ''),
    Contexte_mondial:         c(plan.globalContext) + (plan.globalContextAspects ? '\n' + c(plan.globalContextAspects) : ''),
    contexte:                 c(plan.globalContext),
    enonce_de_recherche:      c(plan.statementOfInquiry) + (plan.statementExplanation ? '\n\n' + c(plan.statementExplanation) : ''),
    énoncé_de_recherche:      c(plan.statementOfInquiry) + (plan.statementExplanation ? '\n\n' + c(plan.statementExplanation) : ''),
    Enonce_de_recherche:      c(plan.statementOfInquiry) + (plan.statementExplanation ? '\n\n' + c(plan.statementExplanation) : ''),
    enonce:                   c(plan.statementOfInquiry),
    énoncé:                   c(plan.statementOfInquiry),
    
    // Questions de recherche
    questions_factuelles:     listTxt(plan.inquiryQuestions?.factual) || 'Quelles sont les notions fondamentales de cette unité ?',
    question_factuelle:       listTxt(plan.inquiryQuestions?.factual) || 'Quelles sont les notions fondamentales de cette unité ?',
    questions_conceptuelles:  listTxt(plan.inquiryQuestions?.conceptual) || 'Comment ces concepts s\'articulent-ils dans le monde réel ?',
    question_conceptuelle:    listTxt(plan.inquiryQuestions?.conceptual) || 'Comment ces concepts s\'articulent-ils dans le monde réel ?',
    questions_debat:          listTxt(plan.inquiryQuestions?.debatable) || 'Dans quelle mesure cette approche est-elle universelle ?',
    question_debat:           listTxt(plan.inquiryQuestions?.debatable) || 'Dans quelle mesure cette approche est-elle universelle ?',
    questions_debatables:     listTxt(plan.inquiryQuestions?.debatable) || 'Dans quelle mesure cette approche est-elle universelle ?',

    // Objectifs, Évaluation & ATL
    objectifs_specifiques:    objectifsTxt || 'Critères IB évalués dans cette unité',
    objectifs_spécifiques:    objectifsTxt || 'Critères IB évalués dans cette unité',
    Objectifs_specifiques:    objectifsTxt || 'Critères IB évalués dans cette unité',
    objectifs:                objectifsTxt || 'Critères IB évalués dans cette unité',
    criteres:                 objectifsTxt || 'Critères IB évalués dans cette unité',
    critères:                 objectifsTxt || 'Critères IB évalués dans cette unité',
    evaluation_sommative:     evalSommTxt || 'Évaluation sommative de fin d\'unité basée sur les critères IB.',
    évaluation_sommative:     evalSommTxt || 'Évaluation sommative de fin d\'unité basée sur les critères IB.',
    Evaluation_sommative:     evalSommTxt || 'Évaluation sommative de fin d\'unité basée sur les critères IB.',
    sommative:                evalSommTxt || 'Évaluation sommative de fin d\'unité basée sur les critères IB.',
    approches_apprentissage:  atl.join('\n') || 'Compétences de communication, pensée critique et autogestion.',
    Approches_apprentissage:  atl.join('\n') || 'Compétences de communication, pensée critique et autogestion.',
    atl:                      atl.join('\n') || 'Compétences de communication, pensée critique et autogestion.',
    ATL:                      atl.join('\n') || 'Compétences de communication, pensée critique et autogestion.',

    // ── Action : enseignement et apprentissage par le biais de la recherche ───
    contenu:                  contenuTxt || c(plan.content),
    Contenu:                  contenuTxt || c(plan.content),
    connaissances:            plan.contentDetails?.knowledges || contenuTxt || c(plan.content),
    processus_apprentissage:  processusTxt || c(plan.learningExperiences),
    Processus_apprentissage:  processusTxt || c(plan.learningExperiences),
    activites_apprentissage:  processusTxt || c(plan.learningExperiences),
    activites:                plan.studentActivities || processusTxt || c(plan.learningExperiences),
    strategies_enseignement:  plan.teachingStrategies || '',
    evaluation_formative:     evalFormTxt || 'Évaluations formatives continues et auto-évaluations.',
    évaluation_formative:     evalFormTxt || 'Évaluations formatives continues et auto-évaluations.',
    Evaluation_formative:     evalFormTxt || 'Évaluations formatives continues et auto-évaluations.',
    formative:                evalFormTxt || 'Évaluations formatives continues et auto-évaluations.',
    differenciation:          difftxt || 'Différenciation pédagogique par étayage, soutien et approfondissement.',
    différenciation:          difftxt || 'Différenciation pédagogique par étayage, soutien et approfondissement.',
    Differenciation:          difftxt || 'Différenciation pédagogique par étayage, soutien et approfondissement.',
    ressources:               ressourcesTxt + (coherenceTxt ? '\n\n' + coherenceTxt : '') || 'Manuels scolaires, fiches d\'activités, plateformes numériques.',
    Ressources:               ressourcesTxt + (coherenceTxt ? '\n\n' + coherenceTxt : '') || 'Manuels scolaires, fiches d\'activités, plateformes numériques.',

    // ── Réflexion : examen de la planification ────────────────────────────────
    reflexion_avant:          reflexionAvantTxt || '(À compléter avant l\'enseignement de l\'unité)',
    réflexion_avant:          reflexionAvantTxt || '(À compléter avant l\'enseignement de l\'unité)',
    Reflexion_avant:          reflexionAvantTxt || '(À compléter avant l\'enseignement de l\'unité)',
    reflexion_pendant:        reflexionPendantTxt || '(À compléter pendant l\'enseignement de l\'unité)',
    réflexion_pendant:        reflexionPendantTxt || '(À compléter pendant l\'enseignement de l\'unité)',
    Reflexion_pendant:        reflexionPendantTxt || '(À compléter pendant l\'enseignement de l\'unité)',
    reflexion_apres:          reflexionApresTxt || '(À compléter après l\'enseignement de l\'unité)',
    réflexion_après:          reflexionApresTxt || '(À compléter après l\'enseignement de l\'unité)',
    Reflexion_apres:          reflexionApresTxt || '(À compléter après l\'enseignement de l\'unité)',

    // ── Cohérence et interdisciplinarité ─────────────────────────────────────
    coherence_verticale:      plan.verticalCoherenceText || plan.verticalCoherence?.before || '',
    coherence_horizontale:    plan.horizontalCoherenceText || plan.horizontalCoherence?.otherSubjectLinks || '',
    liens_interdisciplinaires: plan.interdisciplinaryLinksText || '',

    // ── Données additionnelles & métadonnées ──────────────────────────────────
    date_debut:               startDate,
    date_fin:                 endDate,
    annee_scolaire:           c(plan.schoolYear || '2026-2027'),
    nombre_periodes:          c(plan.numberOfPeriods || ''),
    nombre_heures:            c(plan.numberOfHours || plan.duration),
    prerequis:                prerequisTxt,
    prérequis:                prerequisTxt,
    Date:                     c(startDate || new Date().toLocaleDateString('fr-FR')),
    Semestre:                 c((plan as any).semester || 'Semestre 1'),
    semestre:                 c((plan as any).semester || 'Semestre 1'),
  };

  return dataDict;
};

// ─────────────────────────────────────────────────────────────────────────────
// GÉNÉRATEUR NATIF .DOCX POUR PLAN D'UNITÉ (FALLBACK 100% GARANTI HORS LIGNE)
// ─────────────────────────────────────────────────────────────────────────────
export const generateUnitPlanNativeDocxBlob = async (rawPlan: UnitPlan): Promise<Blob> => {
  const plan = applyIBConformityCorrections(rawPlan);
  const data = buildUnitPlanTemplateData(plan);

  const border = { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  const createCell = (text: string, isHeader = false, widthPercent = 50): DocxTableCell => {
    return new DocxTableCell({
      borders: cellBorders,
      shading: isHeader ? { fill: "F1F5F9", type: ShadingType.CLEAR } : undefined,
      width: { size: widthPercent, type: WidthType.PERCENTAGE },
      children: text.split('\n').map(line =>
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              bold: isHeader,
              size: 20, // 10pt
              font: "Calibri",
              color: isHeader ? "1E293B" : "334155",
            })
          ],
          spacing: { before: 60, after: 60 }
        })
      )
    });
  };

  const createSectionHeader = (title: string, color = "1E3A8A"): Paragraph => {
    return new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 24, // 12pt
          color,
          font: "Calibri",
        })
      ],
      spacing: { before: 240, after: 120 },
      heading: HeadingLevel.HEADING_2
    });
  };

  const createRow = (label: string, value: string): DocxTableRow => {
    return new DocxTableRow({
      children: [
        createCell(label, true, 30),
        createCell(value || '(Non renseigné)', false, 70),
      ]
    });
  };

  const doc = new DocxDocument({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        }
      },
      children: [
        // En-tête principal
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "LES ÉCOLES INTERNATIONALES AL KAWTHAR",
              bold: true,
              size: 26,
              color: "1E3A8A",
              font: "Calibri",
            })
          ],
          spacing: { after: 60 }
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: `PLAN DE L'UNITÉ D'APPRENTISSAGE DU PEI (IB MYP)`,
              bold: true,
              size: 24,
              color: "2563EB",
              font: "Calibri",
            })
          ],
          spacing: { after: 180 }
        }),

        // Tableau métadonnées
        new DocxTable({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: cellBorders,
          rows: [
            new DocxTableRow({
              children: [
                createCell("Titre de l'unité", true, 25),
                createCell(data.titre_unite, false, 75),
              ]
            }),
            new DocxTableRow({
              children: [
                createCell("Matière & Classe", true, 25),
                createCell(`${data.groupe_matiere}`, false, 75),
              ]
            }),
            new DocxTableRow({
              children: [
                createCell("Enseignant(e)", true, 25),
                createCell(data.enseignant || 'Non spécifié', false, 75),
              ]
            }),
            new DocxTableRow({
              children: [
                createCell("Durée & Période", true, 25),
                createCell(data.duree || 'Non spécifié', false, 75),
              ]
            }),
          ]
        }),

        // 1. RECHERCHE
        createSectionHeader("1. ÉTABLIR L'OBJECTIF DE L'UNITÉ (RECHERCHE)"),
        new DocxTable({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: cellBorders,
          rows: [
            createRow("Énoncé de recherche", data.enonce_de_recherche),
            createRow("Concept clé", data.concept_cle),
            createRow("Concepts connexes", data.concepts_connexes),
            createRow("Contexte mondial & exploration", data.contexte_mondial),
            createRow("Questions d'investigation\n(Factuelles, Conceptuelles, Débat)",
              `Factuelles :\n${data.questions_factuelles || '—'}\n\nConceptuelles :\n${data.questions_conceptuelles || '—'}\n\nÀ débat :\n${data.questions_debat || '—'}`
            ),
          ]
        }),

        // 2. ACTION
        createSectionHeader("2. PLANIFIER L'APPRENTISSAGE PAR LE BIAIS DE LA RECHERCHE (ACTION)"),
        new DocxTable({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: cellBorders,
          rows: [
            createRow("Objectifs spécifiques & Critères", data.objectifs_specifiques),
            createRow("Évaluation sommative", data.evaluation_sommative),
            createRow("Approches de l'apprentissage (ATL)", data.approches_apprentissage),
            createRow("Contenu & Notions", data.contenu),
            createRow("Processus d'apprentissage & Séances", data.processus_apprentissage),
            createRow("Évaluation formative", data.evaluation_formative),
            createRow("Différenciation", data.differenciation),
            createRow("Ressources & Coopération", data.ressources),
          ]
        }),

        // 3. RÉFLEXION
        createSectionHeader("3. RÉFLÉCHIR : PLANIFIER, ENSEIGNER ET APPRENDRE (RÉFLEXION)"),
        new DocxTable({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: cellBorders,
          rows: [
            createRow("Avant l'enseignement", data.reflexion_avant),
            createRow("Pendant l'enseignement", data.reflexion_pendant),
            createRow("Après l'enseignement", data.reflexion_apres),
          ]
        }),
      ]
    }]
  });

  return await Packer.toBlob(doc);
};

// ─────────────────────────────────────────────────────────────────────────────
// GÉNÉRATEUR DE BLOB WORD (.DOCX) POUR UN PLAN D'UNITÉ (MODÈLE DRIVE OFFICIEL)
// ─────────────────────────────────────────────────────────────────────────────
export const generateUnitPlanWordBlob = async (rawPlan: UnitPlan): Promise<Blob> => {
  const plan = applyIBConformityCorrections(rawPlan);
  const data = buildUnitPlanTemplateData(plan);

  try {
    const templateContent = await loadFile('plan');
    const blob = generateDocumentBlob(templateContent, data);
    console.log(`[WORD] Plan d'unité généré avec succès à partir du modèle Word Drive (${blob.size} bytes)`);
    return blob;
  } catch (templateError: any) {
    console.warn("[WORD] Erreur avec le modèle Drive, basculement vers le générateur natif:", templateError?.message || templateError);
    return await generateUnitPlanNativeDocxBlob(plan);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT D'UN PLAN D'UNITÉ INDIVIDUEL EN WORD (.DOCX)
// ─────────────────────────────────────────────────────────────────────────────
export const exportUnitPlanToWord = async (plan: UnitPlan): Promise<void> => {
  try {
    const blob = await generateUnitPlanWordBlob(plan);
    const safeTitle = (plan.title || 'Plan_Unite')
      .replace(/[^a-zA-Z0-9_\u00C0-\u017E\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 45);
    const fileName = `Plan_Unite_${safeTitle || 'Sans_Titre'}.docx`;
    const saveAs = (FileSaver as any).saveAs || FileSaver;
    saveAs(blob, fileName);
  } catch (error: any) {
    console.error("Erreur export plan Word:", error);
    alert(`Erreur lors de l'export Word : ${error?.message || error}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT DE TOUS LES PLANS D'UNITÉ D'UNE CLASSE/MATIÈRE EN ZIP (FICHIERS WORD .DOCX)
// ─────────────────────────────────────────────────────────────────────────────
export const exportAllUnitPlansToZip = async (
  plans: UnitPlan[],
  subject: string,
  grade: string,
  onProgress?: (current: number, total: number, unitTitle: string) => void
): Promise<void> => {
  if (!plans || plans.length === 0) {
    alert("Aucun plan d'unité à exporter pour cette classe.");
    return;
  }

  const zip = new JSZip();
  const safeSubject = (subject || 'Matiere')
    .replace(/[^a-zA-Z0-9_\u00C0-\u017E\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const safeGrade = (grade || 'Classe')
    .replace(/[^a-zA-Z0-9_\u00C0-\u017E\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  const folderName = `Plans_Word_${safeSubject}_${safeGrade}`;
  const folder = zip.folder(folderName) || zip;

  // 1. Générer le fichier Word .docx pour chaque unité
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const unitNum = i + 1;
    const safeTitle = (plan.title || `Unite_${unitNum}`)
      .replace(/[^a-zA-Z0-9_\u00C0-\u017E\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40);

    onProgress?.(unitNum, plans.length, plan.title || `Unité ${unitNum}`);

    try {
      const wordBlob = await generateUnitPlanWordBlob(plan);
      const fileName = `${unitNum}_Plan_${safeTitle}.docx`;
      folder.file(fileName, wordBlob);
    } catch (unitErr) {
      console.error(`Erreur génération Word pour unité ${unitNum}:`, unitErr);
      const fallbackBlob = await generateUnitPlanNativeDocxBlob(plan);
      folder.file(`${unitNum}_Plan_${safeTitle}.docx`, fallbackBlob);
    }
  }

  // 2. Ajouter un récapitulatif CSV structuré
  const headers = ['N°', 'Titre', 'Matière', 'Classe', 'Durée', 'Enseignant(e)', 'Énoncé de recherche', 'Concept Clé', 'Contexte Mondial', 'Critères Évalués'];
  const rows = plans.map((p, idx) => [
    idx + 1,
    p.title || '',
    p.subject || subject,
    p.gradeLevel || grade,
    p.duration || '',
    p.teacherName || '',
    p.statementOfInquiry || '',
    p.keyConcept || '',
    p.globalContext || '',
    Array.isArray(p.objectives) ? p.objectives.join(', ') : (p.assessments || []).map(a => `Critère ${a.criterion}`).join(', ')
  ]);

  const csvContent = '\uFEFF' + [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  folder.file(`00_Recapitulatif_${safeGrade}_${safeSubject}.csv`, csvContent);

  // 3. Générer et télécharger l'archive ZIP
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const saveAs = (FileSaver as any).saveAs || FileSaver;
  const zipFileName = `Plans_Word_${safeSubject}_${safeGrade}_${new Date().toISOString().slice(0, 10)}.zip`;
  saveAs(zipBlob, zipFileName);
};

export const exportAssessmentsToZip = async (plan: UnitPlan) => {
  try {
    // 1. Gather assessments to export
    let assessmentsToExport: AssessmentData[] = [];
    
    if (plan.assessments && plan.assessments.length > 0) {
        assessmentsToExport = plan.assessments;
    } else if (plan.assessmentData) {
        // Fallback for legacy single assessment
        assessmentsToExport = [plan.assessmentData];
    } else {
        alert("Aucune donnée d'évaluation trouvée. Veuillez régénérer le plan.");
        return;
    }

    // 2. Load Template Once
    const templateContent = await loadFile('eval');
    
    // 3. Create Zip
    const zip = new JSZip();
    const folderName = `Evaluations_${clean(plan.title).replace(/ /g, '_')}`;
    const folder = zip.folder(folderName);

    // 4. Generate each doc and add to zip
    for (const assessment of assessmentsToExport) {
        const data = mapAssessmentToTemplate(plan, assessment);
        const blob = generateDocumentBlob(templateContent, data);
        const fileName = `Eval_Critere_${assessment.criterion}_${clean(plan.title).substring(0, 20)}.docx`;
        folder?.file(fileName, blob);
    }

    // 5. Generate and download zip
    const zipContent = await zip.generateAsync({ type: "blob" });
    const saveAs = (FileSaver as any).saveAs || FileSaver;
    saveAs(zipContent, `${folderName}.zip`);

  } catch (error: any) {
    console.error("Error generating zip:", error);
    alert("Erreur lors de la création du fichier ZIP: " + error.message);
  }
};

// Legacy single file export kept for compatibility if needed, but updated to use clean
export const exportAssessmentToWord = async (plan: UnitPlan) => {
    await exportAssessmentsToZip(plan);
};

// Export consolidated document for all subjects in a grade
export const exportConsolidatedPlanByGrade = async (grade: string) => {
  try {
    // Load ALL plans for this grade (all subjects)
    const allPlans = await loadAllPlansForGrade(grade);
    
    if (!allPlans || allPlans.length === 0) {
      alert("Aucun plan à exporter pour cette classe.");
      return;
    }

    // Group plans by subject
    const plansBySubject: Record<string, UnitPlan[]> = {};
    
    allPlans.forEach(plan => {
      const subject = plan.subject || "Sans matière";
      if (!plansBySubject[subject]) {
        plansBySubject[subject] = [];
      }
      plansBySubject[subject].push(plan);
    });

    // Create document content as HTML
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: landscape;
            margin: 15mm;
          }
          
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            line-height: 1.3;
            color: #333;
            font-size: 11px;
          }
          
          .header {
            text-align: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #2563eb;
          }
          
          .header h1 {
            color: #1e40af;
            font-size: 20px;
            margin: 0 0 5px 0;
            padding: 0;
          }
          
          .header h2 {
            color: #64748b;
            font-size: 14px;
            font-weight: normal;
            margin: 0;
            padding: 0;
          }
          
          .subject-page {
            page-break-after: always;
            padding: 10px;
          }
          
          .subject-title {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: #dc2626;
            padding: 8px 15px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 6px;
            margin: 0 0 10px 0;
            text-align: center;
          }
          
          .units-container {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
          
          .unit-card {
            background: #f8fafc;
            border: 2px solid #3b82f6;
            border-radius: 6px;
            padding: 10px;
            break-inside: avoid;
          }
          
          .unit-header {
            background: #dbeafe;
            color: #1e40af;
            font-weight: bold;
            font-size: 13px;
            padding: 5px 10px;
            margin: -10px -10px 8px -10px;
            border-radius: 4px 4px 0 0;
          }
          
          .field-group {
            margin-bottom: 6px;
          }
          
          .field-label {
            font-weight: bold;
            color: #475569;
            font-size: 10px;
            text-transform: uppercase;
            margin: 0 0 2px 0;
            padding: 0;
          }
          
          .field-value {
            color: #334155;
            font-size: 10px;
            margin: 0;
            padding: 0;
            line-height: 1.2;
          }
          
          .objectives-list {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 3px;
          }
          
          .objective-badge {
            background: #dbeafe;
            color: #1e40af;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: bold;
            font-size: 10px;
            display: inline-block;
          }
          
          @media print {
            .subject-page {
              page-break-after: always;
            }
            .unit-card {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📚 Planification Annuelle - Classe ${clean(grade)}</h1>
          <h2>Programme d'éducation intermédiaire (PEI)</h2>
        </div>
    `;

    // Generate content for each subject (each subject on one page)
    Object.entries(plansBySubject).sort(([a], [b]) => a.localeCompare(b)).forEach(([subject, subjectPlans]) => {
      htmlContent += `
        <div class="subject-page">
          <div class="subject-title">📖 Groupe de matière : ${clean(subject)}</div>
          <div class="units-container">
      `;
      
      // Generate all units for this subject
      subjectPlans.forEach((plan, index) => {
        // Extract assessment criteria letters (A, B, C, D) from assessments
        let criteriaLetters: string[] = [];
        
        if (plan.assessments && plan.assessments.length > 0) {
          // Use actual assessments
          criteriaLetters = plan.assessments
            .map(a => a.criterion)
            .filter(Boolean)
            .map(c => c.toUpperCase());
        } else if (plan.assessmentData) {
          // Fallback to legacy single assessment
          criteriaLetters = [plan.assessmentData.criterion?.toUpperCase()].filter(Boolean);
        } else {
          // Last resort: try to extract from objectives text
          const rawObjectives: unknown = plan.objectives;
          const objectives: string[] = Array.isArray(rawObjectives)
            ? rawObjectives as string[]
            : (typeof rawObjectives === 'string' ? rawObjectives : "").split(/[,\n]/).filter(Boolean);
          
          criteriaLetters = objectives.map(obj => {
            const match = obj.match(/^([A-D])/i);
            return match ? match[1].toUpperCase() : null;
          }).filter(Boolean) as string[];
        }
        
        // Remove duplicates and sort
        criteriaLetters = Array.from(new Set(criteriaLetters)).sort();
        
        const objectivesHtml = criteriaLetters.length > 0
          ? criteriaLetters.map(letter => `<span class="objective-badge">Critère ${clean(letter)}</span>`).join('')
          : '<span style="font-size: 10px;">Non défini</span>';

        htmlContent += `
          <div class="unit-card">
            <div class="unit-header">Unité ${index + 1} : ${clean(plan.title || "Sans titre")}</div>
            
            <div class="field-group">
              <div class="field-label">📌 Énoncé de recherche</div>
              <div class="field-value">${clean(plan.statementOfInquiry || "Non défini")}</div>
            </div>

            <div class="field-group">
              <div class="field-label">🔑 Concept clé</div>
              <div class="field-value">${clean(plan.keyConcept || "Non défini")}</div>
            </div>

            <div class="field-group">
              <div class="field-label">🔗 Concepts connexes</div>
              <div class="field-value">${clean(Array.isArray(plan.relatedConcepts) ? plan.relatedConcepts.join(", ") : plan.relatedConcepts || "Non défini")}</div>
            </div>

            <div class="field-group">
              <div class="field-label">🌍 Contexte mondial</div>
              <div class="field-value">${clean(plan.globalContext || "Non défini")}</div>
            </div>

            <div class="field-group">
              <div class="field-label">📖 Chapitres et leçons</div>
              <div class="field-value" style="padding-left: 10px;">
                ${plan.chapters 
                  ? plan.chapters.split('\n')
                      .filter((line: string) => line.trim())
                      .map((line: string) => line.trim().startsWith('-') ? line.trim() : `- ${line.trim()}`)
                      .join('<br/>')
                  : 'Non défini'}
              </div>
            </div>
          </div>
        `;
      });
      
      htmlContent += `
          </div>
        </div>
      `;
    });

    htmlContent += `
      </body>
      </html>
    `;

    // Convert HTML to Blob and download
    const blob = new Blob([htmlContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    
    // Use FileSaver to download
    const saveAs = (FileSaver as any).saveAs || FileSaver;
    saveAs(blob, `Planification_Annuelle_${clean(grade).replace(/ /g, '_')}.doc`);
    
  } catch (error: any) {
    console.error("Error generating consolidated document:", error);
    alert("Erreur lors de la génération du document consolidé: " + error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// exportOverviewToWord
// Génère un document Word (HTML simulé) "Description générale du programme"
// pour une matière donnée — toutes les années PEI 1 à 5 dans un seul document,
// sous la même forme que le modèle joint (tableau IB officiel).
// ─────────────────────────────────────────────────────────────────────────────
export const exportOverviewToWord = async (subject: string): Promise<void> => {
  try {
    // 1. Charger tous les plans pour toutes les années
    const plansByGrade = await loadAllPlansForSubjectAllGrades(subject);
    const grades = ['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'];

    // 2. Générer les lignes du tableau via l'AI helper
    const overviewRows = await generateOverviewForSubject(subject, plansByGrade);

    if (overviewRows.length === 0) {
      alert("Aucune unité trouvée pour " + subject + ". Veuillez d'abord générer les planifications pour toutes les années.");
      return;
    }

    // 3. Grouper les lignes par année PEI
    const rowsByGrade: Record<string, OverviewUnitRow[]> = {};
    for (const grade of grades) {
      rowsByGrade[grade] = overviewRows.filter(r => r.grade === grade);
    }

    // 4. Construire le HTML du document
    // Calculer le tableau de conformité
    const allCriteria = ['A.i', 'A.ii', 'B.i', 'B.ii', 'B.iii', 'B.iv', 'C.i', 'C.ii', 'C.iii', 'D.i', 'D.ii', 'D.iii', 'D.iv'];
    const gradeNames = ['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'];
    
    // Compter les occurrences par critère et par grade dans les plans réels
    const criteriaCount: Record<string, Record<string, number>> = {};
    for (const criterion of allCriteria) {
      criteriaCount[criterion] = {};
      for (const grade of gradeNames) {
        const gradePlans = plansByGrade[grade] || [];
        const count = gradePlans.filter(p => {
          const obj = (p.objectives || []).join(' ');
          const assessments = (p.assessments || []).map(a => a.criterion).join(' ');
          return obj.includes(criterion.charAt(0)) || assessments.includes(criterion.charAt(0));
        }).length;
        criteriaCount[criterion][grade] = count;
      }
    }

    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4 landscape; margin: 15mm 12mm; }
    body {
      font-family: 'Calibri', Arial, sans-serif;
      font-size: 9pt;
      color: #222;
      margin: 0;
      padding: 0;
      line-height: 1.3;
    }
    .doc-title {
      font-size: 14pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 4px;
      color: #1e3a5f;
    }
    .doc-subtitle {
      font-size: 11pt;
      font-style: italic;
      text-align: center;
      margin-bottom: 14px;
      color: #1e3a5f;
    }
    .requirements-box {
      border: 2px solid #1e3a5f;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 20px;
      background: #f0f4ff;
    }
    .requirements-box h2 {
      font-size: 11pt;
      font-weight: bold;
      color: #1e3a5f;
      margin: 0 0 10px 0;
      border-bottom: 1px solid #4472c4;
      padding-bottom: 5px;
    }
    .requirements-list {
      margin: 0;
      padding: 0 0 0 18px;
      font-size: 8.5pt;
      color: #1e3a5f;
    }
    .requirements-list li {
      margin-bottom: 4px;
      line-height: 1.4;
    }
    .req-highlight {
      font-weight: bold;
      color: #c00000;
    }
    .compliance-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 8pt;
    }
    .compliance-table th {
      background: #1e3a5f;
      color: white;
      padding: 5px 6px;
      border: 1px solid #4472c4;
      text-align: center;
      font-size: 8pt;
    }
    .compliance-table td {
      border: 1px solid #adc6e0;
      padding: 4px 6px;
      text-align: center;
      font-size: 8pt;
    }
    .compliance-table td.criterion-label {
      text-align: left;
      font-weight: bold;
      background: #dce6f1;
      color: #1e3a5f;
    }
    .conf-ok { background: #d9ead3; color: #274e13; font-weight: bold; }
    .conf-warn { background: #fff2cc; color: #7f6000; font-weight: bold; }
    .conf-fail { background: #f4cccc; color: #990000; font-weight: bold; }
    .grade-section {
      page-break-before: always;
      margin-bottom: 20px;
    }
    .grade-section:first-of-type { page-break-before: avoid; }
    .grade-label {
      font-size: 12pt;
      font-weight: bold;
      color: #1e3a5f;
      background: #dce6f1;
      padding: 5px 10px;
      border: 1px solid #9bbcd6;
      border-radius: 3px;
      margin-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th {
      background-color: #bdd7ee;
      color: #1e3a5f;
      font-weight: bold;
      font-size: 8.5pt;
      text-align: center;
      padding: 5px 4px;
      border: 1px solid #4472c4;
      vertical-align: middle;
      word-wrap: break-word;
    }
    td {
      border: 1px solid #4472c4;
      padding: 4px 5px;
      vertical-align: top;
      font-size: 8pt;
      word-wrap: break-word;
      line-height: 1.35;
    }
    td.unit-title {
      font-weight: bold;
      color: #1e3a5f;
      text-decoration: underline;
      text-align: center;
      font-size: 8.5pt;
    }
    td.hours {
      font-weight: bold;
      text-align: center;
      font-size: 8.5pt;
    }
    td.concept-key { font-weight: bold; text-align: center; }
    td.statement { font-style: italic; color: #1a1a2e; }
    td.objectives { text-align: center; font-weight: bold; }
    .content-list { margin: 0; padding: 0 0 0 12px; }
    .content-list li { margin-bottom: 2px; }
    /* Column widths for landscape A4 */
    col.c1 { width: 11%; }
    col.c2 { width: 6%; }
    col.c3 { width: 9%; }
    col.c4 { width: 11%; }
    col.c5 { width: 18%; }
    col.c6 { width: 6%; }
    col.c7 { width: 14%; }
    col.c8 { width: 25%; }
  </style>
</head>
<body>
  <div class="doc-title">Description générale du programme de &laquo;&nbsp;<em>${clean(subject)}</em>&nbsp;&raquo;</div>
  <div class="doc-subtitle">Les Écoles Internationales Al Kawthar — Programme d'Éducation Intermédiaire (PEI 1 à PEI 5)</div>

  <!-- ═══ SECTION : ATTENTES ET EXIGENCES IB ═══ -->
  <div class="requirements-box">
    <h2>1. Attentes — Cadre de Conformité IB</h2>
    <p style="font-size:8.5pt;color:#1e3a5f;margin-bottom:8px;">
      La description générale du groupe de matières doit :
    </p>
    <ul class="requirements-list">
      <li>Fournir des preuves d'une <strong>planification verticale et horizontale</strong> ;</li>
      <li>Documenter le programme d'études écrit dans chaque groupe de matières pour <strong>toutes les années du programme</strong> ;</li>
      <li>Comprendre un <strong>résumé du contenu</strong> ;</li>
      <li>Montrer que, tout au long des années du programme, l'établissement a :
        <ol style="margin-top:4px;padding-left:20px;">
          <li>Intégré les <strong>concepts clés</strong> requis ;</li>
          <li>Abordé les <strong>concepts connexes</strong> ;</li>
          <li>Intégré les <strong>contextes mondiaux</strong> du PEI ;</li>
          <li>Développé les compétences des <strong>approches de l'apprentissage (ATL)</strong> ;</li>
          <li>Offert aux élèves des occasions d'atteindre tous les <strong>objectifs spécifiques</strong> du groupe de matières du PEI de manière équilibrée ;</li>
          <li>Engagé les élèves dans des activités d'éducation physique pendant au moins <strong>50 % du temps total</strong> d'enseignement consacré à cette matière.</li>
        </ol>
      </li>
    </ul>
    <p style="font-size:8.5pt;color:#c00000;margin-top:8px;font-weight:bold;">
      Exigence importante (Exigence 0401-01-0521) : 
      <span style="color:#1e3a5f;font-weight:normal;">le groupe de matières doit aborder tous les aspects de chacun des objectifs spécifiques <strong>au moins deux fois</strong> au cours de chaque année du PEI.</span>
    </p>
  </div>

  <!-- ═══ SECTION : TABLEAU DE CONFORMITÉ ═══ -->
  <div style="page-break-before: avoid; margin-bottom: 20px;">
    <div class="grade-label" style="font-size:10pt;">Tableau de Vérification de la Fréquence des Aspects (PEI 1 à PEI 5)</div>
    <table class="compliance-table">
      <thead>
        <tr>
          <th style="text-align:left;width:18%;">Objectif Spécifique / Aspect</th>
          <th style="width:15%;">PEI 1</th>
          <th style="width:15%;">PEI 2</th>
          <th style="width:15%;">PEI 3</th>
          <th style="width:15%;">PEI 4</th>
          <th style="width:15%;">PEI 5</th>
          <th style="width:7%;">Conformité<br/>(≥2)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td class="criterion-label" colspan="7" style="background:#1e3a5f;color:white;font-weight:bold;padding:4px 6px;">Objectif A : Connaissances et compréhension</td></tr>
        ${['A.i: Utiliser le vocabulaire / terminologie en contexte', 'A.ii: Démontrer une connaissance/compréhension du contenu'].map((crit, idx) => {
          const key = ['A.i', 'A.ii'][idx];
          const counts = gradeNames.map(g => {
            const gPlans = plansByGrade[g] || [];
            const c = gPlans.filter(p => (p.objectives || []).some(o => o.includes('A')) || (p.assessments || []).some(a => a.criterion === 'A')).length;
            return c;
          });
          const isConf = counts.every(c => c >= 2);
          return `<tr>
            <td class="criterion-label" style="padding-left:10px;font-weight:normal;">${clean(crit)}</td>
            ${counts.map(c => `<td class="${c >= 2 ? 'conf-ok' : c >= 1 ? 'conf-warn' : 'conf-fail'}">${c}</td>`).join('')}
            <td class="${isConf ? 'conf-ok' : 'conf-warn'}">${isConf ? '✅ CONFORME' : '⚠️ À VÉRIFIER'}</td>
          </tr>`;
        }).join('')}
        <tr><td class="criterion-label" colspan="7" style="background:#1e3a5f;color:white;font-weight:bold;padding:4px 6px;">Objectif B : Recherche</td></tr>
        ${['B.i: Formuler une question de recherche', 'B.ii: Formuler et suivre un plan d\'action', 'B.iii: Collecter et enregistrer des informations', 'B.iv: Évaluer le processus et les résultats'].map((crit, idx) => {
          const counts = gradeNames.map(g => {
            const gPlans = plansByGrade[g] || [];
            return gPlans.filter(p => (p.objectives || []).some(o => o.includes('B')) || (p.assessments || []).some(a => a.criterion === 'B')).length;
          });
          const isConf = counts.every(c => c >= 2);
          return `<tr>
            <td class="criterion-label" style="padding-left:10px;font-weight:normal;">${clean(crit)}</td>
            ${counts.map(c => `<td class="${c >= 2 ? 'conf-ok' : c >= 1 ? 'conf-warn' : 'conf-fail'}">${c}</td>`).join('')}
            <td class="${isConf ? 'conf-ok' : 'conf-warn'}">${isConf ? '✅ CONFORME' : '⚠️ À VÉRIFIER'}</td>
          </tr>`;
        }).join('')}
        <tr><td class="criterion-label" colspan="7" style="background:#1e3a5f;color:white;font-weight:bold;padding:4px 6px;">Objectif C : Communication</td></tr>
        ${['C.i: Communiquer des informations dans un style adapté', 'C.ii: Structurer / Organiser informations et idées', 'C.iii: Documenter les sources (bibliographie)'].map(crit => {
          const counts = gradeNames.map(g => {
            const gPlans = plansByGrade[g] || [];
            return gPlans.filter(p => (p.objectives || []).some(o => o.includes('C')) || (p.assessments || []).some(a => a.criterion === 'C')).length;
          });
          const isConf = counts.every(c => c >= 2);
          return `<tr>
            <td class="criterion-label" style="padding-left:10px;font-weight:normal;">${clean(crit)}</td>
            ${counts.map(c => `<td class="${c >= 2 ? 'conf-ok' : c >= 1 ? 'conf-warn' : 'conf-fail'}">${c}</td>`).join('')}
            <td class="${isConf ? 'conf-ok' : 'conf-warn'}">${isConf ? '✅ CONFORME' : '⚠️ À VÉRIFIER'}</td>
          </tr>`;
        }).join('')}
        <tr><td class="criterion-label" colspan="7" style="background:#1e3a5f;color:white;font-weight:bold;padding:4px 6px;">Objectif D : Pensée critique</td></tr>
        ${['D.i: Discuter / analyser concepts, problèmes, modèles', 'D.ii: Synthétiser / résumer pour développer des arguments', 'D.iii: Analyser / évaluer origine, but, valeur, limites', 'D.iv: Interpréter différentes perspectives et leurs implications'].map(crit => {
          const counts = gradeNames.map(g => {
            const gPlans = plansByGrade[g] || [];
            return gPlans.filter(p => (p.objectives || []).some(o => o.includes('D')) || (p.assessments || []).some(a => a.criterion === 'D')).length;
          });
          const isConf = counts.every(c => c >= 2);
          return `<tr>
            <td class="criterion-label" style="padding-left:10px;font-weight:normal;">${clean(crit)}</td>
            ${counts.map(c => `<td class="${c >= 2 ? 'conf-ok' : c >= 1 ? 'conf-warn' : 'conf-fail'}">${c}</td>`).join('')}
            <td class="${isConf ? 'conf-ok' : 'conf-warn'}">${isConf ? '✅ CONFORME' : '⚠️ À VÉRIFIER'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
`;

    for (const grade of grades) {
      const gradeRows = rowsByGrade[grade] || [];
      if (gradeRows.length === 0) continue;

      htmlContent += `
  <div class="grade-section">
    <div class="grade-label">${clean(grade)}</div>
    <table>
      <colgroup>
        <col class="c1"/><col class="c2"/><col class="c3"/><col class="c4"/>
        <col class="c5"/><col class="c6"/><col class="c7"/><col class="c8"/>
      </colgroup>
      <thead>
        <tr>
          <th>Titre de l'unité<br/>et heures d'enseignement</th>
          <th>Concept clé</th>
          <th>Concepts connexes</th>
          <th>Contexte mondial</th>
          <th><u>Énoncé de recherche</u></th>
          <th><u>Objectifs spécifiques</u></th>
          <th>Compétences spécifiques aux approches de l'apprentissage</th>
          <th><u>Contenu</u></th>
        </tr>
      </thead>
      <tbody>
`;

      for (const row of gradeRows) {
        // Formater le contenu en liste à puces
        const contentLines = row.content
          ? row.content.split('\n')
              .filter(l => l.trim())
              .map(l => l.trim().replace(/^[-•]\s*/, ''))
          : [];
        const contentHtml = contentLines.length > 0
          ? `<ul class="content-list">${contentLines.map(l => `<li>${clean(l)}</li>`).join('')}</ul>`
          : clean(row.content);

        // Formater les ATL skills
        const atlLines = row.atlSkills
          ? row.atlSkills.split('\n').filter(l => l.trim()).map(l => l.trim().replace(/^[-•]\s*/, ''))
          : [];
        const atlHtml = atlLines.length > 0
          ? atlLines.join('<br/>')
          : clean(row.atlSkills);

        // Formater les objectifs
        const objLines = row.objectives
          ? row.objectives.split('\n').filter(l => l.trim())
          : [];
        const objHtml = objLines.length > 0
          ? objLines.join('<br/>')
          : clean(row.objectives);

        htmlContent += `
        <tr>
          <td>
            <span class="unit-title" style="display:block;text-align:center;font-weight:bold;text-decoration:underline;">${clean(row.unitTitle)}</span>
            <div style="text-align:center;font-weight:bold;margin-top:3px;">${clean(row.hoursTotal)}</div>
          </td>
          <td class="concept-key">${clean(row.keyConcept)}</td>
          <td>${clean(row.relatedConcepts)}</td>
          <td>${clean(row.globalContext)}</td>
          <td class="statement">${clean(row.statementOfInquiry)}</td>
          <td class="objectives">${objHtml}</td>
          <td>${atlHtml}</td>
          <td>${contentHtml}</td>
        </tr>
`;
      }

      htmlContent += `
      </tbody>
    </table>
  </div>
`;
    }

    htmlContent += `
</body>
</html>`;

    // 5. Télécharger en tant que .doc (Word HTML)
    const blob = new Blob([htmlContent], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const saveAs = (FileSaver as any).saveAs || FileSaver;
    saveAs(blob, `Overview_${clean(subject).replace(/[^a-z0-9]/gi, '_')}_PEI1-5.doc`);

  } catch (error: any) {
    console.error("Error generating overview document:", error);
    alert("Erreur lors de la génération de l'aperçu: " + error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// exportInterdisciplinaryToWord
// Génère un document Word HTML calqué sur le template IB officiel :
//   Page 1 : En-tête + Section RECHERCHE (concept, contexte, énoncé, questions,
//             critères d'évaluation, ATL)
//   Page 2 : Section ACTION (base par discipline, processus, évaluation, différenciation)
//   Page 3 : Section RÉFLEXION (avant / pendant / suite)
// ─────────────────────────────────────────────────────────────────────────────
export const exportInterdisciplinaryToWord = (unit: InterdisciplinaryUnit): void => {
  const esc = (s: string | undefined | null) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const listItems = (arr: string[]): string =>
    arr.length ? `<ul>${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p>—</p>';

  const criteriaRows = (unit.summativeCriteria || []).map(c => `
    <tr>
      <td style="text-align:center;font-weight:bold;background:#dce6f1;">${esc(c.criterion)}</td>
      <td style="font-weight:bold;">${esc(c.name)}</td>
      <td>${esc(c.discipline)}</td>
      <td><ul>${(c.strands || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul></td>
      <td style="text-align:center;font-weight:bold;">8</td>
    </tr>`).join('');

  const disciplineBaseRows = (unit.disciplineBases || []).map(db => `
    <tr>
      <td style="font-weight:bold;background:#f0f4ff;">${esc(db.discipline)}<br/><span style="font-weight:normal;font-size:8pt;">${esc(db.teacher)}</span></td>
      <td>${esc(db.ibObjective)}</td>
      <td>${(db.relatedConcepts || []).map(c => esc(c)).join(', ')}</td>
      <td>${esc(db.content)}</td>
      <td>${esc(db.learningActivities)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 18mm 15mm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.45; }

  /* ── Page header ── */
  .doc-header { border: 2px solid #1e3a5f; padding: 10px 14px; margin-bottom: 14px; background: #f0f4ff; }
  .doc-header h1 { font-size: 14pt; color: #1e3a5f; margin: 0 0 4px 0; text-align: center; }
  .doc-header .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 9pt; }
  .doc-header .meta-row { display: flex; gap: 6px; }
  .doc-header .meta-label { font-weight: bold; color: #1e3a5f; min-width: 140px; }

  /* ── Section titles ── */
  .section-title {
    background: #1e3a5f; color: white; font-size: 11pt; font-weight: bold;
    padding: 6px 12px; margin: 14px 0 8px 0; border-radius: 2px;
    page-break-before: always;
  }
  .section-title:first-of-type { page-break-before: avoid; }
  .subsection-title { font-size: 10pt; font-weight: bold; color: #1e3a5f; border-bottom: 1px solid #bfdbfe; margin: 10px 0 5px 0; padding-bottom: 2px; }

  /* ── Statement of Inquiry ── */
  .soi { font-style: italic; background: #fffbeb; border-left: 4px solid #f59e0b; padding: 8px 14px; margin: 8px 0; font-size: 10.5pt; color: #1a1a2e; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; font-size: 9pt; }
  th { background: #bfdbfe; color: #1e3a5f; font-weight: bold; padding: 5px 6px; border: 1px solid #4472c4; text-align: center; vertical-align: middle; }
  td { border: 1px solid #9bbcd6; padding: 4px 6px; vertical-align: top; }
  td ul { margin: 0; padding-left: 14px; }
  td li { margin-bottom: 2px; }

  /* ── Phases ── */
  .phases-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 8px 0; }
  .phase-box { border: 1px solid #bfdbfe; border-radius: 4px; padding: 8px; }
  .phase-box .phase-label { font-weight: bold; font-size: 9pt; color: #1e40af; margin-bottom: 4px; }

  /* ── Reflection table ── */
  .reflection-table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  .reflection-table th { background: #bfdbfe; color: #1e3a5f; border: 1px solid #4472c4; padding: 6px; font-size: 9pt; }
  .reflection-table td { border: 1px solid #9bbcd6; padding: 8px; vertical-align: top; min-height: 60px; font-size: 9pt; }

  /* ── Shared objectives / ATL ── */
  .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; margin: 6px 0; }
  .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 10px; font-size: 8.5pt; margin: 2px; font-weight: bold; }

  /* ── Criterion badges ── */
  .criterion-badge { display: inline-block; background: #ede9fe; color: #6d28d9; padding: 2px 10px; border-radius: 10px; font-size: 8.5pt; font-weight: bold; margin: 2px; }
</style>
</head>
<body>

<!-- ═══════════════════════════════════ EN-TÊTE ═══════════════════════════════════ -->
<div class="doc-header">
  <h1>🔗 Plan d'unité interdisciplinaire — IB PEI</h1>
  <div class="meta-grid">
    <div class="meta-row"><span class="meta-label">Enseignant(s) :</span>
      <span>${unit.disciplines.map((d, i) => `${esc(d)}: <strong>${esc(unit.teachers[i] || '—')}</strong>`).join(' | ')}</span>
    </div>
    <div class="meta-row"><span class="meta-label">Groupe(s) de matières :</span>
      <span>${unit.disciplines.map(d => esc(d)).join(', ')}</span>
    </div>
    <div class="meta-row"><span class="meta-label">Titre de l'unité :</span>
      <span><strong>${esc(unit.title)}</strong></span>
    </div>
    <div class="meta-row"><span class="meta-label">Année du PEI :</span>
      <span>${esc(unit.grade)}</span>
    </div>
    <div class="meta-row"><span class="meta-label">Durée de l'unité :</span>
      <span>${esc(unit.duration)}</span>
    </div>
    <div class="meta-row"><span class="meta-label">Contexte mondial :</span>
      <span>${esc(unit.globalContext)}</span>
    </div>
  </div>
</div>

<!-- ═══════════════════ SECTION 1 : RECHERCHE ═══════════════════ -->
<div class="section-title">🔍 RECHERCHE : définition de l'objectif de l'unité interdisciplinaire</div>

<div class="subsection-title">But de l'intégration</div>
<div class="info-box">${esc(unit.integrationPurpose)}</div>

<div class="subsection-title">Concept(s) clé(s) / Concepts connexes</div>
<div class="info-box">
  <strong>Concept clé :</strong> <span class="badge">${esc(unit.keyConcept)}</span>
  &nbsp;&nbsp;
  <strong>Concepts connexes :</strong>
  ${(unit.relatedConcepts || []).map(c => `<span class="badge">${esc(c)}</span>`).join(' ')}
</div>

<div class="subsection-title">Objectifs communs aux disciplines</div>
<div class="info-box">${listItems(unit.sharedObjectives || [])}</div>

<div class="subsection-title">Énoncé de recherche</div>
<div class="soi">📌 ${esc(unit.statementOfInquiry)}</div>

<div class="subsection-title">Questions de recherche</div>
<table>
  <thead><tr><th>Type</th><th>Questions</th></tr></thead>
  <tbody>
    <tr>
      <td style="font-weight:bold;color:#1e40af;text-align:center;white-space:nowrap;">Factuelle(s)</td>
      <td>${listItems(unit.inquiryQuestions?.factual || [])}</td>
    </tr>
    <tr>
      <td style="font-weight:bold;color:#065f46;text-align:center;white-space:nowrap;">Conceptuelle(s)</td>
      <td>${listItems(unit.inquiryQuestions?.conceptual || [])}</td>
    </tr>
    <tr>
      <td style="font-weight:bold;color:#92400e;text-align:center;white-space:nowrap;">Invitant au débat</td>
      <td>${listItems(unit.inquiryQuestions?.debatable || [])}</td>
    </tr>
  </tbody>
</table>

<div class="subsection-title">Évaluation sommative — Critères interdisciplinaires (A, B, C — chacun /8)</div>
<table>
  <thead>
    <tr>
      <th style="width:5%;">Critère</th>
      <th style="width:22%;">Nom du critère</th>
      <th style="width:15%;">Discipline</th>
      <th style="width:43%;">Sous-aspects (strands)</th>
      <th style="width:6%;">Sur</th>
    </tr>
  </thead>
  <tbody>${criteriaRows}</tbody>
</table>

<div class="subsection-title">Tâches d'évaluation par critère</div>
<table>
  <thead><tr><th>Critère</th><th>Description de la tâche</th></tr></thead>
  <tbody>
    ${(unit.summativeCriteria || []).map(c => `
    <tr>
      <td style="text-align:center;font-weight:bold;width:8%;"><span class="criterion-badge">Critère ${esc(c.criterion)}</span></td>
      <td>${esc(c.task)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<div class="subsection-title">Approches de l'apprentissage (ATL)</div>
<div class="info-box">${listItems(unit.atlSkills || [])}</div>

<!-- ═══════════════════ SECTION 2 : ACTION ═══════════════════ -->
<div class="section-title">⚡ ACTION : enseignement et apprentissage par le biais de la recherche interdisciplinaire</div>

<div class="subsection-title">Bases disciplinaires</div>
<table>
  <thead>
    <tr>
      <th style="width:16%;">Matière / Enseignant</th>
      <th style="width:20%;">Objectif spécifique IB</th>
      <th style="width:15%;">Concepts connexes</th>
      <th style="width:24%;">Contenu</th>
      <th style="width:25%;">Activités d'apprentissage et stratégies d'enseignement</th>
    </tr>
  </thead>
  <tbody>${disciplineBaseRows}</tbody>
</table>

<div class="subsection-title">Processus d'apprentissage interdisciplinaire</div>
<div class="info-box">${esc(unit.interdisciplinaryLearningProcess)}</div>

<div class="subsection-title">Stratégies d'évaluation formative</div>
<div class="info-box">${esc(unit.formativeStrategies)}</div>

<div class="subsection-title">Tâche sommative finale (intégrant toutes les disciplines)</div>
<div class="info-box" style="border-left: 4px solid #1e3a5f; background:#f0f4ff;">${esc(unit.summativeTask)}</div>

<div class="subsection-title">Différenciation</div>
<div class="info-box">${esc(unit.differentiation)}</div>

<div class="subsection-title">Ressources</div>
<div class="info-box">${esc(unit.resources)}</div>

<!-- ═══════════════════ SECTION 3 : RÉFLEXION ═══════════════════ -->
<div class="section-title">💡 RÉFLEXION : examen de la planification, du processus et de l'impact</div>

<div class="subsection-title">Vue d'ensemble des phases de l'unité</div>
<div class="phases-grid">
  <div class="phase-box">
    <div class="phase-label">🔍 RECHERCHE</div>
    <p style="font-size:9pt;margin:0;">${esc(unit.phases?.recherche)}</p>
  </div>
  <div class="phase-box">
    <div class="phase-label">⚡ ACTION</div>
    <p style="font-size:9pt;margin:0;">${esc(unit.phases?.action)}</p>
  </div>
  <div class="phase-box">
    <div class="phase-label">💡 RÉFLEXION</div>
    <p style="font-size:9pt;margin:0;">${esc(unit.phases?.reflexion)}</p>
  </div>
</div>

<div class="subsection-title">Réflexion des enseignants</div>
<table class="reflection-table">
  <thead>
    <tr>
      <th style="width:33%;">Avant l'unité</th>
      <th style="width:33%;">Pendant l'unité</th>
      <th style="width:34%;">Suite à l'unité</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>${esc(unit.reflection?.before)}</td>
      <td>${esc(unit.reflection?.during)}</td>
      <td>${esc(unit.reflection?.after)}</td>
    </tr>
  </tbody>
</table>

</body>
</html>`;

  const blob = new Blob([html], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const saveAs = (FileSaver as any).saveAs || FileSaver;
  const safeName = (unit.title || 'interdisciplinaire').replace(/[^a-z0-9]/gi, '_').substring(0, 40);
  const safeGrade = (unit.grade || '').replace(/\s+/g, '');
  saveAs(blob, `Interdisciplinaire_${safeName}_${safeGrade}.doc`);
};

// ─────────────────────────────────────────────────────────────────────────────
// exportInterdisciplinaryOverviewToWord
// Tableau synthèse de toutes les unités interdisciplinaires (toutes classes)
// Correspond au modèle "Planification de l'unité interdisciplinaire" fourni
// ─────────────────────────────────────────────────────────────────────────────
export const exportInterdisciplinaryOverviewToWord = async (units: InterdisciplinaryUnit[]): Promise<void> => {
  const esc = (s: string | undefined | null) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const rows = units.map(u => {
    const disciplines = (u.disciplines || []).join(' + ');
    const teachers = (u.disciplines || []).map((d, i) => `${d}: ${u.teachers?.[i] || '—'}`).join(' | ');
    const purpose = esc(u.integrationPurpose || '');
    const perspectives = [
      u.keyConcept ? `Concept clé : ${u.keyConcept}` : '',
      u.relatedConcepts?.length ? `Connexes : ${u.relatedConcepts.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    return `
    <tr>
      <td style="text-align:center;font-weight:bold;">${esc(u.grade)}</td>
      <td>${esc(u.title)}<br/><span style="font-size:8pt;color:#666;">${esc(teachers)}</span></td>
      <td>${esc(disciplines)}</td>
      <td>${esc(purpose)}</td>
      <td>${esc(perspectives)}</td>
      <td>${esc(u.globalContext)}</td>
      <td style="text-align:center;">${esc(u.duration)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 landscape; margin: 15mm 12mm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #1e293b; }
  h1 { text-align:center; font-size:13pt; color:#1e3a5f; margin-bottom:4px; }
  h2 { text-align:center; font-size:10pt; color:#64748b; font-weight:normal; margin-top:0; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th { background:#1e3a5f; color:white; font-size:9pt; font-weight:bold; padding:6px 5px; border:1px solid #4472c4; text-align:center; vertical-align:middle; }
  td { border:1px solid #9bbcd6; padding:4px 5px; vertical-align:top; font-size:8.5pt; }
  tr:nth-child(even) td { background:#f0f4ff; }
  .footer { text-align:center; margin-top:10px; font-size:8pt; color:#94a3b8; }
</style>
</head>
<body>
<h1>Planification de l'unité interdisciplinaire</h1>
<h2>Programme des Écoles Intermédiaires (PEI) — IB</h2>
<table>
  <thead>
    <tr>
      <th style="width:7%;">Année du PEI</th>
      <th style="width:20%;">Titre de l'unité</th>
      <th style="width:16%;">Matières</th>
      <th style="width:22%;">But de l'intégration</th>
      <th style="width:16%;">Perspectives<br/>(Concept clé / Connexes)</th>
      <th style="width:13%;">Contexte mondial</th>
      <th style="width:6%;">Durée</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Document généré automatiquement — Planificateur PEI IB Al Kawthar</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const saveAs = (FileSaver as any).saveAs || FileSaver;
  saveAs(blob, `Planification_Interdisciplinaire_Toutes_Classes.doc`);
};

// ─────────────────────────────────────────────────────────────────────────────
// exportSEAOverviewToWord
// Tableau synthèse "Planification Service et Action" — toutes classes
// Correspond au modèle avec colonnes Classe, Matière, Contexte mondial,
// SEA (titre + contenu), Type, Objectif ciblé, Échéancier, Compétences ATL
// ─────────────────────────────────────────────────────────────────────────────
export const exportSEAOverviewToWord = async (seaPlans: ServiceActionPlan[]): Promise<void> => {
  const esc = (s: string | undefined | null) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const rows = seaPlans.map(sea => {
    const actionTypes = (sea.actionTypes || []).join(', ');
    const selectedOutcomes = (sea.learningOutcomes || [])
      .filter(lo => lo.selected)
      .map(lo => `OA${lo.id}: ${lo.text.substring(0, 50)}…`)
      .join('\n');
    const atl = (sea.atlSkills || []).join('\n');
    const journals = (sea.journalEntries || []);
    const dateRange = journals.length >= 2
      ? `Du ${esc(journals[0]?.date || '')} au ${esc(journals[journals.length - 1]?.date || '')}`
      : journals.length === 1 ? esc(journals[0]?.date || '') : '';

    return `
    <tr>
      <td style="text-align:center;font-weight:bold;">${esc(sea.grade)}</td>
      <td>${esc(sea.subject)}<br/><span style="font-size:7.5pt;color:#666;">${esc(sea.teacherName)}</span></td>
      <td style="font-size:8pt;">${esc(sea.globalContext)}</td>
      <td>
        <strong>${esc(sea.title)}</strong><br/>
        <span style="font-size:7.5pt;color:#555;font-style:italic;">Basé sur : ${esc(sea.sourceUnitTitle)}</span><br/>
        <span style="font-size:7.5pt;">${esc(sea.projectDescription?.substring(0, 200) || '')}${(sea.projectDescription?.length || 0) > 200 ? '…' : ''}</span>
      </td>
      <td style="font-size:8pt;">${esc(actionTypes)}</td>
      <td style="font-size:7.5pt;">${esc(selectedOutcomes)}</td>
      <td style="font-size:8pt;text-align:center;">${esc(dateRange)}</td>
      <td style="font-size:7.5pt;">${esc(atl)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 landscape; margin: 15mm 12mm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #1e293b; }
  h1 { text-align:center; font-size:13pt; color:#1e3a5f; margin-bottom:2px; font-weight:bold; }
  h2 { text-align:center; font-size:9.5pt; color:#64748b; font-weight:normal; margin-top:0; margin-bottom:4px; font-style:italic; }
  h3 { text-align:center; font-size:9pt; color:#475569; font-weight:normal; margin-top:0; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th { background:#1e3a5f; color:white; font-size:8.5pt; font-weight:bold; padding:5px 4px; border:1px solid #4472c4; text-align:center; vertical-align:middle; }
  td { border:1px solid #9bbcd6; padding:4px 5px; vertical-align:top; font-size:8pt; }
  tr:nth-child(even) td { background:#fff5f5; }
  .footer { text-align:center; margin-top:10px; font-size:8pt; color:#94a3b8; }
</style>
</head>
<body>
<h1>Planification Service et Action</h1>
<h2>Le projet SEA engage les élèves à être des citoyens actifs et responsables dans leur communauté.</h2>
<h3>Programme des Écoles Intermédiaires (PEI) — IB Al Kawthar</h3>
<table>
  <thead>
    <tr>
      <th style="width:6%;">Classe</th>
      <th style="width:10%;">Matière</th>
      <th style="width:12%;">Contexte mondial</th>
      <th style="width:28%;">SEA (titre et contenu de l'action)</th>
      <th style="width:11%;">Type (direct, indirect, défense d'une cause, recherche)</th>
      <th style="width:15%;">Objectif ciblé (à préciser)</th>
      <th style="width:9%;">Échéancier (du…au…)</th>
      <th style="width:9%;">Compétences ATL/PEI</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Document généré automatiquement — Planificateur PEI IB Al Kawthar</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const saveAs = (FileSaver as any).saveAs || FileSaver;
  saveAs(blob, `Planification_Service_et_Action_Toutes_Classes.doc`);
};

// ─────────────────────────────────────────────────────────────────────────────
// exportSEAPlanToWord
// Export complet d'un plan SEA individuel en Word
// ─────────────────────────────────────────────────────────────────────────────
export const exportSEAPlanToWord = (sea: ServiceActionPlan): void => {
  const esc = (s: string | undefined | null) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const li = (arr: string[]) => arr.length
    ? `<ul>${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '<p>—</p>';

  const journalRows = (sea.journalEntries || []).map((e, i) => `
    <tr>
      <td style="text-align:center;font-weight:bold;">${i + 1}</td>
      <td style="text-align:center;">${esc(e.date)}</td>
      <td>${esc(e.description)}</td>
    </tr>`).join('');

  const outcomeRows = (sea.learningOutcomes || []).map(lo => `
    <tr style="${lo.selected ? 'background:#dcfce7;' : ''}">
      <td style="text-align:center;font-weight:bold;">${lo.id}</td>
      <td>${esc(lo.text)}</td>
      <td style="text-align:center;">${lo.selected ? '✅' : '☐'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 18mm 15mm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.45; }
  .doc-header { border: 2px solid #be123c; padding: 10px 14px; margin-bottom: 14px; background: #fff1f2; }
  .doc-header h1 { font-size: 13pt; color: #be123c; margin: 0 0 4px 0; text-align:center; }
  .doc-header .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 9pt; }
  .meta-row { display: flex; gap: 6px; }
  .meta-label { font-weight: bold; color: #be123c; min-width: 140px; }
  .section-title { background: #be123c; color: white; font-size: 11pt; font-weight: bold; padding: 6px 12px; margin: 14px 0 8px 0; border-radius: 2px; }
  .subsection-title { font-size: 10pt; font-weight: bold; color: #be123c; border-bottom: 1px solid #fecdd3; margin: 10px 0 5px 0; padding-bottom: 2px; }
  .info-box { background: #fff8f8; border: 1px solid #fecdd3; border-radius: 4px; padding: 8px 12px; margin: 6px 0; }
  .highlight-box { background: #fff0f2; border-left: 4px solid #be123c; padding: 8px 14px; margin: 8px 0; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; font-size: 9pt; }
  th { background: #fecdd3; color: #be123c; font-weight: bold; padding: 5px 6px; border: 1px solid #e11d48; text-align: center; }
  td { border: 1px solid #fda4af; padding: 4px 6px; vertical-align: top; }
  .badge { display: inline-block; background: #fce7f3; color: #be123c; padding: 2px 8px; border-radius: 10px; font-size: 8.5pt; margin: 2px; font-weight: bold; }
  .outcome-badge { display: inline-block; background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 10px; font-size: 8.5pt; margin: 2px; font-weight: bold; }
</style>
</head>
<body>

<div class="doc-header">
  <h1>❤️ Service en tant qu'Action — IB PEI</h1>
  <div class="meta-grid">
    <div class="meta-row"><span class="meta-label">Enseignant(e) :</span><span><strong>${esc(sea.teacherName || '—')}</strong></span></div>
    <div class="meta-row"><span class="meta-label">Matière :</span><span>${esc(sea.subject)}</span></div>
    <div class="meta-row"><span class="meta-label">Titre du projet :</span><span><strong>${esc(sea.title)}</strong></span></div>
    <div class="meta-row"><span class="meta-label">Classe :</span><span>${esc(sea.grade)}</span></div>
    <div class="meta-row"><span class="meta-label">Unité source :</span><span>${esc(sea.sourceUnitTitle)}</span></div>
    <div class="meta-row"><span class="meta-label">Contexte mondial :</span><span>${esc(sea.globalContext)}</span></div>
    <div class="meta-row"><span class="meta-label">Concept clé :</span><span>${esc(sea.keyConcept)}</span></div>
    <div class="meta-row"><span class="meta-label">Type(s) d'action :</span><span>${(sea.actionTypes || []).map(t => `<span class="badge">${esc(t)}</span>`).join(' ')}</span></div>
  </div>
</div>

<!-- A. Identification -->
<div class="section-title">A. Identification du projet</div>
<div class="subsection-title">Description de l'action</div>
<div class="info-box">${esc(sea.projectDescription)}</div>

<div class="subsection-title">Besoin de la communauté</div>
<div class="highlight-box">${esc(sea.communityNeed)}</div>

<div class="subsection-title">Lien avec l'unité de cours</div>
<div class="info-box">${esc(sea.linkToUnit)}</div>

<!-- C. Objectifs d'apprentissage IB -->
<div class="section-title">B. Objectifs d'apprentissage du Service (7 officiels IB)</div>
<table>
  <thead>
    <tr>
      <th style="width:5%;">N°</th>
      <th>Objectif d'apprentissage</th>
      <th style="width:10%;">Sélectionné</th>
    </tr>
  </thead>
  <tbody>${outcomeRows}</tbody>
</table>

<!-- D. Compétences ATL -->
<div class="section-title">C. Compétences ATL développées</div>
<div class="info-box">${li(sea.atlSkills || [])}</div>

<!-- E. Module d'évaluation -->
<div class="section-title">D. Évaluation et réflexion post-action</div>

<div class="subsection-title">Journal de bord (3 rencontres minimum IB)</div>
<table>
  <thead>
    <tr>
      <th style="width:6%;">Séance</th>
      <th style="width:20%;">Date</th>
      <th>Description de la rencontre / des activités réalisées</th>
    </tr>
  </thead>
  <tbody>${journalRows}</tbody>
</table>

<div class="subsection-title">Questions de réflexion finale</div>
<table>
  <thead><tr><th>N°</th><th>Question de réflexion spécifique au projet</th></tr></thead>
  <tbody>
    ${(sea.reflectionPrompts || []).map((q, i) => `
    <tr>
      <td style="text-align:center;font-weight:bold;">${i + 1}</td>
      <td>${esc(q.question)}</td>
    </tr>`).join('')}
  </tbody>
</table>

<div class="subsection-title">Critères de réussite (mesurables)</div>
<table>
  <thead><tr><th>Critère</th><th>Description mesurable</th></tr></thead>
  <tbody>
    ${(sea.successCriteria || []).map((c, i) => `
    <tr>
      <td style="text-align:center;font-weight:bold;">${i + 1}</td>
      <td>${esc(c.description)}</td>
    </tr>`).join('')}
  </tbody>
</table>

</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const saveAs = (FileSaver as any).saveAs || FileSaver;
  const safeName = (sea.title || 'sea').replace(/[^a-z0-9]/gi, '_').substring(0, 40);
  const safeGrade = (sea.grade || '').replace(/\s+/g, '');
  saveAs(blob, `SEA_${safeName}_${safeGrade}.doc`);
};
// ─────────────────────────────────────────────────────────────────────────────
// exportCompleteInterdisciplinaryThemePlan
// Export complet de TOUTES les unités interdisciplinaires en un seul document
// (plan détaillé complet pour chaque unité, pas juste le tableau synthèse)
// ─────────────────────────────────────────────────────────────────────────────
export const exportCompleteInterdisciplinaryThemePlan = (units: InterdisciplinaryUnit[]): void => {
  if (!units || units.length === 0) return;

  const esc = (s: string | undefined | null) =>
    (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const li = (arr: string[]): string =>
    arr.length ? `<ul>${arr.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p>—</p>';

  const buildUnitSection = (unit: InterdisciplinaryUnit, index: number): string => {
    const criteriaRows = (unit.summativeCriteria || []).map(c => `
      <tr>
        <td style="text-align:center;font-weight:bold;background:#dce6f1;width:5%;">${esc(c.criterion)}</td>
        <td style="font-weight:bold;">${esc(c.name)}</td>
        <td>${esc(c.discipline)}</td>
        <td><ul>${(c.strands || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul></td>
        <td style="text-align:center;font-weight:bold;width:5%;">8</td>
      </tr>`).join('');

    const disciplineBaseRows = (unit.disciplineBases || []).map(db => `
      <tr>
        <td style="font-weight:bold;background:#f0f4ff;width:15%;">${esc(db.discipline)}<br/><span style="font-weight:normal;font-size:8pt;">${esc(db.teacher)}</span></td>
        <td>${esc(db.ibObjective)}</td>
        <td>${(db.relatedConcepts || []).map(c => esc(c)).join(', ')}</td>
        <td>${esc(db.content)}</td>
        <td>${esc(db.learningActivities)}</td>
      </tr>`).join('');

    return `
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- UNITÉ ${index + 1} : ${esc(unit.title)}                                -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="unit-separator" style="${index > 0 ? 'page-break-before:always;' : ''}">
  <div class="unit-header">
    <div class="unit-number">Unité ${index + 1} / ${units.length}</div>
    <h2>${esc(unit.title)}</h2>
    <div class="unit-meta">
      <span>📅 ${esc(unit.grade)}</span>
      <span>⏱️ ${esc(unit.duration)}</span>
      <span>🔗 ${unit.disciplines.map(d => esc(d)).join(' + ')}</span>
      <span>🌍 ${esc(unit.globalContext)}</span>
    </div>
    <div class="teachers-row">
      ${unit.disciplines.map((d, i) => `<span class="teacher-badge">${esc(d)}: <strong>${esc(unit.teachers?.[i] || '—')}</strong></span>`).join(' &nbsp;|&nbsp; ')}
    </div>
  </div>

  <!-- SECTION RECHERCHE -->
  <div class="section-title">🔍 RECHERCHE</div>

  <div class="subsection-title">But de l'intégration</div>
  <div class="info-box">${esc(unit.integrationPurpose)}</div>

  <div class="subsection-title">Concepts</div>
  <div class="info-box">
    <strong>Concept clé :</strong> <span class="badge">${esc(unit.keyConcept)}</span>
    &nbsp;&nbsp;
    <strong>Concepts connexes :</strong>
    ${(unit.relatedConcepts || []).map(c => `<span class="badge">${esc(c)}</span>`).join(' ')}
  </div>

  <div class="subsection-title">Objectifs communs aux disciplines</div>
  <div class="info-box">${li(unit.sharedObjectives || [])}</div>

  <div class="subsection-title">Énoncé de recherche</div>
  <div class="soi">📌 ${esc(unit.statementOfInquiry)}</div>

  <div class="subsection-title">Questions de recherche</div>
  <table>
    <thead><tr><th style="width:18%;">Type</th><th>Questions</th></tr></thead>
    <tbody>
      <tr>
        <td style="font-weight:bold;color:#1e40af;text-align:center;">Factuelle(s)</td>
        <td>${li(unit.inquiryQuestions?.factual || [])}</td>
      </tr>
      <tr>
        <td style="font-weight:bold;color:#065f46;text-align:center;">Conceptuelle(s)</td>
        <td>${li(unit.inquiryQuestions?.conceptual || [])}</td>
      </tr>
      <tr>
        <td style="font-weight:bold;color:#92400e;text-align:center;">Invitant au débat</td>
        <td>${li(unit.inquiryQuestions?.debatable || [])}</td>
      </tr>
    </tbody>
  </table>

  <div class="subsection-title">Critères d'évaluation sommative (A, B, C — chacun /8)</div>
  <table>
    <thead>
      <tr>
        <th>Crit.</th><th>Nom du critère</th><th>Discipline</th><th>Sous-aspects (strands)</th><th>Sur</th>
      </tr>
    </thead>
    <tbody>${criteriaRows}</tbody>
  </table>

  ${(unit.summativeCriteria || []).length > 0 ? `
  <div class="subsection-title">Tâches d'évaluation par critère</div>
  <table>
    <thead><tr><th style="width:10%;">Critère</th><th>Description de la tâche</th></tr></thead>
    <tbody>
      ${(unit.summativeCriteria || []).map(c => `
      <tr>
        <td style="text-align:center;font-weight:bold;"><span class="criterion-badge">Critère ${esc(c.criterion)}</span></td>
        <td>${esc(c.task)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <div class="subsection-title">Compétences ATL</div>
  <div class="info-box">${li(unit.atlSkills || [])}</div>

  <!-- SECTION ACTION -->
  <div class="section-title">⚡ ACTION</div>

  <div class="subsection-title">Bases disciplinaires</div>
  <table>
    <thead>
      <tr>
        <th>Matière / Enseignant</th>
        <th>Objectif spécifique IB</th>
        <th>Concepts connexes</th>
        <th>Contenu</th>
        <th>Activités d'apprentissage</th>
      </tr>
    </thead>
    <tbody>${disciplineBaseRows}</tbody>
  </table>

  <div class="subsection-title">Processus d'apprentissage interdisciplinaire</div>
  <div class="info-box">${esc(unit.interdisciplinaryLearningProcess)}</div>

  <div class="subsection-title">Stratégies d'évaluation formative</div>
  <div class="info-box">${esc(unit.formativeStrategies)}</div>

  <div class="subsection-title">Tâche sommative finale</div>
  <div class="info-box" style="border-left:4px solid #1e3a5f;background:#f0f4ff;">${esc(unit.summativeTask)}</div>

  <div class="subsection-title">Différenciation</div>
  <div class="info-box">${esc(unit.differentiation)}</div>

  <div class="subsection-title">Ressources</div>
  <div class="info-box">${esc(unit.resources)}</div>

  <!-- SECTION RÉFLEXION -->
  <div class="section-title">💡 RÉFLEXION</div>

  <div class="phases-grid">
    <div class="phase-box">
      <div class="phase-label">🔍 RECHERCHE</div>
      <p style="font-size:9pt;margin:0;">${esc(unit.phases?.recherche)}</p>
    </div>
    <div class="phase-box">
      <div class="phase-label">⚡ ACTION</div>
      <p style="font-size:9pt;margin:0;">${esc(unit.phases?.action)}</p>
    </div>
    <div class="phase-box">
      <div class="phase-label">💡 RÉFLEXION</div>
      <p style="font-size:9pt;margin:0;">${esc(unit.phases?.reflexion)}</p>
    </div>
  </div>

  <div class="subsection-title">Réflexion des enseignants</div>
  <table>
    <thead>
      <tr>
        <th style="width:33%;">Avant l'unité</th>
        <th style="width:33%;">Pendant l'unité</th>
        <th style="width:34%;">Suite à l'unité</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="min-height:60px;">${esc(unit.reflection?.before)}</td>
        <td style="min-height:60px;">${esc(unit.reflection?.during)}</td>
        <td style="min-height:60px;">${esc(unit.reflection?.after)}</td>
      </tr>
    </tbody>
  </table>
</div>`;
  };

  const allUnitsHtml = units.map((u, i) => buildUnitSection(u, i)).join('\n\n');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 18mm 15mm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #1e293b; line-height: 1.45; }

  /* Cover */
  .cover { text-align:center; padding: 60px 20px 40px; border-bottom: 3px solid #1e3a5f; margin-bottom: 30px; }
  .cover h1 { font-size: 20pt; color: #1e3a5f; margin-bottom: 8px; }
  .cover h2 { font-size: 13pt; color: #64748b; font-weight: normal; margin: 0 0 20px; }
  .cover .cover-meta { display: inline-block; background: #f0f4ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 24px; }
  .cover .cover-meta p { margin: 4px 0; font-size: 10pt; color: #334155; }

  /* Unit header */
  .unit-header { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 14px 18px; border-radius: 4px; margin-bottom: 14px; }
  .unit-header .unit-number { font-size: 9pt; opacity: 0.8; margin-bottom: 4px; }
  .unit-header h2 { font-size: 14pt; margin: 0 0 8px; }
  .unit-header .unit-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 9pt; opacity: 0.9; margin-bottom: 6px; }
  .unit-header .teachers-row { font-size: 9pt; opacity: 0.85; }
  .teacher-badge { background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px; }

  /* Sections */
  .section-title { background: #1e3a5f; color: white; font-size: 11pt; font-weight: bold; padding: 6px 12px; margin: 14px 0 8px; border-radius: 2px; }
  .subsection-title { font-size: 10pt; font-weight: bold; color: #1e3a5f; border-bottom: 1px solid #bfdbfe; margin: 10px 0 5px; padding-bottom: 2px; }
  .soi { font-style: italic; background: #fffbeb; border-left: 4px solid #f59e0b; padding: 8px 14px; margin: 8px 0; font-size: 10.5pt; color: #1a1a2e; }
  .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; margin: 6px 0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 9pt; }
  th { background: #bfdbfe; color: #1e3a5f; font-weight: bold; padding: 5px 6px; border: 1px solid #4472c4; text-align: center; vertical-align: middle; }
  td { border: 1px solid #9bbcd6; padding: 4px 6px; vertical-align: top; }
  td ul { margin: 0; padding-left: 14px; }
  td li { margin-bottom: 2px; }
  tr:nth-child(even) td { background: #f0f7ff; }

  /* Phases */
  .phases-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 8px 0; }
  .phase-box { border: 1px solid #bfdbfe; border-radius: 4px; padding: 8px; }
  .phase-box .phase-label { font-weight: bold; font-size: 9pt; color: #1e40af; margin-bottom: 4px; }

  /* Badges */
  .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 10px; font-size: 8.5pt; margin: 2px; font-weight: bold; }
  .criterion-badge { display: inline-block; background: #ede9fe; color: #6d28d9; padding: 2px 10px; border-radius: 10px; font-size: 8.5pt; font-weight: bold; margin: 2px; }

  /* Footer */
  .footer { text-align: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; }
</style>
</head>
<body>

<!-- PAGE DE COUVERTURE -->
<div class="cover">
  <h1>🔗 Planification des Unités Interdisciplinaires</h1>
  <h2>Programme des Écoles Intermédiaires (PEI) — IB Al Kawthar</h2>
  <div class="cover-meta">
    <p><strong>${units.length} unité(s) interdisciplinaire(s)</strong></p>
    <p>Classes : ${[...new Set(units.map(u => u.grade))].sort().join(', ')}</p>
    <p>Disciplines : ${[...new Set(units.flatMap(u => u.disciplines))].join(' • ')}</p>
    <p style="color:#64748b;font-size:9pt;margin-top:8px;">Document généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>
</div>

${allUnitsHtml}

<div class="footer">Document généré automatiquement — Planificateur PEI IB Al Kawthar</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const saveAs = (FileSaver as any).saveAs || FileSaver;
  saveAs(blob, `Plan_Complet_Interdisciplinaire_Toutes_Classes.doc`);
};

// ─────────────────────────────────────────────────────────────────────────────
// exportInterdisciplinaryAssessmentsToZip
// Génère un ZIP contenant un fichier .docx d'évaluation critériée (même modèle
// que les unités classiques) pour CHAQUE critère A, B, C d'une unité
// interdisciplinaire. Les critères summativeCriteria sont convertis en
// AssessmentData puis injectés dans le template EVAL_TEMPLATE_URL existant.
// ─────────────────────────────────────────────────────────────────────────────
export const exportInterdisciplinaryAssessmentsToZip = async (
  unit: InterdisciplinaryUnit
): Promise<void> => {
  try {
    const criteria = unit.summativeCriteria;
    if (!criteria || criteria.length === 0) {
      alert("Aucun critère d'évaluation trouvé pour cette unité interdisciplinaire.");
      return;
    }

    // Build a synthetic UnitPlan header for the template fields
    const syntheticPlan: UnitPlan = {
      id: unit.id,
      teacherName: (unit.teachers || []).join(' / '),
      title: unit.title,
      subject: (unit.disciplines || []).join(' + '),
      gradeLevel: unit.grade,
      duration: unit.duration || '',
      keyConcept: unit.keyConcept || '',
      relatedConcepts: unit.relatedConcepts || [],
      globalContext: unit.globalContext || '',
      statementOfInquiry: unit.statementOfInquiry || '',
      inquiryQuestions: { factual: [], conceptual: [], debatable: [] },
      objectives: (unit.summativeCriteria || []).map(c => `Critère ${c.criterion}`),
      atlSkills: unit.atlSkills || [],
      content: unit.content || '',
      learningExperiences: unit.interdisciplinaryLearningProcess || '',
      summativeAssessment: unit.summativeTask || '',
      formativeAssessment: unit.formativeStrategies || '',
      differentiation: unit.differentiation || '',
      resources: unit.resources || '',
      reflection: {
        prior: unit.reflection?.before || '',
        during: unit.reflection?.during || '',
        after: unit.reflection?.after || '',
      },
      generatedAssessmentDocument: '',
      assessments: [],
    };

    // Convert each summative criterion into a full AssessmentData
    const assessments: AssessmentData[] = criteria.map(c => {
      const strands = (c.strands && c.strands.length >= 3)
        ? c.strands
        : [
            `i. Mobiliser les savoirs de plusieurs disciplines pour analyser le thème commun`,
            `ii. Établir des liens explicites entre les concepts disciplinaires`,
            `iii. Justifier la pertinence de chaque discipline dans l'approche du thème`,
          ];

      // Build a 5-level rubric (0, 1-2, 3-4, 5-6, 7-8) adapted to the criterion
      const rubricRows = [
        {
          level: '0',
          descriptor: "L'élève n'atteint pas le niveau décrit par les descripteurs suivants.",
        },
        {
          level: '1–2',
          descriptor: `L'élève démontre une compréhension limitée de ${c.name}. Il établit peu de liens entre les disciplines et mobilise les savoirs de façon partielle.`,
        },
        {
          level: '3–4',
          descriptor: `L'élève démontre une compréhension partielle de ${c.name}. Il établit quelques liens interdisciplinaires et mobilise les savoirs avec un certain degré de pertinence.`,
        },
        {
          level: '5–6',
          descriptor: `L'élève démontre une bonne compréhension de ${c.name}. Il établit des liens clairs entre les disciplines et mobilise les savoirs de façon cohérente.`,
        },
        {
          level: '7–8',
          descriptor: `L'élève démontre une compréhension approfondie de ${c.name}. Il établit des liens rigoureux et nuancés entre les disciplines, mobilise les savoirs avec pertinence et justifie sa démarche interdisciplinaire de façon convaincante.`,
        },
      ];

      // Build exercises from the criterion task (titles without "Exercice N :" or "Critère X :" — template adds them)
      const exercises = [
        {
          title: `Tâche interdisciplinaire`,
          content: c.task || `Réaliser une tâche intégrant les apports de ${(unit.disciplines || []).join(', ')} sur le thème "${unit.title}".`,
          criterionReference: strands[0] || '',
          workspaceNeeded: true,
        },
        {
          title: `Synthèse et argumentation`,
          content: `Présenter une réflexion structurée démontrant votre maîtrise de "${c.name}" en mobilisant les ressources de chaque discipline participante.`,
          criterionReference: strands[strands.length - 1] || '',
          workspaceNeeded: true,
        },
      ];

      return {
        criterion: c.criterion,
        criterionName: c.name,
        maxPoints: 8,
        strands,
        rubricRows,
        exercises,
      };
    });

    // Load template and build ZIP
    const templateContent = await loadFile('eval');
    const zip = new JSZip();
    const folderName = `Evaluations_Interdisc_${clean(unit.title).replace(/ /g, '_').substring(0, 30)}_${clean(unit.grade).replace(/ /g, '')}`;
    const folder = zip.folder(folderName);

    for (const assessment of assessments) {
      const data = mapAssessmentToTemplate(syntheticPlan, assessment);
      const docBlob = generateDocumentBlob(templateContent, data);
      const fileName = `Eval_Critere_${assessment.criterion}_Interdisc_${clean(unit.title).substring(0, 20)}.docx`;
      folder?.file(fileName, docBlob);
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const saveAs = (FileSaver as any).saveAs || FileSaver;
    saveAs(zipContent, `${folderName}.zip`);
  } catch (error: any) {
    console.error('Error generating interdisciplinary assessments ZIP:', error);
    alert("Erreur lors de la génération des évaluations interdisciplinaires : " + error.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CALENDRIER ANNUEL EN WORD (HTML inline, paysage A3/A4)
// ─────────────────────────────────────────────────────────────────────────────
export const exportCalendarToWord = async (calendar: AnnualCalendar, grade: string): Promise<void> => {
  const saveAs = (FileSaver as any).saveAs || FileSaver;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const lightenHex = (hex: string, amount = 0.8): string => {
    if (!hex.startsWith('#')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.round(r + (255 - r) * amount);
    const lg = Math.round(g + (255 - g) * amount);
    const lb = Math.round(b + (255 - b) * amount);
    return `rgb(${lr},${lg},${lb})`;
  };

  const darkenHex = (hex: string, amount = 0.35): string => {
    if (!hex.startsWith('#')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r*(1-amount))},${Math.round(g*(1-amount))},${Math.round(b*(1-amount))})`;
  };

  const getSubjectColor = (subject: string): string => SUBJECT_COLORS[subject] || '#6b7280';

  const getSubjectAbbr = (subject: string): string => {
    const map: Record<string, string> = {
      'Langue et littérature': 'L&L', 'Acquisition de langues': 'AcqL',
      'Individus et sociétés': 'I&S', 'Sciences': 'Sci', 'Mathématiques': 'Math',
      'Arts': 'Arts', 'Éducation physique et à la santé': 'EPS', 'Design': 'Des',
    };
    return map[subject] || subject.slice(0, 5);
  };

  // ── Construire les données : un tableau par semaine ───────────────────────
  const entryByWeek = new Map<number, CalendarEntry[]>();
  for (const entry of calendar.entries) {
    if (!entryByWeek.has(entry.weekNum)) entryByWeek.set(entry.weekNum, []);
    entryByWeek.get(entry.weekNum)!.push(entry);
  }

  // Matières présentes dans le calendrier
  const subjects = [...new Set(calendar.entries.map(e => e.subject))].sort();

  // ── Légende HTML ──────────────────────────────────────────────────────────
  const legendItems = subjects.map(subj => {
    const color = getSubjectColor(subj);
    return `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 4px;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700;background-color:${lightenHex(color,0.8)};color:${darkenHex(color)};border:1px solid ${color};">
      <span style="width:8px;height:8px;border-radius:50%;background-color:${color};display:inline-block;"></span>${subj}
    </span>`;
  }).join('');

  // ── Tableau principal semaine par semaine ─────────────────────────────────
  // ORIENTATION PAYSAGE : tableau avec colonnes = matières + 1 colonne semaine
  const colWidth = Math.floor(200 / (subjects.length + 1));

  const tableHeader = `
    <tr style="background-color:#1e3a5f;">
      <th style="width:80px;padding:6px 4px;color:#fff;font-size:10px;text-align:center;border:1px solid #2d5a8e;">Semaine</th>
      <th style="width:80px;padding:6px 4px;color:#fff;font-size:10px;text-align:center;border:1px solid #2d5a8e;">Dates</th>
      ${subjects.map(s => {
        const color = getSubjectColor(s);
        return `<th style="width:${colWidth}mm;padding:6px 4px;color:#fff;font-size:9px;text-align:center;border:1px solid #2d5a8e;background-color:${color};">${getSubjectAbbr(s)}</th>`;
      }).join('')}
    </tr>`;

  const tableRows = SCHOOL_WEEKS_2026_2027.map(week => {
    const entries = entryByWeek.get(week.num) || [];
    const isVacation = [16, 17].includes(week.num);
    const isFerie = [12].includes(week.num);
    const rowBg = isVacation || isFerie ? '#f1f5f9' : '#ffffff';

    const weekLabel = isVacation ? `<div style="font-size:8px;color:#94a3b8;font-style:italic;">Vacances</div>` : '';

    const cells = subjects.map(subject => {
      const subjEntries = entries.filter(e => e.subject === subject);
      if (subjEntries.length === 0) {
        return `<td style="padding:3px;border:1px solid #e2e8f0;background-color:${rowBg};"></td>`;
      }
      const color = getSubjectColor(subject);
      const cellContent = subjEntries.map(e => {
        const isAssessment = e.type === 'assessment';
        if (isAssessment) {
          return `<div style="margin:1px 0;padding:2px 4px;font-size:8px;font-weight:700;border-radius:4px;border:2px solid ${color};color:${darkenHex(color)};background:#fff;text-align:center;">
            ★ Éval. Crit.${e.assessmentCriterion || ''}<br/><span style="font-size:7px;font-weight:400;">U${e.unitNumber}</span>
          </div>`;
        }
        return `<div style="margin:1px 0;padding:2px 4px;font-size:8px;font-weight:600;border-radius:4px;background-color:${lightenHex(color,0.75)};color:${darkenHex(color)};border:1px solid ${color};">
          U${e.unitNumber}: ${(e.unitTitle || '').slice(0, 25)}${(e.unitTitle || '').length > 25 ? '…' : ''}
        </div>`;
      }).join('');

      return `<td style="padding:3px;border:1px solid #e2e8f0;background-color:${isVacation || isFerie ? rowBg : lightenHex(color, 0.95)};vertical-align:top;">${cellContent}</td>`;
    }).join('');

    return `<tr style="background-color:${rowBg};">
      <td style="padding:4px 6px;border:1px solid #e2e8f0;text-align:center;font-weight:800;font-size:12px;color:#1e3a5f;background-color:${rowBg};vertical-align:middle;">
        S${week.num}${weekLabel}
      </td>
      <td style="padding:4px 6px;border:1px solid #e2e8f0;font-size:9px;color:#64748b;vertical-align:middle;text-align:center;">${week.dates}</td>
      ${cells}
    </tr>`;
  }).join('');

  // ── Statistiques par matière ─────────────────────────────────────────────
  const statsRows = subjects.map(subj => {
    const color = getSubjectColor(subj);
    const subjEntries = calendar.entries.filter(e => e.subject === subj);
    const unitCount = [...new Set(subjEntries.filter(e => e.type === 'unit').map(e => e.unitNumber))].length;
    const assessCount = subjEntries.filter(e => e.type === 'assessment').length;
    const weekCount = [...new Set(subjEntries.map(e => e.weekNum))].length;
    return `<tr>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;font-weight:700;color:${darkenHex(color)};background-color:${lightenHex(color,0.85)};">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background-color:${color};margin-right:4px;vertical-align:middle;"></span>${subj}
      </td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:600;">${unitCount}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:600;">${assessCount}</td>
      <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-weight:600;">${weekCount}</td>
    </tr>`;
  }).join('');

  // ── HTML complet ──────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Calendrier Annuel ${grade} — 2026-2027</title>
<style>
  @page { size: A3 landscape; margin: 10mm 8mm 10mm 8mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; }
  body { font-family: 'Calibri', Arial, sans-serif; font-size: 10px; color: #1e293b; margin: 0; padding: 0; }
  
  .page-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 10px; border-bottom: 3px solid #1e3a5f; margin-bottom: 10px; }
  .page-title { font-size: 18px; font-weight: 900; color: #1e3a5f; letter-spacing: -0.5px; }
  .page-subtitle { font-size: 10px; color: #64748b; margin-top: 2px; }
  .page-meta { text-align: right; font-size: 9px; color: #94a3b8; }

  .legend-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; margin-bottom: 8px; }
  .legend-title { font-size: 9px; font-weight: 700; color: #475569; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

  table { border-collapse: collapse; width: 100%; font-size: 9px; }
  th, td { vertical-align: top; }
  
  .section-title { font-size: 12px; font-weight: 800; color: #1e3a5f; margin: 12px 0 6px; padding: 4px 0; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 6px; }
  
  .stat-table th { background-color: #1e3a5f; color: #fff; padding: 5px 8px; text-align: center; font-size: 9px; border: 1px solid #2d5a8e; }
  
  .no-break { page-break-inside: avoid; }
  
  @media print {
    .page-header { position: fixed; top: 0; left: 0; right: 0; }
    .content { margin-top: 60px; }
  }
</style>
</head>
<body>

<!-- EN-TÊTE -->
<div class="page-header">
  <div>
    <div class="page-title">📅 Calendrier Annuel — ${grade}</div>
    <div class="page-subtitle">Les Écoles Internationales Al Kawthar · PEI Planner · Année scolaire 2026-2027 · 38 semaines</div>
  </div>
  <div class="page-meta">
    Généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}<br/>
    ${calendar.entries.filter(e=>e.type==='unit').length} semaines-unités · ${calendar.entries.filter(e=>e.type==='assessment').length} évaluations
  </div>
</div>

<!-- LÉGENDE -->
<div class="legend-box">
  <div class="legend-title">Légende des matières</div>
  <div>${legendItems}</div>
  <div style="margin-top:5px;display:flex;gap:12px;font-size:9px;color:#64748b;">
    <span>📘 U1, U2… = Numéro d'unité</span>
    <span>★ = Évaluation sommative (avec critère IB)</span>
    <span>Fond coloré = Semaine de l'unité</span>
    <span>Fond grisé = Période de vacances</span>
  </div>
</div>

<!-- TABLEAU PRINCIPAL -->
<div class="section-title">📊 Répartition hebdomadaire des unités et évaluations</div>
<table>
  <thead>${tableHeader}</thead>
  <tbody>${tableRows}</tbody>
</table>

<!-- STATISTIQUES -->
<div class="section-title" style="margin-top:16px;">📈 Récapitulatif par matière</div>
<table class="stat-table" style="width:60%;">
  <thead>
    <tr>
      <th style="width:40%;text-align:left;">Matière</th>
      <th>Nb Unités</th>
      <th>Nb Évaluations</th>
      <th>Semaines couvertes</th>
    </tr>
  </thead>
  <tbody>${statsRows}</tbody>
</table>

<!-- PIED DE PAGE -->
<div style="margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8;">
  <span>PEI Planner — Les Écoles Internationales Al Kawthar</span>
  <span>Programme IB PEI · Toutes les matières · Année 2026-2027</span>
  <span>Document confidentiel — Usage pédagogique interne</span>
</div>

<script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  saveAs(blob, `Calendrier_Annuel_${grade.replace(/ /g, '_')}_2026-2027.html`);
};
