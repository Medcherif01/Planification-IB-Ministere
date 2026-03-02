import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { Exam, ExamQuestion, ExamResource, ExamGenerationConfig, QuestionType, ExamGrade } from "../types";

// Déterminer quel service IA utiliser (GROQ en priorité, puis Gemini)
const getAIProvider = (): 'groq' | 'gemini' => {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  
  if (groqKey) {
    console.log('🚀 Utilisation de GROQ AI (quotas élevés)');
    return 'groq';
  }
  
  if (geminiKey) {
    console.log('🤖 Utilisation de Gemini AI (fallback)');
    return 'gemini';
  }
  
  throw new Error("⚠️ Aucune clé API disponible. Configurez GROQ_API_KEY ou GEMINI_API_KEY.");
};

const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  
  if (!apiKey) {
    throw new Error("⚠️ GEMINI_API_KEY non définie. Veuillez configurer la clé API dans les variables d'environnement.");
  }
  
  return new GoogleGenAI({ apiKey });
};

const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    throw new Error("⚠️ GROQ_API_KEY non définie.");
  }
  
  return new Groq({ apiKey });
};

// Nettoyer le JSON retourné par l'IA
const cleanJsonText = (text: string): string => {
  if (!text) return "{}";
  
  try {
    let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    clean = clean.replace(/^[^{\[]*/, '').replace(/[^}\]]*$/, '');
    
    const firstCurly = clean.indexOf('{');
    const firstSquare = clean.indexOf('[');
    
    let start = -1;
    let end = -1;

    if (firstCurly !== -1 && (firstSquare === -1 || firstCurly < firstSquare)) {
        start = firstCurly;
        end = clean.lastIndexOf('}');
    } else if (firstSquare !== -1) {
        start = firstSquare;
        end = clean.lastIndexOf(']');
    }

    if (start !== -1 && end !== -1 && end > start) {
        const extracted = clean.substring(start, end + 1);
        JSON.parse(extracted);
        return extracted;
    }
  } catch (e) {
    console.warn("JSON cleaning failed:", e);
  }

  return "{}";
};

// ============================================================
// POST-PROCESSING: Sanitise toute écriture LaTeX/Markdown
// résiduelle dans les champs texte des questions générées par l'IA
// ============================================================

/**
 * Convertit toute notation LaTeX en notation mathématique standard lisible.
 * Ex: \frac{4z}{3}  →  4z/3
 *     frac{4z}{3}   →  4z/3
 *     x^{2}         →  x^2
 *     \sqrt{16}     →  sqrt(16)
 *     x²            →  x^2  (exposant Unicode → caret)
 */
const sanitizeMathText = (text: string): string => {
  if (!text) return text;
  let s = text;

  // --- Fractions LaTeX: \frac{num}{den} ou frac{num}{den} ---
  // Formes imbriquées : on itère jusqu'à stabilisation
  for (let i = 0; i < 5; i++) {
    // \frac{A}{B} ou frac{A}{B}  (sans backslash aussi)
    s = s.replace(/\\?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
  }
  // Simplifier les parenthèses inutiles autour d'un seul terme
  s = s.replace(/\(([a-zA-Z0-9.]+)\)\/\(([a-zA-Z0-9.]+)\)/g, '$1/$2');

  // --- Racines carrées: \sqrt{x} ou sqrt{x} ---
  s = s.replace(/\\?sqrt\{([^{}]*)\}/g, 'sqrt($1)');
  s = s.replace(/\\?sqrt\s+(\S+)/g, 'sqrt($1)');

  // --- Puissances: x^{2} → x^2 ---
  s = s.replace(/\^{(\d+)}/g, '^$1');

  // --- Exposants Unicode → notation caret ---
  const superscriptMap: Record<string, string> = {
    '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4',
    '⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'
  };
  // Remplacer une séquence d'exposants Unicode collée à un caractère
  s = s.replace(/([a-zA-Z0-9)])([\u2070\u00B9\u00B2\u00B3\u2074-\u2079]+)/g, (match, base, exps) => {
    const digits = exps.split('').map((c: string) => superscriptMap[c] || c).join('');
    return `${base}^${digits}`;
  });

  // --- Racines Unicode: √16 → sqrt(16) ---
  s = s.replace(/√(\d+)/g, 'sqrt($1)');
  s = s.replace(/√\(([^)]+)\)/g, 'sqrt($1)');

  // --- Backslashes LaTeX orphelins: \cdot → ×, \times → ×, etc. ---
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

  // --- Supprimer les dollars $ entourant des formules inline ---
  s = s.replace(/\$([^$\n]+)\$/g, '$1');

  // --- Nettoyer les backslashes restants isolés ---
  s = s.replace(/\\([a-zA-Z]+)/g, '$1');

  return s;
};

/**
 * Convertit les tableaux Markdown (pipes |) en tableaux HTML avec bordures.
 * Ex:  | Col A | Col B |        <table border="1" ...>
 *      |-------|-------|   →      <tr><th>Col A</th><th>Col B</th></tr>
 *      | val 1 | val 2 |          <tr><td>val 1</td><td>val 2</td></tr>
 *                                </table>
 */
