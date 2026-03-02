import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { saveAs } from 'file-saver';
import { Exam, QuestionType } from '../types';
import { WORD_TEMPLATE_URL } from '../constants';

// Charger le template Word depuis la variable d'environnement Vercel UNIQUEMENT
const loadTemplate = async (): Promise<ArrayBuffer> => {
  // URL du template Google Docs (définie dans constants.ts)
  // Cette URL correspond à la variable d'environnement WORD_TEMPLATE_URL configurée dans Vercel
  const templateUrl = WORD_TEMPLATE_URL;
  
  // Ajouter un timestamp pour éviter le cache navigateur
  const urlWithCacheBust = `${templateUrl}&t=${Date.now()}`;
  
  console.log('📄 [WORD EXPORT] Chargement du template depuis Google Docs (Vercel config)');
  console.log('🔗 [WORD EXPORT] URL:', templateUrl);
  console.log('🔄 [WORD EXPORT] Cache-busting activé');
  
  try {
    const response = await fetch(urlWithCacheBust, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ [WORD EXPORT] Erreur HTTP ${response.status}: ${response.statusText}`);
      throw new Error(`Impossible de charger le template (HTTP ${response.status})`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log('✅ [WORD EXPORT] Template Google Docs chargé avec succès');
    console.log(`📊 [WORD EXPORT] Taille: ${arrayBuffer.byteLength} bytes`);
    console.log(`🎯 [WORD EXPORT] Taille attendue: 68644 bytes (template Vercel correct)`);
    
    // Vérification de la taille pour s'assurer qu'on a le bon template
    if (arrayBuffer.byteLength === 68644) {
      console.log('✅ [WORD EXPORT] Template Vercel CORRECT détecté');
    } else {
      console.warn(`⚠️ [WORD EXPORT] Taille différente: ${arrayBuffer.byteLength} bytes au lieu de 68644`);
    }
    
    return arrayBuffer;
  } catch (error) {
    console.error('❌ [WORD EXPORT] Erreur lors du chargement du template:', error);
    throw new Error(`Échec chargement template: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
  }
};

// Convertir / nettoyer les notations LaTeX résiduelles en notation mathématique standard lisible.
// Règles d'écriture imposées :
//   Fractions  : \frac{a}{b} ou frac{a}{b} → a/b
//   Puissances : x^{2} ou x^2 → x^2  (on garde le caret, PAS d'exposant Unicode)
//   Racines    : \sqrt{x}            → sqrt(x)
//   Exposants Unicode (²³…) → notation caret (x² → x^2)
const convertLaTeXToText = (text: string): string => {
  if (!text) return text;

  let s = text;

  // --- Fractions LaTeX : \frac{num}{den} ou frac{num}{den} (imbriquées : on itère) ---
  for (let i = 0; i < 5; i++) {
    s = s.replace(/\\?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  }
  // Simplifier les parenthèses autour d'un terme simple : (a)/(b) → a/b
  s = s.replace(/\(([a-zA-Z0-9.]+)\)\/\(([a-zA-Z0-9.]+)\)/g, '$1/$2');

  // --- Racines carrées : \sqrt{x} ou sqrt{x} ---
  s = s.replace(/\\?sqrt\{([^{}]*)\}/g, 'sqrt($1)');
  s = s.replace(/\\?sqrt\s+(\S+)/g, 'sqrt($1)');

  // --- Puissances : x^{2} → x^2 (garder le caret) ---
  s = s.replace(/\^{(\d+)}/g, '^$1');

  // --- Exposants Unicode → notation caret (x² → x^2, x³ → x^3, …) ---
  const superscriptMap: Record<string, string> = {
    '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4',
    '⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'
  };
  s = s.replace(/([a-zA-Z0-9)])([\u2070\u00B9\u00B2\u00B3\u2074-\u2079]+)/g, (_, base, exps) => {
    const digits = exps.split('').map((c: string) => superscriptMap[c] || c).join('');
    return `${base}^${digits}`;
  });

  // --- Racine Unicode : √16 → sqrt(16) ---
  s = s.replace(/√(\d+)/g, 'sqrt($1)');
  s = s.replace(/√\(([^)]+)\)/g, 'sqrt($1)');

  // --- Symboles LaTeX fréquents ---
  s = s.replace(/\\cdot/g, '×');
  s = s.replace(/\\times/g, '×');
  s = s.replace(/\\div/g, '÷');
  s = s.replace(/\\pm/g, '±');
  s = s.replace(/\\leq/g, '≤');
  s = s.replace(/\\geq/g, '≥');
  s = s.replace(/\\neq/g, '≠');
  s = s.replace(/\\approx/g, '≈');
  s = s.replace(/\\infty/g, '∞');
  s = s.replace(/\\pi/g, 'π');
  s = s.replace(/\\alpha/g, 'α');
  s = s.replace(/\\beta/g, 'β');
  s = s.replace(/\\gamma/g, 'γ');
  s = s.replace(/\\Delta/g, 'Δ');
  s = s.replace(/\\theta/g, 'θ');
  s = s.replace(/\\mathbb\{R\}/g, 'ℝ');
  s = s.replace(/\\mathbb\{N\}/g, 'ℕ');
  s = s.replace(/\\mathbb\{Z\}/g, 'ℤ');
  s = s.replace(/\\mathbb\{Q\}/g, 'ℚ');
  s = s.replace(/\\mathbb\{C\}/g, 'ℂ');

  // --- Supprimer les dollars $ autour des formules inline ---
  s = s.replace(/\$([^$\n]+)\$/g, '$1');

  // --- Nettoyer les backslashes LaTeX orphelins restants ---
  s = s.replace(/\\([a-zA-Z]+)/g, '$1');

  return s;
};

