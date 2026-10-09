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
  section?: 'Garçons' | 'Filles' | 'Mixte'; // Section attribuée (Garçons, Filles ou Mixte)
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
  adminNote?: string;
  approvedAt?: string | null;
  completedAt?: string | null;
}

// ── Session management ────────────────────────────────────────────────────────

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem('currentUser');
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
  return isAdmin(); // Teachers must request, only admin can edit directly
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

  // Fallback local credentials
  const LOCAL_USERS: AppUser[] = [
    { id: 'local-admin', username: 'Mohamed', role: 'admin', displayName: 'Mohamed (Administrateur)', subjects: [], section: 'Mixte' },
    { id: 'local-admin2', username: 'Alkawthar', role: 'admin', displayName: 'Administrateur', subjects: [], section: 'Mixte' },
    // Enseignants Section Garçons
    { id: 'teacher-majed', username: 'Majed', role: 'teacher', displayName: 'Majed (Études Islamiques)', subjects: ['Individus et sociétés'], section: 'Garçons' },
    { id: 'teacher-anouar', username: 'Anouar', role: 'teacher', displayName: 'Anouar (Design)', subjects: ['Design'], section: 'Garçons' },
    { id: 'teacher-mali', username: 'MohamedAli', role: 'teacher', displayName: 'Mohamed Ali (EPS)', subjects: ['Éducation physique et à la santé'], section: 'Garçons' },
    { id: 'teacher-imad', username: 'Imad', role: 'teacher', displayName: 'Imad (Langue Arabe)', subjects: ['Langue et littérature'], section: 'Garçons' },
    { id: 'teacher-kenneh', username: 'Kenneh', role: 'teacher', displayName: 'Kenneh (Anglais)', subjects: ['Acquisition de langues'], section: 'Garçons' },
    { id: 'teacher-youssef', username: 'Youssef', role: 'teacher', displayName: 'Youssef (L.L - Section Garçons)', subjects: ['Langue et littérature'], section: 'Garçons' },
    { id: 'teacher-karim', username: 'Karim', role: 'teacher', displayName: 'Karim (Sciences)', subjects: ['Sciences'], section: 'Garçons' },
    // Enseignantes Section Filles
    { id: 'teacher-nesrine', username: 'Nesrine', role: 'teacher', displayName: 'Nesrine (L.L - Section Filles)', subjects: ['Langue et littérature'], section: 'Filles' },
    { id: 'teacher-samira', username: 'Samira', role: 'teacher', displayName: 'Samira (Maths - Section Filles)', subjects: ['Mathématiques'], section: 'Filles' },
    { id: 'teacher-fatima', username: 'Fatima', role: 'teacher', displayName: 'Fatima (Études Islamiques - Filles)', subjects: ['Individus et sociétés'], section: 'Filles' },
    { id: 'teacher-hajar', username: 'Hajar', role: 'teacher', displayName: 'Hajar (Langue Arabe - Filles)', subjects: ['Langue et littérature'], section: 'Filles' },
  ];
  const LOCAL_PASSWORDS: Record<string, string> = {
    'Mohamed': 'Alkawthar86',
    'Alkawthar': 'Alkawthar@7786',
    'Majed': 'Alkawthar2024',
    'Anouar': 'Alkawthar2024',
    'MohamedAli': 'Alkawthar2024',
    'Imad': 'Alkawthar2024',
    'Kenneh': 'Alkawthar2024',
    'Youssef': 'Alkawthar2024',
    'Karim': 'Alkawthar2024',
    'Nesrine': 'Alkawthar2024',
    'Samira': 'Alkawthar2024',
    'Fatima': 'Alkawthar2024',
    'Hajar': 'Alkawthar2024',
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
  section?: 'Garçons' | 'Filles' | 'Mixte';
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
  section?: 'Garçons' | 'Filles' | 'Mixte';
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

export async function createModificationRequest(data: Omit<ModificationRequest, 'id' | 'status' | 'createdAt'>): Promise<string> {
  const response = await fetch('/api/modification-requests', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Erreur lors de l\'envoi de la demande');
  }
  const result = await response.json();
  return result.id;
}

export async function listModificationRequests(status?: string): Promise<ModificationRequest[]> {
  const url = status ? `/api/modification-requests?status=${status}` : '/api/modification-requests';
  const response = await fetch(url, { headers: getAuthHeaders() });
  if (!response.ok) throw new Error('Impossible de charger les demandes');
  return await response.json();
}

export async function updateRequestStatus(id: string, status: string, adminNote?: string): Promise<void> {
  const response = await fetch(`/api/modification-requests?id=${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status, adminNote }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Erreur lors de la mise à jour');
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
