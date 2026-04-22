import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MISSING_AUTH_API_URL_MESSAGE =
  'Missing AUTH_API_URL. Set it before starting landing, for example AUTH_API_URL=http://localhost:5000 or AUTH_API_URL=https://api.fortressauth.com/.';

export const INVALID_AUTH_API_URL_MESSAGE = (value) =>
  `Invalid AUTH_API_URL "${value}". Use an absolute http(s) URL such as http://localhost:5000 or https://api.fortressauth.com/.`;

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const projectDir = resolve(scriptDir, '..');

function parseEnvFile(contents) {
  const values = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

export function loadLandingEnv(phase) {
  const fileNames = ['.env', '.env.local', `.env.${phase}`, `.env.${phase}.local`];
  const loadedValues = {};

  for (const fileName of fileNames) {
    const filePath = resolve(projectDir, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(loadedValues, parseEnvFile(readFileSync(filePath, 'utf8')));
  }

  for (const [key, value] of Object.entries(loadedValues)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function parseAuthApiUrl(value = process.env.AUTH_API_URL) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function requireAuthApiUrl() {
  const parsed = parseAuthApiUrl();
  if (!parsed) {
    const rawValue = process.env.AUTH_API_URL?.trim();
    throw new Error(
      rawValue ? INVALID_AUTH_API_URL_MESSAGE(rawValue) : MISSING_AUTH_API_URL_MESSAGE,
    );
  }

  return parsed;
}

export function isLoopbackHostname(hostname) {
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
}

export function toBrowserHostname(hostname) {
  if (hostname === '0.0.0.0' || hostname === '::1') {
    return 'localhost';
  }

  return hostname;
}

function isPortAvailable(port, hostname) {
  return new Promise((resolvePort) => {
    const server = createServer();

    server.once('error', () => {
      resolvePort(false);
    });

    server.once('listening', () => {
      server.close(() => resolvePort(true));
    });

    server.listen(port, hostname);
  });
}

export async function findAvailablePort(startPort, hostname = '0.0.0.0', maxAttempts = 10) {
  let port = startPort;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isPortAvailable(port, hostname)) {
      return port;
    }

    port += 1;
  }

  throw new Error(
    `Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`,
  );
}