// Convertir les tableaux Markdown (pipes |) en tableaux en texte plat pour Word
// (Word n'interprète pas le HTML, on convertit donc en texte structuré)
const convertMarkdownTableToPlainText = (text: string): string => {
  if (!text) return text;

  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|.+\|\s*$/.test(line)) {
      // Collecter toutes les lignes consécutives du tableau
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }

      let isFirstDataRow = true;
      for (const tl of tableLines) {
        // Ligne séparateur (|---|) → skip
        if (/^\s*\|[\s\-|:]+\|\s*$/.test(tl)) {
          isFirstDataRow = false;
          continue;
        }
        const cells = tl.split('|').map(c => c.trim()).filter(c => c !== '');
        // En-tête : afficher en majuscules avec séparateurs
        if (isFirstDataRow) {
          result.push(cells.join(' | '));
          result.push(cells.map(() => '--------').join('-+-'));
          isFirstDataRow = false;
        } else {
          result.push(cells.join(' | '));
        }
      }
      result.push(''); // ligne vide après le tableau
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
};

// Supprimer les balises HTML de tableau pour Word (docx ne les affiche pas)
// On les convertit en texte lisible
const stripHTMLTablesForWord = (text: string): string => {
  if (!text) return text;

  // Remplacer les balises <table ...> et </table>
  let s = text;

  // Extraire les tableaux HTML et les convertir en texte lisible
  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    const rows: string[] = [];
    const rowMatches = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    rowMatches.forEach((rowHtml: string, rowIndex: number) => {
      const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      const cells = cellMatches.map((cell: string) =>
        cell.replace(/<[^>]+>/g, '').trim()
      );
      rows.push(cells.join(' | '));
      // Ajouter une ligne séparatrice après l'en-tête
      if (rowIndex === 0) {
        rows.push(cells.map(() => '--------').join('-+-'));
      }
    });

    return '\n' + rows.join('\n') + '\n';
  });

  // Nettoyer les balises HTML restantes éventuelles
  s = s.replace(/<[^>]+>/g, '');

  return s;
};

