import React, { useState, useMemo } from 'react';
import { UnitPlan, UnitSession } from '../types';
import { BookOpen, Layers, Bookmark, Sparkles, ChevronDown, ChevronUp, FileText, CheckCircle2 } from 'lucide-react';

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

// Thèmes de couleurs vives et harmonieuses pour chaque chapitre et ses leçons
const COLOR_THEMES = [
  {
    name: 'indigo',
    border: 'border-indigo-300',
    bg: 'bg-indigo-50/70',
    headerBg: 'bg-indigo-100/90 text-indigo-900',
    badge: 'bg-indigo-600 text-white',
    dash: 'text-indigo-600 font-black',
    bulletBg: 'bg-indigo-500',
    lessonDash: 'text-indigo-500',
    lessonBg: 'bg-white hover:bg-indigo-50/50',
    lessonBorder: 'border-indigo-100',
    lessonText: 'text-indigo-950',
    lessonBadge: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    subDash: 'text-indigo-400',
  },
  {
    name: 'emerald',
    border: 'border-emerald-300',
    bg: 'bg-emerald-50/70',
    headerBg: 'bg-emerald-100/90 text-emerald-900',
    badge: 'bg-emerald-600 text-white',
    dash: 'text-emerald-600 font-black',
    bulletBg: 'bg-emerald-500',
    lessonDash: 'text-emerald-500',
    lessonBg: 'bg-white hover:bg-emerald-50/50',
    lessonBorder: 'border-emerald-100',
    lessonText: 'text-emerald-950',
    lessonBadge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    subDash: 'text-emerald-400',
  },
  {
    name: 'amber',
    border: 'border-amber-300',
    bg: 'bg-amber-50/70',
    headerBg: 'bg-amber-100/90 text-amber-900',
    badge: 'bg-amber-600 text-white',
    dash: 'text-amber-600 font-black',
    bulletBg: 'bg-amber-500',
    lessonDash: 'text-amber-500',
    lessonBg: 'bg-white hover:bg-amber-50/50',
    lessonBorder: 'border-amber-100',
    lessonText: 'text-amber-950',
    lessonBadge: 'bg-amber-100 text-amber-800 border-amber-200',
    subDash: 'text-amber-400',
  },
  {
    name: 'purple',
    border: 'border-purple-300',
    bg: 'bg-purple-50/70',
    headerBg: 'bg-purple-100/90 text-purple-900',
    badge: 'bg-purple-600 text-white',
    dash: 'text-purple-600 font-black',
    bulletBg: 'bg-purple-500',
    lessonDash: 'text-purple-500',
    lessonBg: 'bg-white hover:bg-purple-50/50',
    lessonBorder: 'border-purple-100',
    lessonText: 'text-purple-950',
    lessonBadge: 'bg-purple-100 text-purple-800 border-purple-200',
    subDash: 'text-purple-400',
  },
  {
    name: 'cyan',
    border: 'border-cyan-300',
    bg: 'bg-cyan-50/70',
    headerBg: 'bg-cyan-100/90 text-cyan-900',
    badge: 'bg-cyan-600 text-white',
    dash: 'text-cyan-600 font-black',
    bulletBg: 'bg-cyan-500',
    lessonDash: 'text-cyan-500',
    lessonBg: 'bg-white hover:bg-cyan-50/50',
    lessonBorder: 'border-cyan-100',
    lessonText: 'text-cyan-950',
    lessonBadge: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    subDash: 'text-cyan-400',
  },
  {
    name: 'rose',
    border: 'border-rose-300',
    bg: 'bg-rose-50/70',
    headerBg: 'bg-rose-100/90 text-rose-900',
    badge: 'bg-rose-600 text-white',
    dash: 'text-rose-600 font-black',
    bulletBg: 'bg-rose-500',
    lessonDash: 'text-rose-500',
    lessonBg: 'bg-white hover:bg-rose-50/50',
    lessonBorder: 'border-rose-100',
    lessonText: 'text-rose-950',
    lessonBadge: 'bg-rose-100 text-rose-800 border-rose-200',
    subDash: 'text-rose-400',
  },
  {
    name: 'blue',
    border: 'border-blue-300',
    bg: 'bg-blue-50/70',
    headerBg: 'bg-blue-100/90 text-blue-900',
    badge: 'bg-blue-600 text-white',
    dash: 'text-blue-600 font-black',
    bulletBg: 'bg-blue-500',
    lessonDash: 'text-blue-500',
    lessonBg: 'bg-white hover:bg-blue-50/50',
    lessonBorder: 'border-blue-100',
    lessonText: 'text-blue-950',
    lessonBadge: 'bg-blue-100 text-blue-800 border-blue-200',
    subDash: 'text-blue-400',
  },
];

