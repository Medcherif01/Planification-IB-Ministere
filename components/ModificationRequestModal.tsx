import React, { useState } from 'react';
import { X, Send, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { createModificationRequest, getCurrentUser } from '../services/authService';
import type { AppUser } from '../services/authService';
import type { UnitPlan } from '../types';

interface ModificationRequestModalProps {
  plan: UnitPlan;
  onClose: () => void;
  onSuccess?: () => void;
  currentUser?: AppUser | null;
}

const REQUEST_TYPES = [
  { value: 'modification', label: '✏️ Modification d\'une unité existante' },
  { value: 'creation', label: '➕ Ajout d\'une nouvelle unité' },
  { value: 'deletion', label: '🗑️ Suppression d\'une unité' },
];

const ModificationRequestModal: React.FC<ModificationRequestModalProps> = ({ plan, onClose, onSuccess, currentUser: propUser }) => {
  const [requestType, setRequestType] = useState('modification');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const user = propUser || getCurrentUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Veuillez décrire la modification souhaitée');
      return;
    }
    setSending(true);
    setError('');
    try {
      await createModificationRequest({
        teacherUsername: user?.username || '',
        teacherDisplayName: user?.displayName || user?.username || 'Enseignant',
        subject: plan.subject || '',
        grade: plan.gradeLevel || '',
        unitId: plan.id || '',
        unitTitle: plan.title || 'Sans titre',
        requestType: requestType as 'modification' | 'deletion' | 'creation',
        description: description.trim(),
        adminNote: '',
        approvedAt: null,
        completedAt: null,
      });
      setSuccess(true);
      // Appeler onSuccess si fourni (l'alerte sera dans le parent)
      if (onSuccess) {
        setTimeout(onSuccess, 1500);
      }
    } catch (e: any) {
      setError(e.message || 'Erreur lors de l\'envoi de la demande');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              📝 Demande de modification
            </h2>
            <p className="text-indigo-200 text-xs mt-0.5 truncate max-w-xs">{plan.title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg mb-2">Demande envoyée !</h3>
              <p className="text-slate-500 text-sm">
                Votre demande a été transmise à l'administrateur. Vous serez informé de sa décision.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition"
              >
                Fermer
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Unit info */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs text-slate-500 font-medium mb-1">Unité concernée</p>
                <p className="text-sm font-semibold text-slate-800">{plan.title}</p>
                <p className="text-xs text-slate-500">{plan.subject} · {plan.gradeLevel}</p>
              </div>

              {/* Request type */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Type de demande
                </label>
                <div className="space-y-2">
                  {REQUEST_TYPES.map(t => (
                    <label key={t.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      requestType === t.value
                        ? 'bg-indigo-50 border-indigo-300'
                        : 'bg-white border-slate-200 hover:border-indigo-200'
                    }`}>
                      <input
                        type="radio"
                        value={t.value}
                        checked={requestType === t.value}
                        onChange={() => setRequestType(t.value)}
                        className="text-indigo-600"
                      />
                      <span className="text-sm font-medium text-slate-700">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Description de la modification demandée *
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Décrivez précisément ce que vous souhaitez modifier (section, contenu actuel, contenu souhaité)..."
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none resize-none"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">{description.length}/1000 caractères</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-semibold transition"
                >
                  {sending ? <><Loader2 size={15} className="animate-spin" /> Envoi...</> : <><Send size={15} /> Envoyer la demande</>}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModificationRequestModal;
