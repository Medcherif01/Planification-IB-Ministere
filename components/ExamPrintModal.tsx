import React, { useState, useRef, useEffect } from 'react';
import { X, Printer, Download, FileText, CheckCircle2 } from 'lucide-react';
import { Exam } from '../types';
import { generateExamHtml, downloadExamHtml } from '../services/examHtmlExportService';

interface ExamPrintModalProps {
  exam: Exam;
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'exam' | 'correction';
}

const ExamPrintModal: React.FC<ExamPrintModalProps> = ({
  exam,
  isOpen,
  onClose,
  defaultMode = 'exam'
}) => {
  const [mode, setMode] = useState<'exam' | 'correction'>(defaultMode);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    if (!isOpen || !iframeRef.current) return;
    const html = generateExamHtml(exam, mode === 'correction');
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  }, [exam, mode, isOpen]);

  if (!isOpen) return null;

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownloadHtml = () => {
    downloadExamHtml(exam, mode === 'correction');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 md:p-6 overflow-hidden">
      <div className="bg-slate-900 text-white rounded-2xl w-full max-w-5xl h-[95vh] flex flex-col shadow-2xl border border-slate-700 overflow-hidden">
        
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-600 rounded-lg text-white">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Aperçu A4 Imprimable — {exam.subject} ({exam.className || exam.grade})
              </h2>
              <p className="text-xs text-slate-400">
                Design conforme au modèle Word officiel Al Kawthar (Format A4)
              </p>
            </div>
          </div>

          {/* Toggle Sujet / Corrigé */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700 text-sm">
            <button
              onClick={() => setMode('exam')}
              className={`px-4 py-1.5 rounded-lg font-medium transition ${
                mode === 'exam'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sujet de l'examen
            </button>
            <button
              onClick={() => setMode('correction')}
              className={`px-4 py-1.5 rounded-lg font-medium transition ${
                mode === 'correction'
                  ? 'bg-red-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Corrigé & Barème
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm shadow transition"
              title="Ouvrir la boîte d'impression du navigateur (Imprimer en A4 ou Enregistrer en PDF)"
            >
              <Printer size={16} />
              Imprimer / PDF (A4)
            </button>
            <button
              onClick={handleDownloadHtml}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm shadow transition"
              title="Télécharger le fichier .html autonome"
            >
              <Download size={16} />
              Télécharger HTML
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Preview Area (iFrame with A4 Document) */}
        <div className="flex-1 bg-slate-200 p-4 md:p-6 overflow-auto flex justify-center">
          <iframe
            ref={iframeRef}
            title="Aperçu A4 de l'examen"
            className="w-full max-w-[220mm] h-full min-h-[700px] bg-white rounded-lg shadow-xl border border-slate-300"
          />
        </div>

        {/* Bottom Status Bar */}
        <div className="px-6 py-2.5 bg-slate-800 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span>Format A4 (210 × 297 mm) avec marges standard et en-tête officiel Al Kawthar</span>
          </div>
          <span>Total : {exam.totalPoints || 30} points • {exam.questions?.length || 0} questions</span>
        </div>

      </div>
    </div>
  );
};

export default ExamPrintModal;
