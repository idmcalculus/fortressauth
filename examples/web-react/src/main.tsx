/**
 * FortressAuth React Example - Entry Point
 */

import { AuthProvider } from '@fortressauth/react-sdk';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';

// Use environment variable for API URL, with fallback for development
const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider baseUrl={baseUrl}>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
