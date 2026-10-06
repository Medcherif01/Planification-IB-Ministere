import React from 'react';

interface RichExerciseContentProps {
  content: string;
  className?: string;
}

/**
 * Rendu soigné et professionnel du contenu d'une question ou d'une sous-question :
 * - Si le texte contient du balisage HTML (<p>, <strong>, <ul>, <table>, etc.),
 *   il est rendu fidèlement avec styles adaptés aux examens.
 * - Si le texte est brut, il est formaté en paragraphes clairs et aérés.
 */
export const RichExerciseContent: React.FC<RichExerciseContentProps> = ({ content, className = '' }) => {
  if (!content) return null;

  const hasHtml = /<[a-z][\s\S]*>/i.test(content);

  if (hasHtml) {
    return (
      <div
        className={`rich-exercise-html text-slate-800 leading-relaxed font-normal text-sm sm:text-base space-y-2 [&_p]:mb-2.5 [&_strong]:font-black [&_strong]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_th]:bg-slate-100 [&_th]:font-bold [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_code]:bg-slate-100 [&_code]:text-purple-700 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:font-semibold [&_blockquote]:border-l-4 [&_blockquote]:border-purple-500 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-slate-700 ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // Formatage propre du texte brut avec détection des paragraphes
  const paragraphs = content.split(/\n\s*\n/).filter(Boolean);

  if (paragraphs.length > 1) {
    return (
      <div className={`text-slate-800 leading-relaxed text-sm sm:text-base space-y-2 font-normal ${className}`}>
        {paragraphs.map((para, idx) => (
          <p key={idx} className="whitespace-pre-wrap leading-relaxed">
            {para}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className={`text-slate-800 whitespace-pre-wrap leading-relaxed text-sm sm:text-base font-normal ${className}`}>
      {content}
    </div>
  );
};

export default RichExerciseContent;
