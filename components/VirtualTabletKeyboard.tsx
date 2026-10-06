import React, { useState } from 'react';
import {
  Keyboard, X, Minimize2, Maximize2, ArrowUp, CornerDownLeft, Delete,
  HelpCircle, Eye, EyeOff, Sparkles, Move
} from 'lucide-react';

interface VirtualTabletKeyboardProps {
  isOpen: boolean;
  onClose: () => void;
  activeInputKey: string | null;
  activeInputLabel: string;
  onInsertText: (text: string, cursorOffset?: number) => void;
  onBackspace: () => void;
  isTabletModeNoNativeKeyboard: boolean;
  onToggleTabletMode: (enabled: boolean) => void;
}

export const VirtualTabletKeyboard: React.FC<VirtualTabletKeyboardProps> = ({
  isOpen,
  onClose,
  activeInputKey,
  activeInputLabel,
  onInsertText,
  onBackspace,
  isTabletModeNoNativeKeyboard,
  onToggleTabletMode,
}) => {
  const [activeTab, setActiveTab] = useState<'azerty' | 'numbers' | 'math'>('azerty');
  const [isUppercase, setIsUppercase] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOpen) return null;

  const handleKeyPress = (e: React.MouseEvent | React.TouchEvent, char: string, offset = 0) => {
    e.preventDefault();
    const toInsert = isUppercase ? char.toUpperCase() : char;
    onInsertText(toInsert, offset);
  };

  const handleBackspace = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    onBackspace();
  };

  const handleSpace = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    onInsertText(' ');
  };

  const handleEnter = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    onInsertText('\n');
  };

  const handleCenterInput = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeInputKey) {
      const el = document.getElementById(`textarea_${activeInputKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }
  };

  // Lignes du clavier AZERTY
  const azertyRow1 = ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
  const azertyRow2 = ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'];
  const azertyRow3 = ['w', 'x', 'c', 'v', 'b', 'n', "'", ',', '.', ';', '?', '!'];
  const frenchAccents = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'ù', 'û', 'ô', 'î', 'ï'];

  // Chiffres et calculs
  const numberPad = [
    ['7', '8', '9', '÷', '%'],
    ['4', '5', '6', '×', '*'],
    ['1', '2', '3', '-', '+'],
    ['0', ',', '.', '=', '/'],
  ];

  // Symboles mathématiques & parenthèses
  const mathSymbols = [
    ['(', ')', '[', ']', '{', '}'],
    ['<', '>', '≤', '≥', '≠', '≈'],
    ['√', '∛', 'π', '²', '³', '±'],
    ['°', '∞', 'α', 'β', 'θ', 'Δ'],
  ];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md text-white border-t-2 border-purple-500 shadow-2xl transition-all select-none ${
        isMinimized ? 'translate-y-[calc(100%-48px)]' : 'translate-y-0'
      }`}
      onMouseDown={(e) => {
        // Empêche de dé-focaliser l'input actif
        if ((e.target as HTMLElement).tagName === 'BUTTON') {
          e.preventDefault();
        }
      }}
    >
      {/* ── BARRE SUPÉRIEURE DU CLAVIER TABLETTE ── */}
      <div className="bg-slate-800/90 px-3 sm:px-5 py-2 flex items-center justify-between border-b border-slate-700/80 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center text-white flex-shrink-0 shadow-xs">
            <Keyboard size={16} />
          </div>
          <div className="min-w-0 flex items-center gap-2">
            <span className="font-bold text-xs text-purple-300 hidden sm:inline">
              Clavier Tablette
            </span>
            {activeInputLabel ? (
              <span className="text-[11px] font-semibold text-slate-200 truncate bg-slate-700/80 px-2 py-0.5 rounded-md border border-slate-600 max-w-[200px] sm:max-w-[300px]">
                ✍️ {activeInputLabel}
              </span>
            ) : (
              <span className="text-[11px] text-amber-300/90 italic">
                (Cliquez sur une zone de réponse pour écrire)
              </span>
            )}
          </div>
        </div>

        {/* Boutons d'onglets & Options tablette */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Centrer la zone active pour qu'elle ne soit jamais masquée */}
          {activeInputKey && (
            <button
              type="button"
              onClick={handleCenterInput}
              className="px-2.5 py-1 bg-purple-900/80 hover:bg-purple-800 text-purple-200 rounded-lg text-[11px] font-bold border border-purple-700 flex items-center gap-1 shadow-xs"
              title="Centrer la question et la zone de saisie à l'écran"
            >
              <Move size={12} />
              <span className="hidden md:inline">Centrer la question</span>
            </button>
          )}

          {/* Bascule Mode Tablette Sans Clavier Natif */}
          <button
            type="button"
            onClick={() => onToggleTabletMode(!isTabletModeNoNativeKeyboard)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 shadow-xs ${
              isTabletModeNoNativeKeyboard
                ? 'bg-emerald-600 border-emerald-400 text-white'
                : 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-300'
            }`}
            title="Empêche le clavier natif de la tablette d'apparaître et de masquer l'écran"
          >
            {isTabletModeNoNativeKeyboard ? <EyeOff size={13} /> : <Eye size={13} />}
            <span className="hidden sm:inline">
              {isTabletModeNoNativeKeyboard ? 'Clavier natif masqué (Mode Tablette)' : 'Mode Tablette'}
            </span>
          </button>

          {/* Onglets Clavier */}
          <div className="flex items-center bg-slate-950/60 p-0.5 rounded-lg border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('azerty')}
              className={`px-2.5 py-1 rounded font-bold text-[11px] transition ${
                activeTab === 'azerty' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              AZERTY
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('numbers')}
              className={`px-2.5 py-1 rounded font-bold text-[11px] transition ${
                activeTab === 'numbers' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              123
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('math')}
              className={`px-2.5 py-1 rounded font-bold text-[11px] transition ${
                activeTab === 'math' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Math ( )
            </button>
          </div>

          {/* Réduire / Fermer */}
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700/80"
            title={isMinimized ? 'Agrandir le clavier' : 'Réduire le clavier'}
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-700/80"
            title="Masquer le clavier virtuel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── CORPS DU CLAVIER (TOUCHES) ── */}
      {!isMinimized && (
        <div className="p-2 sm:p-3 max-w-4xl mx-auto space-y-1.5 sm:space-y-2">
          {/* ONGLET 1 : AZERTY + ACCENTS */}
          {activeTab === 'azerty' && (
            <div className="space-y-1.5">
              {/* Accents rapides */}
              <div className="flex items-center justify-center gap-1 sm:gap-1.5 overflow-x-auto pb-0.5">
                {frenchAccents.map((acc) => (
                  <button
                    key={acc}
                    type="button"
                    onMouseDown={(e) => handleKeyPress(e, acc)}
                    onTouchStart={(e) => handleKeyPress(e, acc)}
                    className="min-w-[28px] sm:min-w-[34px] h-8 sm:h-9 bg-slate-800 hover:bg-purple-700 active:bg-purple-800 text-purple-200 hover:text-white font-bold text-sm sm:text-base rounded-lg border border-slate-700 shadow transition flex items-center justify-center"
                  >
                    {isUppercase ? acc.toUpperCase() : acc}
                  </button>
                ))}
              </div>

              {/* Ligne 1 */}
              <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                {azertyRow1.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onMouseDown={(e) => handleKeyPress(e, k)}
                    onTouchStart={(e) => handleKeyPress(e, k)}
                    className="flex-1 max-w-[50px] h-10 sm:h-11 bg-slate-800 hover:bg-purple-600 active:bg-purple-800 text-white font-bold text-sm sm:text-base rounded-xl border border-slate-700 shadow-sm transition flex items-center justify-center"
                  >
                    {isUppercase ? k.toUpperCase() : k}
                  </button>
                ))}
              </div>

              {/* Ligne 2 */}
              <div className="flex items-center justify-center gap-1 sm:gap-1.5 px-2">
                {azertyRow2.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onMouseDown={(e) => handleKeyPress(e, k)}
                    onTouchStart={(e) => handleKeyPress(e, k)}
                    className="flex-1 max-w-[50px] h-10 sm:h-11 bg-slate-800 hover:bg-purple-600 active:bg-purple-800 text-white font-bold text-sm sm:text-base rounded-xl border border-slate-700 shadow-sm transition flex items-center justify-center"
                  >
                    {isUppercase ? k.toUpperCase() : k}
                  </button>
                ))}
              </div>

              {/* Ligne 3 avec Shift et Backspace */}
              <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsUppercase(!isUppercase)}
                  className={`w-12 sm:w-16 h-10 sm:h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-1 border transition shadow-sm ${
                    isUppercase
                      ? 'bg-amber-500 border-amber-300 text-slate-950 font-black'
                      : 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200'
                  }`}
                  title="Majuscules"
                >
                  <ArrowUp size={16} />
                </button>

                {azertyRow3.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onMouseDown={(e) => handleKeyPress(e, k)}
                    onTouchStart={(e) => handleKeyPress(e, k)}
                    className="flex-1 max-w-[45px] h-10 sm:h-11 bg-slate-800 hover:bg-purple-600 active:bg-purple-800 text-white font-bold text-sm sm:text-base rounded-xl border border-slate-700 shadow-sm transition flex items-center justify-center"
                  >
                    {isUppercase ? k.toUpperCase() : k}
                  </button>
                ))}

                <button
                  type="button"
                  onMouseDown={handleBackspace}
                  onTouchStart={handleBackspace}
                  className="w-12 sm:w-16 h-10 sm:h-11 bg-rose-900/80 hover:bg-rose-800 active:bg-rose-700 border border-rose-700 text-rose-100 rounded-xl font-bold flex items-center justify-center shadow-sm"
                  title="Effacer"
                >
                  <Delete size={18} />
                </button>
              </div>

              {/* Ligne inférieure : Espace, Entrée, Ponctuation */}
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 pt-0.5">
                <button
                  type="button"
                  onMouseDown={(e) => handleKeyPress(e, '-')}
                  onTouchStart={(e) => handleKeyPress(e, '-')}
                  className="w-10 sm:w-12 h-10 bg-slate-800 hover:bg-purple-600 text-white font-bold rounded-xl border border-slate-700"
                >
                  -
                </button>
                <button
                  type="button"
                  onMouseDown={handleSpace}
                  onTouchStart={handleSpace}
                  className="flex-1 max-w-sm h-10 bg-slate-700 hover:bg-slate-600 active:bg-purple-700 text-slate-200 font-bold text-xs sm:text-sm rounded-xl border border-slate-600 shadow-sm flex items-center justify-center tracking-wider"
                >
                  ESPACE
                </button>
                <button
                  type="button"
                  onMouseDown={handleEnter}
                  onTouchStart={handleEnter}
                  className="w-20 sm:w-28 h-10 bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white font-bold text-xs rounded-xl border border-purple-500 shadow-sm flex items-center justify-center gap-1"
                  title="Nouvelle ligne (Entrée)"
                >
                  <CornerDownLeft size={14} />
                  <span>Entrée</span>
                </button>
              </div>
            </div>
          )}

          {/* ONGLET 2 : CHIFFRES & CALCULS (123) */}
          {activeTab === 'numbers' && (
            <div className="max-w-md mx-auto space-y-1.5">
              {numberPad.map((row, rIdx) => (
                <div key={rIdx} className="flex items-center justify-center gap-1.5 sm:gap-2">
                  {row.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onMouseDown={(e) => handleKeyPress(e, item)}
                      onTouchStart={(e) => handleKeyPress(e, item)}
                      className="flex-1 h-11 sm:h-12 bg-slate-800 hover:bg-purple-600 active:bg-purple-800 text-white font-black text-lg rounded-xl border border-slate-700 shadow-sm flex items-center justify-center"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ))}
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onMouseDown={handleSpace}
                  onTouchStart={handleSpace}
                  className="flex-1 h-10 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl border border-slate-600"
                >
                  ESPACE
                </button>
                <button
                  type="button"
                  onMouseDown={handleBackspace}
                  onTouchStart={handleBackspace}
                  className="w-20 sm:w-24 h-10 bg-rose-900/80 hover:bg-rose-800 text-rose-100 font-bold rounded-xl border border-rose-700 flex items-center justify-center"
                >
                  <Delete size={18} />
                </button>
              </div>
            </div>
          )}

          {/* ONGLET 3 : SYMBOLES & MATHÉMATIQUES */}
          {activeTab === 'math' && (
            <div className="max-w-lg mx-auto space-y-1.5">
              <div className="bg-purple-950/60 p-2 rounded-xl border border-purple-800/80 text-center text-xs text-purple-200 font-semibold mb-1">
                💡 Parenthèses, accolades, crochets et symboles scientifiques pour tablette
              </div>
              {mathSymbols.map((row, rIdx) => (
                <div key={rIdx} className="flex items-center justify-center gap-1.5 sm:gap-2">
                  {row.map((sym) => {
                    const isBracketPair = ['(', ')', '[', ']', '{', '}'].includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onMouseDown={(e) => handleKeyPress(e, sym)}
                        onTouchStart={(e) => handleKeyPress(e, sym)}
                        className={`flex-1 h-11 sm:h-12 font-black text-base sm:text-lg rounded-xl border shadow-sm flex items-center justify-center transition ${
                          isBracketPair
                            ? 'bg-purple-900/80 hover:bg-purple-700 border-purple-600 text-white'
                            : 'bg-slate-800 hover:bg-purple-600 border-slate-700 text-purple-200'
                        }`}
                      >
                        {sym}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onMouseDown={handleSpace}
                  onTouchStart={handleSpace}
                  className="flex-1 h-10 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs rounded-xl border border-slate-600"
                >
                  ESPACE
                </button>
                <button
                  type="button"
                  onMouseDown={handleBackspace}
                  onTouchStart={handleBackspace}
                  className="w-20 sm:w-24 h-10 bg-rose-900/80 hover:bg-rose-800 text-rose-100 font-bold rounded-xl border border-rose-700 flex items-center justify-center"
                >
                  <Delete size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VirtualTabletKeyboard;
