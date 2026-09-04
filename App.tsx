import React, { useState, useEffect } from 'react';
import { UnitPlan, AppView, AppMode } from './types';
import Dashboard from './components/Dashboard';
import UnitPlanForm from './components/UnitPlanForm';
import AuthenticationScreen from './components/AuthenticationScreen';
import HomeScreen from './components/HomeScreen';
import ExamsWizard from './components/ExamsWizard';
import ErrorBoundary from './components/ErrorBoundary';
import { sanitizeUnitPlan } from './services/geminiService';
import { loadPlansFromDatabase, savePlansToDatabase, migrateLocalStorageToMongoDB, needsMigration, cleanupInvalidLocalStorageKeys } from './services/databaseService';
import { mergePlansWithReplacement, deduplicatePlans } from './services/excelBackupService';
import { getCurrentUser, setCurrentUser, type AppUser } from './services/authService';

// ─── Initialisation synchrone depuis localStorage ───────────────────────────
function getInitialAuthState(): boolean {
  try {
    return localStorage.getItem('isAuthenticated') === 'true';
  } catch { return false; }
}

function getInitialSession(): { subject: string; grade: string; mode?: AppMode } | null {
  try {
    const raw = localStorage.getItem('userSession');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getInitialView(
  authenticated: boolean,
  session: { subject: string; grade: string; mode?: AppMode } | null
): AppView {
  if (!authenticated) return AppView.LOGIN;
  try {
    const savedView = localStorage.getItem('currentView') as AppView | null;
    if (savedView && savedView !== AppView.LOGIN && savedView !== AppView.EDITOR) {
      return savedView;
    }
    if (session?.mode === AppMode.EXAMS) return AppView.EXAMS_WIZARD;
    if (session?.mode === AppMode.PEI_PLANNER && session.subject && session.grade) {
      return AppView.DASHBOARD;
    }
    return AppView.HOME;
  } catch { return AppView.HOME; }
}

// ─────────────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => getInitialAuthState());
  const [currentUser, setCurrentUserState] = useState<AppUser | null>(() =>
    getInitialAuthState() ? getCurrentUser() : null
  );
  const [session, setSession] = useState<{ subject: string; grade: string; mode?: AppMode } | null>(
    () => (getInitialAuthState() ? getInitialSession() : null)
  );
  const [view, setView] = useState<AppView>(() => {
    const auth = getInitialAuthState();
    const sess = auth ? getInitialSession() : null;
    return getInitialView(auth, sess);
  });

  const [currentPlans, setCurrentPlans] = useState<UnitPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<UnitPlan | undefined>(undefined);
  const [migrationDone, setMigrationDone] = useState(false);

  // Migration automatique au démarrage
  useEffect(() => {
    const runMigration = async () => {
      if (migrationDone) return;
      try {
        cleanupInvalidLocalStorageKeys();
        if (needsMigration()) {
          const result = await migrateLocalStorageToMongoDB();
          console.log(`✅ Migration: ${result.migrated} planification(s) migrée(s)`);
        }
        setMigrationDone(true);
      } catch (error) {
        console.error('❌ Erreur migration:', error);
        setMigrationDone(true);
      }
    };
    runMigration();
  }, []);

  // Charger les plans quand la session change
  useEffect(() => {
    if (session && session.subject && session.grade) {
      const loadPlans = async () => {
        try {
          const plans = await loadPlansFromDatabase(session.subject, session.grade);
          const sanitizedPlans = plans.map(p => sanitizeUnitPlan(p, session.subject, session.grade));
          setCurrentPlans(sanitizedPlans);
        } catch (error) {
          console.error('❌ Erreur chargement plans:', error);
        }
      };
      loadPlans();
    }
  }, [session]);

  // Sauvegarder automatiquement quand les plans changent
  useEffect(() => {
    if (session && session.subject && session.grade && currentPlans.length > 0) {
      const savePlans = async () => {
        try {
          await savePlansToDatabase(session.subject, session.grade, currentPlans);
        } catch (error) {
          console.error('❌ Erreur sauvegarde plans:', error);
        }
      };
      savePlans();
    }
  }, [currentPlans, session]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAuthenticated = () => {
    setIsAuthenticated(true);
    const user = getCurrentUser();
    setCurrentUserState(user);
    const savedSession = getInitialSession();
    const savedView = localStorage.getItem('currentView') as AppView | null;

    if (savedSession && savedSession.mode === AppMode.EXAMS) {
      setSession(savedSession);
      setView(AppView.EXAMS_WIZARD);
    } else if (
      savedSession && savedSession.mode === AppMode.PEI_PLANNER &&
      savedSession.subject && savedSession.grade && savedView === AppView.DASHBOARD
    ) {
      // Check if teacher can access this subject
      if (user?.role === 'admin' || user?.subjects?.includes(savedSession.subject)) {
        setSession(savedSession);
        setView(AppView.DASHBOARD);
      } else {
        setView(AppView.HOME);
        localStorage.setItem('currentView', AppView.HOME);
      }
    } else {
      setView(AppView.HOME);
      localStorage.setItem('currentView', AppView.HOME);
    }
  };

  const handleSelectSubjectGrade = (subject: string, grade: string, mode: AppMode) => {
    // Check permission for teachers
    if (currentUser?.role === 'teacher' && !currentUser.subjects.includes(subject)) {
      alert(`Accès refusé : vous n'êtes pas autorisé à accéder à la matière "${subject}".`);
      return;
    }
    if (mode === AppMode.EXAMS) {
      const sessionData = { subject: '', grade: '', mode };
      setSession(sessionData);
      setView(AppView.EXAMS_WIZARD);
      localStorage.setItem('userSession', JSON.stringify(sessionData));
      localStorage.setItem('currentView', AppView.EXAMS_WIZARD);
    } else {
      const sessionData = { subject, grade, mode };
      setSession(sessionData);
      setView(AppView.DASHBOARD);
      localStorage.setItem('userSession', JSON.stringify(sessionData));
      localStorage.setItem('currentView', AppView.DASHBOARD);
    }
  };

  const handleBackToHome = () => {
    setSession(null);
    setCurrentPlans([]);
    setView(AppView.HOME);
    localStorage.removeItem('userSession');
    localStorage.setItem('currentView', AppView.HOME);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('authTimestamp');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userUsername');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userSession');
    localStorage.removeItem('currentView');
    setIsAuthenticated(false);
    setCurrentUserState(null);
    setSession(null);
    setCurrentPlans([]);
    setView(AppView.LOGIN);
  };

  const handleGoToExams = () => {
    const sessionData = { subject: '', grade: '', mode: AppMode.EXAMS };
    setSession(sessionData);
    setView(AppView.EXAMS_WIZARD);
    localStorage.setItem('userSession', JSON.stringify(sessionData));
    localStorage.setItem('currentView', AppView.EXAMS_WIZARD);
  };

  const handleCreateNew = () => {
    // Only admin can create freely; teachers need approval (but we allow for now via request flow)
    setEditingPlan({
      ...sanitizeUnitPlan({}, session?.subject || '', session?.grade || ''),
      teacherName: currentUser?.displayName || '',
      subject: session?.subject || '',
      gradeLevel: session?.grade || '',
    });
    setView(AppView.EDITOR);
    localStorage.setItem('currentView', AppView.EDITOR);
  };

  const handleEdit = (plan: UnitPlan) => {
    // Protection côté serveur : seul admin peut modifier directement
    const user = getCurrentUser();
    if (user?.role === 'teacher') {
      alert('Action refusée : utilisez le bouton "Demander une modification" pour soumettre une demande à l\'administrateur.');
      return;
    }
    const cleanPlan = sanitizeUnitPlan(
      plan,
      plan.subject || session?.subject || '',
      plan.gradeLevel || session?.grade || ''
    );
    setEditingPlan(cleanPlan);
    setView(AppView.EDITOR);
    localStorage.setItem('currentView', AppView.EDITOR);
  };

  const handleDelete = (id: string) => {
    // Protection côté serveur : seul admin peut supprimer directement
    const user = getCurrentUser();
    if (user?.role === 'teacher') {
      alert('Action refusée : vous ne pouvez pas supprimer d\'unité directement. Demandez une suppression via "Demander une modification".');
      return;
    }
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce plan ?')) {
      setCurrentPlans(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleSavePlan = (plan: UnitPlan) => {
    const planToSave = {
      ...plan,
      subject: plan.subject || session?.subject || '',
      gradeLevel: plan.gradeLevel || session?.grade || '',
    };
    setCurrentPlans(prev => mergePlansWithReplacement(prev, [planToSave]));
    setView(AppView.DASHBOARD);
    localStorage.setItem('currentView', AppView.DASHBOARD);
  };

  const handleAddPlans = (newPlans: UnitPlan[]) => {
    if (!session) return;
    if (currentPlans.length > 0) {
      const confirmReplace = window.confirm(
        `⚠️ Une planification existe déjà pour ${session.subject} - ${session.grade}.\n\n` +
        `Voulez-vous REMPLACER l'ancienne planification par la nouvelle ?\n\n` +
        `- OUI: Remplacer complètement\n- NON: Annuler`
      );
      if (!confirmReplace) return;
    }
    const signedPlans = newPlans.map(p => ({
      ...p,
      subject: session.subject,
      gradeLevel: session.grade,
    }));
    setCurrentPlans(deduplicatePlans(signedPlans));
    alert(
      `✅ Planification enregistrée pour ${session.subject} - ${session.grade}\n\n` +
      `${signedPlans.length} unités créées.`
    );
  };

  const handleAddSingleUnit = (plan: UnitPlan) => {
    if (!session) return;
    const signed = { ...plan, subject: session.subject, gradeLevel: session.grade };
    setCurrentPlans(prev => mergePlansWithReplacement(prev, [signed]));
  };

  const handleUpdateUnit = (plan: UnitPlan) => {
    if (!session) return;
    const signed = { ...plan, subject: session.subject, gradeLevel: session.grade };
    setCurrentPlans(prev => mergePlansWithReplacement(prev, [signed]));
  };

  const handleCancel = () => {
    setView(AppView.DASHBOARD);
    localStorage.setItem('currentView', AppView.DASHBOARD);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return <AuthenticationScreen onAuthenticated={handleAuthenticated} />;
  }

  if (view === AppView.HOME) {
    return (
      <HomeScreen
        onSelectSubjectGrade={handleSelectSubjectGrade}
        onLogout={handleLogout}
        onGoToExams={handleGoToExams}
        currentUser={currentUser}
      />
    );
  }

  if (view === AppView.EXAMS_WIZARD) {
    return <ExamsWizard onBack={handleBackToHome} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {view === AppView.DASHBOARD && session ? (
        <Dashboard
          currentSubject={session.subject}
          currentGrade={session.grade}
          plans={currentPlans}
          onCreateNew={handleCreateNew}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAddPlans={handleAddPlans}
          onAddSingleUnit={handleAddSingleUnit}
          onUpdateUnit={handleUpdateUnit}
          onLogout={handleBackToHome}
          currentUser={currentUser}
        />
      ) : (
        <div className="p-4 md:p-8">
          <ErrorBoundary
            fallbackTitle="Erreur lors de l'affichage du formulaire d'unité"
            onReset={handleCancel}
          >
            <UnitPlanForm
              initialPlan={editingPlan || undefined}
              onSave={handleSavePlan}
              onCancel={handleCancel}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
};

export default App;
