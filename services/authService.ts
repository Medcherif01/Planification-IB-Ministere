// ─────────────────────────────────────────────────────────────────────────────
// Service d'authentification — gère connexion, session, permissions
// Supporte : admin complet + enseignants avec matières assignées
// ─────────────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  username: string;
  role: 'admin' | 'teacher';
  displayName: string;
  subjects: string[]; // Matières attribuées (vide = tout pour admin)
}

export interface ModificationRequest {
  id?: string;
  teacherUsername: string;
  teacherDisplayName: string;
  subject: string;
  grade: string;
  unitId: string;
  unitTitle: string;
  requestType: 'modification' | 'deletion' | 'creation';
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: string;
  updatedAt?: string;
  adminNote?: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  completedAt?: string | null;
  previousPlan?: any | null;
  newPlan?: any | null;
  appliedImmediately?: boolean;
}

// ── Session management ────────────────────────────────────────────────────────

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem('currentUser');
    const username = localStorage.getItem('userUsername') || '';
    const normUser = username.trim().toLowerCase();
    let parsedUser = '';
    try {
      parsedUser = raw ? (JSON.parse(raw)?.username || '').trim().toLowerCase() : '';
    } catch {}

    if (
      normUser === 'mohamed' || normUser === 'alkawthar' ||
      parsedUser === 'mohamed' || parsedUser === 'alkawthar'
    ) {
      setCurrentUser(null);
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return null;
    }
    if (!raw) return null;
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: AppUser | null): void {
  if (user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('userRole', user.role);
    localStorage.setItem('userName', user.displayName);
    localStorage.setItem('userUsername', user.username);
  } else {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userUsername');
  }
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function isTeacher(): boolean {
  const user = getCurrentUser();
  return user?.role === 'teacher';
}

export function canAccessSubject(subject: string): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.subjects.includes(subject);
}

export function canEdit(): boolean {
  return isAdmin() || isTeacher(); // Les enseignants peuvent modifier/ajouter/supprimer directement (avec validation/annulation admin a posteriori)
}

export function canExportAll(): boolean {
  return isAdmin();
}

export function canRegenerateAll(): boolean {
  return isAdmin();
}

// ── API calls ─────────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const user = getCurrentUser();
  return {
    'Content-Type': 'application/json',
    'X-User-Role': user?.role || 'anonymous',
    'X-Username': user?.username || '',
  };
}

export async function loginUser(username: string, password: string): Promise<AppUser> {
  const normUser = (username || '').trim().toLowerCase();
  // Alkawthar n'a plus d'accès admin ni utilisateur, seul Mohamed2020 est administrateur
  if (normUser === 'alkawthar' || normUser === 'mohamed') {
    throw new Error('Identifiants incorrects');
  }

  // Try MongoDB API first
  try {
    const response = await fetch('/api/users?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (response.ok) {
      const data = await response.json();
      return data.user as AppUser;
    }
    if (response.status === 401) {
      throw new Error('Identifiants incorrects');
    }
  } catch (e: any) {
    if (e.message === 'Identifiants incorrects') throw e;
    // Fall through to local fallback
    console.warn('[Auth] API non disponible, essai en local:', e.message);
  }

  // Fallback local credentials (Mohamed2020 uniquement comme administrateur)
  const LOCAL_USERS: AppUser[] = [
    { id: 'local-admin', username: 'Mohamed2020', role: 'admin', displayName: 'Mohamed (Administrateur)', subjects: [] },
  ];
  const LOCAL_PASSWORDS: Record<string, string> = {
    'Mohamed2020': '120786Mmed',
  };

  const user = LOCAL_USERS.find(u => u.username === username);
  if (user && LOCAL_PASSWORDS[username] === password) {
    return user;
  }
  throw new Error('Identifiants incorrects');
}

// ── User management (admin only) ─────────────────────────────────────────────

