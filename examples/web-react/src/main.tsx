import { AuthProvider } from '@fortressauth/react-sdk';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';

// Point directly to the backend to avoid CORS preflight redirects from the proxy
const baseUrl = 'http://localhost:5001';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider baseUrl={baseUrl}>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
