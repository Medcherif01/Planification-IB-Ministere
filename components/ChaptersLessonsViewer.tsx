import React, { useState, useMemo } from 'react';
import { UnitPlan, UnitSession } from '../types';
import { BookOpen, Copy, Check, List, LayoutGrid, ChevronDown, ChevronUp } from 'lucide-react';

export interface ChapterItem {
  id: string;
  title: string;
  number?: string | number;
  raw: string;
  lessons: LessonItem[];
  colorIndex: number;
}

export interface LessonItem {
  id: string;
  title: string;
  number?: string | number;
  raw: string;
  duration?: string;
  objective?: string;
}

// Thèmes de couleurs harmonieuses pour chaque chapitre et ses leçons
const COLOR_THEMES = [
  {
    name: 'blue',
    border: 'border-blue-300',
    bg: 'bg-blue-50/70',
    headerBg: 'bg-blue-100/90 text-blue-900',
    badge: 'bg-blue-600 text-white',
    dash: 'text-blue-600 font-black',
    lessonDash: 'text-blue-500 font-bold',
    lessonBg: 'bg-white hover:bg-blue-50/60',
    lessonBorder: 'border-blue-100',
    lessonText: 'text-slate-800',
    lessonBadge: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    name: 'emerald',
    border: 'border-emerald-300',
    bg: 'bg-emerald-50/70',
    headerBg: 'bg-emerald-100/90 text-emerald-900',
    badge: 'bg-emerald-600 text-white',
    dash: 'text-emerald-600 font-black',
    lessonDash: 'text-emerald-500 font-bold',
    lessonBg: 'bg-white hover:bg-emerald-50/60',
    lessonBorder: 'border-emerald-100',
    lessonText: 'text-slate-800',
    lessonBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    name: 'amber',
    border: 'border-amber-300',
    bg: 'bg-amber-50/70',
    headerBg: 'bg-amber-100/90 text-amber-900',
    badge: 'bg-amber-600 text-white',
    dash: 'text-amber-600 font-black',
    lessonDash: 'text-amber-500 font-bold',
    lessonBg: 'bg-white hover:bg-amber-50/60',
    lessonBorder: 'border-amber-100',
    lessonText: 'text-slate-800',
    lessonBadge: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    name: 'purple',
    border: 'border-purple-300',
    bg: 'bg-purple-50/70',
    headerBg: 'bg-purple-100/90 text-purple-900',
    badge: 'bg-purple-600 text-white',
    dash: 'text-purple-600 font-black',
    lessonDash: 'text-purple-500 font-bold',
    lessonBg: 'bg-white hover:bg-purple-50/60',
    lessonBorder: 'border-purple-100',
    lessonText: 'text-slate-800',
    lessonBadge: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    name: 'cyan',
    border: 'border-cyan-300',
    bg: 'bg-cyan-50/70',
    headerBg: 'bg-cyan-100/90 text-cyan-900',
    badge: 'bg-cyan-600 text-white',
    dash: 'text-cyan-600 font-black',
    lessonDash: 'text-cyan-500 font-bold',
    lessonBg: 'bg-white hover:bg-cyan-50/60',
    lessonBorder: 'border-cyan-100',
    lessonText: 'text-slate-800',
    lessonBadge: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  },
  {
    name: 'rose',
    border: 'border-rose-300',
    bg: 'bg-rose-50/70',
    headerBg: 'bg-rose-100/90 text-rose-900',
    badge: 'bg-rose-600 text-white',
    dash: 'text-rose-600 font-black',
    lessonDash: 'text-rose-500 font-bold',
    lessonBg: 'bg-white hover:bg-rose-50/60',
    lessonBorder: 'border-rose-100',
    lessonText: 'text-slate-800',
    lessonBadge: 'bg-rose-100 text-rose-800 border-rose-200',
  },
];

/**
 * Normalisation et découpage des lignes, en traitant les retours à la ligne
 * et les séparateurs type point-virgule ou double saut.
 */
