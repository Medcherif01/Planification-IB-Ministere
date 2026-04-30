import { Document, Paragraph, TextRun, AlignmentType, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import { Packer } from 'docx';
import { Exam, QuestionType } from '../types';

// Configuration globale du formatage
const FONT_NAME = 'Times New Roman';
const LINE_SPACING = 360; // Interligne 1,5 (240 * 1.5 = 360 en twips)

// Fonction pour créer l'en-tête du document (tableau)
const createHeader = (exam: Exam): Table => {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Examen ${exam.subject}`,
                    bold: true,
                    font: FONT_NAME,
                  }),
                ],
                spacing: {
                  line: LINE_SPACING,
                  
                },
              }),
            ],
            rowSpan: 5,
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Classe : ', bold: true }),
                  new TextRun({ text: exam.className || exam.grade }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Durée : ', bold: true }),
                  new TextRun({ text: exam.duration }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Enseignant : ', bold: true }),
                  new TextRun({ text: exam.teacherName || '' }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Semestre : ', bold: true }),
                  new TextRun({ text: exam.semester || '' }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Date : ', bold: true }),
                  new TextRun({ text: exam.date || '' }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Nom et prénom : ..............................' }),
                ],
              }),
            ],
            columnSpan: 2,
          }),
        ],
      }),
    ],
  });
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

// Créer les paragraphes pour une question
const createQuestionParagraphs = (question: any, index: number, isEnglish: boolean = false): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  const exerciseLabel = isEnglish ? 'EXERCISE' : 'EXERCICE';
  const pointsLabel = isEnglish 
    ? (question.points > 1 ? 'points' : 'point')
    : (question.points > 1 ? 'points' : 'point');
  
  // Titre de l'exercice EN GRAS
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${exerciseLabel} ${index + 1} : ${question.title}`,
          bold: true,
          size: 24, // 12pt
          font: FONT_NAME,
        }),
        new TextRun({
          text: ` (${question.points} ${pointsLabel})`,
          size: 24,
          font: FONT_NAME,
        }),
      ],
      spacing: {
        before: 120, // Réduire l'espace avant
        after: 80,   // Réduire l'espace après
        line: LINE_SPACING,
        
      },
    })
  );
  
  // Énoncé EN GRAS
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: question.content,
          bold: true,
          size: 22, // 11pt
          font: FONT_NAME,
        }),
      ],
      spacing: {
        after: 80, // Réduire l'espace après
        line: LINE_SPACING,
        
      },
    })
  );
  
  // Formater selon le type de question
  switch (question.type) {
    case QuestionType.QCM:
      if (question.options && Array.isArray(question.options)) {
        question.options.forEach((opt: string, i: number) => {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `☐ ${String.fromCharCode(65 + i)}. ${opt}`,
                  size: 22,
                  font: FONT_NAME,
                }),
              ],
              spacing: { after: 60 },
            })
          );
        });
      }
      break;
      
    case QuestionType.VRAI_FAUX:
      if (question.statements && Array.isArray(question.statements)) {
        question.statements.forEach((stmt: any, i: number) => {
          const pointsPerStatement = question.pointsPerStatement || 1;
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${i + 1}. ${stmt.statement} (${pointsPerStatement} pt)`,
                  size: 22,
                  font: FONT_NAME,
                }),
              ],
              spacing: { after: 60 },
            })
          );
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: '   ☐ Vrai   ☐ Faux',
                  size: 22,
                  font: FONT_NAME,
                }),
              ],
              spacing: { after: 120 },
            })
          );
        });
      }
      break;
      
    default:
      // Lignes pour réponse
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '............................................................................................................................',
              size: 22,
                  font: FONT_NAME,
            }),
          ],
          spacing: { after: 120 },
        })
      );
  }
  
  return paragraphs;
};

// Créer les paragraphes pour une question avec correction
const createQuestionWithCorrectionParagraphs = (question: any, index: number, isEnglish: boolean = false): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  const exerciseLabel = isEnglish ? 'EXERCISE' : 'EXERCICE';
  const pointsLabel = isEnglish 
    ? (question.points > 1 ? 'points' : 'point')
    : (question.points > 1 ? 'points' : 'point');
  
  // Titre de l'exercice EN GRAS
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${exerciseLabel} ${index + 1} : ${question.title}`,
          bold: true,
          size: 24,
                  font: FONT_NAME,
        }),
        new TextRun({
          text: ` (${question.points} ${pointsLabel})`,
          size: 24,
                  font: FONT_NAME,
        }),
      ],
      spacing: { before: 240, after: 120 },
    })
  );
  
  // Énoncé EN GRAS
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: question.content,
          bold: true,
          size: 22,
                  font: FONT_NAME,
        }),
      ],
      spacing: { after: 120 },
    })
  );
  
  // Ajouter les RÉPONSES EN ROUGE
  switch (question.type) {
    case QuestionType.QCM:
      if (question.options && Array.isArray(question.options)) {
        question.options.forEach((opt: string, i: number) => {
          const letter = String.fromCharCode(65 + i);
          const isCorrect = question.correctAnswer === letter;
          
          const textRuns: TextRun[] = [
            new TextRun({
              text: `☐ ${letter}. ${opt}`,
              size: 22,
                  font: FONT_NAME,
            }),
          ];
          
          if (isCorrect) {
            textRuns.push(
              new TextRun({
                text: ' ✓ RÉPONSE CORRECTE',
                bold: true,
                color: 'FF0000', // Rouge
                size: 22,
                  font: FONT_NAME,
              })
            );
          }
          
          paragraphs.push(
            new Paragraph({
              children: textRuns,
              spacing: { after: 60 },
            })
          );
        });
        
        if (question.answer) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `EXPLICATION: ${question.answer}`,
                  bold: true,
                  color: 'FF0000',
                  size: 22,
                  font: FONT_NAME,
                }),
              ],
              spacing: { after: 120 },
            })
          );
        }
      }
      break;
      
    case QuestionType.VRAI_FAUX:
      if (question.statements && Array.isArray(question.statements)) {
        question.statements.forEach((stmt: any, i: number) => {
          const pointsPerStatement = question.pointsPerStatement || 1;
          const correctAnswer = stmt.isTrue ? 'Vrai' : 'Faux';
          
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${i + 1}. ${stmt.statement} (${pointsPerStatement} pt)`,
                  size: 22,
                  font: FONT_NAME,
                }),
              ],
              spacing: { after: 60 },
            })
          );
          
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: '   ☐ Vrai   ☐ Faux',
                  size: 22,
                  font: FONT_NAME,
                }),
              ],
              spacing: { after: 60 },
            })
          );
          
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `   ✓ RÉPONSE: ${correctAnswer}`,
                  bold: true,
                  color: 'FF0000',
                  size: 22,
                  font: FONT_NAME,
                }),
              ],
              spacing: { after: 120 },
            })
          );
        });
      }
      break;
      
    default:
      if (question.answer) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `CORRECTION:\n${question.answer}`,
                bold: true,
                color: 'FF0000',
                size: 22,
                  font: FONT_NAME,
              }),
            ],
            spacing: { after: 120 },
          })
        );
      }
  }
  
  return paragraphs;
};

// Exporter un examen vers Word avec formatage natif
export const exportExamToWordNative = async (exam: Exam): Promise<void> => {
  try {
    console.log('📄 [EXPORT NATIF] Début génération Word avec formatage');
    
    if (!exam.subject) {
      throw new Error('Le champ subject est obligatoire');
    }
    
    const isEnglish = exam.subject?.toLowerCase().includes('anglais') || 
                      exam.subject?.toLowerCase() === 'english';
    
    // Créer le document
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // En-tête
          createHeader(exam),
          
          new Paragraph({ text: '' }), // Espace
          
          // Logo et titre (optionnel)
          new Paragraph({
            children: [
              new TextRun({
                text: 'LES ÉCOLES INTERNATIONALES AL KAWTHAR',
                bold: true,
                size: 28,
                  font: FONT_NAME,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),
          
          // Questions par sections
          ...generateQuestionsParagraphs(exam, isEnglish),
        ],
      }],
    });
    
    // Générer le blob
    const blob = await Packer.toBlob(doc);
    
    // Télécharger
    const fileName = `Examen_${exam.subject.replace(/\s+/g, '_')}_${exam.grade}_${exam.semester.replace(/\s+/g, '_')}.docx`;
    saveAs(blob, fileName);
    
    console.log('✅ [EXPORT NATIF] Document généré avec formatage natif');
    
  } catch (error: any) {
    console.error('❌ [EXPORT NATIF] Erreur:', error);
    throw new Error(`Échec de l'export natif: ${error?.message}`);
  }
};

// Générer tous les paragraphes des questions
const generateQuestionsParagraphs = (exam: Exam, isEnglish: boolean): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  
  if (exam.questions && exam.questions.length > 0) {
    const sections = organizeQuestionsBySection(exam.questions);
    let globalIndex = 0;
    
    sections.forEach((questions, sectionName) => {
      // Titre de section EN GRAS
      if (sectionName !== 'Exercices') {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: sectionName.toUpperCase(),
                bold: true,
                size: 26, // 13pt
              }),
            ],
            spacing: { before: 360, after: 240 },
          })
        );
      }
      
      // Questions de cette section
      questions.forEach((question) => {
        paragraphs.push(...createQuestionParagraphs(question, globalIndex, isEnglish));
        globalIndex++;
      });
    });
  }
  
  return paragraphs;
};

