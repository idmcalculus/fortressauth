import { spawn } from 'node:child_process';
import {
  findAvailablePort,
  isLoopbackHostname,
  loadLandingEnv,
  requireAuthApiUrl,
  toBrowserHostname,
} from './env-utils.mjs';

loadLandingEnv('development');

const configuredApiUrl = requireAuthApiUrl();
const wantsLocalApi = isLoopbackHostname(configuredApiUrl.hostname);
const preferredApiPort =
  configuredApiUrl.port.length > 0
    ? Number.parseInt(configuredApiUrl.port, 10)
    : configuredApiUrl.protocol === 'https:'
      ? 443
      : 80;

const apiPort = wantsLocalApi ? await findAvailablePort(preferredApiPort) : preferredApiPort;
const effectiveApiUrl = new URL(configuredApiUrl.toString());

if (wantsLocalApi) {
  effectiveApiUrl.hostname = toBrowserHostname(configuredApiUrl.hostname);
  effectiveApiUrl.port = String(apiPort);
}

const apiOrigin = effectiveApiUrl.origin;
const serverPort = wantsLocalApi ? apiPort : 5000;
const sharedEnv = {
  ...process.env,
  AUTH_API_URL: apiOrigin,
  NEXT_PUBLIC_AUTH_API_URL: apiOrigin,
  VITE_API_URL: apiOrigin,
  ANGULAR_API_URL: apiOrigin,
  STRICT_PORT: wantsLocalApi ? 'true' : process.env.STRICT_PORT,
  BASE_URL: process.env.BASE_URL ?? 'http://localhost:3000',
  CORS_ORIGINS:
    process.env.CORS_ORIGINS ??
    'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004',
};

if (wantsLocalApi && apiPort !== preferredApiPort) {
  console.log(
    `Using local API origin ${apiOrigin} because port ${preferredApiPort} is unavailable.`,
  );
} else {
  console.log(`Using API origin ${apiOrigin}.`);
}

const concurrentlyArgs = [
  '-n',
  'next,server,react,vue,svelte,angular',
  '-c',
  'blue,white,green,magenta,yellow,red',
  'next dev --turbopack',
  `PORT=${serverPort} pnpm --filter @fortressauth/server dev`,
  'pnpm --filter fortressauth-web-react dev',
  'pnpm --filter fortressauth-web-vue dev',
  'pnpm --filter fortressauth-web-svelte dev',
  'pnpm --filter fortressauth-web-angular dev',
];

const child = spawn('pnpm', ['exec', 'concurrently', ...concurrentlyArgs], {
  cwd: process.cwd(),
  env: sharedEnv,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
