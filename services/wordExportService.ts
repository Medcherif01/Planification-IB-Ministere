import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import FileSaver from "file-saver";
import JSZip from "jszip";
import { UnitPlan, AssessmentData, ServiceActionPlan } from "../types";
import { PLAN_TEMPLATE_URL, EVAL_TEMPLATE_URL } from "../constants";
import { loadAllPlansForGrade, loadAllPlansForSubjectAllGrades } from "./databaseService";
import { generateOverviewForSubject, OverviewUnitRow, InterdisciplinaryUnit } from "./geminiService";

// Helper function to fetch the template with retries and different proxies
const loadFile = async (url: string): Promise<ArrayBuffer> => {
  // Add timestamp to bypass cache
  const uniqueUrl = url + (url.includes('?') ? '&' : '?') + 't=' + new Date().getTime();
  
  // List of proxies to try in order
  const proxies = [
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://cors-anywhere.herokuapp.com/${u}` // Fallback
  ];

  for (const proxyGen of proxies) {
    try {
      const proxyUrl = proxyGen(uniqueUrl);
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        console.warn(`Proxy failed: ${proxyUrl}`);
        continue;
      }
      const buffer = await response.arrayBuffer();
      // Basic check: if buffer is too small, it might be an empty error file
      if (buffer.byteLength < 100) {
         continue;
      }
      return buffer;
    } catch (error) {
      console.warn("Error loading template with proxy:", error);
    }
  }
  
  throw new Error("Impossible de télécharger le modèle Word. Vérifiez votre connexion ou réessayez plus tard.");
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

const generateDocument = async (templateUrl: string, data: any, fileName: string) => {
  try {
    const content = await loadFile(templateUrl);
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
    exercices: exercises.map((ex, index) => ({
        numero: index + 1,
        titre: clean(ex.title),
        contenu: clean(ex.content),
        ref: clean(ex.criterionReference),
    }))
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
      exercices_ar: exercises.map((ex, index) => ({
        numero: index + 1,
        titre_ar: (ex as any).title_ar ? clean((ex as any).title_ar) : "(تمرين)",
        contenu_ar: (ex as any).content_ar ? clean((ex as any).content_ar) : "(المحتوى)",
        ref_ar: (ex as any).criterionReference_ar ? clean((ex as any).criterionReference_ar) : "",
      }))
    };
  }
  
  return baseData;
};