// Préparer le contenu texte pour Word : nettoyer LaTeX + convertir tableaux en texte
const prepareTextForWord = (text: string): string => {
  if (!text) return text;
  let s = convertLaTeXToText(text);
  s = stripHTMLTablesForWord(s);
  s = convertMarkdownTableToPlainText(s);
  return s;
};
const generateAnswerLines = (numberOfLines: number): string => {
  // ~120 points pour atteindre environ 24 cm (selon la police)
  // Ajout de ligne vide entre chaque ligne pour simuler interligne 1,5
  const longLine = '............................................................................................................................';
  return Array(numberOfLines).fill(longLine).join('\n\n');
};

// Formater un exercice selon son type
const formatQuestion = (question: any, index: number, isEnglish: boolean = false, subject: string = ''): string => {
  const pointsLabel = isEnglish 
    ? (question.points > 1 ? 'points' : 'point')
    : (question.points > 1 ? 'points' : 'point');
  
  const exerciseLabel = isEnglish ? 'EXERCISE' : 'EXERCICE';
  
  // Vérifier si c'est Français ou Anglais (pas de gras pour le contenu)
  const isFrenchOrEnglish = subject.toLowerCase().includes('français') || 
                            subject.toLowerCase().includes('anglais') ||
                            subject.toLowerCase().includes('english');
  
  // EN-TÊTE DE L'EXERCICE - EN MAJUSCULES (effet gras visuel)
  let formatted = `\n${exerciseLabel} ${index + 1} : ${prepareTextForWord(question.title).toUpperCase()} (${question.points} ${pointsLabel})\n`;
  
  if (question.isDifferentiation) {
    const diffLabel = isEnglish ? '⭐ Differentiation exercise' : '⭐ Exercice de différenciation';
    formatted += `${diffLabel}\n`;
  }
  
  // ÉNONCÉ DE L'EXERCICE (contenu) - PAS DE GRAS
  formatted += `\n${prepareTextForWord(question.content)}\n`;
  
  // Formater selon le type de question
  switch (question.type) {
    case QuestionType.QCM:
      if (question.options && Array.isArray(question.options)) {
        formatted += `\n`;
        question.options.forEach((opt: string, i: number) => {
          formatted += `☐ ${String.fromCharCode(65 + i)}. ${prepareTextForWord(opt)}\n`;
        });
      }
      break;
      
    case QuestionType.VRAI_FAUX:
      if (question.statements && Array.isArray(question.statements)) {
        formatted += `\n`;
        const trueLabel = isEnglish ? 'True' : 'Vrai';
        const falseLabel = isEnglish ? 'False' : 'Faux';
        question.statements.forEach((stmt: any, i: number) => {
          const pointsPerStatement = question.pointsPerStatement || 1;
          formatted += `${i + 1}. ${prepareTextForWord(stmt.statement)} (${pointsPerStatement} pt)\n   ☐ ${trueLabel}   ☐ ${falseLabel}\n\n`;
        });
      }
      break;
      
    case QuestionType.TEXTE_A_TROUS:
      formatted += `\n${generateAnswerLines(2)}\n`;
      break;
      
    case QuestionType.LEGENDER:
      const labelText = isEnglish ? '[Space to label the diagram/image]' : '[Espace pour légender le schéma/image]';
      formatted += `\n${labelText}\n`;
      formatted += `${generateAnswerLines(3)}\n`;
      break;
      
    case 'Relier par flèche':
      // Déjà formaté dans le content (tableau avec colonnes)
      formatted += `\n`;
      break;
      
    case 'Compléter un tableau':
      // Déjà formaté dans le content (tableau)
      formatted += `\n`;
      break;
      
    case QuestionType.DEFINITIONS:
      formatted += `\n${generateAnswerLines(3)}\n`;
      break;
      
    case QuestionType.ANALYSE_DOCUMENTS:
      formatted += `\n${generateAnswerLines(5)}\n`;
      break;
      
    case QuestionType.REPONSE_LONGUE:
    case QuestionType.PROBLEME:
      const lines = question.expectedLines || 8;
      formatted += `\n${generateAnswerLines(lines)}\n`;
      break;
      
    default:
      formatted += `\n${generateAnswerLines(4)}\n`;
  }
  
  return formatted;
};