/**
 * Analyse intelligente du texte des chapitres et des leçons pour construire une hiérarchie structurée.
 */
export function parseChaptersAndLessons(
  chaptersText?: string,
  lessonsList?: string[],
  sessionsList?: UnitSession[],
  contentText?: string
): ChapterItem[] {
  const result: ChapterItem[] = [];
  const textToParse = (chaptersText || '').trim();

  // Regex patterns pour détecter les chapitres et les leçons
  const chapterRegex = /^(?:[-*•–—]?\s*)?(?:chapitre|chapter|ch\.|partie|thème|theme|module|section|unité|unite|grand\s+[ivx\d]+|[ivx]+\.|\d+\.)\s*([\d\w\.\-_]*)\s*[:\-\–\—\.]?\s*(.*)$/i;
  const lessonRegex = /^(?:[-*•–—]?\s*)?(?:leçon|lecon|lesson|lec\.|séance|seance|session|sous-chapitre|sous\s+chapitre|activité|activite|partie\s+[\w\d]+|\d+\.\d+|[a-z]\))\s*([\d\w\.\-_]*)\s*[:\-\–\—\.]?\s*(.*)$/i;
  const genericDashRegex = /^[-*•–—]\s*(.*)$/;

  if (textToParse) {
    const rawLines = textToParse.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let currentChapter: ChapterItem | null = null;
    let colorCounter = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const isIndented = line.startsWith('  ') || line.startsWith('\t') || line.startsWith(' -') || line.startsWith(' *');
      const cleanLine = line.replace(/^[-*•–—]\s*/, '').trim();

      // Vérifier si c'est une leçon explicite
      const lessonMatch = line.match(lessonRegex);
      // Vérifier si c'est un chapitre explicite
      const chapterMatch = line.match(chapterRegex);

      if (chapterMatch && !isIndented && !line.toLowerCase().includes('leçon') && !line.toLowerCase().includes('séance') && !line.toLowerCase().includes('session')) {
        // C'est un nouveau chapitre
        const chapNum = chapterMatch[1] ? chapterMatch[1].trim() : `${result.length + 1}`;
        let chapTitle = chapterMatch[2] ? chapterMatch[2].trim() : cleanLine;
        if (!chapTitle && cleanLine) chapTitle = cleanLine;

        currentChapter = {
          id: `chap_${result.length}_${Date.now()}`,
          title: chapTitle || `Chapitre ${chapNum}`,
          number: chapNum,
          raw: line,
          lessons: [],
          colorIndex: colorCounter % COLOR_THEMES.length,
        };
        colorCounter++;
        result.push(currentChapter);
      } else if (lessonMatch || (isIndented && currentChapter)) {
        // C'est une leçon
        const lesNum = lessonMatch?.[1] ? lessonMatch[1].trim() : (currentChapter ? `${currentChapter.lessons.length + 1}` : `${i + 1}`);
        const lesTitle = lessonMatch?.[2] ? lessonMatch[2].trim() : cleanLine;

        const newLesson: LessonItem = {
          id: `les_${i}_${Date.now()}`,
          title: lesTitle || cleanLine,
          number: lesNum,
          raw: line,
        };

        if (!currentChapter) {
          // Créer un chapitre par défaut si la première ligne est une leçon
          currentChapter = {
            id: `chap_${result.length}_${Date.now()}`,
            title: 'Chapitre 1 : Programme et notions clés',
            number: '1',
            raw: 'Chapitre 1',
            lessons: [],
            colorIndex: colorCounter % COLOR_THEMES.length,
          };
          colorCounter++;
          result.push(currentChapter);
        }
        currentChapter.lessons.push(newLesson);
      } else {
        // Ligne générique avec ou sans tiret
        const dashMatch = line.match(genericDashRegex);
        const contentTextClean = dashMatch ? dashMatch[1].trim() : cleanLine;

        if (contentTextClean) {
          // Si nous n'avons aucun chapitre, ou si la ligne commence par un tiret simple
          if (!currentChapter) {
            currentChapter = {
              id: `chap_${result.length}_${Date.now()}`,
              title: contentTextClean,
              number: `${result.length + 1}`,
              raw: line,
              lessons: [],
              colorIndex: colorCounter % COLOR_THEMES.length,
            };
            colorCounter++;
            result.push(currentChapter);
          } else if (currentChapter.lessons.length === 0 && !dashMatch && result.length === 1 && i === 0) {
            currentChapter.title = contentTextClean;
          } else {
            // Ajouter en tant que sous-leçon/notion au chapitre en cours
            currentChapter.lessons.push({
              id: `les_${i}_${Date.now()}`,
              title: contentTextClean,
              number: `${currentChapter.lessons.length + 1}`,
              raw: line,
            });
          }
        }
      }
    }
  }

  // Si on a des leçons dans `lessonsList` qui ne sont pas encore intégrées
  if (Array.isArray(lessonsList) && lessonsList.length > 0) {
    if (result.length === 0) {
      const defaultChap: ChapterItem = {
        id: `chap_lessons_${Date.now()}`,
        title: 'Chapitre 1 : Programme et leçons',
        number: '1',
        raw: 'Programme',
        lessons: [],
        colorIndex: 0,
      };
      lessonsList.forEach((les, idx) => {
        if (typeof les === 'string' && les.trim()) {
          defaultChap.lessons.push({
            id: `les_arr_${idx}`,
            title: les.trim().replace(/^[-*•–—]\s*/, ''),
            number: `${idx + 1}`,
            raw: les,
          });
        }
      });
      if (defaultChap.lessons.length > 0) {
        result.push(defaultChap);
      }
    }
  }

  // Si on a des séances `sessionsList`
  if (Array.isArray(sessionsList) && sessionsList.length > 0 && result.length === 0) {
    const sessionChap: ChapterItem = {
      id: `chap_sessions_${Date.now()}`,
      title: 'Chapitre 1 : Planification des séances d\'apprentissage',
      number: '1',
      raw: 'Séances',
      lessons: [],
      colorIndex: 0,
    };
    sessionsList.forEach((s) => {
      const title = s.objectifApprentissage || s.contenu || `Séance ${s.numero}`;
      sessionChap.lessons.push({
        id: `sess_${s.numero}`,
        title: `Séance ${s.numero} : ${title}`,
        number: `${s.numero}`,
        duration: s.duree,
        objective: s.objectifApprentissage,
        raw: title,
      });
    });
    if (sessionChap.lessons.length > 0) {
      result.push(sessionChap);
    }
  }

  // Fallback si toujours vide mais que `contentText` existe
  if (result.length === 0 && contentText && contentText.trim()) {
    const lines = contentText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const fallbackChap: ChapterItem = {
      id: `chap_content_${Date.now()}`,
      title: 'Chapitre 1 : Contenu et progression d\'apprentissage',
      number: '1',
      raw: 'Contenu',
      lessons: [],
      colorIndex: 0,
    };
    lines.forEach((l, idx) => {
      fallbackChap.lessons.push({
        id: `content_line_${idx}`,
        title: l.replace(/^[-*•–—]\s*/, ''),
        number: `${idx + 1}`,
        raw: l,
      });
    });
    result.push(fallbackChap);
  }

  return result;
}

