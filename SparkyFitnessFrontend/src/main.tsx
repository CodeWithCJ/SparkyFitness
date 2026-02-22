import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.tsx';
import './i18n';
import { Suspense } from 'react';
import { PreferencesProvider } from './contexts/PreferencesContext.tsx';

createRoot(document.getElementById('root')!).render(
  <Suspense fallback="loading">
    <BrowserRouter>
      <AuthProvider>
        <PreferencesProvider>
          <App />
        </PreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  </Suspense>
);
