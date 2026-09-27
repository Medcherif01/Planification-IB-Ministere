import React, { useRef, useState, useEffect } from 'react';
import { X, Check, RotateCcw, Trash2, Square, Circle, Triangle, Minus, Edit3, Type, Grid } from 'lucide-react';

interface GeometricDrawingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveDrawing: (dataUrl: string) => void;
  initialDrawing?: string;
}

type ToolMode = 'pencil' | 'line' | 'rect' | 'circle' | 'triangle' | 'text' | 'eraser';

const GeometricDrawingModal: React.FC<GeometricDrawingModalProps> = ({
  isOpen,
  onClose,
  onSaveDrawing,
  initialDrawing,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<ToolMode>('pencil');
  const [color, setColor] = useState<string>('#1e293b'); // Dark slate
  const [lineWidth, setLineWidth] = useState<number>(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [showGrid, setShowGrid] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = 750;
    canvas.height = 450;

    // White background
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
    setHistory(prev => [...prev.slice(-15), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = [...history];
    newHistory.pop(); // Remove current
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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    if (tool === 'text') {
      setTextPos({ x, y });
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
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? 16 : lineWidth;
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

    if (tool === 'pencil' || tool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      // Shapes preview: restore last history snapshot then draw shape
      if (history.length > 0) {
        ctx.putImageData(history[history.length - 1], 0, 0);
      }
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;

      if (tool === 'line') {
        ctx.moveTo(startX, startY);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (tool === 'rect') {
        ctx.strokeRect(startX, startY, x - startX, y - startY);
      } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (tool === 'triangle') {
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
    ctx.font = 'bold 16px Inter, sans-serif';
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
    <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📐</span>
            <div>
              <h3 className="font-black text-sm">Outil Géométrique & Tracé de Figures</h3>
              <p className="text-[11px] text-blue-200">
                Dessinez des segments, angles, triangles, cercles ou graphiques pour accompagner votre réponse
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white rounded-xl hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 p-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
          {/* Tools */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
            <button
              onClick={() => setTool('pencil')}
              className={`p-1.5 rounded-lg font-bold flex items-center gap-1 ${tool === 'pencil' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Crayon libre"
            >
              <Edit3 size={15} /> <span className="hidden sm:inline">Crayon</span>
            </button>
            <button
              onClick={() => setTool('line')}
              className={`p-1.5 rounded-lg font-bold flex items-center gap-1 ${tool === 'line' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Segment / Ligne droite"
            >
              <Minus size={15} /> <span className="hidden sm:inline">Ligne</span>
            </button>
            <button
              onClick={() => setTool('triangle')}
              className={`p-1.5 rounded-lg font-bold flex items-center gap-1 ${tool === 'triangle' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Triangle"
            >
              <Triangle size={15} /> <span className="hidden sm:inline">Triangle</span>
            </button>
            <button
              onClick={() => setTool('rect')}
              className={`p-1.5 rounded-lg font-bold flex items-center gap-1 ${tool === 'rect' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Rectangle / Carré"
            >
              <Square size={15} /> <span className="hidden sm:inline">Rectangle</span>
            </button>
            <button
              onClick={() => setTool('circle')}
              className={`p-1.5 rounded-lg font-bold flex items-center gap-1 ${tool === 'circle' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Cercle"
            >
              <Circle size={15} /> <span className="hidden sm:inline">Cercle</span>
            </button>
            <button
              onClick={() => setTool('text')}
              className={`p-1.5 rounded-lg font-bold flex items-center gap-1 ${tool === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Nommer les sommets (A, B, C...)"
            >
              <Type size={15} /> <span className="hidden sm:inline">Sommet/Texte</span>
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-1.5 rounded-lg font-bold ${tool === 'eraser' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              title="Gomme"
            >
              Gomme
            </button>
          </div>

          {/* Couleurs */}
          <div className="flex items-center gap-1.5">
            {[
              { c: '#1e293b', label: 'Noir' },
              { c: '#2563eb', label: 'Bleu' },
              { c: '#dc2626', label: 'Rouge' },
              { c: '#16a34a', label: 'Vert' },
            ].map(col => (
              <button
                key={col.c}
                onClick={() => setColor(col.c)}
                className={`w-6 h-6 rounded-full border-2 transition ${color === col.c ? 'scale-110 border-indigo-600 ring-2 ring-indigo-200' : 'border-white'}`}
                style={{ backgroundColor: col.c }}
                title={col.label}
              />
            ))}

            <select
              value={lineWidth}
              onChange={e => setLineWidth(Number(e.target.value))}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold"
            >
              <option value="1">Fin (1px)</option>
              <option value="2">Moyen (2px)</option>
              <option value="4">Épais (4px)</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowGrid(v => !v)}
              className={`px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${showGrid ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'bg-white border-slate-200 text-slate-600'}`}
              title="Afficher/Masquer le quadrillage"
            >
              <Grid size={13} /> Quadrillage
            </button>
            <button
              onClick={handleUndo}
              disabled={history.length <= 1}
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg disabled:opacity-40"
              title="Annuler le dernier tracé"
            >
              <RotateCcw size={15} />
            </button>
            <button
              onClick={handleClear}
              className="p-1.5 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-lg"
              title="Effacer tout"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Dialog for text placing */}
        {textPos && (
          <div className="bg-amber-50 p-2 border-b border-amber-200 flex items-center gap-2 text-xs">
            <span className="font-bold text-amber-800">Texte à inscrire (ex: A, B, C, 90°, 5 cm) :</span>
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Ex: A"
              className="px-2 py-1 bg-white border border-amber-300 rounded font-bold text-xs"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleApplyText(); }}
            />
            <button onClick={handleApplyText} className="px-3 py-1 bg-indigo-600 text-white rounded font-bold text-xs">
              Valider
            </button>
            <button onClick={() => setTextPos(null)} className="px-2 py-1 text-slate-500 hover:text-slate-800 text-xs">
              Annuler
            </button>
          </div>
        )}

        {/* Canvas Workspace with optional grid */}
        <div className="p-4 bg-slate-200 flex items-center justify-center overflow-auto max-h-[500px]">
          <div className={`relative bg-white rounded-xl shadow-lg border border-slate-300 overflow-hidden ${showGrid ? 'bg-grid-pattern' : ''}`}>
            <style>{`
              .bg-grid-pattern {
                background-image: linear-gradient(to right, #f1f5f9 1px, transparent 1px),
                                  linear-gradient(to bottom, #f1f5f9 1px, transparent 1px);
                background-size: 20px 20px;
              }
            `}</style>
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="cursor-crosshair block"
              style={{ width: '750px', height: '450px' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Conseil : Utilisez les formes géométriques et l'outil "Sommet/Texte" pour nommer vos points (A, B, C...)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5"
            >
              <Check size={15} /> Insérer la figure dans ma réponse
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default GeometricDrawingModal;
