import React, { useState, useEffect } from 'react';
import { X, Calculator, Clock, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface HoursCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  grade: string;
  /** Total duration (in hours) already planned across all units — pass 0 if not calculated */
  plannedHours: number;
}

const MIN_HOURS = 50;

const HoursCalculatorModal: React.FC<HoursCalculatorModalProps> = ({
  isOpen, onClose, subject, grade, plannedHours,
}) => {
  const [frequence, setFrequence] = useState<number>(3);   // sessions / week
  const [nbSemaines, setNbSemaines] = useState<number>(30); // weeks per year
  const [dureeSeance, setDureeSeance] = useState<number>(55); // minutes per session

  const totalMinutes = frequence * nbSemaines * dureeSeance;
  const totalHeures = totalMinutes / 60;
  const isEnough = totalHeures >= MIN_HOURS;
  const diff = Math.abs(totalHeures - MIN_HOURS);

  // Planned vs calculated comparison
  const plannedOk = plannedHours > 0 && Math.abs(plannedHours - totalHeures) <= 5;
  const plannedOver = plannedHours > totalHeures + 5;
  const plannedUnder = plannedHours > 0 && plannedHours < totalHeures - 5;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Calculator size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-extrabold text-base">Calculateur d'heures</h2>
              <p className="text-teal-200 text-xs">{subject} — {grade}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition p-1">
            <X size={20} />
          </button>
        </div>

        {/* Info banner */}
        <div className="bg-teal-50 border-b border-teal-100 px-5 py-2.5 flex items-center gap-2 text-xs text-teal-700">
          <Info size={13} className="flex-shrink-0 text-teal-500" />
          <span>Le programme IB PEI exige <strong>minimum 50 heures</strong> d'enseignement par matière et par an.</span>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">

          {/* Inputs grid */}
          <div className="space-y-4">
            {/* Fréquence */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Fréquence hebdomadaire (séances / semaine)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1} max={7} step={0.5}
                  value={frequence}
                  onChange={e => setFrequence(Number(e.target.value))}
                  className="flex-1 accent-teal-600"
                />
                <span className="w-16 text-center font-black text-teal-700 text-lg bg-teal-50 border border-teal-200 rounded-xl py-1">
                  {frequence}
                </span>
              </div>
            </div>

            {/* Nombre de semaines */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Nombre de semaines de cours par an
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={20} max={40} step={1}
                  value={nbSemaines}
                  onChange={e => setNbSemaines(Number(e.target.value))}
                  className="flex-1 accent-teal-600"
                />
                <span className="w-16 text-center font-black text-teal-700 text-lg bg-teal-50 border border-teal-200 rounded-xl py-1">
                  {nbSemaines}
                </span>
              </div>
            </div>

            {/* Durée de séance */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Durée d'une séance (minutes)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={30} max={120} step={5}
                  value={dureeSeance}
                  onChange={e => setDureeSeance(Number(e.target.value))}
                  className="flex-1 accent-teal-600"
                />
                <span className="w-16 text-center font-black text-teal-700 text-lg bg-teal-50 border border-teal-200 rounded-xl py-1">
                  {dureeSeance}
                </span>
              </div>
            </div>
          </div>

          {/* Formula display */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 text-center">
            <span className="font-mono">
              {frequence} séances × {nbSemaines} semaines × {dureeSeance} min = {totalMinutes} min
            </span>
          </div>

          {/* Result card */}
          <div className={`rounded-2xl p-5 border-2 text-center transition-all ${
            isEnough
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-red-50 border-red-300'
          }`}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Clock size={20} className={isEnough ? 'text-emerald-600' : 'text-red-500'} />
              <span className={`text-4xl font-black ${isEnough ? 'text-emerald-700' : 'text-red-600'}`}>
                {totalHeures.toFixed(1)}h
              </span>
            </div>
            <p className={`text-sm font-semibold ${isEnough ? 'text-emerald-700' : 'text-red-600'}`}>
              {isEnough ? '✅ Conforme aux exigences IB' : '⚠️ Insuffisant pour le programme IB'}
            </p>
            {!isEnough && (
              <p className="text-xs text-red-500 mt-1">
                Il manque encore <strong>{diff.toFixed(1)}h</strong> pour atteindre les 50h requises.
              </p>
            )}
            {isEnough && (
              <p className="text-xs text-emerald-600 mt-1">
                Excédent de <strong>{diff.toFixed(1)}h</strong> au-dessus du minimum.
              </p>
            )}
          </div>

          {/* Planned hours comparison */}
          {plannedHours > 0 && (
            <div className={`rounded-xl p-4 border text-sm flex items-start gap-3 ${
              plannedOk ? 'bg-green-50 border-green-200 text-green-700'
              : plannedOver ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-orange-50 border-orange-200 text-orange-700'
            }`}>
              {plannedOk
                ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-green-500" />
                : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />}
              <div>
                <p className="font-semibold">
                  Heures planifiées dans les unités : <strong>{plannedHours.toFixed(1)}h</strong>
                </p>
                {plannedOk && <p className="text-xs mt-0.5">Les unités planifiées correspondent bien au volume horaire calculé.</p>}
                {plannedOver && (
                  <p className="text-xs mt-0.5">
                    Les unités planifiées dépassent le volume calculé de <strong>{(plannedHours - totalHeures).toFixed(1)}h</strong>.
                    Vérifiez les durées des unités ou augmentez le volume horaire.
                  </p>
                )}
                {plannedUnder && (
                  <p className="text-xs mt-0.5">
                    Les unités planifiées sont inférieures de <strong>{(totalHeures - plannedHours).toFixed(1)}h</strong> au volume calculé.
                    Ajoutez des unités ou allongez les durées existantes.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Quick presets */}
          <div>
            <p className="text-xs text-slate-500 font-semibold mb-2">⚡ Configurations courantes :</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '2×55min / 30 sem.', f: 2, s: 30, d: 55 },
                { label: '3×55min / 30 sem.', f: 3, s: 30, d: 55 },
                { label: '4×55min / 28 sem.', f: 4, s: 28, d: 55 },
                { label: '2×90min / 32 sem.', f: 2, s: 32, d: 90 },
              ].map(p => (
                <button
                  key={p.label}
                  onClick={() => { setFrequence(p.f); setNbSemaines(p.s); setDureeSeance(p.d); }}
                  className="px-3 py-1.5 text-xs border border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg font-medium transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default HoursCalculatorModal;