function prepareLines(text: string): string[] {
  if (!text) return [];

  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // 1. Détecter si des chapitres sont mentionnés inline entre parenthèses ou inline
  // Ex: "... la performance optimale (Chapitre 1) et de l'entretien de la santé (Chapitre 5) ..."
  const inlineChapMatches = [...normalized.matchAll(/(?:([^\n.;()]+?)\s*\((?:Chapitre|Chap|Ch\b)\s*(\d+)\s*\)|(?:Chapitre|Chap|Ch\b)\s*(\d+)\s*[:\-\–\—\.]?\s*([^\n.;()]+))/gi)];
  if (inlineChapMatches.length >= 2) {
    const extracted: string[] = [];
    for (const m of inlineChapMatches) {
      if (m[2]) {
        const chapNum = m[2];
        const rawTitle = m[1].replace(/^(?:les élèves exploreront|exploration de|étude de|et de|et|de|sur)\s+/i, '').trim();
        extracted.push(`Chapitre ${chapNum} : ${rawTitle || 'Notions clés'}`);
      } else if (m[3]) {
        const chapNum = m[3];
        const rawTitle = m[4].trim();
        extracted.push(`Chapitre ${chapNum} : ${rawTitle || 'Notions clés'}`);
      }
    }
    if (extracted.length >= 2) {
      return extracted;
    }
  }

  // 2. Si des chapitres ou leçons sont collés sur une même ligne
  // Ex: "Chapitre 1 : ... Chapitre 2 : ..."
  normalized = normalized.replace(/([^\n])\s+(?=(?:Chapitre|Chap\b|Thème|Partie|Section)\s*\d+)/gi, '$1\n');
  normalized = normalized.replace(/([^\n])\s+(?=(?:[-*•–—]\s*)?(?:Leçon|Lecon|Séance|Seance)\s*\d+)/gi, '$1\n');
  normalized = normalized.replace(/([^\n])\s+[-*•–—]\s+/g, '$1\n- ');

  if (normalized.includes(';') && (/(?:chapitre|chap\b|thème|partie|module|leçon|seance)/i.test(normalized))) {
    normalized = normalized.split(';').join('\n');
  }

  return normalized
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * Normalise un titre de chapitre ou de leçon pour détecter les doublons
 * même s'ils proviennent de différents manuels scolaires.
 */
export function normalizeTopicKey(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // enlever les accents
    .replace(/^(?:[-*•–—]?\s*)?(?:chapitre|chap|chapter|ch|theme|module|partie|section|unite|lecon|lesson|lec|seance|session|activite)\s*[\d\w.\-_]*\s*[:\-–—.]?\s*/i, '')
    .replace(/^(?:les|la|le|l'|des|du|de la|de l'|de|d'|un|une|et|ou|dans|sur|pour|avec|par|introduction a|initiation a|etude de|notions de)\s+/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Vérifie si deux intitulés de chapitres ou de leçons désignent le même sujet
 * (ex: issus de deux sommaires de manuels différents).
 */
export function areTopicsSimilar(titleA: string, titleB: string): boolean {
  const keyA = normalizeTopicKey(titleA);
  const keyB = normalizeTopicKey(titleB);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;

  // Inclusion directe si la chaîne est suffisamment descriptive
  if (keyA.length >= 6 && keyB.length >= 6) {
    if (keyA.includes(keyB) || keyB.includes(keyA)) return true;
  }

  // Comparaison par mots-clés significatifs (> 3 lettres)
  const stopWords = new Set(['dans', 'pour', 'avec', 'sans', 'entre', 'sous', 'vers', 'chez', 'plus', 'moins', 'tout', 'tous', 'toute', 'toutes', 'cette', 'sont', 'etre', 'avoir', 'faire', 'comme', 'ainsi', 'donc', 'mais', 'chapitre', 'lecon', 'seance', 'partie', 'theme', 'cours', 'etude', 'notion', 'notions']);
  const wordsA = keyA.split(' ').filter(w => w.length > 3 && !stopWords.has(w));
  const wordsB = keyB.split(' ').filter(w => w.length > 3 && !stopWords.has(w));

  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const matches = wordsA.filter(w =>
    wordsB.some(wb => wb === w || (w.length >= 5 && wb.length >= 5 && (w.startsWith(wb.slice(0, 5)) || wb.startsWith(w.slice(0, 5)))))
  );

  const minLen = Math.min(wordsA.length, wordsB.length);
  const maxLen = Math.max(wordsA.length, wordsB.length);

  if (minLen === 1 && maxLen === 1) {
    return matches.length === 1;
  }
  return matches.length >= Math.max(1, Math.ceil(minLen * 0.75)) && matches.length / maxLen >= 0.5;
}

/**
 * Déduplique une liste de ChapterItem en fusionnant les chapitres similaires
 * et en supprimant les leçons répétées, puis renumérote proprement.
 */
export function deduplicateChapterItems(items: ChapterItem[]): ChapterItem[] {
  const mergedChapters: ChapterItem[] = [];

  for (const chap of items) {
    const cleanChapTitle = chap.title
      .replace(/^(?:[-*•–—]?\s*)?(?:chapitre|chap|chapter|ch\b|thème|theme|module|partie|section)\s*[\d\w.\-_]*\s*[:\-–—.]?\s*/i, '')
      .trim() || chap.title.trim();

    // Chercher si ce chapitre existe déjà dans mergedChapters
    const existingChap = mergedChapters.find(c => areTopicsSimilar(c.title, cleanChapTitle));

    const targetChap = existingChap || {
      ...chap,
      title: cleanChapTitle,
      lessons: [],
      colorIndex: mergedChapters.length % COLOR_THEMES.length,
    };

    if (!existingChap) {
      mergedChapters.push(targetChap);
    }

    // Ajouter uniquement les leçons qui n'existent pas encore dans ce chapitre (ni à l'identique dans un autre chapitre)
    for (const les of chap.lessons) {
      const cleanLesTitle = les.title
        .replace(/^[-*•–—]\s*/, '')
        .replace(/^(?:leçon|lecon|lesson|lec\b|séance|seance|session|activité|activite)\s*[\d\w.\-_]*\s*[:\-–—.]?\s*/i, '')
        .trim() || les.title.trim();

      if (!cleanLesTitle) continue;

      const alreadyInTarget = targetChap.lessons.some(existingLes =>
        areTopicsSimilar(existingLes.title, cleanLesTitle)
      );

      if (!alreadyInTarget) {
        targetChap.lessons.push({
          ...les,
          title: cleanLesTitle,
          number: `${targetChap.lessons.length + 1}`,
        });
      }
    }
  }

  // Renuméroter proprement les chapitres et leurs leçons
  return mergedChapters.map((chap, idx) => ({
    ...chap,
    number: `${idx + 1}`,
    colorIndex: idx % COLOR_THEMES.length,
    lessons: chap.lessons.map((les, lIdx) => ({
      ...les,
      number: `${lIdx + 1}`,
    })),
  }));
}

/**
 * Analyse intelligente du texte des chapitres et des leçons pour construire une hiérarchie structurée
 * SANS doublons de chapitres ni de leçons.
 */
export function parseChaptersAndLessons(
  chaptersText?: string,
  lessonsList?: string[],
  sessionsList?: UnitSession[],
  contentText?: string
): ChapterItem[] {
  const result: ChapterItem[] = [];
  const textToParse = (chaptersText || '').trim();

  // Regex pour détecter les chapitres (avec ou sans ponctuation, tiret ou point)
  const chapterExplicitRegex = /^(?:[-*•–—]?\s*)?(?:chapitre|chap|chapter|ch\b|thème|theme|module|partie|section|unité|unite|grand\s+[ivx\d]+)\s*([\d\w\.\-_]*)\s*[:\-\–\—\.]?\s*(.*)$/i;

  // Regex pour les leçons explicites
  const lessonExplicitRegex = /^(?:[-*•–—]?\s*)?(?:leçon|lecon|lesson|lec\b|séance|seance|session|sous-chapitre|sous\s+chapitre|activité|activite)\s*([\d\w\.\-_]*)\s*[:\-\–\—\.]?\s*(.*)$/i;

  // Regex pour toute ligne commençant par un tiret ou une puce
  const dashBulletRegex = /^[-*•–—]\s*(.*)$/;

  if (textToParse) {
    const rawLines = prepareLines(textToParse);
    let currentChapter: ChapterItem | null = null;
    let colorCounter = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const isDash = dashBulletRegex.test(line);
      const cleanLine = line.replace(/^[-*•–—]\s*/, '').trim();

      const chapterMatch = line.match(chapterExplicitRegex);
      const lessonMatch = line.match(lessonExplicitRegex);

      const isExplicitLesson = !!lessonMatch || (isDash && /(?:leçon|lecon|lesson|séance|seance|activité)/i.test(line));
      const isExplicitChapter = !!chapterMatch && !isExplicitLesson;

      if (isExplicitChapter) {
        const chapNum = chapterMatch[1] ? chapterMatch[1].trim() : `${result.length + 1}`;
        let chapTitle = chapterMatch[2] ? chapterMatch[2].trim() : '';
        if (!chapTitle) {
          chapTitle = `Chapitre ${chapNum}`;
        }

        currentChapter = {
          id: `chap_${result.length}_${Date.now()}`,
          title: chapTitle,
          number: chapNum,
          raw: line,
          lessons: [],
          colorIndex: colorCounter % COLOR_THEMES.length,
        };
        colorCounter++;
        result.push(currentChapter);
      } else if (isExplicitLesson) {
        const lesNum = lessonMatch?.[1] ? lessonMatch[1].trim() : (currentChapter ? `${currentChapter.lessons.length + 1}` : `${i + 1}`);
        let lesTitle = lessonMatch?.[2] ? lessonMatch[2].trim() : cleanLine;
        if (!lesTitle) lesTitle = cleanLine;

        if (!currentChapter) {
          currentChapter = {
            id: `chap_${result.length}_${Date.now()}`,
            title: 'Chapitre 1',
            number: '1',
            raw: 'Chapitre 1',
            lessons: [],
            colorIndex: colorCounter % COLOR_THEMES.length,
          };
          colorCounter++;
          result.push(currentChapter);
        }

        currentChapter.lessons.push({
          id: `les_${currentChapter.lessons.length}_${Date.now()}`,
          title: lesTitle,
          number: lesNum,
          raw: line,
        });
      } else if (isDash) {
        if (!currentChapter) {
          currentChapter = {
            id: `chap_${result.length}_${Date.now()}`,
            title: cleanLine,
            number: `${result.length + 1}`,
            raw: line,
            lessons: [],
            colorIndex: colorCounter % COLOR_THEMES.length,
          };
          colorCounter++;
          result.push(currentChapter);
        } else {
          currentChapter.lessons.push({
            id: `les_${currentChapter.lessons.length}_${Date.now()}`,
            title: cleanLine,
            number: `${currentChapter.lessons.length + 1}`,
            raw: line,
          });
        }
      } else {
        const numMatch = line.match(/^(\d+)[\.\-\)]\s*(.*)$/);
        const chapNum = numMatch ? numMatch[1] : `${result.length + 1}`;
        const chapTitle = numMatch ? (numMatch[2] || line) : line;

        currentChapter = {
          id: `chap_${result.length}_${Date.now()}`,
          title: chapTitle,
          number: chapNum,
          raw: line,
          lessons: [],
          colorIndex: colorCounter % COLOR_THEMES.length,
        };
        colorCounter++;
        result.push(currentChapter);
      }
    }
  }

  // ── ENRICHISSEMENT INTELLIGENT DES LEÇONS SI ABSENTES OU INCOMPLÈTES ──
  const totalExtractedLessons = result.reduce((acc, c) => acc + c.lessons.length, 0);

  if (Array.isArray(sessionsList) && sessionsList.length > 0 && totalExtractedLessons === 0) {
    if (result.length <= 1) {
      const targetChap = result[0] || {
        id: `chap_sessions_${Date.now()}`,
        title: 'Planification des séances',
        number: '1',
        raw: 'Séances',
        lessons: [],
        colorIndex: 0,
      };
      if (result.length === 0) result.push(targetChap);
      sessionsList.forEach(s => {
        const title = s.objectifApprentissage || s.contenu || `Séance ${s.numero}`;
        targetChap.lessons.push({
          id: `sess_${s.numero}_${Date.now()}`,
          title: title.startsWith('Séance') || title.startsWith('Leçon') ? title : `Séance ${s.numero} : ${title}`,
          number: `${s.numero}`,
          duration: s.duree,
          objective: s.objectifApprentissage,
          raw: title,
        });
      });
    } else {
      const perChap = Math.ceil(sessionsList.length / result.length);
      sessionsList.forEach((s, idx) => {
        const chapIdx = Math.min(Math.floor(idx / perChap), result.length - 1);
        const title = s.objectifApprentissage || s.contenu || `Séance ${s.numero}`;
        result[chapIdx].lessons.push({
          id: `sess_${s.numero}_${Date.now()}`,
          title: title.startsWith('Séance') || title.startsWith('Leçon') ? title : `Séance ${s.numero} : ${title}`,
          number: `${s.numero}`,
          duration: s.duree,
          objective: s.objectifApprentissage,
          raw: title,
        });
      });
    }
  } else if (Array.isArray(lessonsList) && lessonsList.length > 0 && totalExtractedLessons === 0) {
    const targetChap = result[0] || {
      id: `chap_lessons_${Date.now()}`,
      title: 'Notions & Progression',
      number: '1',
      raw: 'Programme',
      lessons: [],
      colorIndex: 0,
    };
    if (result.length === 0) result.push(targetChap);
    lessonsList.forEach((les, idx) => {
      if (typeof les === 'string' && les.trim()) {
        targetChap.lessons.push({
          id: `les_arr_${idx}`,
          title: les.trim().replace(/^[-*•–—]\s*/, ''),
          number: `${idx + 1}`,
          raw: les,
        });
      }
    });
  } else if (result.length === 0 && contentText && contentText.trim()) {
    const lines = prepareLines(contentText);
    const chap: ChapterItem = {
      id: `chap_content_${Date.now()}`,
      title: 'Notions & Progression',
      number: '1',
      raw: 'Contenu',
      lessons: [],
      colorIndex: 0,
    };
    lines.forEach((l, idx) => {
      chap.lessons.push({
        id: `content_line_${idx}`,
        title: l.replace(/^[-*•–—]\s*/, ''),
        number: `${idx + 1}`,
        raw: l,
      });
    });
    result.push(chap);
  } else if (result.length === 1 && result[0].lessons.length === 0 && textToParse) {
    const sentences = textToParse
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim().replace(/^[-*•–—]\s*/, ''))
      .filter(s => s.length > 12);
    if (sentences.length >= 2) {
      sentences.forEach((sent, idx) => {
        result[0].lessons.push({
          id: `les_sent_${idx}`,
          title: sent,
          number: `${idx + 1}`,
          raw: sent,
        });
      });
    } else {
      const clauses = textToParse
        .split(/(?:,|\bet\b|\bpour\b)\s+/)
        .map(c => c.trim())
        .filter(c => c.length > 15);
      if (clauses.length >= 2) {
        clauses.forEach((cl, idx) => {
          result[0].lessons.push({
            id: `les_cl_${idx}`,
            title: cl.charAt(0).toUpperCase() + cl.slice(1),
            number: `${idx + 1}`,
            raw: cl,
          });
        });
      }
    }
  }

  // Déduplication systématique des chapitres et des leçons
  return deduplicateChapterItems(result);
}

/**
 * Fusionne les chapitres existants d'une unité avec de nouveaux chapitres issus d'un ou plusieurs manuels :
 * - Ne répète JAMAIS un chapitre ou une leçon déjà présent(e)
 * - Ajoute les nouveaux chapitres compatibles et fusionne les nouvelles leçons dans les chapitres existants
 */
export function mergeAndDeduplicateChaptersText(
  existingChaptersText: string,
  incomingChaptersText: string
): {
  chaptersText: string;
  lessonsList: string[];
  addedChaptersCount: number;
  addedLessonsCount: number;
  skippedDuplicatesCount: number;
} {
  const existingItems = parseChaptersAndLessons(existingChaptersText);
  const incomingItems = parseChaptersAndLessons(incomingChaptersText);

  let addedChaptersCount = 0;
  let addedLessonsCount = 0;
  let skippedDuplicatesCount = 0;

  const merged: ChapterItem[] = existingItems.map(c => ({
    ...c,
    lessons: [...c.lessons],
  }));

  for (const incChap of incomingItems) {
    const cleanIncChapTitle = incChap.title
      .replace(/^(?:[-*•–—]?\s*)?(?:chapitre|chap|chapter|ch\b|thème|theme|module|partie|section)\s*[\d\w.\-_]*\s*[:\-–—.]?\s*/i, '')
      .trim() || incChap.title.trim();

    const matchedChap = merged.find(exChap => areTopicsSimilar(exChap.title, cleanIncChapTitle));

    if (matchedChap) {
      // Le chapitre existe déjà : on ne le répète pas, on vérifie ses leçons
      skippedDuplicatesCount++;
      for (const incLes of incChap.lessons) {
        const cleanLesTitle = incLes.title
          .replace(/^[-*•–—]\s*/, '')
          .replace(/^(?:leçon|lecon|lesson|lec\b|séance|seance|session|activité|activite)\s*[\d\w.\-_]*\s*[:\-–—.]?\s*/i, '')
          .trim() || incLes.title.trim();
        if (!cleanLesTitle) continue;

        const alreadyHasLesson = merged.some(c =>
          c.lessons.some(l => areTopicsSimilar(l.title, cleanLesTitle))
        );

        if (alreadyHasLesson) {
          skippedDuplicatesCount++;
        } else {
          matchedChap.lessons.push({
            ...incLes,
            title: cleanLesTitle,
            number: `${matchedChap.lessons.length + 1}`,
          });
          addedLessonsCount++;
        }
      }
    } else {
      // Nouveau chapitre non présent : filtrer ses leçons pour éviter de répéter une leçon déjà présente dans un autre chapitre de l'unité
      const uniqueNewLessons: LessonItem[] = [];
      for (const incLes of incChap.lessons) {
        const cleanLesTitle = incLes.title
          .replace(/^[-*•–—]\s*/, '')
          .replace(/^(?:leçon|lecon|lesson|lec\b|séance|seance|session|activité|activite)\s*[\d\w.\-_]*\s*[:\-–—.]?\s*/i, '')
          .trim() || incLes.title.trim();
        if (!cleanLesTitle) continue;

        const alreadyInUnit = merged.some(c =>
          c.lessons.some(l => areTopicsSimilar(l.title, cleanLesTitle))
        ) || uniqueNewLessons.some(l => areTopicsSimilar(l.title, cleanLesTitle));

        if (alreadyInUnit) {
          skippedDuplicatesCount++;
        } else {
          uniqueNewLessons.push({
            ...incLes,
            title: cleanLesTitle,
            number: `${uniqueNewLessons.length + 1}`,
          });
          addedLessonsCount++;
        }
      }

      merged.push({
        ...incChap,
        title: cleanIncChapTitle,
        number: `${merged.length + 1}`,
        colorIndex: merged.length % COLOR_THEMES.length,
        lessons: uniqueNewLessons,
      });
      addedChaptersCount++;
    }
  }

  const finalChapters = deduplicateChapterItems(merged);
  const formattedLines: string[] = [];
  const flatLessons: string[] = [];

  finalChapters.forEach((chap, cIdx) => {
    formattedLines.push(`Chapitre ${cIdx + 1} : ${chap.title}`);
    chap.lessons.forEach((les, lIdx) => {
      const lessonLine = `Leçon ${lIdx + 1} : ${les.title}`;
      formattedLines.push(`- ${lessonLine}`);
      flatLessons.push(lessonLine);
    });
  });

  return {
    chaptersText: formattedLines.join('\n'),
    lessonsList: flatLessons,
    addedChaptersCount,
    addedLessonsCount,
    skippedDuplicatesCount,
  };
}

/**
 * Génère le texte brut sous la forme exacte demandée par l'utilisateur :
 * Chap 1
 * -leçon 1
 * -leçon 2
 * Chap 2
 * Chap 3
 */
export function formatAsBulletedText(chapters: ChapterItem[]): string {
  if (!chapters || chapters.length === 0) return '';
  const lines: string[] = [];

  chapters.forEach((chap, cIdx) => {
    const chapHeader = chap.title.toLowerCase().startsWith('chap')
      ? chap.title
      : `Chap ${chap.number || cIdx + 1} : ${chap.title}`;
    lines.push(chapHeader);

    chap.lessons.forEach((les, lIdx) => {
      const cleanTitle = les.title.replace(/^[-*•–—]\s*/, '');
      const lessonLabel = cleanTitle.toLowerCase().startsWith('leçon') || cleanTitle.toLowerCase().startsWith('séance')
        ? cleanTitle
        : `leçon ${les.number || lIdx + 1} : ${cleanTitle}`;
      lines.push(`  -${lessonLabel}`);
    });
  });

  return lines.join('\n');
}

interface ChaptersLessonsViewerProps {
  plan?: UnitPlan;
  chapters?: string;
  lessons?: string[];
  sessions?: UnitSession[];
  content?: string;
  rawText?: string;
  unitTitle?: string;
  compact?: boolean;
  variant?: 'card' | 'full' | 'compact' | 'preview';
  initialExpanded?: boolean;
  className?: string;
  showTitle?: boolean;
}

/**
 * Composant d'affichage des chapitres et leçons sous forme de tirets structurés.
 * Répond fidèlement au besoin :
 * Chap 1
 * -leçon 1
 * -leçon 2
 * Chap 2
 * Chap 3
 */
export const ChaptersLessonsViewer: React.FC<ChaptersLessonsViewerProps> = ({
  plan,
  chapters,
  lessons,
  sessions,
  content,
  rawText,
  unitTitle,
  compact = false,
  variant = 'card',
  initialExpanded = true,
  className = '',
  showTitle = true,
}) => {
  const effectiveContent = content || rawText;
  const effectiveVariant = compact ? 'compact' : variant;
  const [viewMode, setViewMode] = useState<'cards' | 'raw_dashes'>('cards');
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded || effectiveVariant === 'full' || effectiveVariant === 'preview');

  // Détermination des données sources
  const chaptersText = chapters !== undefined ? chapters : plan?.chapters;
  const lessonsList = lessons !== undefined ? lessons : plan?.lessons;
  const sessionsList = sessions !== undefined ? sessions : plan?.sessions;
  const contentText = effectiveContent !== undefined ? effectiveContent : plan?.content;

  const parsedChapters = useMemo(() => {
    return parseChaptersAndLessons(chaptersText, lessonsList, sessionsList, contentText);
  }, [chaptersText, lessonsList, sessionsList, contentText]);

  const rawDashesText = useMemo(() => {
    return formatAsBulletedText(parsedChapters);
  }, [parsedChapters]);

  const totalChapters = parsedChapters.length;
  const totalLessons = parsedChapters.reduce((acc, c) => acc + c.lessons.length, 0);

  const handleCopyDashes = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(rawDashesText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (totalChapters === 0 && totalLessons === 0) {
    if (variant === 'full' || variant === 'preview') {
      return (
        <div className={`p-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-400 italic ${className}`}>
          Aucun chapitre ou leçon spécifié.
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs ${className}`}>
      {/* ── Entête du bloc ── */}
      {showTitle && (
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="p-1 rounded bg-blue-600 text-white shrink-0">
              <BookOpen size={12} />
            </span>
            <span className="text-xs font-bold text-slate-800 truncate">
              Chapitres & Leçons ({totalChapters} chap. • {totalLessons} leçons)
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Bascule vue Cartes / Vue Tirets bruts */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setViewMode(m => m === 'cards' ? 'raw_dashes' : 'cards');
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition ${
                viewMode === 'raw_dashes'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Basculer entre vue graphique et format tirets"
            >
              {viewMode === 'raw_dashes' ? <LayoutGrid size={11} /> : <List size={11} />}
              {viewMode === 'raw_dashes' ? 'Vue graphique' : 'Format tirets'}
            </button>

            {/* Bouton Copier */}
            <button
              type="button"
              onClick={handleCopyDashes}
              className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition"
              title="Copier le format texte avec tirets"
            >
              {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* ── VUE 1 : FORMAT TEXTE PUR AVEC TIRETS ── */}
      {viewMode === 'raw_dashes' ? (
        <div className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs leading-relaxed overflow-x-auto select-all rounded-b-xl max-h-60 overflow-y-auto">
          <pre className="whitespace-pre-wrap">{rawDashesText}</pre>
        </div>
      ) : (
        /* ── VUE 2 : VUE HIÉRARCHIQUE STRUCTURÉE (TIRETS & COULEURS) ── */
        <div className="p-2.5 space-y-2 text-xs">
          {parsedChapters.map((chap, chapIdx) => {
            const theme = COLOR_THEMES[chap.colorIndex % COLOR_THEMES.length];
            const hasLessons = chap.lessons.length > 0;
            const chapDisplay = chap.title.toLowerCase().startsWith('chap')
              ? chap.title
              : `Chap ${chap.number || chapIdx + 1} : ${chap.title}`;

            return (
              <div
                key={chap.id || chapIdx}
                className={`rounded-lg border ${theme.border} ${theme.bg} p-2 transition-all`}
              >
                {/* ── Chapitre avec badge et tiret gras ── */}
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-black ${theme.dash} select-none shrink-0`}>
                    —
                  </span>
                  <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${theme.badge}`}>
                      Chap {chap.number || chapIdx + 1}
                    </span>
                    <span className="font-bold text-slate-900 leading-snug">
                      {chap.title}
                    </span>
                  </div>
                </div>

                {/* ── Leçons sous forme de tirets ── */}
                {hasLessons ? (
                  <div className="mt-1.5 pl-4 space-y-1">
                    {chap.lessons.map((lesson, lesIdx) => {
                      const cleanTitle = lesson.title.replace(/^[-*•–—]\s*/, '');
                      return (
                        <div
                          key={lesson.id || lesIdx}
                          className={`flex items-baseline gap-2 py-0.5 px-2 rounded ${theme.lessonBg} border ${theme.lessonBorder}`}
                        >
                          <span className={`text-xs font-black select-none shrink-0 ${theme.lessonDash}`}>
                            -
                          </span>
                          <span className="text-slate-800 font-medium leading-snug">
                            {cleanTitle}
                          </span>
                          {lesson.duration && (
                            <span className="text-[10px] text-slate-400 italic ml-auto shrink-0">
                              ({lesson.duration})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-1 pl-5 text-[11px] text-slate-400 italic">
                    (Chapitre sans sous-leçons détaillées)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChaptersLessonsViewer;