export async function listUsers(): Promise<AppUser[]> {
  const response = await fetch('/api/users', { headers: getAuthHeaders() });
  if (!response.ok) throw new Error('Impossible de charger la liste des utilisateurs');
  const data = await response.json();
  return data as AppUser[];
}

export async function createTeacher(data: {
  username: string;
  password: string;
  displayName: string;
  subjects: string[];
}): Promise<string> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Erreur lors de la création');
  }
  const result = await response.json();
  return result.id;
}

export async function updateTeacher(id: string, data: Partial<{
  username: string;
  password: string;
  displayName: string;
  subjects: string[];
  isActive: boolean;
}>): Promise<void> {
  const response = await fetch(`/api/users?id=${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Erreur lors de la modification');
  }
}

export async function deleteTeacher(id: string): Promise<void> {
  const response = await fetch(`/api/users?id=${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Erreur lors de la suppression');
  }
}

// ── Modification requests ─────────────────────────────────────────────────────

const LOCAL_MOD_REQUESTS_KEY = 'myp_modification_requests_local';

function loadLocalModRequests(): ModificationRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_MOD_REQUESTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalModRequests(requests: ModificationRequest[]): void {
  try {
    const rawJson = JSON.stringify(requests).replace(
      /"data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]{10000,}"/g,
      '""'
    );
    localStorage.setItem(LOCAL_MOD_REQUESTS_KEY, rawJson);
  } catch (e) {
    console.warn('Avertissement sauvegarde locale modification_requests:', e);
  }
}

export async function createModificationRequest(data: Omit<ModificationRequest, 'id' | 'status' | 'createdAt'>): Promise<string> {
  // Sauvegarder aussi dans localStorage pour garantir la persistance des snapshots previousPlan/newPlan
  const localList = loadLocalModRequests();
  let coalescedLocalId: string | null = null;
  if (data.appliedImmediately && data.unitId) {
    const existingPending = localList.find(
      r => r.status === 'pending' && r.unitId === data.unitId && r.subject === data.subject && r.grade === (data.grade || '')
    );
    if (existingPending) {
      coalescedLocalId = existingPending.id || null;
      existingPending.unitTitle = data.unitTitle || existingPending.unitTitle;
      existingPending.description = data.description;
      existingPending.updatedAt = new Date().toISOString();
      if (existingPending.requestType === 'creation' && data.requestType === 'modification') {
        existingPending.newPlan = data.newPlan ?? existingPending.newPlan;
      } else if (existingPending.requestType === 'modification' && data.requestType === 'modification') {
        existingPending.newPlan = data.newPlan ?? existingPending.newPlan;
      } else if (data.requestType === 'deletion') {
        existingPending.previousPlan = existingPending.previousPlan || existingPending.newPlan || data.previousPlan || null;
        existingPending.newPlan = null;
        existingPending.requestType = 'deletion';
      }
      saveLocalModRequests(localList);
    }
  }

  try {
    const response = await fetch('/api/modification-requests', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (response.ok) {
      const result = await response.json();
      const serverId = result.id || coalescedLocalId || `req_${Date.now()}`;
      if (!coalescedLocalId) {
        localList.unshift({
          ...data,
          id: serverId,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        saveLocalModRequests(localList);
      } else {
        const match = localList.find(r => r.id === coalescedLocalId);
        if (match) match.id = serverId;
        saveLocalModRequests(localList);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('modification_requests_updated'));
      }
      return serverId;
    }
  } catch (e) {
    console.warn('[ModificationRequest] Fallback local:', e);
  }

  const fallbackId = coalescedLocalId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  if (!coalescedLocalId) {
    localList.unshift({
      ...data,
      id: fallbackId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    saveLocalModRequests(localList);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('modification_requests_updated'));
  }
  return fallbackId;
}

export async function listModificationRequests(status?: string): Promise<ModificationRequest[]> {
  const localList = loadLocalModRequests();
  try {
    const url = status ? `/api/modification-requests?status=${status}` : '/api/modification-requests';
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (response.ok) {
      const serverList: ModificationRequest[] = await response.json();
      // Fusionner avec localList pour enrichir previousPlan/newPlan ou les demandes créées hors-ligne
      const mergedMap = new Map<string, ModificationRequest>();
      for (const sReq of serverList) {
        const key = sReq.id || `${sReq.unitId}_${sReq.createdAt}`;
        const localMatch = localList.find(
          l => l.id === sReq.id || (l.unitId && l.unitId === sReq.unitId && l.status === sReq.status)
        );
        mergedMap.set(key, {
          ...localMatch,
          ...sReq,
          previousPlan: sReq.previousPlan || localMatch?.previousPlan || null,
          newPlan: sReq.newPlan || localMatch?.newPlan || null,
          appliedImmediately: sReq.appliedImmediately ?? localMatch?.appliedImmediately ?? false,
        });
      }
      for (const lReq of localList) {
        const key = lReq.id || `${lReq.unitId}_${lReq.createdAt}`;
        if (!mergedMap.has(key) && !Array.from(mergedMap.values()).some(r => r.unitId && r.unitId === lReq.unitId && r.status === 'pending' && lReq.status === 'pending')) {
          mergedMap.set(key, lReq);
        }
      }
      let result = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      if (status) {
        result = result.filter(r => r.status === status);
      }
      return result;
    }
  } catch (e) {
    console.warn('[listModificationRequests] Utilisation du cache local:', e);
  }
  return status ? localList.filter(r => r.status === status) : localList;
}

export async function updateRequestStatus(id: string, status: string, adminNote?: string): Promise<void> {
  // Mettre à jour dans localStorage
  const localList = loadLocalModRequests();
  const targetLocal = localList.find(r => r.id === id);
  if (targetLocal) {
    targetLocal.status = status as ModificationRequest['status'];
    if (adminNote !== undefined) targetLocal.adminNote = adminNote;
    if (status === 'approved') targetLocal.approvedAt = new Date().toISOString();
    if (status === 'rejected') targetLocal.rejectedAt = new Date().toISOString();
    if (status === 'completed') targetLocal.completedAt = new Date().toISOString();
    saveLocalModRequests(localList);
  }

  try {
    const response = await fetch(`/api/modification-requests?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status, adminNote }),
    });
    if (!response.ok && !targetLocal) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Erreur lors de la mise à jour');
    }
  } catch (e) {
    if (!targetLocal) throw e;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('modification_requests_updated'));
  }
}

/**
 * Construit un résumé lisible des changements effectués sur une unité
 */
function buildUnitChangeSummary(
  requestType: 'modification' | 'creation' | 'deletion',
  unitTitle: string,
  previousPlan?: any | null,
  newPlan?: any | null
): string {
  if (requestType === 'creation') {
    return `Ajout d'une nouvelle unité « ${unitTitle || 'Sans titre'} » (appliqué immédiatement par l'enseignant, en attente de confirmation par l'administrateur).`;
  }
  if (requestType === 'deletion') {
    return `Suppression de l'unité « ${unitTitle || 'Sans titre'} » (appliquée immédiatement par l'enseignant, annulable par l'administrateur).`;
  }
  const changedFields: string[] = [];
  if (previousPlan && newPlan) {
    if ((previousPlan.title || '') !== (newPlan.title || '')) {
      changedFields.push(`Titre (« ${previousPlan.title || ''} » → « ${newPlan.title || ''} »)`);
    }
    if ((previousPlan.statementOfInquiry || '') !== (newPlan.statementOfInquiry || '')) {
      changedFields.push('Énoncé de recherche');
    }
    if ((previousPlan.chapters || '') !== (newPlan.chapters || '') || (previousPlan.content || '') !== (newPlan.content || '')) {
      changedFields.push('Chapitres & leçons');
    }
    if ((previousPlan.keyConcept || '') !== (newPlan.keyConcept || '') || JSON.stringify(previousPlan.relatedConcepts || []) !== JSON.stringify(newPlan.relatedConcepts || [])) {
      changedFields.push('Concepts (clé / connexes)');
    }
    if ((previousPlan.globalContext || '') !== (newPlan.globalContext || '')) {
      changedFields.push('Contexte mondial');
    }
    if ((previousPlan.duration || '') !== (newPlan.duration || '')) {
      changedFields.push(`Durée (${newPlan.duration || ''})`);
    }
    if (JSON.stringify(previousPlan.objectives || []) !== JSON.stringify(newPlan.objectives || '') || JSON.stringify(previousPlan.objectivesDetails || []) !== JSON.stringify(newPlan.objectivesDetails || [])) {
      changedFields.push('Critères & objectifs spécifiques IB');
    }
    if (JSON.stringify(previousPlan.assessments || []) !== JSON.stringify(newPlan.assessments || [])) {
      changedFields.push('Évaluations critériées');
    }
    if (JSON.stringify(previousPlan.inquiryQuestions || {}) !== JSON.stringify(newPlan.inquiryQuestions || {})) {
      changedFields.push('Questions de recherche');
    }
    if (
      JSON.stringify(previousPlan.sessions || []) !== JSON.stringify(newPlan.sessions || []) ||
      JSON.stringify(previousPlan.learningProcess || {}) !== JSON.stringify(newPlan.learningProcess || {}) ||
      JSON.stringify(previousPlan.differentiationDetails || {}) !== JSON.stringify(newPlan.differentiationDetails || {}) ||
      JSON.stringify(previousPlan.reflectionDetails || {}) !== JSON.stringify(newPlan.reflectionDetails || {})
    ) {
      changedFields.push('Détails pédagogiques & séances');
    }
  }
  const detailText = changedFields.length > 0 ? ` — Éléments modifiés : ${changedFields.join(', ')}` : '';
  return `Modification de l'unité « ${unitTitle || 'Sans titre'} »${detailText} (appliquée immédiatement, en attente de validation admin).`;
}

/**
 * Enregistre automatiquement toute modification / création / suppression d'unité faite par un enseignant
 * sans bloquer l'enseignant, afin que l'administrateur puisse l'accepter ou l'annuler (restaurer l'état précédent).
 */
export async function recordTeacherUnitChange(params: {
  user?: AppUser | null;
  subject: string;
  grade: string;
  requestType: 'modification' | 'creation' | 'deletion';
  unitId: string;
  unitTitle: string;
  description?: string;
  previousPlan?: any | null;
  newPlan?: any | null;
}): Promise<void> {
  const effectiveUser = params.user || getCurrentUser();
  // Seuls les enseignants génèrent une demande de validation a posteriori (l'admin valide directement)
  if (!effectiveUser || effectiveUser.role !== 'teacher') {
    return;
  }

  const summary = params.description || buildUnitChangeSummary(
    params.requestType,
    params.unitTitle,
    params.previousPlan,
    params.newPlan
  );

  try {
    await createModificationRequest({
      teacherUsername: effectiveUser.username || 'enseignant',
      teacherDisplayName: effectiveUser.displayName || effectiveUser.username || 'Enseignant',
      subject: params.subject,
      grade: params.grade,
      unitId: params.unitId,
      unitTitle: params.unitTitle || 'Sans titre',
      requestType: params.requestType,
      description: summary,
      adminNote: '',
      approvedAt: null,
      rejectedAt: null,
      completedAt: null,
      previousPlan: params.previousPlan || null,
      newPlan: params.newPlan || null,
      appliedImmediately: true,
    });
  } catch (err) {
    console.warn('Impossible d\'enregistrer la notification de modification pour l\'admin:', err);
  }
}

export function hasApprovedRequest(unitId: string): boolean {
  // Check localStorage cache for approved requests
  try {
    const raw = localStorage.getItem('approvedRequests');
    if (!raw) return false;
    const approved: string[] = JSON.parse(raw);
    return approved.includes(unitId);
  } catch {
    return false;
  }
}
