import React, { useRef, useState, useEffect } from 'react';
import {
  X, Check, RotateCcw, Trash2, Square, Circle, Triangle, Minus, Edit3, Type, Grid,
  Palette, Compass, Ruler, HelpCircle, Eye, Sliders, ChevronDown
} from 'lucide-react';

interface GeometricDrawingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveDrawing: (dataUrl: string) => void;
  initialDrawing?: string;
  subject?: string;
  questionLabel?: string;
}

type ToolMode =
  // Outils généraux
  | 'pencil'
  | 'line'
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'text'
  | 'eraser'
  // Outils spécifiques Mathématiques
  | 'ruler'          // Règle graduée
  | 'set_square'     // Équerre (angle droit 90°)
  | 'protractor'     // Rapporteur d'angle
  | 'compass'        // Compas (cercle centré avec rayon)
  | 'triangle_right' // Triangle rectangle
  | 'point'          // Point avec étiquette (A, B, C...)
  // Outils spécifiques Art
  | 'art_brush'       // Pinceau aquarelle / lavis
  | 'art_pencil'      // Crayon / fusain
  | 'art_marker'      // Feutre / marqueur
  | 'art_fill';       // Remplissage fond / forme

const ARTIST_PALETTE = [
  { name: 'Noir intense', hex: '#09090b' },
  { name: 'Gris ardoise', hex: '#475569' },
  { name: 'Gris perle', hex: '#cbd5e1' },
  { name: 'Blanc pur', hex: '#ffffff' },
  { name: 'Bleu cobalt', hex: '#1d4ed8' },
  { name: 'Bleu outremer', hex: '#3b82f6' },
  { name: 'Cyan éclatant', hex: '#06b6d4' },
  { name: 'Bleu pastel', hex: '#bae6fd' },
  { name: 'Vert émeraude', hex: '#047857' },
  { name: 'Vert prairie', hex: '#10b981' },
  { name: 'Vert sauge', hex: '#84cc16' },
  { name: 'Vert pastel', hex: '#bbf7d0' },
  { name: 'Rouge carmin', hex: '#b91c1c' },
  { name: 'Rouge vermillon', hex: '#ef4444' },
  { name: 'Corail / Rose', hex: '#f43f5e' },
  { name: 'Rose pastel', hex: '#fbcfe8' },
  { name: 'Orange vif', hex: '#ea580c' },
  { name: 'Ambre chaud', hex: '#f59e0b' },
  { name: 'Jaune d\'or', hex: '#eab308' },
  { name: 'Jaune pastel', hex: '#fef08a' },
  { name: 'Violet impérial', hex: '#6d28d9' },
  { name: 'Pourpre', hex: '#a855f7' },
  { name: 'Terre de Sienne', hex: '#78350f' },
  { name: 'Brun sépia', hex: '#451a03' },
];

