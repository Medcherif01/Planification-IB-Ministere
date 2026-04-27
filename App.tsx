import React, { useState, useEffect } from 'react';
import { UnitPlan, AppView, AppMode } from './types';
import Dashboard from './components/Dashboard';
import UnitPlanForm from './components/UnitPlanForm';
import LoginScreen from './components/LoginScreen';
import AuthenticationScreen from './components/AuthenticationScreen';
import ExamsWizard from './components/ExamsWizard';
import { sanitizeUnitPlan } from './services/geminiService';
import { loadPlansFromDatabase, savePlansToDatabase, migrateLocalStorageToMongoDB, needsMigration, cleanupInvalidLocalStorageKeys } from './services/databaseService';

// ─── Initialisation synchrone depuis localStorage ───────────────────────────
// On lit localStorage AVANT le premier render pour éviter tout flash de l'écran
// de connexion quand l'utilisateur est déjà authentifié.
function getInitialAuthState(): boolean {
  try {
    return localStorage.getItem('isAuthenticated') === 'true';
  } catch {
    return false;
  }
}

function getInitialSession(): { subject: string; grade: string; mode?: AppMode } | null {
  try {
    const raw = localStorage.getItem('userSession');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getInitialView(authenticated: boolean, session: { subject: string; grade: string; mode?: AppMode } | null): AppView {
  if (!authenticated) return AppView.LOGIN;
  try {
    const savedView = localStorage.getItem('currentView') as AppView | null;
    // EDITOR n'est pas restaurable (editingPlan non persisté) → DASHBOARD
    if (savedView && savedView !== AppView.LOGIN && savedView !== AppView.EDITOR) {
      return savedView;
    }
    if (session?.mode === AppMode.EXAMS) return AppView.EXAMS_WIZARD;
    if (session?.mode === AppMode.PEI_PLANNER) return AppView.DASHBOARD;
    return AppView.LOGIN; // écran de sélection matière/classe
  } catch {
    return AppView.LOGIN;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  // Initialisation SYNCHRONE (pas de useEffect) → zéro flash au rechargement
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => getInitialAuthState());
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

  // Migration automatique au démarrage de l'application
  useEffect(() => {
    const runMigration = async () => {
      if (migrationDone) return;

      try {
        cleanupInvalidLocalStorageKeys();

        if (needsMigration()) {
          console.log('🚀 Démarrage de la migration automatique localStorage → MongoDB');
          const result = await migrateLocalStorageToMongoDB();
          if (result.migrated > 0) {
            console.log(`✅ Migration réussie : ${result.migrated} planification(s) migrée(s) vers MongoDB`);
          }
          if (result.errors > 0) {
            console.warn(`⚠️ ${result.errors} erreur(s) lors de la migration`);
          }
        } else {
          console.log('✅ Aucune migration nécessaire (localStorage vide ou déjà migré)');
        }

        setMigrationDone(true);
      } catch (error) {
        console.error('❌ Erreur lors de la migration automatique:', error);
        setMigrationDone(true);
      }
    };

    runMigration();
  }, []); // Exécuter une seule fois au montage

  // Charger les plans quand la session change (depuis MongoDB)
  useEffect(() => {
    if (session) {
      const loadPlans = async () => {
        try {
          console.log(`🔄 Chargement des plans depuis MongoDB pour ${session.subject} - ${session.grade}`);
          const plans = await loadPlansFromDatabase(session.subject, session.grade);
          const sanitizedPlans = plans.map(p => sanitizeUnitPlan(p, session.subject, session.grade));
          setCurrentPlans(sanitizedPlans);
          if (sanitizedPlans.length > 0) {
            console.log(`✅ ${sanitizedPlans.length} plan(s) chargé(s) depuis MongoDB`);
          } else {
            console.log('ℹ️ Aucun plan trouvé pour cette matière/classe');
          }
        } catch (error) {
          console.error('❌ Erreur lors du chargement des plans:', error);
        }
      };
      loadPlans();
    }
  }, [session]);

  // Sauvegarder automatiquement quand les plans changent (vers MongoDB)
  useEffect(() => {
    if (session && currentPlans.length > 0) {
      const savePlans = async () => {
        try {
          console.log(`💾 Sauvegarde de ${currentPlans.length} plan(s) dans MongoDB...`);
          const success = await savePlansToDatabase(session.subject, session.grade, currentPlans);
          if (success) {
            console.log('✅ Plans sauvegardés avec succès dans MongoDB');
          } else {
            console.warn('⚠️ Sauvegarde dans localStorage seulement (fallback)');
          }
        } catch (error) {
          console.error('❌ Erreur lors de la sauvegarde des plans:', error);
        }
      };
      savePlans();
    }
  }, [currentPlans, session]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** Appelé par AuthenticationScreen après connexion réussie (ou auto-reconnexion) */
  const handleAuthenticated = () => {
    setIsAuthenticated(true);
    const savedSession = getInitialSession();
    const savedView = localStorage.getItem('currentView') as AppView | null;

    if (savedSession) {
      setSession(savedSession);
      const restoredView =
        savedView && savedView !== AppView.LOGIN && savedView !== AppView.EDITOR
          ? savedView
          : null;
      if (restoredView) {
        setView(restoredView);
      } else if (savedSession.mode === AppMode.EXAMS) {
        setView(AppView.EXAMS_WIZARD);
      } else if (savedSession.mode === AppMode.PEI_PLANNER) {
        setView(AppView.DASHBOARD);
      } else {
        setView(AppView.LOGIN);
      }
    } else {
      setView(AppView.LOGIN);
    }
  };

  /** Appelé par LoginScreen quand l'utilisateur choisit matière / classe / mode */
  const handleLogin = (subject: string, grade: string, mode: AppMode) => {
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

  /** Déconnexion complète — efface tout localStorage lié à la session */
  const handleLogout = () => {
    console.log('🚪 Déconnexion de l\'utilisateur...');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('authTimestamp');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userSession');
    localStorage.removeItem('currentView');
    setIsAuthenticated(false);
    setSession(null);
    setCurrentPlans([]);
    setView(AppView.LOGIN);
    console.log('✅ Déconnexion complète effectuée');
  };

  const handleCreateNew = () => {
    setEditingPlan({
      ...sanitizeUnitPlan({}, session?.subject || '', session?.grade || ''),
      teacherName: '',
      subject: session?.subject || '',
      gradeLevel: session?.grade || '',
    });
    setView(AppView.EDITOR);
    localStorage.setItem('currentView', AppView.EDITOR);
  };

  const handleEdit = (plan: UnitPlan) => {
    setEditingPlan(plan);
    setView(AppView.EDITOR);
    localStorage.setItem('currentView', AppView.EDITOR);
  };

  const handleDelete = (id: string) => {
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
    if (editingPlan && editingPlan.id) {
      setCurrentPlans(prev => prev.map(p => (p.id === planToSave.id ? planToSave : p)));
    } else {
      setCurrentPlans(prev => [planToSave, ...prev]);
    }
    setView(AppView.DASHBOARD);
    localStorage.setItem('currentView', AppView.DASHBOARD);
  };

  const handleAddPlans = (newPlans: UnitPlan[]) => {
    if (!session) return;
    if (currentPlans.length > 0) {
      const confirm = window.confirm(
        `⚠️ Une planification existe déjà pour ${session.subject} - ${session.grade}.\n\n` +
        `Voulez-vous REMPLACER l'ancienne planification par la nouvelle ?\n\n` +
        `- OUI: Remplacer complètement\n` +
        `- NON: Annuler`
      );
      if (!confirm) return;
    }
    const signedPlans = newPlans.map(p => ({
      ...p,
      subject: session.subject,
      gradeLevel: session.grade,
    }));
    setCurrentPlans(signedPlans);
    alert(
      `✅ Planification enregistrée pour ${session.subject} - ${session.grade}\n\n` +
      `${signedPlans.length} unités créées.\n\n` +
      `Cette planification est maintenant disponible pour tous les enseignants de cette matière/classe.`
    );
  };

  const handleCancel = () => {
    setView(AppView.DASHBOARD);
    localStorage.setItem('currentView', AppView.DASHBOARD);
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  // Pas authentifié → écran de connexion
  if (!isAuthenticated) {
    return <AuthenticationScreen onAuthenticated={handleAuthenticated} />;
  }

  // Authentifié mais pas encore de session (choix matière/classe/mode)
  if (view === AppView.LOGIN) {
    return <LoginScreen onLogin={handleLogin} onLogout={handleLogout} />;
  }

  // Mode Examens
  if (view === AppView.EXAMS_WIZARD) {
    return <ExamsWizard onBack={handleLogout} />;
  }

  // Mode PEI Planner
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
          onLogout={handleLogout}
        />
      ) : (
        <div className="p-4 md:p-8">
          <UnitPlanForm
            initialPlan={editingPlan}
            onSave={handleSavePlan}
            onCancel={handleCancel}
          />
        </div>
      )}
    </div>
  );
};

export default App;