interface ChaptersLessonsViewerProps {
  plan?: UnitPlan;
  chapters?: string;
  lessons?: string[];
  sessions?: UnitSession[];
  content?: string;
  variant?: 'card' | 'full' | 'compact' | 'preview';
  initialExpanded?: boolean;
  className?: string;
  showTitle?: boolean;
}

/**
 * Composant d'affichage élégant des chapitres et leçons sous forme de tirets et en couleurs.
 */
export const ChaptersLessonsViewer: React.FC<ChaptersLessonsViewerProps> = ({
  plan,
  chapters,
  lessons,
  sessions,
  content,
  variant = 'card',
  initialExpanded = false,
  className = '',
  showTitle = true,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(initialExpanded || variant === 'full' || variant === 'preview');

  // Détermination des données sources
  const chaptersText = chapters !== undefined ? chapters : plan?.chapters;
  const lessonsList = lessons !== undefined ? lessons : plan?.lessons;
  const sessionsList = sessions !== undefined ? sessions : plan?.sessions;
  const contentText = content !== undefined ? content : plan?.content;

  const parsedChapters = useMemo(() => {
    return parseChaptersAndLessons(chaptersText, lessonsList, sessionsList, contentText);
  }, [chaptersText, lessonsList, sessionsList, contentText]);

  // Décompte global
  const totalChapters = parsedChapters.length;
  const totalLessons = parsedChapters.reduce((acc, c) => acc + c.lessons.length, 0);

  if (totalChapters === 0 && totalLessons === 0) {
    if (variant === 'full' || variant === 'preview') {
      return (
        <div className={`p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-400 italic ${className}`}>
          Aucun chapitre ou leçon spécifié pour le moment.
        </div>
      );
    }
    return null;
  }

  // Nombre maximum d'éléments visibles par défaut en mode 'card' (pour garder une mise en page aérée)
  const maxVisibleChaptersInCard = 2;
  const shouldShowToggle = variant === 'card' && (totalChapters > maxVisibleChaptersInCard || totalLessons > 3);
  const displayedChapters = (variant === 'card' && !isExpanded) 
    ? parsedChapters.slice(0, maxVisibleChaptersInCard) 
    : parsedChapters;

  return (
    <div className={`rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50/80 via-white to-blue-50/30 overflow-hidden shadow-xs ${className}`}>
      {/* ── Entête du bloc Chapitres & Leçons ── */}
      {showTitle && (
        <div className="px-3.5 py-2.5 bg-gradient-to-r from-slate-100/90 to-blue-50/80 border-b border-slate-200/70 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-blue-600 text-white shadow-xs">
              <BookOpen size={13} />
            </span>
            <span className="text-xs font-bold text-slate-800 tracking-tight">
              Chapitres & Leçons inclus
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {totalChapters > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                <span className="text-indigo-600 font-extrabold">—</span>
                {totalChapters} {totalChapters > 1 ? 'chapitres' : 'chapitre'}
              </span>
            )}
            {totalLessons > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="text-emerald-600 font-extrabold">–</span>
                {totalLessons} {totalLessons > 1 ? 'leçons' : 'leçon'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Liste des chapitres et leçons avec tirets colorés ── */}
      <div className="p-3 space-y-2.5 text-xs">
        {displayedChapters.map((chap, chapIdx) => {
          const theme = COLOR_THEMES[chap.colorIndex % COLOR_THEMES.length];
          const hasLessons = chap.lessons.length > 0;

          return (
            <div
              key={chap.id || chapIdx}
              className={`rounded-lg border ${theme.border} ${theme.bg} p-2.5 transition-all duration-200 hover:shadow-xs`}
            >
              {/* ── Ligne Chapitre avec tiret coloré en gras ── */}
              <div className="flex items-start gap-2">
                {/* Tiret coloré stylisé pour le chapitre */}
                <span className={`text-base leading-none select-none font-black ${theme.dash} mt-0.5`} title="Chapitre inclus">
                  —
                </span>

                <div className="flex-grow">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${theme.badge}`}>
                      Chapitre {chap.number || chapIdx + 1}
                    </span>
                    <span className="font-bold text-slate-900 leading-tight">
                      {chap.title}
                    </span>
                  </div>

                  {/* ── Liste des Leçons associées avec tirets sous-jacents en couleurs ── */}
                  {hasLessons && (
                    <div className="mt-2 pl-2 sm:pl-3 border-l-2 border-dashed border-slate-200/90 space-y-1.5">
                      {chap.lessons.map((lesson, lesIdx) => (
                        <div
                          key={lesson.id || lesIdx}
                          className={`flex items-start gap-2 py-1 px-2 rounded-md ${theme.lessonBg} border ${theme.lessonBorder} transition-colors`}
                        >
                          {/* Tiret coloré stylisé pour la leçon */}
                          <span className={`text-sm leading-none select-none font-bold ${theme.lessonDash} mt-0.5`} title="Leçon incluse">
                            –
                          </span>

                          <div className="flex-grow flex items-baseline gap-1.5 flex-wrap">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${theme.lessonBadge}`}>
                              Leçon {lesson.number || lesIdx + 1}
                            </span>
                            <span className={`font-medium ${theme.lessonText} leading-snug`}>
                              {lesson.title}
                            </span>
                            {lesson.duration && (
                              <span className="text-[10px] text-slate-500 italic ml-auto">
                                ({lesson.duration})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* ── Indicateur s'il y a d'autres chapitres masqués en mode carte ── */}
        {!isExpanded && variant === 'card' && totalChapters > maxVisibleChaptersInCard && (
          <div className="text-[11px] text-slate-500 italic text-center py-1 bg-slate-50 rounded-md border border-slate-100">
            + {totalChapters - maxVisibleChaptersInCard} autre{totalChapters - maxVisibleChaptersInCard > 1 ? 's' : ''} chapitre{totalChapters - maxVisibleChaptersInCard > 1 ? 's' : ''}...
          </div>
        )}
      </div>

      {/* ── Bouton Dérouler / Replier pour mode carte ── */}
      {shouldShowToggle && (
        <div className="px-3 py-1.5 bg-slate-50/80 border-t border-slate-100 flex justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            {isExpanded ? (
              <>
                <ChevronUp size={12} /> Réduire les chapitres
              </>
            ) : (
              <>
                <ChevronDown size={12} /> Voir tous les chapitres et leçons ({totalChapters} ch. • {totalLessons} leçons)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default ChaptersLessonsViewer;
