import React from 'react';
import { formatProfessionalHtml } from '../services/evaluationAiOptimizerService';

interface RichExerciseContentProps {
  content: string;
  className?: string;
  allowHtml?: boolean;
}

/**
 * Rendu soigné et professionnel du contenu d'une question ou d'une sous-question :
 * - Interprète et sublime le balisage HTML propre (<p>, <strong>, <ul>, <table>...)
 * - Empêche strictement l'affichage de balises brutes sous forme de texte brut.
 * - Formate les énoncés en typographie fluide, moderne et élégante.
 */
export const RichExerciseContent: React.FC<RichExerciseContentProps> = ({
  content,
  className = '',
  allowHtml = true,
}) => {
  if (!content) return null;

  const html = formatProfessionalHtml(content);

  return (
    <div
      className={`rich-exercise-html leading-relaxed text-slate-800 text-sm sm:text-base space-y-2.5 font-normal
        [&_p]:mb-2.5 [&_p:last-child]:mb-0
        [&_strong]:font-black [&_strong]:text-slate-900
        [&_b]:font-black [&_b]:text-slate-900
        [&_em]:italic [&_em]:text-slate-700
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2.5 [&_ul]:space-y-1
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2.5 [&_ol]:space-y-1
        [&_li]:text-slate-800 [&_li]:leading-relaxed
        [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_table]:text-xs [&_table]:sm:text-sm [&_table]:bg-white [&_table]:rounded-xl [&_table]:overflow-hidden [&_table]:shadow-2xs
        [&_th]:border [&_th]:border-slate-300 [&_th]:p-2.5 [&_th]:bg-slate-100 [&_th]:font-bold [&_th]:text-slate-900 [&_th]:text-left
        [&_td]:border [&_td]:border-slate-300 [&_td]:p-2.5 [&_td]:text-slate-800
        [&_code]:bg-purple-50 [&_code]:text-purple-700 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:font-semibold [&_code]:text-xs
        [&_blockquote]:border-l-4 [&_blockquote]:border-purple-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-700 [&_blockquote]:my-2
        ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default RichExerciseContent;