// Organiser les questions par sections
const organizeQuestionsBySection = (questions: any[]): Map<string, any[]> => {
  const sections = new Map<string, any[]>();
  
  questions.forEach(question => {
    const section = question.section || 'Exercices';
    if (!sections.has(section)) {
      sections.set(section, []);
    }
    sections.get(section)!.push(question);
  });
  
  return sections;
};

// Formater toutes les questions de l'examen organisées par sections
const formatExercises = (exam: Exam): string => {
  let exercisesText = '';
  
  // Détecter si c'est un examen d'anglais ou d'acquisition de langues
  const subjectLower = exam.subject?.toLowerCase() || '';
  const isEnglish = subjectLower.includes('anglais') || 
                    subjectLower === 'english' ||
                    subjectLower.includes('acquisition de langues') ||
                    subjectLower.includes('acquisition de langue') ||
                    subjectLower.includes('language acquisition');
  
  // Organiser les questions par sections
  if (exam.questions && exam.questions.length > 0) {
    const sections = organizeQuestionsBySection(exam.questions);
    let globalIndex = 0;
    
    sections.forEach((questions, sectionName) => {
      // Titre de la section (PARTIE) - DÉJÀ EN MAJUSCULES
      if (sectionName !== 'Exercices') {
        exercisesText += `\n${sectionName.toUpperCase()}\n\n`;
      }
      
      // Questions de cette section
      questions.forEach((question) => {
        exercisesText += formatQuestion(question, globalIndex, isEnglish, exam.subject || '');
        exercisesText += `\n`;
        globalIndex++;
      });
    });
  }
  
  return exercisesText;
};

// Exporter un examen vers Word
export const exportExamToWord = async (exam: Exam): Promise<void> => {
  try {
    console.log('📄 [EXPORT] Début de l\'export Word');
    console.log('📊 [EXPORT] Données exam:', {
      subject: exam.subject,
      grade: exam.grade,
      semester: exam.semester,
      teacherName: exam.teacherName,
      className: exam.className,
      questionsCount: exam.questions?.length || 0
    });
    
    if (!exam.subject) {
      throw new Error('Le champ subject est obligatoire pour l\'export');
    }
    
    const templateBuffer = await loadTemplate();
    console.log('✅ [EXPORT] Template chargé');
    
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    // IMPORTANT: Vérification que subject est bien défini
    console.log('🔍 [DEBUG] exam.subject =', exam.subject);
    console.log('🔍 [DEBUG] typeof exam.subject =', typeof exam.subject);
    
    if (!exam.subject || exam.subject === 'undefined') {
      console.error('❌ [EXPORT] exam.subject est vide ou undefined!');
      throw new Error('Le nom de la matière est requis pour générer l\'examen');
    }
    
    // Préparer les données pour le template
    // La balise dans le template est {Matiere} - on assure qu'elle soit bien remplie
    const data = {
      Matiere: exam.subject,  // BALISE PRINCIPALE utilisée dans le template
      Classe: exam.className || exam.grade || '',
      Duree: '2H',
      Enseignant: exam.teacherName || '',
      Semestre: exam.semester || '',
      Date: exam.date || '',  // Date saisie par l'enseignant (format: JJ/MM/AAAA)
      Exercices: formatExercises(exam)
    };
    
    console.log('📋 [EXPORT] Données pour template:', {
      Matiere: data.Matiere,
      'Matiere (type)': typeof data.Matiere,
      'exam.subject': exam.subject,
      'exam.subject (type)': typeof exam.subject,
      Classe: data.Classe,
      Semestre: data.Semestre,
      ExercicesLength: data.Exercices.length
    });
    
    // Vérification finale avant render
    if (!data.Matiere || data.Matiere === 'undefined') {
      console.error('❌ [EXPORT] ATTENTION: Matiere est undefined ou vide!');
      console.error('exam complet:', JSON.stringify(exam, null, 2));
      throw new Error(`Le sujet de l'examen est vide ou undefined. Veuillez renseigner la matière.`);
    }
    
    doc.render(data);
    console.log('✅ [EXPORT] Template rempli');
    
    // Générer directement le document SANS manipulation XML
    // (pour éviter la corruption du fichier Word)
    const output = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    
    console.log('⚠️ [EXPORT] Document généré sans manipulation XML pour éviter corruption');
    
    const fileName = `Examen_${exam.subject.replace(/\s+/g, '_')}_${exam.grade}_${exam.semester.replace(/\s+/g, '_')}.docx`;
    console.log(`✅ [EXPORT] Téléchargement: ${fileName}`);
    
    saveAs(output, fileName);
    
  } catch (error: any) {
    console.error('❌ [EXPORT] Erreur:', error);
    console.error('❌ [EXPORT] Stack:', error.stack);
    throw new Error(`Échec de l'export: ${error?.message || 'Erreur inconnue'}`);
  }
};