const GeometricDrawingModal: React.FC<GeometricDrawingModalProps> = ({
  isOpen,
  onClose,
  onSaveDrawing,
  initialDrawing,
  subject = '',
  questionLabel = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Détection du mode initial selon la matière
  const isArtSubject = /art|plastique|visuel|dessin/i.test(subject);
  const [activeTab, setActiveTab] = useState<'math' | 'art'>(isArtSubject ? 'art' : 'math');

  // Outil actif
  const [tool, setTool] = useState<ToolMode>(isArtSubject ? 'art_brush' : 'pencil');
  const [color, setColor] = useState<string>(isArtSubject ? '#1e3a8a' : '#0f172a');
  const [lineWidth, setLineWidth] = useState<number>(isArtSubject ? 6 : 2);
  const [opacity, setOpacity] = useState<number>(100);

  // Options géométrie
  const [gridType, setGridType] = useState<'none' | 'grid' | 'millimeter' | 'art_thirds'>('grid');
  const [protractorAngle, setProtractorAngle] = useState<number>(60);
  const [compassRadius, setCompassRadius] = useState<number>(80);
  const [pointLabel, setPointLabel] = useState<string>('A');

  // État de dessin
  const [isDrawing, setIsDrawing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

  // Synchroniser l'onglet si le sujet change
  useEffect(() => {
    if (isArtSubject) {
      setActiveTab('art');
      setTool('art_brush');
      setLineWidth(6);
      setColor('#1e3a8a');
    } else {
      setActiveTab('math');
      setTool('pencil');
      setLineWidth(2);
      setColor('#0f172a');
    }
  }, [subject, isArtSubject]);

  // Initialisation du canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 480;

    // Fond blanc
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (initialDrawing) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        saveState();
      };
      img.src = initialDrawing;
    } else {
      saveState();
    }
  }, [isOpen]);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setHistory(prev => [...prev.slice(-20), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = [...history];
    newHistory.pop();
    const prevState = newHistory[newHistory.length - 1];
    ctx.putImageData(prevState, 0, 0);
    setHistory(newHistory);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveState();
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Convertir couleur hex + opacité en rgba
  const getRGBA = (hex: string, alphaPercent: number) => {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    const a = Math.max(0, Math.min(1, alphaPercent / 100));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    if (tool === 'text') {
      setTextPos({ x, y });
      return;
    }

    if (tool === 'point') {
      // Placer un point géométrique avec sa lettre
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
      ctx.fill();

      ctx.font = 'bold 14px "Inter", sans-serif';
      ctx.fillText(pointLabel, x + 6, y - 6);

      // Passer à la lettre suivante (A -> B -> C...)
      const nextChar = String.fromCharCode(pointLabel.charCodeAt(0) + 1);
      if (pointLabel.length === 1 && pointLabel >= 'A' && pointLabel < 'Z') {
        setPointLabel(nextChar);
      }
      saveState();
      return;
    }

    if (tool === 'art_fill') {
      // Remplissage rapide
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = getRGBA(color, opacity);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      saveState();
      return;
    }

    setIsDrawing(true);
    setStartX(x);
    setStartY(y);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);

    if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(16, lineWidth * 2);
    } else {
      ctx.strokeStyle = getRGBA(color, opacity);
      ctx.lineWidth = lineWidth;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);

    // Dessin libre (crayon, pinceau d'art, feutre, gomme)
    if (tool === 'pencil' || tool === 'eraser' || tool === 'art_brush' || tool === 'art_pencil' || tool === 'art_marker') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      // Prévisualisation des formes avec restauration de l'état précédent
      if (history.length > 0) {
        ctx.putImageData(history[history.length - 1], 0, 0);
      }
      ctx.beginPath();
      ctx.strokeStyle = getRGBA(color, opacity);
      ctx.fillStyle = getRGBA(color, Math.min(25, opacity));
      ctx.lineWidth = lineWidth;

      if (tool === 'line') {
        ctx.moveTo(startX, startY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // ── RÈGLE GRADUÉE ──
      else if (tool === 'ruler') {
        ctx.moveTo(startX, startY);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Calculer la distance et afficher la mesure en cm (approx 38px = 1cm)
        const dx = x - startX;
        const dy = y - startY;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const distCm = (distPx / 38).toFixed(1);

        // Petit repère aux extrémités
        const angle = Math.atan2(dy, dx);
        const perpX = Math.cos(angle + Math.PI / 2) * 6;
        const perpY = Math.sin(angle + Math.PI / 2) * 6;

        ctx.beginPath();
        ctx.moveTo(startX - perpX, startY - perpY);
        ctx.lineTo(startX + perpX, startY + perpY);
        ctx.moveTo(x - perpX, y - perpY);
        ctx.lineTo(x + perpX, y + perpY);
        ctx.stroke();

        // Texte longueur
        ctx.font = 'bold 12px "Inter", sans-serif';
        ctx.fillStyle = color;
        const midX = (startX + x) / 2 + perpX * 2;
        const midY = (startY + y) / 2 + perpY * 2;
        ctx.fillText(`${distCm} cm`, midX, midY);
      }

      // ── ÉQUERRE : ANGLE DROIT 90° ──
      else if (tool === 'set_square' || tool === 'triangle_right') {
        // Trace un angle droit : de start à (startX, y) puis à (x, y)
        const cornerX = startX;
        const cornerY = y;

        ctx.moveTo(startX, startY);
        ctx.lineTo(cornerX, cornerY);
        ctx.lineTo(x, cornerY);
        if (tool === 'triangle_right') {
          ctx.lineTo(startX, startY);
          ctx.fill();
        }
        ctx.stroke();

        // Symbole d'angle droit (petit carré ∟)
        const size = 12;
        const signY = startY > cornerY ? 1 : -1;
        const signX = x > cornerX ? 1 : -1;

        ctx.beginPath();
        ctx.moveTo(cornerX + signX * size, cornerY);
        ctx.lineTo(cornerX + signX * size, cornerY + signY * size);
        ctx.lineTo(cornerX, cornerY + signY * size);
        ctx.strokeStyle = color;
        ctx.stroke();
      }

      // ── RAPPORTEUR : TRACÉ D'ANGLE PRÉCIS ──
      else if (tool === 'protractor') {
        const dx = x - startX;
        const dy = y - startY;
        const baseAngle = Math.atan2(dy, dx);
        const radius = Math.max(50, Math.sqrt(dx * dx + dy * dy));
        const radAngle = (protractorAngle * Math.PI) / 180;
        const targetAngle = baseAngle - radAngle;

        // Côté initial
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + Math.cos(baseAngle) * radius, startY + Math.sin(baseAngle) * radius);
        ctx.stroke();

        // Côté secondaire selon l'angle choisi
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + Math.cos(targetAngle) * radius, startY + Math.sin(targetAngle) * radius);
        ctx.stroke();

        // Arc de cercle pour l'angle
        ctx.beginPath();
        ctx.arc(startX, startY, Math.min(35, radius / 2), targetAngle, baseAngle);
        ctx.stroke();

        // Étiquette de l'angle
        const labelAngle = targetAngle + radAngle / 2;
        const labelX = startX + Math.cos(labelAngle) * 45;
        const labelY = startY + Math.sin(labelAngle) * 45;
        ctx.font = 'bold 12px "Inter", sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(`${protractorAngle}°`, labelX, labelY);
      }

      // ── COMPAS : CERCLE ET RAYON ──
      else if (tool === 'compass') {
        const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));

        // Cercle
        ctx.beginPath();
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Point central
        ctx.beginPath();
        ctx.arc(startX, startY, 3, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('O', startX - 10, startY - 5);

        // Tracé du rayon en pointillé
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.setLineDash([]); // reset

        // Mesure du rayon en cm
        const rCm = (radius / 38).toFixed(1);
        ctx.font = '11px sans-serif';
        ctx.fillText(`r = ${rCm} cm`, (startX + x) / 2, (startY + y) / 2 - 5);
      }

      // ── RECTANGLE ──
      else if (tool === 'rect') {
        ctx.strokeRect(startX, startY, x - startX, y - startY);
      }

      // ── CERCLE CLASSIQUE ──
      else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // ── TRIANGLE QUELCONQUE ──
      else if (tool === 'triangle') {
        ctx.moveTo(startX + (x - startX) / 2, startY);
        ctx.lineTo(startX, y);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveState();
  };

  const handleApplyText = () => {
    if (!textInput.trim() || !textPos) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(14, lineWidth * 4)}px Inter, sans-serif`;
    ctx.fillText(textInput, textPos.x, textPos.y);
    saveState();
    setTextInput('');
    setTextPos(null);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSaveDrawing(dataUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col border border-slate-200 animate-fadeIn max-h-[95vh]">

        {/* ── HEADER MODALE AVEC DEUX ONGLETS (MATHS vs ART) ── */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white p-3 sm:p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/40 text-purple-300 border border-purple-400/30 flex items-center justify-center text-lg">
              {activeTab === 'math' ? '📐' : '🎨'}
            </div>
            <div>
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <span>{activeTab === 'math' ? 'Studio de Géométrie & Mathématiques' : 'Studio d\'Arts Plastiques & Dessin'}</span>
                {questionLabel && (
                  <span className="text-[10px] bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full font-bold">
                    {questionLabel}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-300">
                {activeTab === 'math'
                  ? 'Équerre (angle droit), Rapporteur, Compas, Règle graduée, sommets et figures'
                  : 'Palette de 24 couleurs, Pinceaux, Fusain, Feutre et Lavis d\'artiste'}
              </p>
            </div>
          </div>

          {/* Onglets de bascule rapide */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('math');
                  setTool('pencil');
                  setLineWidth(2);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                  activeTab === 'math'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span>📐</span> Maths & Géométrie
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('art');
                  setTool('art_brush');
                  setLineWidth(6);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition ${
                  activeTab === 'art'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span>🎨</span> Arts & Dessin
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── TOOLBAR SPÉCIALISÉE ── */}
        <div className="bg-slate-50 border-b border-slate-200 p-2.5 flex flex-col gap-2">

          {/* Ligne 1 : Outils selon l'onglet */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">

            {/* Outils Maths */}
            {activeTab === 'math' && (
              <div className="flex items-center gap-1 flex-wrap bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setTool('pencil')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'pencil' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Crayon fin"
                >
                  <Edit3 size={14} /> <span>Crayon</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('ruler')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'ruler' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Règle graduée (mesure en cm)"
                >
                  <Ruler size={14} /> <span>Règle (cm)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('set_square')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'set_square' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Équerre : trace un angle droit 90° avec repère carré"
                >
                  <span>📐</span> <span>Équerre (90°)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('protractor')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'protractor' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Rapporteur d'angle (en degrés)"
                >
                  <span>🧭</span> <span>Rapporteur</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('compass')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'compass' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Compas : cercle centré avec rayon"
                >
                  <Compass size={14} /> <span>Compas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('triangle_right')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'triangle_right' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Triangle rectangle"
                >
                  <span>⊿</span> <span>Triangle rect.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('triangle')}
                  className={`p-1.5 rounded-lg font-bold ${tool === 'triangle' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Triangle"
                >
                  <Triangle size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => setTool('rect')}
                  className={`p-1.5 rounded-lg font-bold ${tool === 'rect' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Rectangle / Carré"
                >
                  <Square size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => setTool('circle')}
                  className={`p-1.5 rounded-lg font-bold ${tool === 'circle' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Cercle libre"
                >
                  <Circle size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => setTool('line')}
                  className={`p-1.5 rounded-lg font-bold ${tool === 'line' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Segment simple"
                >
                  <Minus size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => setTool('point')}
                  className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 ${tool === 'point' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Placer un point (sommet)"
                >
                  <span className="font-mono text-xs">● {pointLabel}</span>
                </button>
              </div>
            )}

            {/* Outils Art */}
            {activeTab === 'art' && (
              <div className="flex items-center gap-1 flex-wrap bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setTool('art_brush')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'art_brush' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Pinceau doux / Lavis aquarelle"
                >
                  <span>🖌️</span> <span>Pinceau d'art</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('art_pencil')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'art_pencil' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Crayon d'art / Fusain"
                >
                  <span>✏️</span> <span>Fusain / Crayon</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('art_marker')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'art_marker' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Feutre / Marqueur net"
                >
                  <span>🖊️</span> <span>Feutre</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('art_fill')}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${tool === 'art_fill' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Remplir le fond d'une couleur"
                >
                  <span>🪣</span> <span>Aplat de couleur</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTool('circle')}
                  className={`p-1.5 rounded-lg font-bold ${tool === 'circle' ? 'bg-purple-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Cercle d'esquisse"
                >
                  <Circle size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => setTool('rect')}
                  className={`p-1.5 rounded-lg font-bold ${tool === 'rect' ? 'bg-purple-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  title="Cadre / Rectangle"
                >
                  <Square size={15} />
                </button>
              </div>
            )}

            {/* Outils communs (Texte, Gomme, Annuler, Vider) */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setTool('text')}
                className={`p-1.5 rounded-lg font-bold flex items-center gap-1 ${tool === 'text' ? 'bg-purple-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                title="Ajouter un texte / annotation"
              >
                <Type size={15} /> <span className="hidden sm:inline">Texte</span>
              </button>

              <button
                type="button"
                onClick={() => setTool('eraser')}
                className={`p-1.5 rounded-lg font-bold flex items-center gap-1 ${tool === 'eraser' ? 'bg-rose-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                title="Gomme"
              >
                <span>🧽</span> <span className="hidden sm:inline">Gomme</span>
              </button>

              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length <= 1}
                className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                title="Annuler (Ctrl+Z)"
              >
                <RotateCcw size={15} />
              </button>

              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                title="Effacer tout"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {/* Ligne 2 : Palette de couleurs riche & curseurs */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            {/* Palette 24 couleurs d'artiste */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mr-1 flex items-center gap-1">
                <Palette size={12} /> Couleurs :
              </span>
              <div className="flex items-center gap-1 flex-wrap max-w-xl">
                {ARTIST_PALETTE.map(p => (
                  <button
                    key={p.hex}
                    type="button"
                    onClick={() => setColor(p.hex)}
                    style={{ backgroundColor: p.hex }}
                    className={`w-5 h-5 rounded-full border transition transform hover:scale-125 ${
                      color === p.hex ? 'ring-2 ring-purple-600 ring-offset-1 scale-110 border-white' : 'border-slate-300'
                    }`}
                    title={p.name}
                  />
                ))}
              </div>

              {/* Color picker libre */}
              <div className="relative flex items-center gap-1 ml-1">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-6 h-6 rounded-lg cursor-pointer border border-slate-300 p-0"
                  title="Choisir une couleur personnalisée"
                />
              </div>
            </div>

            {/* Réglages épaisseur & opacité */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500">Trait :</span>
                <input
                  type="range"
                  min="1"
                  max="36"
                  value={lineWidth}
                  onChange={e => setLineWidth(parseInt(e.target.value))}
                  className="w-16 accent-purple-600"
                />
                <span className="text-[10px] font-mono font-bold text-slate-600 w-4">{lineWidth}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500">Opacité :</span>
                <input
                  type="range"
                  min="15"
                  max="100"
                  value={opacity}
                  onChange={e => setOpacity(parseInt(e.target.value))}
                  className="w-16 accent-purple-600"
                />
                <span className="text-[10px] font-mono font-bold text-slate-600 w-6">{opacity}%</span>
              </div>

              {/* Grille / Papier millimétré */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500">Grille :</span>
                <select
                  value={gridType}
                  onChange={e => setGridType(e.target.value as any)}
                  className="p-1 bg-white border border-slate-200 rounded text-[11px] font-semibold text-slate-700 outline-none"
                >
                  <option value="none">Sans grille</option>
                  <option value="grid">Grille carreaux</option>
                  <option value="millimeter">Papier millimétré</option>
                  <option value="art_thirds">Règle des tiers (Art)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Option spécifique : Angle du rapporteur si actif */}
          {tool === 'protractor' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-indigo-900">Angle du rapporteur :</span>
                <div className="flex gap-1">
                  {[30, 45, 60, 90, 120, 135, 150].map(deg => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setProtractorAngle(deg)}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        protractorAngle === deg ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-800 border border-indigo-200'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="5"
                  max="180"
                  value={protractorAngle}
                  onChange={e => setProtractorAngle(parseInt(e.target.value))}
                  className="w-24 accent-indigo-600"
                />
                <span className="font-mono font-bold text-indigo-900">{protractorAngle}°</span>
              </div>
            </div>
          )}
        </div>

        {/* ── ZONE DE CANVAS AVEC OVERLAY DE GRILLE ── */}
        <div className="flex-1 bg-slate-200 p-3 sm:p-4 flex items-center justify-center overflow-auto relative">
          <div className="relative shadow-xl rounded-xl overflow-hidden bg-white border border-slate-300">
            {/* Grilles de fond transparentes */}
            {gridType === 'grid' && (
              <div
                className="absolute inset-0 pointer-events-none z-10 opacity-30"
                style={{
                  backgroundImage: 'linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)',
                  backgroundSize: '25px 25px',
                }}
              />
            )}
            {gridType === 'millimeter' && (
              <div
                className="absolute inset-0 pointer-events-none z-10 opacity-40"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, #f43f5e 1px, transparent 1px),
                    linear-gradient(to bottom, #f43f5e 1px, transparent 1px),
                    linear-gradient(to right, #cbd5e1 1px, transparent 1px),
                    linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)
                  `,
                  backgroundSize: '50px 50px, 50px 50px, 10px 10px, 10px 10px',
                }}
              />
            )}
            {gridType === 'art_thirds' && (
              <div
                className="absolute inset-0 pointer-events-none z-10 opacity-35"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, #8b5cf6 2px, transparent 2px),
                    linear-gradient(to bottom, #8b5cf6 2px, transparent 2px)
                  `,
                  backgroundSize: '33.333% 33.333%',
                }}
              />
            )}

            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="cursor-crosshair block max-w-full h-auto bg-white"
            />
          </div>

          {/* Boîte de saisie de texte positionnée au clic */}
          {textPos && (
            <div
              className="absolute z-20 bg-white p-2.5 rounded-xl shadow-2xl border-2 border-purple-500 flex items-center gap-2"
              style={{
                left: `${Math.min(textPos.x + 20, 600)}px`,
                top: `${Math.min(textPos.y + 20, 380)}px`,
              }}
            >
              <input
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="Votre texte / symbole..."
                autoFocus
                className="p-1.5 border border-slate-300 rounded text-xs font-bold outline-none"
                onKeyDown={e => e.key === 'Enter' && handleApplyText()}
              />
              <button
                type="button"
                onClick={handleApplyText}
                className="px-2.5 py-1.5 bg-purple-600 text-white rounded text-xs font-bold"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setTextPos(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* ── FOOTER D'INSERTION DANS LA COPIE ÉLÈVE ── */}
        <div className="bg-white border-t border-slate-200 p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="font-bold text-slate-700">Conseil :</span>
            {activeTab === 'math' ? (
              <span>Utilisez l'Équerre pour les angles droits ∟ et le Rapporteur pour les angles mesurés en degrés.</span>
            ) : (
              <span>Variez l'opacité et les teintes pour créer des dégradés et textures artistiques.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs shadow-lg transition flex items-center gap-1.5"
            >
              <Check size={16} />
              <span>Insérer ce tracé dans ma réponse</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default GeometricDrawingModal;
