import React, { useState } from 'react';
import { Calculator, X, Delete, Check, Copy, CornerDownLeft, Sparkles, Keyboard } from 'lucide-react';

// ─── Groupes de symboles mathématiques, parenthèses, accolades, crochets ─────
export interface MathSymbolItem {
  label: string;
  val: string;
  cursorOffset?: number; // Décalage du curseur depuis la fin de 'val' (ex: -1 pour placer entre '(' et ')')
  title: string;
  group: 'brackets' | 'algebra' | 'relations' | 'geometry';
}

export const ORGANIZED_MATH_SYMBOLS: MathSymbolItem[] = [
  // 1. Parenthèses, Accolades, Crochets & Délimiteurs
  { label: '( )', val: '()', cursorOffset: -1, title: 'Parenthèses ( )', group: 'brackets' },
  { label: '(', val: '(', title: 'Parenthèse ouvrante (', group: 'brackets' },
  { label: ')', val: ')', title: 'Parenthèse fermante )', group: 'brackets' },
  { label: '{ }', val: '{}', cursorOffset: -1, title: 'Accolades { }', group: 'brackets' },
  { label: '{', val: '{', title: 'Accolade ouvrante {', group: 'brackets' },
  { label: '}', val: '}', title: 'Accolade fermante }', group: 'brackets' },
  { label: '[ ]', val: '[]', cursorOffset: -1, title: 'Crochets [ ]', group: 'brackets' },
  { label: '[', val: '[', title: 'Crochet ouvrant [', group: 'brackets' },
  { label: ']', val: ']', title: 'Crochet fermant ]', group: 'brackets' },
  { label: '|x|', val: '||', cursorOffset: -1, title: 'Valeur absolue | |', group: 'brackets' },
  { label: '⟨ ⟩', val: '⟨⟩', cursorOffset: -1, title: 'Chevrons ⟨ ⟩', group: 'brackets' },

  // 2. Exposants, Racines & Fractions
  { label: 'x²', val: '²', title: 'Au carré (²)', group: 'algebra' },
  { label: 'x³', val: '³', title: 'Au cube (³)', group: 'algebra' },
  { label: 'xⁿ', val: '^()', cursorOffset: -1, title: 'Puissance ^(n)', group: 'algebra' },
  { label: '√( )', val: '√()', cursorOffset: -1, title: 'Racine carrée √( )', group: 'algebra' },
  { label: '∛( )', val: '∛()', cursorOffset: -1, title: 'Racine cubique ∛( )', group: 'algebra' },
  { label: 'a/b', val: '()/()', cursorOffset: -4, title: 'Fraction (a)/(b)', group: 'algebra' },
  { label: '10ⁿ', val: '10^()', cursorOffset: -1, title: 'Puissance de 10', group: 'algebra' },
  { label: 'x₁', val: '₁', title: 'Indice 1 (₁)', group: 'algebra' },
  { label: 'x₂', val: '₂', title: 'Indice 2 (₂)', group: 'algebra' },

  // 3. Opérations & Comparaisons
  { label: '×', val: ' × ', title: 'Multiplication ×', group: 'relations' },
  { label: '÷', val: ' ÷ ', title: 'Division ÷', group: 'relations' },
  { label: '±', val: ' ± ', title: 'Plus ou moins ±', group: 'relations' },
  { label: '≈', val: ' ≈ ', title: 'Environ égal ≈', group: 'relations' },
  { label: '≠', val: ' ≠ ', title: 'Différent de ≠', group: 'relations' },
  { label: '≤', val: ' ≤ ', title: 'Inférieur ou égal ≤', group: 'relations' },
  { label: '≥', val: ' ≥ ', title: 'Supérieur ou égal ≥', group: 'relations' },
  { label: '⇒', val: ' ⇒ ', title: 'Implique ⇒', group: 'relations' },
  { label: '⇔', val: ' ⇔ ', title: 'Équivalent à ⇔', group: 'relations' },

  // 4. Géométrie & Ensembles
  { label: 'π', val: 'π', title: 'Nombre Pi (π)', group: 'geometry' },
  { label: '°', val: '°', title: 'Degré (°)', group: 'geometry' },
  { label: '∠', val: '∠', title: 'Angle ∠', group: 'geometry' },
  { label: '△', val: '△', title: 'Triangle △', group: 'geometry' },
  { label: '⊥', val: ' ⊥ ', title: 'Perpendiculaire ⊥', group: 'geometry' },
  { label: '∥', val: ' ∥ ', title: 'Parallèle ∥', group: 'geometry' },
  { label: '[AB]', val: '[AB]', title: 'Segment [AB]', group: 'geometry' },
  { label: '(AB)', val: '(AB)', title: 'Droite (AB)', group: 'geometry' },
  { label: '[AB)', val: '[AB)', title: 'Demi-droite [AB)', group: 'geometry' },
  { label: '∈', val: ' ∈ ', title: 'Appartient à ∈', group: 'geometry' },
  { label: '∉', val: ' ∉ ', title: 'N\'appartient pas à ∉', group: 'geometry' },
  { label: '∪', val: ' ∪ ', title: 'Réunion ∪', group: 'geometry' },
  { label: '∩', val: ' ∩ ', title: 'Intersection ∩', group: 'geometry' },
  { label: '∅', val: '∅', title: 'Ensemble vide ∅', group: 'geometry' },
  { label: 'ℝ', val: 'ℝ', title: 'Ensemble des réels ℝ', group: 'geometry' },
  { label: '∞', val: '∞', title: 'Infini ∞', group: 'geometry' },
  { label: 'Δ', val: 'Δ', title: 'Delta / Discriminant Δ', group: 'geometry' },
];

