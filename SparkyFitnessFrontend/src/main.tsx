import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.tsx'; // Import AuthProvider
import './i18n';
import { Suspense } from 'react';

createRoot(document.getElementById("root")!).render(
  <Suspense fallback="loading">
    <BrowserRouter>
      <AuthProvider> {/* Wrap App with AuthProvider */}
        <App />
      </AuthProvider>
    </BrowserRouter>
  </Suspense>
);