// Formater un exercice avec sa CORRECTION
const formatQuestionWithCorrection = (question: any, index: number, isEnglish: boolean = false, subject: string = ''): string => {
  const exerciseLabel = isEnglish ? 'EXERCISE' : 'EXERCICE';
  const pointsLabel = isEnglish 
    ? (question.points > 1 ? 'points' : 'point')
    : (question.points > 1 ? 'points' : 'point');
  
  // EN-TÊTE - EN MAJUSCULES (effet gras visuel)
  let formatted = `\n${exerciseLabel} ${index + 1} : ${prepareTextForWord(question.title).toUpperCase()} (${question.points} ${pointsLabel})\n`;
  
  if (question.isDifferentiation) {
    const diffLabel = isEnglish ? '⭐ Differentiation exercise' : '⭐ Exercice de différenciation';
    formatted += `${diffLabel}\n`;
  }
  
  // ÉNONCÉ - PAS DE GRAS
  formatted += `\n${prepareTextForWord(question.content)}\n`;
  
  // Ajouter les RÉPONSES
  switch (question.type) {
    case QuestionType.QCM:
      if (question.options && Array.isArray(question.options)) {
        formatted += `\n`;
        const correctLabel = isEnglish ? 'CORRECT ANSWER' : 'RÉPONSE CORRECTE';
        const explanationLabel = isEnglish ? 'EXPLANATION' : 'EXPLICATION';
        question.options.forEach((opt: string, i: number) => {
          const letter = String.fromCharCode(65 + i);
          const isCorrect = question.correctAnswer === letter;
          const marker = isCorrect ? `[✓ ${correctLabel}]` : '';
          formatted += `☐ ${letter}. ${prepareTextForWord(opt)} ${marker}\n`;
        });
        if (question.answer) {
          formatted += `\n[${explanationLabel}: ${prepareTextForWord(question.answer)}]`;
        }
      }
      break;
      
    case QuestionType.VRAI_FAUX:
      if (question.statements && Array.isArray(question.statements)) {
        formatted += `\n`;
        const trueLabel = isEnglish ? 'True' : 'Vrai';
        const falseLabel = isEnglish ? 'False' : 'Faux';
        const answerLabel = isEnglish ? 'ANSWER' : 'RÉPONSE';
        question.statements.forEach((stmt: any, i: number) => {
          const pointsPerStatement = question.pointsPerStatement || 1;
          const correctAnswer = stmt.isTrue ? trueLabel : falseLabel;
          formatted += `${i + 1}. ${prepareTextForWord(stmt.statement)} (${pointsPerStatement} pt)\n`;
          formatted += `   ☐ ${trueLabel}   ☐ ${falseLabel}\n`;
          formatted += `   [✓ ${answerLabel}: ${correctAnswer}]\n\n`;
        });
      }
      break;
      
    case QuestionType.LEGENDER:
      const labelText = isEnglish ? '[Space to label the diagram/image]' : '[Espace pour légender le schéma/image]';
      formatted += `\n${labelText}\n`;
      if (question.answer) {
        formatted += `\n[CORRECTION:\n${prepareTextForWord(question.answer)}]`;
      }
      break;
      
    default:
      if (question.answer) {
        const correctionLabel = isEnglish ? 'CORRECTION' : 'CORRECTION';
        formatted += `\n[${correctionLabel}:\n${prepareTextForWord(question.answer)}]`;
      }
  }
  
  return formatted;
};

