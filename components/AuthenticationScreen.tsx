import React, { useState } from 'react';
import { Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface AuthenticationScreenProps {
  onAuthenticated: () => void;
}

// Credentials sécurisés (dans une vraie application, cela devrait être côté serveur)
const VALID_CREDENTIALS = [
  {
    username: 'Alkawthar',
    password: 'Alkawthar@7786',
    role: 'admin', // Accès complet (PEI Planner + Examens)
    displayName: 'Administrateur'
  },
  {
    username: 'Alkawthar',
    password: 'Alkawthar01',
    role: 'teacher', // Accès limité (PEI Planner uniquement)
    displayName: 'Enseignant'
  },
  {
    username: 'Alkawthar',
    password: 'Alkawthar',
    role: 'exams_only', // Accès uniquement Examens (niveau difficile par défaut)
    displayName: 'Générateur d\'Examens'
  }
];

const AuthenticationScreen: React.FC<AuthenticationScreenProps> = ({ onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simulation d'un délai de connexion
    setTimeout(() => {
      // Vérifier les credentials
      const matchedUser = VALID_CREDENTIALS.find(
        cred => cred.username === username && cred.password === password
      );
      
      if (matchedUser) {
        // Stocker la session dans localStorage
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('authTimestamp', new Date().toISOString());
        localStorage.setItem('userRole', matchedUser.role);
        localStorage.setItem('userName', matchedUser.displayName);
        onAuthenticated();
      } else {
        setError('Identifiants incorrects. Veuillez réessayer.');
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-violet-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-fadeIn">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-8 text-white text-center relative overflow-hidden">
          {/* Animated background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-16 -translate-y-16 animate-pulse"></div>
            <div className="absolute bottom-0 right-0 w-40 h-40 bg-white rounded-full translate-x-20 translate-y-20 animate-pulse delay-700"></div>
          </div>
          
          <div className="relative z-10">
            <div className="bg-white w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 shadow-2xl overflow-hidden transform hover:scale-110 transition-transform duration-300">
              <img 
                src="/logo-alkawtar.png" 
                alt="Al Kawthar Logo" 
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('bg-white/20', 'backdrop-blur-sm');
                  const icon = document.createElement('div');
                  icon.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 22v-4a2 2 0 1 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17"/><path d="m4 6 8-4 8 4"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/></svg>';
                  e.currentTarget.parentElement?.appendChild(icon);
                }}
              />
            </div>
            <h1 className="text-3xl font-bold mb-2 animate-slideDown">🔒 Connexion Sécurisée</h1>
            <p className="text-blue-100 text-sm tracking-wide">Les Écoles Internationales Al-Kawthar</p>
          </div>
        </div>
        
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
          }
          .animate-fadeIn {
            animation: fadeIn 0.5s ease-out;
          }
          .animate-slideDown {
            animation: slideDown 0.6s ease-out;
          }
          .animate-shake {
            animation: shake 0.5s ease-in-out;
          }
          .delay-700 {
            animation-delay: 0.7s;
          }
        `}</style>
        
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 animate-shake">
                <AlertCircle size={20} className="flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nom d'utilisateur
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="text-slate-400" size={20} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError('');
                  }}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Entrez votre identifiant"
                  required
                  autoFocus
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="text-slate-400" size={20} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  className="block w-full pl-10 pr-12 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Entrez votre mot de passe"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition transform hover:-translate-y-0.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Connexion en cours...</span>
                </>
              ) : (
                <>
                  <Lock size={18} />
                  <span>Se connecter</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">
              🔒 Connexion sécurisée - Votre session sera conservée
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthenticationScreen;
