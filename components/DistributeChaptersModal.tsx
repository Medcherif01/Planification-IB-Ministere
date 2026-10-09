import React, { useState } from 'react';
import {
  X, Sparkles, BookOpen, Layers, CheckCircle2, AlertCircle, Loader2, ArrowRight
} from 'lucide-react';
import { UnitPlan } from '../types';
import { distributeChaptersIntoExistingUnits } from '../services/geminiService';
import { SUBJECTS, PEI_GRADES } from '../constants';

interface DistributeChaptersModalProps {
  isOpen: boolean;
  onClose: () => void;
  units: UnitPlan[];
  currentSubject?: string;
  currentGrade?: string;
  onUpdateUnit: (updatedPlan: UnitPlan) => void;
}

export const DistributeChaptersModal: React.FC<DistributeChaptersModalProps> = ({
  isOpen,
  onClose,
  units,
  currentSubject,
  currentGrade,
  onUpdateUnit,
}) => {
  const [subject, setSubject] = useState<string>(currentSubject || SUBJECTS[0]);
  const [grade, setGrade] = useState<string>(currentGrade || 'PEI 1');
  const [allChaptersText, setAllChaptersText] = useState<string>('');
  const [isDistributing, setIsDistributing] = useState<boolean>(false);
  const [previewAssignments, setPreviewAssignments] = useState<{
    unitId: string;
    unitTitle: string;
    chapters: string;
    lessons?: string[];
  }[] | null>(null);

  if (!isOpen) return null;

  // Filtrer les unités existantes correspondant à cette matière et cette classe
  const targetUnits = units.filter(u =>
    (!subject || u.subject === subject) &&
    (!grade || u.gradeLevel === grade)
  );

  const handleRunDistribution = async () => {
    if (!allChaptersText.trim()) {
      alert("Veuillez saisir ou coller la liste de tous vos chapitres et leçons.");
      return;
    }
    if (targetUnits.length === 0) {
      alert(`Aucune unité existante trouvée pour ${subject} - ${grade}. Veuillez d'abord vous assurer que les unités de cette matière existent.`);
      return;
    }

    setIsDistributing(true);
    try {
      const assignments = await distributeChaptersIntoExistingUnits(
        allChaptersText,
        targetUnits,
        subject,
        grade
      );
      setPreviewAssignments(assignments);
    } catch (err: any) {
      console.error("Erreur distribution chapitres :", err);
      alert(`❌ Erreur : ${err?.message || err}`);
    } finally {
      setIsDistributing(false);
    }
  };

  const handleApplyDistribution = () => {
    if (!previewAssignments || previewAssignments.length === 0) return;

    let updatedCount = 0;
    previewAssignments.forEach(assign => {
      const existing = targetUnits.find(u => u.id === assign.unitId);
      if (existing) {
        // Met à jour UNIQUEMENT les chapitres et les leçons, sans toucher aux autres champs pédagogiques
        const updated: UnitPlan = {
          ...existing,
          chapters: assign.chapters,
          lessons: assign.lessons && assign.lessons.length > 0 ? assign.lessons : existing.lessons,
        };
        onUpdateUnit(updated);
        updatedCount++;
      }
    });

    alert(`✅ Succès ! ${updatedCount} unité(s) ont été mises à jour avec leurs chapitres et leçons assignés, sans modifier les titres, concepts, énoncés ou évaluations existantes.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden my-auto border border-slate-200">
        
        {/* Header */}
        <header className="bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-800 text-white p-5 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner">
              📚
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                Mettre à jour les Chapitres & Leçons
              </h3>
              <p className="text-blue-100 text-xs">
                Ajoutez tous vos chapitres et leçons : l'IA les place intelligemment dans les unités existantes sans altérer leur contenu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition"
          >
            <X size={20} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Sélection Matière & Classe */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Matière</label>
              <select
                value={subject}
                onChange={e => {
                  setSubject(e.target.value);
                  setPreviewAssignments(null);
                }}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Classe / Niveau PEI</label>
              <select
                value={grade}
                onChange={e => {
                  setGrade(e.target.value);
                  setPreviewAssignments(null);
                }}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PEI_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          {/* Statut des unités existantes */}
          <div className={`p-3 rounded-2xl text-xs flex items-center justify-between border ${
            targetUnits.length > 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className="flex items-center gap-2">
              <Layers size={16} className={targetUnits.length > 0 ? 'text-emerald-600' : 'text-amber-600'} />
              <span>
                <strong>{targetUnits.length} unité(s) existante(s)</strong> détectée(s) pour {subject} ({grade}).
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              Les unités et leur contenu restent 100% préservés
            </span>
          </div>

          {/* Saisie des chapitres et leçons */}
          {!previewAssignments && (
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <BookOpen size={14} className="text-blue-600" />
                Collez ou saisissez tous les chapitres et leçons de la matière :
              </label>
              <p className="text-[11px] text-slate-500">
                Vous pouvez copier l'ensemble de votre programme annuel ou la table des matières avec chapitres et leçons. L'IA analysera chaque élément et le distribuera dans l'unité correspondante.
              </p>
              <textarea
                value={allChaptersText}
                onChange={e => setAllChaptersText(e.target.value)}
                placeholder={`Exemple :\nChapitre 1 : Nombres entiers et rationnels\n- Leçon 1 : Opérations et priorités\n- Leçon 2 : Fractions et simplifications\nChapitre 2 : Équations et inéquations du premier degré\n- Leçon 1 : Résolution d'équations\n- Leçon 2 : Problèmes concrets\nChapitre 3 : Géométrie dans le plan et théorème de Pythagore\n- Leçon 1 : Propriétés des triangles rectangles\n- Leçon 2 : Applications pratiques`}
                rows={10}
                className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-2xl text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
              />
            </div>
          )}

          {/* Aperçu de la distribution avant application */}
          {previewAssignments && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-slate-800 uppercase flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Répartition intelligente proposée ({previewAssignments.length} unités) :
                </h4>
                <button
                  type="button"
                  onClick={() => setPreviewAssignments(null)}
                  className="text-xs text-blue-600 hover:underline font-bold"
                >
                  ← Modifier le texte
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {previewAssignments.map((assign, idx) => (
                  <div key={assign.unitId} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-indigo-950">
                        {assign.unitTitle}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        Unité {idx + 1}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed max-h-28 overflow-y-auto">
                      {assign.chapters}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bannière de réassurance IB */}
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs text-blue-900 leading-relaxed flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Garantie de non-altération du contenu :</strong> Les titres des unités, concepts clés, contextes mondiaux, énoncés de recherche, critères d'évaluation et compétences ATL restent rigoureusement intacts. Seuls les champs <em>Chapitres</em> et <em>Leçons</em> sont mis à jour et ordonnés.
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition border border-slate-300"
          >
            Annuler
          </button>
          {!previewAssignments ? (
            <button
              onClick={handleRunDistribution}
              disabled={isDistributing || !allChaptersText.trim() || targetUnits.length === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isDistributing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Distribution intelligente en cours...
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Générer et Placer dans les Unités
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleApplyDistribution}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              Valider et Mettre à jour les Unités
            </button>
          )}
        </footer>

      </div>
    </div>
  );
};

export default DistributeChaptersModal;