// Exporter la correction
export const exportExamCorrectionToWordNative = async (exam: Exam): Promise<void> => {
  try {
    console.log('📄 [CORRECTION NATIF] Début génération correction avec formatage');
    
    if (!exam.subject) {
      throw new Error('Le champ subject est obligatoire');
    }
    
    const isEnglish = exam.subject?.toLowerCase().includes('anglais') || 
                      exam.subject?.toLowerCase() === 'english';
    
    // Modifier l'examen pour ajouter "CORRECTION" au sujet
    const correctionExam = { ...exam, subject: `${exam.subject} - CORRECTION` };
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          createHeader(correctionExam),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'LES ÉCOLES INTERNATIONALES AL KAWTHAR',
                bold: true,
                size: 28,
                  font: FONT_NAME,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),
          ...generateCorrectionParagraphs(exam, isEnglish),
        ],
      }],
    });
    
    const blob = await Packer.toBlob(doc);
    const fileName = `CORRECTION_${exam.subject.replace(/\s+/g, '_')}_${exam.grade}_${exam.semester.replace(/\s+/g, '_')}.docx`;
    saveAs(blob, fileName);
    
    console.log('✅ [CORRECTION NATIF] Correction générée avec formatage rouge');
    
  } catch (error: any) {
    console.error('❌ [CORRECTION NATIF] Erreur:', error);
    throw new Error(`Échec export correction: ${error?.message}`);
  }
};

// Générer paragraphes avec corrections
const generateCorrectionParagraphs = (exam: Exam, isEnglish: boolean): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  
  if (exam.questions && exam.questions.length > 0) {
    const sections = organizeQuestionsBySection(exam.questions);
    let globalIndex = 0;
    
    sections.forEach((questions, sectionName) => {
      if (sectionName !== 'Exercices') {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: sectionName.toUpperCase(),
                bold: true,
                size: 26,
                  font: FONT_NAME,
              }),
            ],
            spacing: { before: 360, after: 240 },
          })
        );
      }
      
      questions.forEach((question) => {
        paragraphs.push(...createQuestionWithCorrectionParagraphs(question, globalIndex, isEnglish));
        globalIndex++;
      });
    });
  }
  
  return paragraphs;
};