const convertMarkdownTableToHTML = (text: string): string => {
  if (!text) return text;

  // Détecte un bloc de lignes contenant des pipes
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Vérifie si c'est une ligne de tableau Markdown (contient au moins un |)
    if (/^\s*\|.+\|\s*$/.test(line)) {
      // Collecter toutes les lignes consécutives faisant partie du tableau
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }

      // Construire le HTML
      let html = '<table border="1" style="border-collapse: collapse; width: 100%;">\n';
      let isHeader = true;

      for (const tl of tableLines) {
        // Ligne de séparateur (|---|---|) → skip
        if (/^\s*\|[\s\-|:]+\|\s*$/.test(tl)) {
          isHeader = false; // les lignes suivantes sont des données
          continue;
        }
        // Découper les cellules
        const cells = tl.split('|').map(c => c.trim()).filter(c => c !== '');
        const tag = isHeader ? 'th' : 'td';
        html += '  <tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>\n';
        if (isHeader) isHeader = false; // seulement la 1ère ligne est header
      }

      html += '</table>';
      result.push(html);
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
};

/**
 * Applique la sanitisation complète (maths + tableaux) à une chaîne de texte.
 */
const sanitizeContent = (text: string): string => {
  if (!text) return text;
  let s = sanitizeMathText(text);
  s = convertMarkdownTableToHTML(s);
  return s;
};

/**
 * Parcourt récursivement toutes les questions d'un examen et sanitise leur contenu.
 */
const sanitizeExamContent = (exam: any): any => {
  if (!exam) return exam;

  if (exam.questions && Array.isArray(exam.questions)) {
    exam.questions = exam.questions.map((q: any) => {
      if (q.content)  q.content  = sanitizeContent(q.content);
      if (q.title)    q.title    = sanitizeMathText(q.title);
      if (q.answer)   q.answer   = sanitizeContent(q.answer);
      if (q.options && Array.isArray(q.options)) {
        q.options = q.options.map((o: string) => sanitizeMathText(o));
      }
      if (q.statements && Array.isArray(q.statements)) {
        q.statements = q.statements.map((s: any) => ({
          ...s,
          statement: sanitizeMathText(s.statement)
        }));
      }
      return q;
    });
  }

  return exam;
};

// Déterminer le style d'examen basé sur le grade
const getExamStyle = (grade: ExamGrade): 'Brevet' | 'Bac' | 'Standard' => {
  if (grade === ExamGrade.TROISIEME) return 'Brevet'; // PEI4 (3ème)
  if (grade === ExamGrade.PREMIERE || grade === ExamGrade.TERMINALE) return 'Bac';
  return 'Standard';
};

// Vérifier si la matière nécessite un texte de compréhension
const needsComprehensionText = (subject: string): boolean => {
  const normalized = subject.toLowerCase();
  return normalized.includes('français') || 
         normalized.includes('anglais') || 
         normalized.includes('langue') ||
         normalized.includes('littérature');
};

// Vérifier si la matière nécessite des graphiques/courbes
const needsGraphResource = (subject: string): boolean => {
  const normalized = subject.toLowerCase();
  return normalized.includes('math') || 
         normalized.includes('physique') || 
         normalized.includes('chimie') ||
         normalized.includes('svt') ||
         normalized.includes('sciences');
};

// Vérifier si c'est un examen d'anglais ou d'acquisition de langues (qui doit être en anglais)
const isEnglishExam = (subject: string): boolean => {
  const normalized = subject.toLowerCase();
  return normalized.includes('anglais') || 
         normalized === 'english' || 
         normalized.includes('acquisition de langues') ||
         normalized.includes('acquisition de langue') ||
         normalized.includes('language acquisition');
};

