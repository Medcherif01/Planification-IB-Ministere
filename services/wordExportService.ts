import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import FileSaver from "file-saver";
import JSZip from "jszip";
import { UnitPlan, AssessmentData, ServiceActionPlan } from "../types";
import { loadAllPlansForGrade, loadAllPlansForSubjectAllGrades } from "./databaseService";
import { generateOverviewForSubject, OverviewUnitRow, InterdisciplinaryUnit, AnnualCalendar, SCHOOL_WEEKS_2026_2027, SUBJECT_COLORS, CalendarEntry } from "./geminiService";

// ─────────────────────────────────────────────────────────────────────────────
// Chargement des templates Word via l'API backend (évite les problèmes CORS)
// L'API /api/template?type=plan|eval|exam télécharge le fichier côté serveur
// et le renvoie directement au frontend — aucun proxy tiers requis.
// ─────────────────────────────────────────────────────────────────────────────
const loadFile = async (templateType: 'plan' | 'eval' | 'exam'): Promise<ArrayBuffer> => {
  console.log(`[WORD] Chargement du template "${templateType}" via l'API backend...`);

  const response = await fetch(`/api/template?type=${templateType}&t=${Date.now()}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    let errMsg = `Erreur HTTP ${response.status}`;
    try {
      const json = await response.json();
      errMsg = json.error || json.message || errMsg;
    } catch (_) { /* ignore */ }
    throw new Error(errMsg);
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength < 100) {
    throw new Error("Le template téléchargé est vide ou invalide. Veuillez réessayer.");
  }

  console.log(`[WORD] Template "${templateType}" chargé avec succès (${buffer.byteLength} bytes)`);
  return buffer;
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

const generateDocumentBlob = (templateContent: ArrayBuffer, data: any): Blob => {
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

    // Get the generated zip
    const generatedZip = doc.getZip();
    
    // Force LTR (Left-to-Right) text direction by modifying document.xml settings
    try {
        const documentXml = generatedZip.file("word/document.xml")?.asText();
        if (documentXml) {
            // Ensure bidi="0" (LTR) is set in all paragraphs
            let modifiedXml = documentXml;
            
            // Add rtl="0" to paragraph properties if not present
            // This ensures left-to-right direction
            modifiedXml = modifiedXml.replace(
                /<w:pPr>/g,
                '<w:pPr><w:bidi w:val="0"/>'
            );
            
            // Also add to run properties for extra safety
            modifiedXml = modifiedXml.replace(
                /<w:rPr>/g,
                '<w:rPr><w:rtl w:val="0"/>'
            );
            
            generatedZip.file("word/document.xml", modifiedXml);
        }
    } catch (dirError) {
        console.warn("Could not modify text direction, using default:", dirError);
    }

    return generatedZip.generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
};

const generateDocument = async (templateType: 'plan' | 'eval' | 'exam', data: any, fileName: string) => {
  try {
    const content = await loadFile(templateType);
    const blob = generateDocumentBlob(content, data);
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

export const exportUnitPlanToWord = async (plan: UnitPlan) => {
  // Génère un document HTML complet portrait avec TOUS les champs IB PEI (sections A→R)
  const s = (v: string | undefined | null) => (v || '—').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const arr = (v: string[] | string | undefined) => {
    if (!v) return '—';
    const a = Array.isArray(v) ? v : [v];
    return a.map(x => `• ${x.replace(/</g,'&lt;').replace(/>/g,'&gt;')}`).join('<br>') || '—';
  };

  const objectives = Array.isArray(plan.objectives) ? plan.objectives : [];
  const atl = Array.isArray(plan.atlSkills) ? plan.atlSkills : (plan.atlSkills ? [plan.atlSkills] : []);
  const related = Array.isArray(plan.relatedConcepts) ? plan.relatedConcepts : [];

  const sectionStyle = 'background:#1e3a5f;color:white;font-size:10pt;font-weight:bold;padding:6px 10px;margin:0;';
  const subSectionStyle = 'background:#d6e4f0;color:#1e3a5f;font-size:9pt;font-weight:bold;padding:4px 8px;margin:0;';
  const cellStyle = 'padding:6px 10px;font-size:9pt;color:#222;vertical-align:top;border-bottom:1px solid #dde3ea;';
  const labelStyle = 'font-weight:bold;color:#1e3a5f;font-size:8pt;white-space:nowrap;width:180px;';

  // Helper pour une ligne de champ
  const row = (label: string, value: string) =>
    `<tr><td style="${cellStyle}${labelStyle}">${label}</td><td style="${cellStyle}">${value}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 15mm 12mm 15mm 15mm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #222; margin: 0; padding: 0; }
  .logo-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 10px; }
  .logo-header h1 { font-size: 14pt; color: #1e3a5f; margin: 0; }
  .logo-header p { font-size: 8pt; color: #555; margin: 2px 0 0 0; }
  .badge { background: #1e3a5f; color: white; border-radius: 4px; padding: 3px 10px; font-size: 9pt; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; border: 1px solid #b0c4d8; }
  .section-header { ${sectionStyle} }
  .sub-header { ${subSectionStyle} }
  .sessions-table { font-size: 8pt; }
  .sessions-table th { background: #1e3a5f; color: white; padding: 4px 6px; border: 1px solid #4472c4; text-align: center; }
  .sessions-table td { border: 1px solid #b0c4d8; padding: 3px 5px; vertical-align: top; }
  .sessions-table tr:nth-child(even) { background: #f5f9ff; }
  @media print { .no-print { display:none; } }
  .tag { display:inline-block; background:#e8f0fe; color:#1e3a5f; border-radius:10px; padding:2px 8px; margin:2px; font-size:8pt; font-weight:bold; }
  .obj-table td { border: 1px solid #b0c4d8; padding:4px 6px; vertical-align:top; font-size:8pt; }
  .obj-table th { background:#2d5986; color:white; padding:4px 6px; font-size:8pt; }
</style>
</head>
<body>

<!-- EN-TÊTE -->
<div class="logo-header">
  <div>
    <h1>📘 Plan d'Unité IB PEI — ${s(plan.title)}</h1>
    <p>Les Écoles Internationales Al-Kawthar · Programme IB MYP/PEI</p>
  </div>
  <div>
    <span class="badge">${s(plan.subject)}</span><br>
    <span class="badge" style="margin-top:4px;display:inline-block;">${s(plan.gradeLevel)}</span>
  </div>
</div>

<!-- A. INFORMATIONS GÉNÉRALES -->
<table>
  <tr><td colspan="2" class="section-header">A. Informations générales</td></tr>
  ${row('Enseignant(e)', s(plan.teacherName))}
  ${row('Groupe / Matière', s(plan.subject))}
  ${row('Titre de l\'unité', s(plan.title))}
  ${row('Niveau (PEI)', s(plan.gradeLevel))}
  ${row('Durée', s(plan.duration))}
  ${row('Année scolaire', s(plan.schoolYear || '2026-2027'))}
  ${row('Nombre de périodes', s(plan.numberOfPeriods || ''))}
  ${row('Nombre d\'heures', s(plan.numberOfHours || plan.duration))}
  ${row('Date de début', s(plan.startDate || ''))}
  ${row('Date de fin', s(plan.endDate || ''))}
  ${row('Prérequis', s(plan.prerequisites || plan.content?.slice(0, 150)))}
</table>

<!-- B. CONTEXTE DES ÉLÈVES -->
<table>
  <tr><td colspan="2" class="section-header">B. Contexte des élèves et connaissances antérieures</td></tr>
  ${row('Connaissances antérieures', s(plan.studentContext?.priorKnowledge))}
  ${row('Compétences déjà acquises', s(plan.studentContext?.acquiredSkills))}
  ${row('Liens avec les unités précédentes', s(plan.studentContext?.linksPreviousUnits))}
  ${row('Besoins spécifiques', s(plan.studentContext?.specificNeeds))}
  ${row('Diversité des profils', s(plan.studentContext?.profileDiversity || plan.studentContext?.culturalContexts))}
  ${row('Difficultés anticipées', s(plan.studentContext?.anticipatedDifficulties))}
</table>

<!-- C. CONCEPTS ET CONTEXTE MONDIAL -->
<table>
  <tr><td colspan="2" class="section-header">C. Concepts et contexte mondial</td></tr>
  ${row('Concept clé', s(plan.keyConcept))}
  ${row('Définition du concept clé', s(plan.keyConceptDefinition))}
  ${row('Concepts connexes', related.map(c=>`<span class="tag">${c.replace(/</g,'&lt;')}</span>`).join(' ') || '—')}
  ${row('Contexte mondial', s(plan.globalContext))}
  ${row('Aspects du contexte', s(plan.globalContextAspects))}
  ${row('Énoncé de recherche', `<em>${s(plan.statementOfInquiry)}</em>`)}
  ${row('Explication de l\'énoncé', s(plan.statementExplanation))}
</table>

<!-- D. QUESTIONS D'INVESTIGATION -->
<table>
  <tr><td colspan="2" class="section-header">D. Questions d'investigation (inquiry)</td></tr>
  <tr><td class="sub-header" colspan="2">Questions factuelles</td></tr>
  <tr><td colspan="2" style="${cellStyle}">${arr(plan.inquiryQuestions?.factual)}</td></tr>
  <tr><td class="sub-header" colspan="2">Questions conceptuelles</td></tr>
  <tr><td colspan="2" style="${cellStyle}">${arr(plan.inquiryQuestions?.conceptual)}</td></tr>
  <tr><td class="sub-header" colspan="2">Questions débattables</td></tr>
  <tr><td colspan="2" style="${cellStyle}">${arr(plan.inquiryQuestions?.debatable)}</td></tr>
</table>

<!-- E. OBJECTIFS ET CRITÈRES D'ÉVALUATION -->
<table>
  <tr><td colspan="5" class="section-header">E. Objectifs et critères d'évaluation IB (Objectif → Activité → Apprentissage → Évaluation)</td></tr>
  <tr class="obj-table">
    <th>Critère</th><th>Aspects évalués</th><th>Niveau attendu</th><th>Activités associées</th><th>Évaluation</th>
  </tr>
  ${objectives.map(cr => {
    const detail = plan.objectivesDetails?.find(d => d.criterion === cr);
    return `<tr class="obj-table">
      <td style="font-weight:bold;text-align:center;">${cr}</td>
      <td>${s(detail?.aspects)}</td>
      <td style="text-align:center;">${s(detail?.expectedLevel)}</td>
      <td>${s(detail?.activities)}</td>
      <td>${s(detail?.summativeAssessment || detail?.formativeAssessment)}</td>
    </tr>`;
  }).join('')}
  ${objectives.length === 0 ? `<tr><td colspan="5" style="${cellStyle}">Objectifs non définis</td></tr>` : ''}
</table>

<!-- F. COMPÉTENCES ATL -->
<table>
  <tr><td class="section-header">F. Approches de l'apprentissage (ATL)</td></tr>
  <tr><td style="${cellStyle}">${atl.map(a=>`<span class="tag">${a.replace(/</g,'&lt;')}</span>`).join(' ') || '—'}</td></tr>
</table>

<!-- G. CONTENU -->
<table>
  <tr><td colspan="2" class="section-header">G. Contenu de l'unité</td></tr>
  ${row('Contenu général', s(plan.content))}
  ${row('Connaissances (savoirs théoriques)', s(plan.contentDetails?.knowledges))}
  ${row('Notions / Vocabulaire clé', s(plan.contentDetails?.notions || plan.contentDetails?.vocabulary))}
  ${row('Méthodes et techniques', s(plan.contentDetails?.methods || plan.contentDetails?.techniques))}
  ${row('Compétences disciplinaires', s(plan.contentDetails?.disciplinarySkills))}
  ${row('Contenu obligatoire IB', s(plan.contentDetails?.mandatoryContent))}
  ${row('Liens programme national français', s(plan.contentDetails?.nationalLinks))}
</table>

<!-- H. PROCESSUS D'APPRENTISSAGE -->
<table>
  <tr><td colspan="2" class="section-header">H. Processus d'apprentissage</td></tr>
  ${row('Phase 1 — Activation', s(plan.learningProcess?.phase1_activation))}
  ${row('Phase 2 — Acquisition', s(plan.learningProcess?.phase2_acquisition))}
  ${row('Phase 3 — Mise en pratique', s(plan.learningProcess?.phase3_practice))}
  ${row('Phase 4 — Transfert', s(plan.learningProcess?.phase4_transfer))}
  ${row('Phase 5 — Réflexion', s(plan.learningProcess?.phase5_reflection))}
  ${row('Stratégies de l\'enseignant', s(plan.teachingStrategies))}
  ${row('Activités des élèves', s(plan.studentActivities))}
</table>

<!-- I. SÉANCES DÉTAILLÉES -->
<table>
  <tr><td class="section-header" colspan="9">I. Séances détaillées</td></tr>
  <tr>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">N°</th>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">Durée</th>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">Objectif</th>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">Contenu</th>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">Activité</th>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">ATL</th>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">Éval. form.</th>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">Différenciation</th>
    <th style="background:#2d5986;color:white;padding:4px;font-size:8pt;border:1px solid #4472c4;">Ressources</th>
  </tr>
  ${(plan.sessions || []).map(sess => `
  <tr style="font-size:8pt;">
    <td style="border:1px solid #b0c4d8;padding:3px;text-align:center;font-weight:bold;">${sess.numero}</td>
    <td style="border:1px solid #b0c4d8;padding:3px;text-align:center;">${s(sess.duree)}</td>
    <td style="border:1px solid #b0c4d8;padding:3px;">${s(sess.objectifApprentissage)}</td>
    <td style="border:1px solid #b0c4d8;padding:3px;">${s(sess.contenu)}</td>
    <td style="border:1px solid #b0c4d8;padding:3px;">${s(sess.activite)}</td>
    <td style="border:1px solid #b0c4d8;padding:3px;">${s(sess.atl)}</td>
    <td style="border:1px solid #b0c4d8;padding:3px;">${s(sess.evaluationFormative)}</td>
    <td style="border:1px solid #b0c4d8;padding:3px;">${s(sess.differenciation)}</td>
    <td style="border:1px solid #b0c4d8;padding:3px;">${s(sess.ressources)}</td>
  </tr>`).join('') || `<tr><td colspan="9" style="${cellStyle};color:#999">Séances non encore générées — utilisez "Ajouter Détails" dans l'application</td></tr>`}
</table>

<!-- L. ÉVALUATION FORMATIVE -->
<table>
  <tr><td class="section-header">L. Évaluation formative</td></tr>
  <tr><td style="${cellStyle}">${s(plan.formativeAssessment)}</td></tr>
</table>

<!-- M. ÉVALUATION SOMMATIVE -->
<table>
  <tr><td colspan="2" class="section-header">M. Évaluation sommative</td></tr>
  ${row('Description', s(plan.summativeAssessment))}
  ${plan.assessments?.length > 0 ? `<tr><td style="${cellStyle}${labelStyle}">Critères évalués</td><td style="${cellStyle}">${plan.assessments.map(a=>`<span class="tag">Critère ${a.criterion}: ${s(a.criterionName)} (/${a.maxPoints})</span>`).join(' ')}</td></tr>` : ''}
  ${plan.summativeDetails ? `
  ${row('Tâche / Consigne', s(plan.summativeDetails.consigne))}
  ${row('Production attendue', s(plan.summativeDetails.productionAttendue))}
  ${row('Durée', s(plan.summativeDetails.duree))}
  ${row('Modalités', s(plan.summativeDetails.modalites))}` : ''}
</table>

<!-- N. DIFFÉRENCIATION -->
<table>
  <tr><td colspan="2" class="section-header">N. Différenciation</td></tr>
  ${row('Stratégie globale', s(plan.differentiation))}
  <tr><td class="sub-header" colspan="2">Élèves en difficulté</td></tr>
  ${row('Soutien vocabulaire', s(plan.differentiationDetails?.supportStudents?.vocabulary))}
  ${row('Supports visuels', s(plan.differentiationDetails?.supportStudents?.visualSupports))}
  ${row('Modèles et étayage', s(plan.differentiationDetails?.supportStudents?.models))}
  ${row('Instructions adaptées', s(plan.differentiationDetails?.supportStudents?.adaptedInstructions))}
  ${row('Soutien individuel', s(plan.differentiationDetails?.supportStudents?.individualSupport))}
  <tr><td class="sub-header" colspan="2">Élèves avancés</td></tr>
  ${row('Approfondissement', s(plan.differentiationDetails?.advancedStudents?.deepening))}
  ${row('Défis et extension', s(plan.differentiationDetails?.advancedStudents?.challenges))}
  ${row('Recherche autonome', s(plan.differentiationDetails?.advancedStudents?.autonomousResearch))}
  <tr><td class="sub-header" colspan="2">Types de différenciation</td></tr>
  ${row('Par le contenu', s(plan.differentiationDetails?.contentDifferentiation))}
  ${row('Par le processus', s(plan.differentiationDetails?.processDifferentiation))}
  ${row('Par la production', s(plan.differentiationDetails?.productDifferentiation))}
</table>

<!-- O. RESSOURCES -->
<table>
  <tr><td class="section-header">O. Ressources</td></tr>
  <tr><td style="${cellStyle}">${s(plan.resources)}</td></tr>
</table>

<!-- P. RÉFLEXION -->
<table>
  <tr><td colspan="2" class="section-header">P. Réflexion de l'enseignant (avant / pendant / après)</td></tr>
  <tr><td class="sub-header" colspan="2">Avant l'unité</td></tr>
  ${row('Connaissances antérieures', s(plan.reflectionDetails?.before?.priorKnowledge || plan.reflection?.prior))}
  ${row('Difficultés anticipées', s(plan.reflectionDetails?.before?.anticipatedDifficulties))}
  ${row('Stratégies planifiées', s(plan.reflectionDetails?.before?.plannedStrategies))}
  ${row('Résultats attendus', s(plan.reflectionDetails?.before?.expectedOutcomes))}
  <tr><td class="sub-header" colspan="2">Pendant l'unité</td></tr>
  ${row('Progrès observés', s(plan.reflectionDetails?.during?.progressObserved || plan.reflection?.during))}
  ${row('Difficultés rencontrées', s(plan.reflectionDetails?.during?.difficulties))}
  ${row('Ajustements effectués', s(plan.reflectionDetails?.during?.adjustmentsMade))}
  <tr><td class="sub-header" colspan="2">Après l'unité</td></tr>
  ${row('Objectifs atteints', s(plan.reflectionDetails?.after?.achievedObjectives || plan.reflection?.after))}
  ${row('Points à améliorer', s(plan.reflectionDetails?.after?.improvements))}
  ${row('Modifications pour la suite', s(plan.reflectionDetails?.after?.modificationsNext))}
</table>

<!-- Q. COHÉRENCE VERTICALE ET HORIZONTALE -->
<table>
  <tr><td colspan="2" class="section-header">Q. Cohérence verticale et horizontale</td></tr>
  ${row('Cohérence verticale', s(plan.verticalCoherenceText || (plan.verticalCoherence as any)?.during || plan.reflectionDetails?.before?.previousLinks))}
  ${row('Cohérence horizontale', s(plan.horizontalCoherenceText || (plan.horizontalCoherence as any)?.otherSubjectLinks))}
</table>

<!-- R. LIENS INTERDISCIPLINAIRES -->
<table>
  <tr><td class="section-header">R. Liens interdisciplinaires</td></tr>
  <tr><td style="${cellStyle}">${s(plan.interdisciplinaryLinksText || (Array.isArray(plan.interdisciplinaryLinks) && plan.interdisciplinaryLinks.length > 0 ? plan.interdisciplinaryLinks.map((l:any)=>`${l.subject}: ${l.commonConcept}`).join(' | ') : undefined))}</td></tr>
</table>

<div style="margin-top:14px;border-top:1px solid #ccc;padding-top:6px;font-size:7.5pt;color:#888;text-align:center;">
  Document généré par PEI Planner — Les Écoles Internationales Al-Kawthar · ${new Date().toLocaleDateString('fr-FR')} · Conforme programme IB MYP/PEI
  ${plan.lastDetailUpdate ? ` · Dernière mise à jour IA: ${plan.lastDetailUpdate}` : ''}
</div>

<script>window.onload=()=>window.print();</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const saveAs = (FileSaver as any).saveAs || FileSaver;
  const filename = `Plan_Unite_${(plan.title || 'Sans_Titre').replace(/[^a-z0-9]/gi,'_').slice(0,40)}.html`;
  saveAs(blob, filename);
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