// ─── Évaluateur sécurisé d'expressions mathématiques ─────────────────────────
function evaluateMathExpression(rawExpr: string): { result: string; error?: string } {
  try {
    if (!rawExpr.trim()) return { result: '' };

    // Remplacer les accolades {} et crochets [] par des parenthèses () pour le calcul
    let expr = rawExpr
      .replace(/\{/g, '(')
      .replace(/\}/g, ')')
      .replace(/\[/g, '(')
      .replace(/\]/g, ')')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/,/g, '.')
      .replace(/π/g, '(Math.PI)')
      .replace(/²/g, '**2')
      .replace(/³/g, '**3')
      .replace(/\^/g, '**')
      .replace(/√\(([^)]+)\)/g, 'Math.sqrt($1)')
      .replace(/√([0-9.]+)/g, 'Math.sqrt($1)')
      .replace(/∛\(([^)]+)\)/g, 'Math.cbrt($1)')
      .replace(/∛([0-9.]+)/g, 'Math.cbrt($1)')
      .replace(/sin\(/g, 'Math.sin((Math.PI/180)*')
      .replace(/cos\(/g, 'Math.cos((Math.PI/180)*')
      .replace(/tan\(/g, 'Math.tan((Math.PI/180)*')
      .replace(/log\(/g, 'Math.log10(')
      .replace(/ln\(/g, 'Math.log(')
      .replace(/%/g, '/100');

    // Équilibrer les parenthèses ouvrantes non fermées en fin d'expression
    const openCount = (expr.match(/\(/g) || []).length;
    const closeCount = (expr.match(/\)/g) || []).length;
    if (openCount > closeCount) {
      expr += ')'.repeat(openCount - closeCount);
    }

    // Vérifier qu'il n'y a pas d'injection de code
    const sanitizedCheck = expr.replace(
      /Math\.(PI|sqrt|cbrt|sin|cos|tan|log10|log|abs|pow)|[0-9+\-*/().\s]/g,
      ''
    );
    if (sanitizedCheck.length > 0) {
      return { result: '', error: 'Expression incomplète' };
    }

    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${expr});`)();
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      return { result: '', error: 'Calcul impossible (ex: division par 0)' };
    }

    // Arrondir proprement pour éviter 0.30000000000000004
    const rounded = Math.round(val * 1e10) / 1e10;
    return { result: String(rounded) };
  } catch {
    return { result: '', error: 'Vérifiez les parenthèses ou la syntaxe' };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. COMPOSANT : CALCULATRICE SCIENTIFIQUE & STANDARD INTERACTIVE
// ═════════════════════════════════════════════════════════════════════════════

interface ScientificCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertText?: (textToInsert: string) => void;
  activeTargetLabel?: string;
}

export const ScientificCalculatorModal: React.FC<ScientificCalculatorModalProps> = ({
  isOpen,
  onClose,
  onInsertText,
  activeTargetLabel,
}) => {
  const [expression, setExpression] = useState('');
  const [history, setHistory] = useState<{ expr: string; res: string }[]>([]);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  if (!isOpen) return null;

  const liveEval = evaluateMathExpression(expression);

  const handleAppend = (token: string) => {
    setExpression(prev => prev + token);
  };

  const handleClear = () => {
    setExpression('');
  };

  const handleBackspace = () => {
    setExpression(prev => prev.slice(0, -1));
  };

  const handleCalculateEqual = () => {
    if (!expression.trim()) return;
    const { result } = evaluateMathExpression(expression);
    if (result !== '') {
      setHistory(prev => [{ expr: expression, res: result }, ...prev.slice(0, 7)]);
      setExpression(result);
    }
  };

  const handleCopyResult = () => {
    const valToCopy = liveEval.result || expression;
    if (!valToCopy) return;
    navigator.clipboard.writeText(valToCopy);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-[95] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-slate-900 text-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-purple-500/30">
        {/* Header Calculatrice */}
        <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-slate-900 px-5 py-3.5 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/30 border border-purple-400/40 flex items-center justify-center text-purple-200">
              <Calculator size={18} />
            </div>
            <div>
              <h3 className="font-black text-sm text-white tracking-wide">
                Calculatrice Scientifique PEI
              </h3>
              <p className="text-[10px] text-purple-300">
                Parenthèses ( ), Accolades &#123; &#125;, Crochets [ ], Racines & Trigonométrie
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition"
            title="Fermer la calculatrice"
          >
            <X size={18} />
          </button>
        </div>

        {/* Écran d'affichage */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 space-y-2">
          <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 min-h-[82px] flex flex-col justify-between">
            <input
              type="text"
              value={expression}
              onChange={e => setExpression(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCalculateEqual();
                }
              }}
              placeholder="Saisissez votre calcul : ex. {(12 + 8) × [5 - 2]} ÷ 4"
              className="w-full bg-transparent text-right font-mono text-base sm:text-lg font-bold text-purple-200 focus:outline-none placeholder:text-slate-600 placeholder:text-xs"
            />
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Résultat :
              </span>
              <span className="font-mono text-xl font-black text-emerald-400">
                {liveEval.result ? `= ${liveEval.result}` : expression ? '...' : '0'}
              </span>
            </div>
          </div>

          {/* Boutons rapides d'insertion dans la copie de l'élève */}
          <div className="flex items-center gap-2 flex-wrap">
            {onInsertText && (
              <>
                <button
                  type="button"
                  disabled={!liveEval.result && !expression}
                  onClick={() => {
                    const toInsert = liveEval.result || expression;
                    if (toInsert) {
                      onInsertText(toInsert);
                      onClose();
                    }
                  }}
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow transition"
                >
                  <CornerDownLeft size={13} />
                  <span>Insérer le résultat{activeTargetLabel ? ` (${activeTargetLabel})` : ''}</span>
                </button>
                <button
                  type="button"
                  disabled={!expression}
                  onClick={() => {
                    const full = liveEval.result && liveEval.result !== expression
                      ? `${expression} = ${liveEval.result}`
                      : expression;
                    if (full) {
                      onInsertText(full);
                      onClose();
                    }
                  }}
                  className="py-2 px-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow transition"
                  title="Insérer l'expression complète et son résultat dans la réponse"
                >
                  <span>Insérer calcul complet</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleCopyResult}
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs flex items-center gap-1 transition"
            >
              {copiedFeedback ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copiedFeedback ? 'Copié' : 'Copier'}</span>
            </button>
          </div>
        </div>

        {/* Clavier de la calculatrice */}
        <div className="p-4 space-y-2.5 bg-slate-900">
          {/* Ligne spéciale : Parenthèses (), Accolades {}, Crochets [] */}
          <div className="grid grid-cols-6 gap-1.5">
            {[
              { lbl: '(', val: '(' },
              { lbl: ')', val: ')' },
              { lbl: '{', val: '{' },
              { lbl: '}', val: '}' },
              { lbl: '[', val: '[' },
              { lbl: ']', val: ']' },
            ].map(b => (
              <button
                key={b.lbl}
                type="button"
                onClick={() => handleAppend(b.val)}
                className="py-2 bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 rounded-xl font-mono font-black text-sm transition shadow-2xs"
              >
                {b.lbl}
              </button>
            ))}
          </div>

          {/* Fonctions scientifiques */}
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { lbl: 'x²', val: '²' },
              { lbl: 'x³', val: '³' },
              { lbl: 'xⁿ', val: '^(' },
              { lbl: '√x', val: '√(' },
              { lbl: 'π', val: 'π' },
              { lbl: 'sin', val: 'sin(' },
              { lbl: 'cos', val: 'cos(' },
              { lbl: 'tan', val: 'tan(' },
              { lbl: 'log', val: 'log(' },
              { lbl: '%', val: '%' },
            ].map(b => (
              <button
                key={b.lbl}
                type="button"
                onClick={() => handleAppend(b.val)}
                className="py-2 bg-slate-800 hover:bg-slate-700 text-purple-200 border border-slate-700 rounded-xl font-bold text-xs transition"
              >
                {b.lbl}
              </button>
            ))}
          </div>

          {/* Pavé numérique et opérations */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            <button
              type="button"
              onClick={handleClear}
              className="py-2.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-xl font-black text-xs transition"
            >
              AC (Tout effacer)
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition"
            >
              <Delete size={15} /> Retour
            </button>
            <button
              type="button"
              onClick={() => handleAppend(' / ')}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl font-mono font-black text-xs transition"
            >
              a/b
            </button>
            <button
              type="button"
              onClick={() => handleAppend(' ÷ ')}
              className="py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black text-base transition"
            >
              ÷
            </button>

            {['7', '8', '9'].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => handleAppend(n)}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-base transition border border-slate-700/80"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleAppend(' × ')}
              className="py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black text-base transition"
            >
              ×
            </button>

            {['4', '5', '6'].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => handleAppend(n)}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-base transition border border-slate-700/80"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleAppend(' - ')}
              className="py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black text-base transition"
            >
              −
            </button>

            {['1', '2', '3'].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => handleAppend(n)}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-base transition border border-slate-700/80"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleAppend(' + ')}
              className="py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-black text-base transition"
            >
              +
            </button>

            <button
              type="button"
              onClick={() => handleAppend('0')}
              className="py-3 col-span-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-base transition border border-slate-700/80"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleAppend('.')}
              className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-base transition border border-slate-700/80"
            >
              .
            </button>
            <button
              type="button"
              onClick={handleCalculateEqual}
              className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-base transition shadow-lg"
            >
              =
            </button>
          </div>

          {/* Historique des calculs récents */}
          {history.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Historique récent (cliquez pour réutiliser) :
              </span>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {history.map((h, i) => (
                  <div
                    key={i}
                    onClick={() => setExpression(`${h.expr}`)}
                    className="flex items-center justify-between px-2.5 py-1 bg-slate-800/70 hover:bg-slate-800 rounded-lg text-xs font-mono cursor-pointer transition"
                  >
                    <span className="text-slate-300 truncate">{h.expr}</span>
                    <span className="text-emerald-400 font-bold ml-2">= {h.res}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// 2. COMPOSANT : BARRE D'OUTILS PARENTHÈSES, ACCOLADES, CROCHETS & MATHS
// ═════════════════════════════════════════════════════════════════════════════

interface MathSymbolsAndBracketsToolbarProps {
  targetKey: string;
  onInsertSymbol: (targetKey: string, val: string, cursorOffset?: number) => void;
  onOpenCalculator?: () => void;
  onOpenDrawingStudio?: () => void;
  isArtSubject?: boolean;
  showCalculatorButton?: boolean;
  compact?: boolean;
  onOpenVirtualKeyboard?: () => void;
}

export const MathSymbolsAndBracketsToolbar: React.FC<MathSymbolsAndBracketsToolbarProps> = ({
  targetKey,
  onInsertSymbol,
  onOpenCalculator,
  onOpenDrawingStudio,
  isArtSubject = false,
  showCalculatorButton = true,
  compact = false,
  onOpenVirtualKeyboard,
}) => {
  const [activeGroup, setActiveGroup] = useState<'all' | 'brackets' | 'algebra' | 'relations' | 'geometry'>('all');

  const bracketsGroup = ORGANIZED_MATH_SYMBOLS.filter(s => s.group === 'brackets');
  const algebraGroup = ORGANIZED_MATH_SYMBOLS.filter(s => s.group === 'algebra');
  const relationsGroup = ORGANIZED_MATH_SYMBOLS.filter(s => s.group === 'relations');
  const geometryGroup = ORGANIZED_MATH_SYMBOLS.filter(s => s.group === 'geometry');

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 space-y-2 text-xs shadow-2xs">
      {/* Barre supérieure : Onglets de catégories + Calculatrice + Studio Géométrie/Art */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200/80 pb-2">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveGroup('all')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
              activeGroup === 'all'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-purple-50 border border-slate-200'
            }`}
          >
            Tous les outils
          </button>
          <button
            type="button"
            onClick={() => setActiveGroup('brackets')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
              activeGroup === 'brackets'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-white text-indigo-800 hover:bg-indigo-50 border border-indigo-200'
            }`}
          >
            ( ) &#123; &#125; [ ] Parenthèses & Accolades
          </button>
          <button
            type="button"
            onClick={() => setActiveGroup('algebra')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
              activeGroup === 'algebra'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-purple-50 border border-slate-200'
            }`}
          >
            x² √ Fractions
          </button>
          <button
            type="button"
            onClick={() => setActiveGroup('relations')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
              activeGroup === 'relations'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-purple-50 border border-slate-200'
            }`}
          >
            × ÷ ≤ ≥ ⇒
          </button>
          <button
            type="button"
            onClick={() => setActiveGroup('geometry')}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
              activeGroup === 'geometry'
                ? 'bg-purple-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-purple-50 border border-slate-200'
            }`}
          >
            📐 Géométrie & Ensembles
          </button>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {onOpenVirtualKeyboard && (
            <button
              type="button"
              onClick={onOpenVirtualKeyboard}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
              title="Ouvrir le clavier virtuel pour tablette (évite que le clavier système masque l'écran)"
            >
              <Keyboard size={14} />
              <span>Clavier</span>
            </button>
          )}

          {showCalculatorButton && onOpenCalculator && (
            <button
              type="button"
              onClick={onOpenCalculator}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
              title="Ouvrir la calculatrice scientifique et standard"
            >
              <Calculator size={14} />
              <span>Calculatrice</span>
            </button>
          )}

          {onOpenDrawingStudio && (
            <button
              type="button"
              onClick={onOpenDrawingStudio}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
              title="Ouvrir le studio de tracé (Équerre, Rapporteur, Compas ou Art)"
            >
              {isArtSubject ? (
                <span>🎨 Studio Dessin & Croquis</span>
              ) : (
                <span>📐 Tracer Figure (Équerre, Compas)</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Boutons de symboles selon le filtre actif */}
      <div className="space-y-1.5">
        {/* Toujours mettre en évidence les Parenthèses, Accolades et Crochets en premier */}
        {(activeGroup === 'all' || activeGroup === 'brackets') && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-black text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-md mr-1">
              Parenthèses / Accolades :
            </span>
            {bracketsGroup.map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => onInsertSymbol(targetKey, item.val, item.cursorOffset)}
                className="px-2.5 py-1 bg-indigo-50/90 hover:bg-indigo-600 text-indigo-950 hover:text-white border border-indigo-300 rounded-lg font-mono font-black text-xs transition shadow-2xs"
                title={item.title}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Algèbre, Opérations et Géométrie */}
        {activeGroup !== 'brackets' && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">
              Symboles :
            </span>
            {(activeGroup === 'all'
              ? [...algebraGroup, ...relationsGroup, ...(compact ? geometryGroup.slice(0, 7) : geometryGroup)]
              : activeGroup === 'algebra'
              ? algebraGroup
              : activeGroup === 'relations'
              ? relationsGroup
              : geometryGroup
            ).map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => onInsertSymbol(targetKey, item.val, item.cursorOffset)}
                className="px-2 py-1 bg-white hover:bg-purple-600 text-slate-800 hover:text-white border border-slate-200 rounded-lg font-bold text-xs transition shadow-2xs"
                title={item.title}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