// Prompt système pour la génération d'examens
const SYSTEM_INSTRUCTION_EXAM = `
Tu es un expert pédagogique spécialisé dans la création d'examens et évaluations selon les normes du programme français et IB.
Tu dois générer un examen ou une évaluation complet(e) et structuré(e).

⚠️ RÈGLE CRITIQUE POUR EXAMENS EN ANGLAIS (English, Anglais, Acquisition de langues) :
- Si l'examen est en ANGLAIS, TOUT doit être en anglais (aucun mot français)
- Titres de sections en anglais : "PART I", "PART II" (pas "PARTIE I")
- Types de questions en anglais : "Multiple Choice", "True/False", "Fill in the blanks"
- Instructions techniques en anglais :
  * "[Space for audio recording]" (PAS "Espace pour audio")
  * "[Space for image/diagram]" (PAS "Espace pour image")
  * "[Space for video]" (PAS "Espace pour vidéo")
  * "Listen to the audio and answer..." (PAS "Écoutez l'audio...")
  * "Watch the video and..." (PAS "Regardez la vidéo...")
- Ressources et sources en anglais uniquement

⚠️ DISTINCTION CRITIQUE - EXAMEN VS ÉVALUATION :
1. **EXAMEN (2 HEURES)** :
   - Durée : 2H
   - Barème : 30 points (toutes les classes)
   - Niveau de difficulté : DIFFICILE
   - Exercices longs, approfondis, variés (minimum 5 types différents)
   - Couvre plusieurs chapitres

2. **ÉVALUATION (40 MINUTES)** :
   - Durée : 40 MINUTES (contrainte stricte)
   - Barème : 30 points (PEI2, PEI3, PEI4, PEI5, 1ère, Terminale) | 20 points (PEI1 uniquement)
   - Niveau de difficulté : DIFFICILE
   - Exercices CONCIS et RAPIDES adaptés à 40 minutes
   - Couvre 1-2 chapitres spécifiques
   - Types de questions variés mais COURTS

RÈGLES ABSOLUES - BARÈME :
1. BARÈME STRICT PAR TYPE :
   **EXAMEN (2H)** :
   - TOUTES les classes : EXACTEMENT 30 points
   
   **ÉVALUATION (40 MIN)** :
   - Classes PEI2, PEI3, PEI4, PEI5, 1ère, Terminale : EXACTEMENT 30 points
   - Classe PEI1 UNIQUEMENT : EXACTEMENT 20 points
   
2. Niveau de difficulté selon le type (voir ci-dessus)
3. Il doit y avoir EXACTEMENT 1 question de différenciation explicite (marquée comme telle).
4. BARÈME ÉQUILIBRÉ ET DIVISIBLE :
   - Pour QCM : 1 point par choix OU points divisibles (2pts, 3pts, 5pts)
   - Pour Vrai/Faux : OBLIGATOIREMENT 1 point par affirmation
   - Pour exercices : points logiques et divisibles (2, 3, 4, 5, 6, 8, 10)
   - Répartir les points de manière progressive
5. Types de questions VARIÉS OBLIGATOIRES :
   - **POUR EXAMEN (2H)** : minimum 5 types différents
   - **POUR ÉVALUATION (40 MIN)** : minimum 3-4 types différents
   
   TYPES DISPONIBLES :
   - QCM (Questions à Choix Multiples) - ÉVITER pour Mathématiques
   - Vrai/Faux - ÉVITER pour Mathématiques
   - Textes à trous
   - Légender (schémas, cartes, figures géométriques, etc.)
   - Relier par flèche (tableaux avec deux colonnes à associer)
   - Définitions (⚠️ STRICTEMENT INTERDIT pour "Français" et "Langue et littérature" et "Anglais" - ÉVITER aussi en Mathématiques)
   - Analyse de documents
   - Réponse longue / Développement
   - Résolution de problème / Calculs
   - Compléter un tableau
   
   ⚠️ RÈGLE SPÉCIALE FRANÇAIS/ANGLAIS/LANGUE ET LITTÉRATURE :
   - NE JAMAIS utiliser le type "Définitions"
   - Privilégier : Analyse de texte, Compréhension, Grammaire appliquée, Rédaction, Reformulation

⚠️ RÈGLES GLOBALES DE FORMAT POUR TOUTES LES MATIÈRES :

1. ÉCRITURE MATHÉMATIQUE STANDARD (toutes matières) :
   - Fractions  : UNIQUEMENT "/" (ex: 4z/3 = 12, PAS \frac{4z}{3} ni frac{4z}{3})
   - Puissances : UNIQUEMENT "^" (ex: x^2 - 4x + 3, PAS x², ni LaTeX)
   - Racines    : UNIQUEMENT "sqrt()" (ex: sqrt(16) = 4, PAS √16 ni \sqrt{16})
   - NE JAMAIS utiliser des commandes LaTeX (\frac, \sqrt, \cdot, $...$, etc.)

2. TABLEAUX — FORMAT HTML OBLIGATOIRE POUR TOUTES LES MATIÈRES :
   - TOUJOURS utiliser des balises HTML <table> avec border="1"
   - NE JAMAIS utiliser le format Markdown avec pipes (| Col | Col |)
   - Format obligatoire :
     <table border="1" style="border-collapse: collapse; width: 100%;">
       <tr><th>En-tête 1</th><th>En-tête 2</th></tr>
       <tr><td>Donnée 1</td><td>Donnée 2</td></tr>
     </table>



**MATHÉMATIQUES** - Structure obligatoire :
- ÉVITER les QCM, Vrai/Faux ET Définitions (privilégier calculs, résolution de problèmes, constructions)
- ⚠️ ÉCRITURE MATHÉMATIQUE STANDARD OBLIGATOIRE (PAS DE LATEX) :
  * Fractions : utiliser UNIQUEMENT la barre oblique "/" (ex: 4z/3 = 12, PAS \frac{4z}{3} ou frac{4z}{3})
  * Puissances : utiliser le symbole "^" (ex: x^2, x^3, 10^4, PAS x², 10⁴, ni LaTeX)
  * Racines : utiliser "sqrt()" (ex: sqrt(16) = 4, PAS √16 ni \sqrt{16})
  * Symboles : ≤, ≥, ≠, ∈, ∉, ∀, ∃, π, etc.
  * Exemples corrects : "5x/2 + 3 = 7", "x^2 - 4x + 3 = 0", "sqrt(25) = 5"
  * Exemples interdits : "\frac{5x}{2}", "frac{5x}{2}", "x² - 4x", "√25"
- EXPRESSIONS MATHÉMATIQUES :
  * TOUJOURS donner PLUSIEURS expressions (minimum 3-5 expressions par exercice)
  * Exemples : Si exercice sur simplification, donner 5 expressions à simplifier
  * Si exercice sur calculs, donner 4-6 calculs différents
- PARTIE I : ALGÈBRE (15 ou 10 points selon le total)
  * Calculs numériques avec fractions, puissances, racines carrées
  * Équations, inéquations, systèmes
  * Développement, factorisation, identités remarquables
  * Fonctions (tableaux de valeurs, graphiques, résolution)
  * Exercices progressifs de calcul et résolution
  * DONNER plusieurs expressions/équations par question
- PARTIE II : GÉOMÉTRIE (15 ou 10 points selon le total)
  * Figures, théorèmes (Pythagore, Thalès, trigonométrie)
  * Constructions géométriques précises
  * OBLIGATOIRE : Inclure au moins un schéma/figure à légender ou à compléter
  * Calculs de périmètres, aires, volumes avec notations correctes
  * Démonstrations géométriques
  * Transformations (symétries, rotations, translations)

**HISTOIRE-GÉOGRAPHIE-EMC** - Structure obligatoire :
- PARTIE I : HISTOIRE (10 points)
  * Analyse de documents historiques
  * Questions de cours et développement
- PARTIE II : GÉOGRAPHIE (10 points)
  * Cartes, croquis, documents géographiques
  * Analyse spatiale
- PARTIE III : EMC (Enseignement Moral et Civique) (10 points)
  * Valeurs républicaines, citoyenneté
  * Réflexion éthique

**FRANÇAIS** - Structure obligatoire :
- PARTIE I : COMPRÉHENSION DE TEXTE (10 points pour examen, 8 points pour évaluation)
  * Texte littéraire de MINIMUM 20 lignes fourni DANS L'ÉNONCÉ de l'exercice
  * ⚠️ OBLIGATOIRE : Source en bas du texte : (Auteur, Titre, Éditeur, Année)
  * Exemples sources valides :
    - (Victor Hugo, Les Misérables, Gallimard, 1862)
    - (Émile Zola, Germinal, Fasquelle, 1885)
    - (Albert Camus, L'Étranger, Gallimard, 1942)
  * Questions de compréhension, analyse, interprétation
  
- PARTIE II : LANGUE (Grammaire, Conjugaison, Orthographe, Vocabulaire) (10 points pour examen, 7 points pour évaluation)
  * Exercices variés de maîtrise de la langue
  * ⚠️ INTERDIT : Questions de type "Définitions" ou "Donnez la définition de..."
  * PRIVILÉGIER : Exercices d'application (identifier, transformer, corriger, réécrire, analyser en contexte)
  * EXEMPLES VALIDES : "Identifiez les verbes conjugués", "Transformez au passé composé", "Corrigez les erreurs"
  * EXEMPLES INTERDITS : "Définissez ce qu'est un adverbe", "Donnez la définition du COD"
  
- PARTIE III : PRODUCTION ÉCRITE (10 points pour examen, 5 points pour évaluation)
  * Rédaction/Expression écrite (adaptée au temps disponible)

**ANGLAIS** - Structure obligatoire (TOUT EN ANGLAIS) :
- PART I : READING COMPREHENSION (10 points for exam, 8 points for evaluation)
  * Text of MINIMUM 20 lines provided IN THE EXERCISE CONTENT
  * ⚠️ MANDATORY: Source below the text: (Author, Title, Publisher, Year)
  * Valid source examples:
    - (Charles Dickens, Oliver Twist, Penguin Books, 1838)
    - (Jane Austen, Pride and Prejudice, T. Egerton, 1813)
    - (George Orwell, 1984, Secker & Warburg, 1949)
  * Comprehension and analysis questions
  
- PART II : LANGUAGE (Grammar, Vocabulary) (10 points for exam, 7 points for evaluation)
  * Varied language exercises
  * ⚠️ FORBIDDEN: "Definitions" type questions or "Define..."
  * PRIORITIZE: Application exercises (identify, transform, correct, rewrite, analyze in context)
  * VALID EXAMPLES: "Identify the verbs", "Transform into past tense", "Correct the errors"
  * FORBIDDEN EXAMPLES: "Define what an adverb is", "Give the definition of a pronoun"
  
- PART III : WRITING (10 points for exam, 5 points for evaluation)
  * Written expression (adapted to available time)

**SCIENCES (SVT, Physique-Chimie)** - Inclure obligatoirement :
- Graphiques, courbes, tableaux de données avec descriptions détaillées DANS L'ÉNONCÉ
- Schémas à légender
- Protocoles expérimentaux
- ⚠️ Si texte scientifique utilisé : ajouter source (Journal/Revue, Article, Année)

**HISTOIRE-GÉOGRAPHIE** - Sources obligatoires :
- Documents historiques : (Type de document, Auteur si connu, Date)
- Articles : (Publication, Titre, Date)
- Cartes : (Source, Année)

**AUTRES MATIÈRES** - Structure adaptée mais équilibrée
- ⚠️ Tout texte ou document doit avoir sa SOURCE

GESTION DES RESSOURCES (TRÈS IMPORTANT) :
⚠️ LES RESSOURCES DOIVENT ÊTRE INTÉGRÉES DIRECTEMENT DANS L'ÉNONCÉ DE CHAQUE EXERCICE.
NE PAS créer de section "resources" séparée au niveau de l'examen.

- **Textes** : Intégrer le texte COMPLET dans l'énoncé de l'exercice (minimum 20 lignes)
  * OBLIGATOIRE : Ajouter la SOURCE en bas du texte
  * Format source : (Auteur, Titre de l'œuvre, Éditeur/Journal, Année)
  * Exemple source : (Victor Hugo, Les Misérables, Éditions Gallimard, 1862)
  * Exemple source : (Le Monde, "Article sur le climat", 15 novembre 2023)
  
- **Tableaux** : Intégrer le tableau dans l'énoncé avec format HTML propre
  ⚠️ UTILISER FORMAT HTML UNIQUEMENT (PAS DE FORMAT MARKDOWN) :
  <table border="1" style="border-collapse: collapse; width: 100%;">
    <tr>
      <th>En-tête 1</th>
      <th>En-tête 2</th>
      <th>En-tête 3</th>
    </tr>
    <tr>
      <td>Donnée 1</td>
      <td>Donnée 2</td>
      <td>Donnée 3</td>
    </tr>
  </table>
  ⚠️ NE JAMAIS utiliser le format Markdown (|---|---|) pour les tableaux
  
- **Graphiques/Courbes** : Description DÉTAILLÉE dans l'énoncé
  Exemple : [Graphique : Évolution température vs temps
  Axe X : 0-10 min (grad. 2 min), Axe Y : 0-100°C (grad. 10°C)
  Courbe : Croissance linéaire 20°C→80°C puis stabilisation]
  
- **Images/Schémas** : Description dans l'énoncé
  Exemple : [Image : Schéma système digestif avec œsophage, estomac, intestins]

STYLE D'EXAMEN PAR NIVEAU :

**3ème - STYLE BREVET DES COLLÈGES (DNB)** :
- Questions typiques du DNB (Diplôme National du Brevet)
- Pour Français : Compréhension de texte (10 pts), Grammaire/Langue (10 pts), Rédaction/Expression écrite (10 pts)
- Pour Maths : Exercices indépendants, calcul, géométrie, problèmes
- Pour Histoire-Géo-EMC : Analyse de documents + développement construit
- Progressivité : questions simples au début, plus complexes à la fin

**1ère/Terminale - STYLE BACCALAURÉAT** :
- Questions typiques du Baccalauréat français
- Pour Français : Commentaire de texte, dissertation, question de grammaire
- Pour Philosophie (Terminale) : Dissertation, explication de texte
- Pour Sciences : Exercices de spécialité, analyse de documents scientifiques
- Niveau supérieur avec réflexion approfondie

**Autres niveaux (PEI1, PEI2, PEI3, PEI5)** :
- Style standard adapté au niveau du PEI/lycée
- Questions variées et progressives

FORMAT JSON ATTENDU :
{
  "title": "Titre de l'examen ou évaluation",
  "totalPoints": EXAMEN: 30 (toutes classes) | ÉVALUATION: 30 (ou 20 pour PEI1 uniquement),
  "duration": EXAMEN: "2H" | ÉVALUATION: "40 min",
  "difficulty": EXAMEN: "Difficile" | ÉVALUATION: "Difficile",
  "style": "Brevet" | "Bac" | "Standard",

  "questions": [
    {
      "id": "q1",
      "section": "Partie I : ALGÈBRE" (indiquer la section pour organisation),
      "type": "QCM" | "Vrai/Faux" | "Textes à trous" | "Légender" | "Définitions" | "Analyse de documents" | "Réponse longue",
      "title": "Titre de l'exercice",
      "content": "Énoncé complet de l'exercice",
      "points": 3,
      "pointsPerStatement": 1 (OBLIGATOIRE pour Vrai/Faux : 1 point par affirmation),

      "options": ["option1", "option2", ...] (pour QCM),
      "correctAnswer": "A" (OBLIGATOIRE pour QCM : lettre de la bonne réponse),
      
      "statements": [{"statement": "...", "isTrue": true/false}] (pour Vrai/Faux),
      
      "expectedLines": 5 (pour réponse longue),
      "answer": "Réponse détaillée et complète du corrigé" (OBLIGATOIRE pour toutes les questions),
      
      "isDifferentiation": false (true pour UNE seule question)
    }
  ]
}

⚠️ RÈGLES CRITIQUES FINALES :
- NE PAS créer de champ "resources" au niveau de l'examen
- INTÉGRER tous les textes/tableaux/graphiques dans le "content" de chaque question
- TOUJOURS ajouter la source après les textes : (Auteur, Titre, Éditeur, Année)
- Exemples de sources :
  * Texte littéraire : (Victor Hugo, Les Misérables, Gallimard, 1862)
  * Article : (Le Monde, "Titre de l'article", 15 novembre 2023)
  * Document historique : (Lettre de Voltaire à D'Alembert, 1757)

⚠️ EXERCICE "RELIER PAR FLÈCHE" :
- Pour ce type d'exercice, présenter deux colonnes :
  Colonne A          |  Colonne B
  1. Élément 1       |  a. Définition A
  2. Élément 2       |  b. Définition B
  3. Élément 3       |  c. Définition C
- Instructions : "Reliez chaque élément de la colonne A à sa correspondance dans la colonne B."
- Type de question : "Relier par flèche"

⚠️ CORRECTION / RÉPONSES (OBLIGATOIRE) :
- CHAQUE question DOIT avoir son champ "answer" avec la réponse complète
- Pour QCM : "correctAnswer" avec la lettre (ex: "A", "B", "C")
- Pour Vrai/Faux : "isTrue" rempli pour chaque affirmation
- Pour questions ouvertes : "answer" avec réponse détaillée et justification
- Pour problèmes : "answer" avec solution complète étape par étape
- Les réponses doivent être claires, précises et pédagogiques

- Retourne UNIQUEMENT le JSON valide, sans texte d'introduction
- Somme des points = 30 EXACTEMENT
- Varie les types de questions (minimum 4 types différents)
`;

