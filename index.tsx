import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

if (typeof window !== 'undefined') {
  (window as any).selectedGrade = (window as any).selectedGrade || '';
  (window as any).currentUserName = (window as any).currentUserName || 'Enseignant';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Une erreur inattendue est survenue">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);