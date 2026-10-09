import React from 'react';
import { formatProfessionalHtml } from '../services/evaluationAiOptimizerService';
import { isArabicText } from '../constants';

interface RichExerciseContentProps {
  content: string;
  className?: string;
  allowHtml?: boolean;
}

/**
 * Rendu soigné et professionnel du contenu d'une question ou d'une sous-question :
 * - Interprète et sublime le balisage HTML propre (<p>, <strong>, <ul>, <table>...)
 * - Détecte l'arabe automatiquement : applique dir="rtl" et centrage horizontal dans toutes les cases et blocs.
 * - Formate les énoncés en typographie fluide, moderne et élégante.
 */
export const RichExerciseContent: React.FC<RichExerciseContentProps> = ({
  content,
  className = '',
  allowHtml = true,
}) => {
  if (!content) return null;

  const html = formatProfessionalHtml(content);
  const isArabic = isArabicText(content);

  return (
    <div
      dir={isArabic ? 'rtl' : undefined}
      className={`rich-exercise-html leading-relaxed text-slate-800 text-sm sm:text-base space-y-2.5 font-normal
        ${isArabic ? 'dir-rtl text-center font-arabic' : ''}
        [&_p]:mb-2.5 [&_p:last-child]:mb-0
        [&_strong]:font-black [&_strong]:text-slate-900
        [&_b]:font-black [&_b]:text-slate-900
        [&_em]:italic [&_em]:text-slate-700
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2.5 [&_ul]:space-y-1.5
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2.5 [&_ol]:space-y-1.5
        [&_li]:text-slate-800 [&_li]:leading-relaxed
        [&_table]:w-full [&_table]:border-collapse [&_table]:my-3.5 [&_table]:text-xs [&_table]:sm:text-sm [&_table]:bg-white [&_table]:rounded-xl [&_table]:overflow-hidden [&_table]:shadow-2xs [&_table]:border [&_table]:border-slate-300
        [&_thead]:bg-gradient-to-r [&_thead]:from-slate-100 [&_thead]:to-slate-50
        [&_th]:border [&_th]:border-slate-300 [&_th]:p-3 [&_th]:font-bold [&_th]:text-slate-900 [&_th]:text-center [&_th]:tracking-wide
        [&_td]:border [&_td]:border-slate-300 [&_td]:p-2.5 [&_td]:sm:p-3 [&_td]:text-slate-800 [&_td]:align-middle [&_td]:text-center
        [&_tr:nth-child(even)]:bg-slate-50/70
        [&_tr:hover]:bg-purple-50/30
        [&_code]:bg-purple-50 [&_code]:text-purple-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:font-mono [&_code]:font-semibold [&_code]:text-xs [&_code]:border [&_code]:border-purple-200
        [&_blockquote]:border-l-4 [&_blockquote]:border-indigo-600 [&_blockquote]:bg-indigo-50/50 [&_blockquote]:p-3 [&_blockquote]:rounded-r-xl [&_blockquote]:italic [&_blockquote]:text-slate-800 [&_blockquote]:my-3
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default RichExerciseContent;

