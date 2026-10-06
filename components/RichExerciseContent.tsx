import React from 'react';
import { stripHtmlTags } from '../services/educationalDiagramService';

interface RichExerciseContentProps {
  content: string;
  className?: string;
  allowHtml?: boolean;
}

/**
 * Formate le texte en ligne pour afficher le gras markdown **texte** sans astérisques bruts
 */
function renderInlineFormattedText(text: string): React.ReactNode {
  if (!text) return null;
  // Découpe selon **gras**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-bold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/**
 * Rendu soigné et professionnel du contenu d'une question ou d'une sous-question :
 * - Garantit qu'aucun symbole ou balise HTML brute (comme <p class="mb-2"><strong>)
 *   ne fuite sous forme de texte brut à l'écran ou à l'impression.
 * - Formate le texte en paragraphes clairs, aérés et agréables à lire.
 */
export const RichExerciseContent: React.FC<RichExerciseContentProps> = ({
  content,
  className = '',
  allowHtml = false,
}) => {
  if (!content) return null;

  // Si du HTML valide et sécurisé est expressément requis
  if (allowHtml && /<[a-z][\s\S]*>/i.test(content) && !content.includes('&lt;')) {
    return (
      <div
        className={`rich-exercise-html text-slate-800 leading-relaxed font-normal text-sm sm:text-base space-y-2 [&_p]:mb-2.5 [&_strong]:font-black [&_strong]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_th]:bg-slate-100 [&_th]:font-bold [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_code]:bg-slate-100 [&_code]:text-purple-700 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:font-semibold [&_blockquote]:border-l-4 [&_blockquote]:border-purple-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-700 ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // Nettoyage rigoureux de toute balise HTML pour bannir les symboles comme <p class="mb-2"><strong>
  const clean = stripHtmlTags(content);
  const paragraphs = clean.split(/\n\s*\n/).filter(Boolean);

  if (paragraphs.length > 1) {
    return (
      <div className={`text-slate-800 leading-relaxed text-sm sm:text-base space-y-2.5 font-normal ${className}`}>
        {paragraphs.map((para, idx) => (
          <p key={idx} className="whitespace-pre-wrap leading-relaxed">
            {renderInlineFormattedText(para)}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className={`text-slate-800 whitespace-pre-wrap leading-relaxed text-sm sm:text-base font-normal ${className}`}>
      {renderInlineFormattedText(clean)}
    </div>
  );
};

export default RichExerciseContent;

