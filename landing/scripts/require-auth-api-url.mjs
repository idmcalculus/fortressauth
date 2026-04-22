import { loadLandingEnv, requireAuthApiUrl } from './env-utils.mjs';

const phase = process.env.FORTRESSAUTH_LANDING_ENV === 'production' ? 'production' : 'development';

loadLandingEnv(phase);

try {
  requireAuthApiUrl();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid AUTH_API_URL');
  process.exit(1);
}
