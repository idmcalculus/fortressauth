declare global {
  interface Window {
    __FORTRESSAUTH_RUNTIME_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

export {};