export const exportUnitPlanToWord = async (plan: UnitPlan) => {
  const isBilingual = isBilingualSubject(plan.subject);
  
  // Data mapping for Unit Plan Template
  const baseData = {
    enseignant: clean(plan.teacherName) || "____________________",
    groupe_matiere: clean(plan.subject),
    titre_unite: clean(plan.title),
    annee_pei: clean(plan.gradeLevel),
    duree: clean(plan.duration),
    concept_cle: clean(plan.keyConcept),
    concepts_connexes: Array.isArray(plan.relatedConcepts) ? clean(plan.relatedConcepts.join(", ")) : clean(plan.relatedConcepts),
    contexte_mondial: clean(plan.globalContext),
    enonce_de_recherche: clean(plan.statementOfInquiry),
    
    questions_factuelles: clean(plan.inquiryQuestions?.factual?.join("\n") || ""),
    questions_conceptuelles: clean(plan.inquiryQuestions?.conceptual?.join("\n") || ""),
    questions_debat: clean(plan.inquiryQuestions?.debatable?.join("\n") || ""),
    
    objectifs_specifiques: clean(Array.isArray(plan.objectives) ? plan.objectives.join("\n") : plan.objectives),
    evaluation_sommative: clean(plan.summativeAssessment),
    approches_apprentissage: clean(Array.isArray(plan.atlSkills) ? plan.atlSkills.join("\n") : plan.atlSkills),
    
    contenu: clean(plan.content),
    processus_apprentissage: clean(plan.learningExperiences),
    evaluation_formative: clean(plan.formativeAssessment),
    differenciation: clean(plan.differentiation),
    ressources: clean(plan.resources),
    
    reflexion_avant: clean(plan.reflection?.prior),
    reflexion_pendant: clean(plan.reflection?.during),
    reflexion_apres: clean(plan.reflection?.after)
  };
  
  // Add Arabic versions if bilingual (ART or EPS)
  let data: Record<string, string> = baseData;
  if (isBilingual) {
    const planAny = plan as any; // Pour accéder aux champs _ar
    data = {
      ...baseData,
      // Arabic versions of all fields
      titre_unite_ar: getArabicValue(planAny, 'title'),
      duree_ar: getArabicValue(planAny, 'duration'),
      concept_cle_ar: getArabicValue(planAny, 'keyConcept'),
      concepts_connexes_ar: planAny.relatedConcepts_ar 
        ? clean(Array.isArray(planAny.relatedConcepts_ar) ? planAny.relatedConcepts_ar.join(", ") : planAny.relatedConcepts_ar)
        : "",
      contexte_mondial_ar: getArabicValue(planAny, 'globalContext'),
      enonce_de_recherche_ar: getArabicValue(planAny, 'statementOfInquiry'),
      
      questions_factuelles_ar: planAny.inquiryQuestions?.factual_ar 
        ? clean(planAny.inquiryQuestions.factual_ar.join("\n"))
        : "",
      questions_conceptuelles_ar: planAny.inquiryQuestions?.conceptual_ar 
        ? clean(planAny.inquiryQuestions.conceptual_ar.join("\n"))
        : "",
      questions_debat_ar: planAny.inquiryQuestions?.debatable_ar 
        ? clean(planAny.inquiryQuestions.debatable_ar.join("\n"))
        : "",
      
      objectifs_specifiques_ar: planAny.objectives_ar 
        ? clean(Array.isArray(planAny.objectives_ar) ? planAny.objectives_ar.join("\n") : planAny.objectives_ar)
        : "",
      evaluation_sommative_ar: getArabicValue(planAny, 'summativeAssessment'),
      approches_apprentissage_ar: planAny.atlSkills_ar 
        ? clean(Array.isArray(planAny.atlSkills_ar) ? planAny.atlSkills_ar.join("\n") : planAny.atlSkills_ar)
        : "",
      
      contenu_ar: getArabicValue(planAny, 'content'),
      processus_apprentissage_ar: getArabicValue(planAny, 'learningExperiences'),
      evaluation_formative_ar: getArabicValue(planAny, 'formativeAssessment'),
      differenciation_ar: getArabicValue(planAny, 'differentiation'),
      ressources_ar: getArabicValue(planAny, 'resources'),
      
      reflexion_avant_ar: planAny.reflection?.prior_ar ? clean(planAny.reflection.prior_ar) : "",
      reflexion_pendant_ar: planAny.reflection?.during_ar ? clean(planAny.reflection.during_ar) : "",
      reflexion_apres_ar: planAny.reflection?.after_ar ? clean(planAny.reflection.after_ar) : ""
    };
  }

  await generateDocument(PLAN_TEMPLATE_URL, data, `Plan_Unite_${(plan.title || 'Sans_Titre').replace(/[^a-z0-9]/gi, '_')}.docx`);
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
    const templateContent = await loadFile(EVAL_TEMPLATE_URL);
    
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

      // Build exercises from the criterion task
      const exercises = [
        {
          title: `Tâche interdisciplinaire — Critère ${c.criterion}`,
          content: c.task || `Réaliser une tâche intégrant les apports de ${(unit.disciplines || []).join(', ')} sur le thème "${unit.title}".`,
          criterionReference: `Critère ${c.criterion} : ${strands[0] || ''}`,
          workspaceNeeded: true,
        },
        {
          title: `Synthèse et argumentation — Critère ${c.criterion}`,
          content: `Présenter une réflexion structurée démontrant votre maîtrise de "${c.name}" en mobilisant les ressources de chaque discipline participante.`,
          criterionReference: `Critère ${c.criterion} : ${strands[strands.length - 1] || ''}`,
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
    const templateContent = await loadFile(EVAL_TEMPLATE_URL);
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
