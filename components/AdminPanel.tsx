import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Plus, Edit2, Trash2, Shield, BookOpen, CheckCircle,
  XCircle, Clock, Download, Upload, RefreshCw, Eye, EyeOff,
  AlertCircle, Loader2, ChevronDown, ChevronUp, X, Save,
  Bell, UserCheck, UserX, Database, FileText, FileSpreadsheet, Check
} from 'lucide-react';
import {
  listUsers, createTeacher, updateTeacher, deleteTeacher,
  listModificationRequests, updateRequestStatus,
  type AppUser, type ModificationRequest
} from '../services/authService';
import { SUBJECTS } from '../constants';
import {
  downloadCompleteExcelBackup,
  downloadCompleteCSVBackup,
  importAllDataFromExcel,
  importAllDataFromCSV
} from '../services/excelBackupService';

// ─────────────────────────────────────────────────────────────────────────────

interface AdminPanelProps {
  onClose: () => void;
  onExportCSV?: () => void;
  onImportCSV?: (file: File) => void;
}

type AdminTab = 'users' | 'requests' | 'data';

// ─────────────────────────────────────────────────────────────────────────────

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, onExportCSV, onImportCSV }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // ── Users state ───────────────────────────────────────────────────────────
  const [users, setUsers] = useState<AppUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  // ── New user form ──────────────────────────────────────────────────────────
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newSubjects, setNewSubjects] = useState<string[]>([]);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [userFormError, setUserFormError] = useState('');

  // ── Requests state ────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<ModificationRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestFilter, setRequestFilter] = useState<string>('pending');

  // ── Import ref ────────────────────────────────────────────────────────────
  const importRef = useRef<HTMLInputElement>(null);

  // ── Load users ────────────────────────────────────────────────────────────
  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (e: any) {
      setUsersError(e.message || 'Erreur chargement utilisateurs');
    } finally {
      setUsersLoading(false);
    }
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const data = await listModificationRequests(requestFilter || undefined);
      setRequests(data);
    } catch (e: any) {
      console.error('Erreur chargement demandes:', e);
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { if (activeTab === 'requests') loadRequests(); }, [activeTab, requestFilter]);

  // ── Create teacher ────────────────────────────────────────────────────────
  const handleCreateTeacher = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newDisplayName.trim()) {
      setUserFormError('Tous les champs sont obligatoires');
      return;
    }
    setSavingUser(true);
    setUserFormError('');
    try {
      await createTeacher({
        username: newUsername.trim(),
        password: newPassword.trim(),
        displayName: newDisplayName.trim(),
        subjects: newSubjects,
      });
      setNewUsername(''); setNewPassword(''); setNewDisplayName(''); setNewSubjects([]);
      setShowAddForm(false);
      await loadUsers();
    } catch (e: any) {
      setUserFormError(e.message || 'Erreur création');
    } finally {
      setSavingUser(false);
    }
  };

  // ── Update teacher ────────────────────────────────────────────────────────
  const handleUpdateTeacher = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    setUserFormError('');
    try {
      const updateData: Parameters<typeof updateTeacher>[1] = {
        displayName: newDisplayName,
        subjects: newSubjects,
        isActive: true,
      };
      if (newPassword.trim()) updateData.password = newPassword.trim();
      if (newUsername.trim() !== editingUser.username) updateData.username = newUsername.trim();
      await updateTeacher(editingUser.id, updateData);
      setEditingUser(null);
      setNewUsername(''); setNewPassword(''); setNewDisplayName(''); setNewSubjects([]);
      await loadUsers();
    } catch (e: any) {
      setUserFormError(e.message || 'Erreur modification');
    } finally {
      setSavingUser(false);
    }
  };

  const startEditUser = (user: AppUser) => {
    setEditingUser(user);
    setNewUsername(user.username);
    setNewDisplayName(user.displayName);
    setNewPassword('');
    setNewSubjects(user.subjects || []);
    setUserFormError('');
    setShowAddForm(false);
  };

  const cancelUserForm = () => {
    setEditingUser(null);
    setShowAddForm(false);
    setNewUsername(''); setNewPassword(''); setNewDisplayName(''); setNewSubjects([]);
    setUserFormError('');
  };

  // ── Delete teacher ────────────────────────────────────────────────────────
  const handleDeleteTeacher = async (user: AppUser) => {
    if (!window.confirm(`Supprimer l'enseignant "${user.displayName}" ?\n\nCette action est irréversible.`)) return;
    try {
      await deleteTeacher(user.id);
      await loadUsers();
    } catch (e: any) {
      alert('Erreur : ' + e.message);
    }
  };

  // ── Toggle subject selection ───────────────────────────────────────────────
  const toggleSubject = (subject: string) => {
    setNewSubjects(prev =>
      prev.includes(subject)
        ? prev.filter(s => s !== subject)
        : [...prev, subject]
    );
  };

  // ── Handle request action ─────────────────────────────────────────────────
  const handleRequestAction = async (id: string, action: 'approved' | 'rejected', note?: string) => {
    try {
      await updateRequestStatus(id, action, note);
      await loadRequests();
    } catch (e: any) {
      alert('Erreur : ' + e.message);
    }
  };

  // ── Import state ───────────────────────────────────────────────────────────
  const [importStatus, setImportStatus] = useState<'' | 'loading' | 'success' | 'error'>('');
  const [importMessage, setImportMessage] = useState('');
  const [importProgress, setImportProgress] = useState<{ step: string; percent: number } | null>(null);
  const [importStats, setImportStats] = useState<{
    units: number;
    interdisciplinary: number;
    sea: number;
    users: number;
    exams: number;
    criteria?: number;
    calendars?: number;
    errors: string[];
  } | null>(null);

  // ── Export state ───────────────────────────────────────────────────────────
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgressMsg, setExportProgressMsg] = useState('');

  const handleExportExcelAll = async () => {
    setExportLoading(true);
    setExportProgressMsg('Préparation du fichier Excel...');
    try {
      await downloadCompleteExcelBackup((step) => {
        setExportProgressMsg(step);
      });
    } catch (e: any) {
      alert('Erreur lors de l\'exportation Excel : ' + (e.message || e));
    } finally {
      setExportLoading(false);
      setExportProgressMsg('');
    }
  };

  const handleExportCSVAll = async () => {
    setExportLoading(true);
    setExportProgressMsg('Préparation du fichier CSV...');
    try {
      await downloadCompleteCSVBackup((step) => {
        setExportProgressMsg(step);
      });
    } catch (e: any) {
      alert('Erreur lors de l\'exportation CSV : ' + (e.message || e));
    } finally {
      setExportLoading(false);
      setExportProgressMsg('');
    }
  };

  // ── Import file handler (Excel & CSV) ──────────────────────────────────────
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importRef.current) importRef.current.value = '';

    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

    // Confirmation
    const confirmMsg = `Vous êtes sur le point de restaurer les données depuis le fichier "${file.name}".\n\n` +
      `Cette opération synchronisera et remplacera toutes les unités et plans correspondants pour garantir une base propre sans doublons.\n\n` +
      `Voulez-vous continuer ?`;

    if (!window.confirm(confirmMsg)) return;

    setImportStatus('loading');
    setImportMessage('Lecture et analyse du fichier en cours...');
    setImportStats(null);
    setImportProgress({ step: 'Initialisation...', percent: 5 });

    try {
      let result;
      if (isCsv) {
        // Restauration complète depuis CSV (.csv)
        result = await importAllDataFromCSV(file, (step, percent) => {
          setImportMessage(step);
          setImportProgress({ step, percent });
        });
      } else if (isExcel) {
        // Restauration complète depuis Excel (.xlsx)
        result = await importAllDataFromExcel(file, (step, percent) => {
          setImportMessage(step);
          setImportProgress({ step, percent });
        });
      } else {
        throw new Error('Format de fichier non pris en charge. Veuillez sélectionner un fichier .xlsx ou .csv.');
      }

      if (result.success) {
        setImportStatus('success');
        setImportMessage(result.message);
        setImportStats({
          units: result.stats.units,
          interdisciplinary: result.stats.interdisciplinary,
          sea: result.stats.sea,
          users: result.stats.users,
          exams: result.stats.exams,
          criteria: result.stats.criteria,
          calendars: result.stats.calendars,
          errors: result.stats.errors,
        });
        if (onImportCSV) onImportCSV(file);
        await loadUsers();
        await loadRequests();
      } else {
        setImportStatus('error');
        setImportMessage(result.message);
        if (result.stats?.errors?.length) {
          setImportStats({
            units: result.stats.units || 0,
            interdisciplinary: result.stats.interdisciplinary || 0,
            sea: result.stats.sea || 0,
            users: result.stats.users || 0,
            exams: result.stats.exams || 0,
            errors: result.stats.errors,
          });
        }
      }
    } catch (e: any) {
      setImportStatus('error');
      setImportMessage(e.message || 'Erreur lors de la lecture du fichier');
    } finally {
      setImportProgress(null);
    }
  };

  // ── Status badge ──────────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { cls: string; label: string }> = {
      pending: { cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'En attente' },
      approved: { cls: 'bg-green-100 text-green-800 border-green-200', label: 'Approuvée' },
      rejected: { cls: 'bg-red-100 text-red-800 border-red-200', label: 'Refusée' },
      completed: { cls: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Terminée' },
    };
    const c = config[status] || config.pending;
    return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] overflow-y-auto">
      <div className="min-h-screen p-4 flex items-start justify-center">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Shield size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Panneau Administrateur</h2>
                <p className="text-slate-400 text-xs">Les Écoles Internationales Al-Kawthar</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition">
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-200 flex">
            {[
              { id: 'users' as AdminTab, label: 'Utilisateurs', icon: <Users size={15} /> },
              { id: 'requests' as AdminTab, label: `Demandes${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: <Bell size={15} /> },
              { id: 'data' as AdminTab, label: 'Données', icon: <Database size={15} /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold transition border-b-2 ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">

            {/* ══ TAB: USERS ═══════════════════════════════════════════════════ */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <Users size={16} /> Gestion des enseignants
                  </h3>
                  {!showAddForm && !editingUser && (
                    <button
                      onClick={() => { setShowAddForm(true); setEditingUser(null); cancelUserForm(); setShowAddForm(true); }}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow transition"
                    >
                      <Plus size={15} /> Ajouter un enseignant
                    </button>
                  )}
                </div>

                {/* Add/Edit form */}
                {(showAddForm || editingUser) && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-indigo-800 flex items-center gap-2">
                      {editingUser ? <Edit2 size={15} /> : <Plus size={15} />}
                      {editingUser ? `Modifier : ${editingUser.displayName}` : 'Nouvel enseignant'}
                    </h4>

                    {userFormError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex items-center gap-2">
                        <AlertCircle size={14} /> {userFormError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Nom affiché *</label>
                        <input
                          type="text"
                          value={newDisplayName}
                          onChange={e => setNewDisplayName(e.target.value)}
                          placeholder="Ex: Ahmed Bensalem"
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Nom d'utilisateur *</label>
                        <input
                          type="text"
                          value={newUsername}
                          onChange={e => setNewUsername(e.target.value)}
                          placeholder="Ex: ahmed.bensalem"
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                        />
                      </div>
                      <div className="relative">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Mot de passe {editingUser ? '(laisser vide = inchangé)' : '*'}
                        </label>
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder={editingUser ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(v => !v)}
                          className="absolute right-2 bottom-2 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Matières */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2">
                        Matières attribuées ({newSubjects.length} sélectionnée{newSubjects.length > 1 ? 's' : ''})
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {SUBJECTS.map(subj => (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => toggleSubject(subj)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                              newSubjects.includes(subj)
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                            }`}
                          >
                            {subj}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={editingUser ? handleUpdateTeacher : handleCreateTeacher}
                        disabled={savingUser}
                        className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition"
                      >
                        {savingUser ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {editingUser ? 'Enregistrer' : 'Créer l\'enseignant'}
                      </button>
                      <button
                        onClick={cancelUserForm}
                        className="px-5 py-2 bg-white border border-slate-300 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* Users list */}
                {usersLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
                    <Loader2 size={16} className="animate-spin" /> Chargement...
                  </div>
                ) : usersError ? (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
                    {usersError}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {users.length === 0 ? (
                      <p className="text-slate-400 text-sm text-center py-8">Aucun utilisateur</p>
                    ) : (
                      users.map(user => (
                        <div key={user.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                            user.role === 'admin' ? 'bg-gradient-to-br from-slate-700 to-slate-900' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                          }`}>
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-semibold text-slate-800 text-sm">{user.displayName}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                                user.role === 'admin'
                                  ? 'bg-slate-100 text-slate-700 border-slate-300'
                                  : 'bg-blue-100 text-blue-700 border-blue-200'
                              }`}>
                                {user.role === 'admin' ? '👑 Admin' : '👨‍🏫 Enseignant'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400">@{user.username}</p>
                            {user.subjects && user.subjects.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {user.subjects.map(s => (
                                  <span key={s} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                            {user.role === 'admin' && (
                              <p className="text-xs text-slate-400 mt-1">Accès complet à toutes les matières</p>
                            )}
                          </div>
                          {user.role !== 'admin' && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => startEditUser(user)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                title="Modifier"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteTeacher(user)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: REQUESTS ════════════════════════════════════════════════ */}
            {activeTab === 'requests' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <Bell size={16} /> Demandes de modification
                  </h3>
                  <div className="flex gap-2">
                    {(['all', 'pending', 'approved', 'rejected', 'completed'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setRequestFilter(f === 'all' ? '' : f)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                          (f === 'all' && requestFilter === '') || requestFilter === f
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {f === 'all' ? 'Toutes' : f === 'pending' ? 'En attente' : f === 'approved' ? 'Approuvées' : f === 'rejected' ? 'Refusées' : 'Terminées'}
                      </button>
                    ))}
                    <button onClick={loadRequests} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition" title="Actualiser">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>

                {requestsLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
                    <Loader2 size={16} className="animate-spin" /> Chargement...
                  </div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Bell size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Aucune demande {requestFilter === 'pending' ? 'en attente' : ''}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map(req => (
                      <RequestCard
                        key={req.id}
                        request={req}
                        onApprove={(note) => handleRequestAction(req.id!, 'approved', note)}
                        onReject={(note) => handleRequestAction(req.id!, 'rejected', note)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══ TAB: DATA ════════════════════════════════════════════════════ */}
            {activeTab === 'data' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    <Database className="text-indigo-600" size={20} /> Sauvegarde et Restauration Complète
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Exportez et importez toutes vos données (Unités, Matières, Classes, Enseignants, Projets Interdisciplinaires, SEA, Évaluations, Critères IB et Calendriers) dans un seul fichier Excel sécurisé.
                  </p>
                </div>

                {/* Export Card - EXCEL */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-emerald-900 text-base mb-1.5 flex items-center gap-2">
                        <FileSpreadsheet className="text-emerald-700" size={20} /> Sauvegarde Complète — Format Excel (.xlsx)
                      </h4>
                      <p className="text-sm text-emerald-800 mb-4 max-w-xl">
                        Génère un classeur Excel multi-feuilles avec l'intégralité des données de votre établissement. Vous pourrez réimporter ce fichier à tout moment sans perte d'information, même en cas de changement de cluster MongoDB ou de réinitialisation.
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-emerald-700 font-medium mb-4">
                        <span className="bg-emerald-100/80 px-2.5 py-1 rounded-md">✓ Unités PEI</span>
                        <span className="bg-emerald-100/80 px-2.5 py-1 rounded-md">✓ Projets Interdisciplinaires</span>
                        <span className="bg-emerald-100/80 px-2.5 py-1 rounded-md">✓ Évaluations & SEA</span>
                        <span className="bg-emerald-100/80 px-2.5 py-1 rounded-md">✓ Comptes Enseignants</span>
                        <span className="bg-emerald-100/80 px-2.5 py-1 rounded-md">✓ Critères IB & Calendriers</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleExportExcelAll}
                      disabled={exportLoading}
                      className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition"
                    >
                      {exportLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> {exportProgressMsg || 'Exportation en cours...'}
                        </>
                      ) : (
                        <>
                          <Download size={16} /> Sauvegarde Complète (Excel .xlsx)
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleExportCSVAll}
                      disabled={exportLoading}
                      className="flex items-center gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition"
                      title="Sauvegarde complète au format standard CSV (UTF-8 avec BOM)"
                    >
                      <Download size={16} /> Sauvegarde Complète (CSV .csv)
                    </button>

                    {onExportCSV && (
                      <button
                        onClick={onExportCSV}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-semibold shadow-sm transition"
                        title="Export simple au format CSV"
                      >
                        <FileText size={14} /> Export CSV Simple
                      </button>
                    )}
                  </div>
                </div>

                {/* Import Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-6 shadow-sm">
                  <h4 className="font-bold text-indigo-900 text-base mb-1.5 flex items-center gap-2">
                    <Upload className="text-indigo-700" size={20} /> Restauration & Import — Excel (.xlsx) / CSV (.csv)
                  </h4>
                  <p className="text-sm text-indigo-800 mb-3 max-w-xl">
                    Restaurez instantanément l'ensemble de vos données depuis un fichier Excel (<code>.xlsx</code>) ou CSV (<code>.csv</code>). Le système analyse automatiquement les colonnes, remplace les unités et plans sans créer de doublons, et réinjecte toutes les données dans votre base.
                  </p>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4 text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Sécurité des données :</span> L'import consolide et restaure les données sans écraser arbitrairement les informations existantes. Idéal pour synchroniser un nouveau cluster de base de données.
                    </div>
                  </div>

                  <input
                    ref={importRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleImportFile}
                    className="hidden"
                  />

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => importRef.current?.click()}
                      disabled={importStatus === 'loading'}
                      className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition"
                    >
                      {importStatus === 'loading' ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> {importMessage || 'Restauration en cours...'}
                        </>
                      ) : (
                        <>
                          <Upload size={16} /> Sélectionner un fichier de sauvegarde (.xlsx / .csv)
                        </>
                      )}
                    </button>
                  </div>

                  {/* Progress bar */}
                  {importProgress && (
                    <div className="mt-4 bg-white border border-indigo-100 rounded-xl p-3 shadow-sm">
                      <div className="flex justify-between text-xs font-semibold text-indigo-800 mb-1">
                        <span>{importProgress.step}</span>
                        <span>{importProgress.percent}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${importProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Résultat import */}
                  {importStatus === 'success' && (
                    <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
                      <div className="flex items-start gap-2.5">
                        <CheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">{importMessage}</p>
                          {importStats && (
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-medium">
                              <span className="bg-emerald-100/70 p-2 rounded-lg text-emerald-800">
                                📘 Unités : <strong>{importStats.units}</strong>
                              </span>
                              <span className="bg-emerald-100/70 p-2 rounded-lg text-emerald-800">
                                🔗 Interdisciplinaire : <strong>{importStats.interdisciplinary}</strong>
                              </span>
                              <span className="bg-emerald-100/70 p-2 rounded-lg text-emerald-800">
                                🌿 SEA : <strong>{importStats.sea}</strong>
                              </span>
                              <span className="bg-emerald-100/70 p-2 rounded-lg text-emerald-800">
                                👥 Enseignants : <strong>{importStats.users}</strong>
                              </span>
                              <span className="bg-emerald-100/70 p-2 rounded-lg text-emerald-800">
                                📝 Examens : <strong>{importStats.exams}</strong>
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {importStatus === 'error' && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-2.5">
                      <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Erreur de restauration</p>
                        <p className="text-xs mt-0.5">{importMessage}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 space-y-2">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <FileSpreadsheet size={15} className="text-slate-700" /> Structure du fichier de sauvegarde Excel
                  </h4>
                  <p>
                    Le fichier <code>.xlsx</code> généré comprend plusieurs feuilles structurées avec les métadonnées complètes et la charge utile brute :
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600 pl-2">
                    <li><strong>Unités PEI</strong> : Titres, matières, niveaux de classes, enseignants, concepts clés, contextes mondiaux, énoncés, questions, objectifs, ATL, évaluations et critères.</li>
                    <li><strong>Interdisciplinaire</strong> : Titres, matières impliquées, intégration conceptuelle et déroulement.</li>
                    <li><strong>SEA (Service et Action)</strong> : Résultats d'apprentissage, étapes, objectifs et réflexions.</li>
                    <li><strong>Enseignants & Rôles</strong> : Liste des comptes enseignants, matières assignées et statuts d'accès.</li>
                    <li><strong>Examens & Évaluations Critériées</strong> : Questions, barèmes, critères et points.</li>
                  </ul>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: RequestCard
// ─────────────────────────────────────────────────────────────────────────────

interface RequestCardProps {
  request: ModificationRequest;
  onApprove: (note: string) => void;
  onReject: (note: string) => void;
}

const RequestCard: React.FC<RequestCardProps> = ({ request, onApprove, onReject }) => {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  const handleConfirm = () => {
    if (action === 'approve') onApprove(note);
    else if (action === 'reject') onReject(note);
    setShowNote(false);
    setNote('');
    setAction(null);
  };

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm ${
      request.status === 'pending' ? 'border-yellow-200' :
      request.status === 'approved' ? 'border-green-200' :
      request.status === 'rejected' ? 'border-red-200' : 'border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{request.teacherDisplayName}</span>
            <span className="text-slate-400 text-xs">·</span>
            <span className="text-xs text-indigo-600 font-medium">{request.subject}</span>
            {request.grade && <><span className="text-slate-400 text-xs">·</span><span className="text-xs text-slate-500">{request.grade}</span></>}
            <StatusBadgeLocal status={request.status} />
          </div>
          <p className="text-sm font-medium text-slate-700 mb-1">
            📄 {request.unitTitle}
          </p>
          <p className="text-xs text-slate-500 line-clamp-2">{request.description}</p>
          <p className="text-xs text-slate-400 mt-1">{new Date(request.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          {request.adminNote && (
            <p className="text-xs text-slate-600 mt-1 italic bg-slate-50 rounded p-1.5 border border-slate-200">
              📝 Note : {request.adminNote}
            </p>
          )}
        </div>

        {request.status === 'pending' && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => { setAction('approve'); setShowNote(true); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition"
            >
              <CheckCircle size={12} /> Approuver
            </button>
            <button
              onClick={() => { setAction('reject'); setShowNote(true); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition"
            >
              <XCircle size={12} /> Refuser
            </button>
          </div>
        )}
      </div>

      {showNote && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Note pour l'enseignant (optionnel)
          </label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ex: Approuvé, vous pouvez modifier la section évaluation"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-indigo-300 outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white transition ${
                action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {action === 'approve' ? <><CheckCircle size={12} /> Confirmer l'approbation</> : <><XCircle size={12} /> Confirmer le refus</>}
            </button>
            <button
              onClick={() => { setShowNote(false); setNote(''); setAction(null); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function StatusBadgeLocal({ status }: { status: string }) {
  const config: Record<string, { cls: string; label: string }> = {
    pending: { cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: '⏳ En attente' },
    approved: { cls: 'bg-green-100 text-green-800 border-green-200', label: '✅ Approuvée' },
    rejected: { cls: 'bg-red-100 text-red-800 border-red-200', label: '❌ Refusée' },
    completed: { cls: 'bg-blue-100 text-blue-800 border-blue-200', label: '✔️ Terminée' },
  };
  const c = config[status] || config.pending;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>;
}

export default AdminPanel;
