import { AuthProvider } from '@fortressauth/react-sdk';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider baseUrl={baseUrl}>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