// Formater toutes les questions avec corrections
const formatExercisesWithCorrections = (exam: Exam): string => {
  let exercisesText = '';
  
  const subjectLower = exam.subject?.toLowerCase() || '';
  const isEnglish = subjectLower.includes('anglais') || 
                    subjectLower === 'english' ||
                    subjectLower.includes('acquisition de langues') ||
                    subjectLower.includes('acquisition de langue') ||
                    subjectLower.includes('language acquisition');
  
  if (exam.questions && exam.questions.length > 0) {
    const sections = organizeQuestionsBySection(exam.questions);
    let globalIndex = 0;
    
    sections.forEach((questions, sectionName) => {
      // Titre de section (PARTIE) - DÉJÀ EN MAJUSCULES
      if (sectionName !== 'Exercices') {
        exercisesText += `\n${sectionName.toUpperCase()}\n\n`;
      }
      
      questions.forEach((question) => {
        exercisesText += formatQuestionWithCorrection(question, globalIndex, isEnglish, exam.subject || '');
        exercisesText += `\n`;
        globalIndex++;
      });
    });
  }
  
  return exercisesText;
};

// Exporter la CORRECTION de l'examen vers Word (avec texte en rouge)
export const exportExamCorrectionToWord = async (exam: Exam): Promise<void> => {
  try {
    console.log('📄 [CORRECTION] Début de l\'export correction');
    console.log('📊 [CORRECTION] Données exam:', {
      subject: exam.subject,
      grade: exam.grade,
      questionsCount: exam.questions?.length || 0
    });
    
    if (!exam.subject) {
      throw new Error('Le champ subject est obligatoire pour l\'export de correction');
    }
    
    const templateBuffer = await loadTemplate();
    console.log('✅ [CORRECTION] Template chargé');
    
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    // IMPORTANT: Vérification que subject est bien défini
    console.log('🔍 [DEBUG CORRECTION] exam.subject =', exam.subject);
    
    if (!exam.subject || exam.subject === 'undefined') {
      console.error('❌ [CORRECTION] exam.subject est vide ou undefined!');
      throw new Error('Le nom de la matière est requis pour générer la correction');
    }
    
    // Préparer les données pour le template
    const data = {
      Matiere: `${exam.subject} - CORRECTION`,  // BALISE PRINCIPALE
      Classe: exam.className || exam.grade || '',
      Duree: '2H',
      Enseignant: exam.teacherName || '',
      Semestre: exam.semester || '',
      Date: exam.date || '',  // Date saisie par l'enseignant (format: JJ/MM/AAAA)
      Exercices: formatExercisesWithCorrections(exam)
    };
    
    console.log('📋 [CORRECTION] Données pour template:', {
      Matiere: data.Matiere,
      Classe: data.Classe
    });
    
    doc.render(data);
    console.log('✅ [CORRECTION] Template rempli');
    
    // Générer directement SANS manipulation XML pour éviter corruption
    const output = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    
    console.log('⚠️ [CORRECTION] Document généré sans manipulation XML (corrections avec marqueurs [...])');
    
    const fileName = `CORRECTION_${exam.subject.replace(/\s+/g, '_')}_${exam.grade}_${exam.semester.replace(/\s+/g, '_')}.docx`;
    console.log(`✅ [CORRECTION] Téléchargement: ${fileName}`);
    
    saveAs(output, fileName);
    
  } catch (error: any) {
    console.error('❌ [CORRECTION] Erreur:', error);
    console.error('❌ [CORRECTION] Stack:', error.stack);
    throw new Error(`Échec de l'export correction: ${error?.message || 'Erreur inconnue'}`);
  }
};

// Exporter plusieurs examens en ZIP
export const exportMultipleExamsToZip = async (exams: Exam[]): Promise<void> => {
  try {
    for (const exam of exams) {
      await exportExamToWord(exam);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error: any) {
    console.error('❌ Erreur lors de l\'export multiple:', error);
    throw new Error(`Échec de l'export multiple: ${error?.message}`);
  }
};