export const generateExam = async (config: ExamGenerationConfig): Promise<Exam> => {
  try {
    const provider = getAIProvider();
    const style = getExamStyle(config.grade);
    const needsText = needsComprehensionText(config.subject);
    const needsGraph = needsGraphResource(config.subject);
    const isEnglish = isEnglishExam(config.subject);
    const examType = config.examType || 'Examen'; // Par défaut: Examen
    const isEvaluation = examType === 'Évaluation';
    
    // Vérifier si la matière est Français ou Langue pour éviter les définitions
    const isFrenchOrLanguage = config.subject.toLowerCase().includes('français') || 
                               config.subject.toLowerCase().includes('langue') ||
                               config.subject.toLowerCase().includes('littérature');
    
    // Détails spécifiques selon le style d'examen
    let styleGuidelines = '';
    if (style === 'Brevet') {
      styleGuidelines = `
      IMPORTANT - FORMAT BREVET (DNB) :
      - Structure en 3 parties équilibrées
      - Questions progressives (facile → moyen → difficile)
      - Compréhension (10 pts) + Compétences spécifiques (10 pts) + Production/Analyse (10 pts)
      - Inclure des questions de maîtrise de la langue pour Français
      `;
    } else if (style === 'Bac') {
      styleGuidelines = `
      IMPORTANT - FORMAT BACCALAURÉAT :
      - Exercices indépendants de niveau lycée
      - Analyse approfondie et réflexion critique
      - Questions de cours (5-10 pts) + Exercices d'application (10-15 pts) + Problème/Synthèse (10-15 pts)
      - Niveau de rigueur académique supérieur
      `;
    }
    
    const userPrompt = isEnglish ? `
    ⚠️ CRITICAL: This is an ENGLISH ${examType.toUpperCase()} - EVERYTHING must be in ENGLISH (no French at all)
    
    Generate a complete English ${examType} for:
    
    Subject: ${config.subject}
    Grade Level: ${config.grade}
    Topics to cover: ${config.chapters}
    
    Type: ${examType} ${isEvaluation ? '(40 MINUTES - SHORT AND FOCUSED)' : '(2 HOURS - COMPREHENSIVE)'}
    Exam Style: ${style}
    ${styleGuidelines}
    ${needsText ? `IMPORTANT: Include a comprehension text of MINIMUM ${isEvaluation ? '15' : '20'} lines IN ENGLISH.` : ''}
    
    Duration: ${isEvaluation ? '40 MINUTES' : '2H'}
    Total: EXACTLY ${isEvaluation ? (config.grade === ExamGrade.SIXIEME ? '20' : '30') : '30'} points
    Difficulty: DIFFICULT
    
    ⚠️ MANDATORY RULES FOR ENGLISH ${examType.toUpperCase()}:
    - ALL text must be in ENGLISH (titles, questions, instructions, content)
    - NO French words or phrases allowed
    - Section names in ENGLISH (e.g., "PART I: READING COMPREHENSION")
    - Question types in ENGLISH (e.g., "Multiple Choice", "True/False", "Fill in the blanks")
    - Instructions in ENGLISH (e.g., "Read the following text", "Answer the questions")
    - ⚠️ TECHNICAL INSTRUCTIONS IN ENGLISH ONLY:
      * "[Space for audio recording]" NOT "Espace pour audio"
      * "[Space for image/diagram]" NOT "Espace pour image"
      * "[Space for video]" NOT "Espace pour vidéo"
      * "Listen to the audio and..." NOT "Écoutez l'audio..."
      * "Watch the video and..." NOT "Regardez la vidéo..."
    - Sources in ENGLISH format: (Author, Title, Publisher, Year)
    - ⚠️ FORBIDDEN: "Definitions" type questions or "Define..." questions
    - PRIORITIZE: Comprehension, grammar in context, application exercises
    
    ${config.subject.toLowerCase().includes('math') ? `⚠️ CRITICAL RULES FOR MATHEMATICS :
    - STANDARD MATHEMATICAL WRITING (NO LATEX) :
      * Fractions : ONLY "/" (ex: "4z/3 = 12", NOT "frac{4z}{3}" or "\\frac{4z}{3}")
      * Powers : ONLY "^" (ex: "x^2 + 5", NOT "x²" or LaTeX)
      * Roots : ONLY "sqrt()" (ex: "sqrt(16) = 4", NOT "√16" or "\\sqrt{16}")
      * Correct examples : "Solve: 2x/3 + 5 = 7", "Simplify: x^2 - 4x + 4", "Calculate: sqrt(25)"
      * FORBIDDEN examples : "\\frac{2x}{3}", "frac{2x}{3}", "x² - 4x", "√25"
    - TABLES : Use HTML FORMAT only, NOT Markdown format (|---|)
    ` : ''}
    
    Make sure to:
    - Vary question types (minimum ${isEvaluation ? '3' : '4'} different types)
    - Include EXACTLY 1 differentiation question
    - Provide complete resources (texts, descriptions) IN ENGLISH
    - Follow ${style} exam format and standards
    - Use balanced scoring (points well distributed)
    ${isEvaluation ? '- Keep exercises SHORT and CONCISE (40 minutes constraint)' : ''}
    ` : `
    Génère ${isEvaluation ? 'une évaluation' : 'un examen'} complet${isEvaluation ? 'e' : ''} pour :
    
    Matière : ${config.subject}
    Niveau : ${config.grade}
    Chapitres/Sujets à couvrir : ${config.chapters}
    
    Type : ${examType} ${isEvaluation ? '(40 MINUTES - COURT ET CIBLÉ)' : '(2 HEURES - COMPLET)'}
    Style d'examen : ${style}
    ${styleGuidelines}
    ${needsText ? `IMPORTANT : Inclus un texte de compréhension de MINIMUM ${isEvaluation ? '15' : '20'} lignes dans les ressources.` : ''}
    ${needsGraph ? 'IMPORTANT : Inclus des descriptions de graphiques, courbes ou tableaux de données.' : ''}
    
    Durée : ${isEvaluation ? '40 MINUTES' : '2H'}
    Total : ${isEvaluation ? (config.grade === ExamGrade.SIXIEME ? '20' : '30') : '30'} points EXACTEMENT
    Niveau : DIFFICILE
    
    ${isFrenchOrLanguage ? `⚠️ RÈGLE CRITIQUE POUR ${config.subject.toUpperCase()} :
    - INTERDIT : Questions de type "Définitions" ou "Donnez la définition de..."
    - PRIVILÉGIER : Compréhension, grammaire en contexte, exercices d'application, analyse
    - EXEMPLES VALIDES : "Identifiez...", "Transformez...", "Analysez...", "Expliquez en contexte..."
    - EXEMPLES INTERDITS : "Définissez ce qu'est...", "Donnez la définition de..."
    ` : ''}
    
    ${config.subject.toLowerCase().includes('math') ? `⚠️ RÈGLES CRITIQUES POUR MATHÉMATIQUES :
    - ÉCRITURE MATHÉMATIQUE STANDARD (PAS DE LATEX) :
      * Fractions : UNIQUEMENT "/" (ex: "4z/3 = 12", PAS "frac{4z}{3}" ni "\\frac{4z}{3}")
      * Puissances : UNIQUEMENT "^" (ex: "x^2 + 5", PAS "x²" ni LaTeX)
      * Racines : UNIQUEMENT "sqrt()" (ex: "sqrt(16) = 4", PAS "√16" ni "\\sqrt{16}")
      * Exemples corrects : "Résoudre : 2x/3 + 5 = 7", "Simplifier : x^2 - 4x + 4", "Calculer : sqrt(25)"
      * Exemples INTERDITS : "\\frac{2x}{3}", "frac{2x}{3}", "x² - 4x", "√25"
    - TABLEAUX : Utiliser FORMAT HTML uniquement, PAS de format Markdown (|---|)
    ` : ''}
    
    ${needsGraph ? `⚠️ RÈGLES POUR TABLEAUX ET GRAPHIQUES :
    - TABLEAUX : OBLIGATOIRE d'utiliser format HTML avec <table>, <tr>, <th>, <td>
    - NE JAMAIS utiliser le format Markdown avec pipes (| Colonne | Colonne |)
    - Exemple correct :
      <table border="1">
        <tr><th>Valeur 1</th><th>Valeur 2</th></tr>
        <tr><td>Donnée 1</td><td>Donnée 2</td></tr>
      </table>
    ` : ''}
    
    Assure-toi de :
    - Varier les types de questions (minimum ${isEvaluation ? '3' : '4'} types différents)
    - Inclure EXACTEMENT 1 question de différenciation
    - Fournir des ressources complètes (textes, tableaux, descriptions d'images)
    - Respecter les contraintes spécifiques à la matière
    - Suivre le format ${style === 'Brevet' ? 'Brevet des collèges' : style === 'Bac' ? 'Baccalauréat' : 'standard'}
    - Barème équilibré et logique
    ${isEvaluation ? '- Garder les exercices COURTS et CONCIS (contrainte de 40 minutes)' : ''}
    `;

    let text: string;
    
    if (provider === 'groq') {
      // Utiliser GROQ AI (quotas élevés)
      const groq = getGroqClient();
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile', // Modèle puissant et rapide
        messages: [
          {
            role: 'system',
            content: SYSTEM_INSTRUCTION_EXAM
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      });
      
      text = completion.choices[0]?.message?.content || '';
      if (!text) throw new Error("Pas de réponse de GROQ AI");
      
    } else {
      // Utiliser Gemini AI (fallback)
      const ai = getClient();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_EXAM,
          responseMimeType: "application/json",
          temperature: 0.7
        }
      });
      
      text = response.text;
      if (!text) throw new Error("Pas de réponse de Gemini");
    }
    
    const cleanedJson = cleanJsonText(text);
    if (!cleanedJson || cleanedJson === "{}") {
      throw new Error("JSON invalide retourné par l'IA");
    }
    
    let parsed = JSON.parse(cleanedJson);

    // ============================================================
    // POST-PROCESSING: Sanitiser toute notation LaTeX/Markdown
    // résiduelle avant de construire l'objet Exam final
    // ============================================================
    parsed = sanitizeExamContent(parsed);
    
    // Vérification CRITIQUE: config.subject doit être défini
    if (!config.subject) {
      console.error(`❌ [${provider.toUpperCase()}] config.subject est undefined ou vide!`);
      throw new Error('Le paramètre subject est obligatoire pour générer un examen');
    }
    
    console.log(`✅ [${provider.toUpperCase()}] config.subject =`, config.subject);
    
    // Déterminer le total de points selon le type
    let expectedTotal: number;
    if (isEvaluation) {
      // Évaluations: 20 pour PEI1, 30 pour les autres
      expectedTotal = config.grade === ExamGrade.SIXIEME ? 20 : 30;
    } else {
      // Examens: 30 pour toutes les classes
      expectedTotal = 30;
    }
    
    // Créer l'objet Exam complet (sans resources - tout est intégré dans les questions)
    const exam: Exam = {
      id: Date.now().toString(),
      subject: config.subject, // IMPORTANT: Utiliser directement config.subject sans fallback
      grade: config.grade,
      semester: config.semester,
      teacherName: config.teacherName || "",
      className: config.className || config.grade || "",
      duration: parsed.duration || (isEvaluation ? "40 min" : "2H"),
      totalPoints: expectedTotal,
      title: parsed.title || `${examType} de ${config.subject}`,
      questions: parsed.questions || [],
      resources: [], // Tableau vide - tout est dans le content des questions
      difficulty: parsed.difficulty || "Difficile",
      style: style,
      chapters: config.chapters,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // LOG de vérification finale
    console.log(`✅ [${provider.toUpperCase()}] Examen créé avec subject =`, exam.subject);
    
    // Vérifier et corriger les questions avec 0 points
    exam.questions = exam.questions.map((q, idx) => {
      if (!q.points || q.points === 0) {
        console.warn(`⚠️ Question ${idx + 1} a 0 points. Attribution de 2 points par défaut.`);
        return { ...q, points: 2 };
      }
      return q;
    });
    
    // Vérifier que la somme des points correspond au total attendu
    let totalPoints = exam.questions.reduce((sum, q) => sum + (q.points || 0), 0);
    
    if (totalPoints !== expectedTotal) {
      console.warn(`⚠️ Total des points (${totalPoints}) ne fait pas ${expectedTotal}. Ajustement...`);
      
      // Ajustement intelligent : répartir la différence sur toutes les questions
      const diff = expectedTotal - totalPoints;
      const adjustment = Math.floor(diff / exam.questions.length);
      const remainder = diff % exam.questions.length;
      
      exam.questions = exam.questions.map((q, idx) => ({
        ...q,
        points: q.points + adjustment + (idx < remainder ? 1 : 0)
      }));
      
      // Vérification finale
      totalPoints = exam.questions.reduce((sum, q) => sum + q.points, 0);
      console.log(`✅ Total ajusté : ${totalPoints} points`);
    }
    
    return exam;
    
  } catch (error: any) {
    console.error("Erreur lors de la génération de l'examen:", error);
    throw new Error(`Échec de génération: ${error?.message || "Erreur inconnue"}`);
  }
};

// Générer plusieurs examens (pour les deux semestres)
export const generateExamsForBothSemesters = async (
  subject: string,
  grade: ExamGrade,
  chapters: string,
  teacherName?: string,
  className?: string
): Promise<{ semester1: Exam; semester2: Exam }> => {
  try {
    console.log(`📝 Génération des examens pour les 2 semestres...`);
    
    const exam1 = await generateExam({
      subject,
      grade,
      semester: 'Semestre 1' as any,
      chapters: chapters + " (Première partie du programme)",
      teacherName,
      className
    });
    
    const exam2 = await generateExam({
      subject,
      grade,
      semester: 'Semestre 2' as any,
      chapters: chapters + " (Deuxième partie du programme)",
      teacherName,
      className
    });
    
    return { semester1: exam1, semester2: exam2 };
  } catch (error: any) {
    console.error("Erreur lors de la génération des examens:", error);
    throw new Error(`Échec: ${error?.message}`);
  }
};
