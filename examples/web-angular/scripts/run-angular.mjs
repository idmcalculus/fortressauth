import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspect } from 'node:util';

function normalizeBaseHref(value, fallback) {
  const trimmed = (value ?? fallback).trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

function toServePath(baseHref) {
  return baseHref === '/' ? '/' : baseHref.replace(/\/$/, '');
}

const command = process.argv[2];
const baseHref = normalizeBaseHref(process.env.DEMO_BASE_PATH, '/angular-demo/');
const angularApiUrl = process.env.ANGULAR_API_URL?.trim();
const runtimeConfigPath = resolve(process.cwd(), 'src/assets/runtime-config.js');

const args = [];

switch (command) {
  case 'serve':
    // Angular CLI accepts --serve-path here, but not --base-href.
    // Local dev keeps the checked-in /angular-demo/ base href from angular.json.
    args.push('serve', '--port', '3004', '--serve-path', toServePath(baseHref));
    break;
  case 'build':
    args.push('build', '--base-href', baseHref);
    break;
  case 'watch':
    args.push('build', '--watch', '--configuration', 'development', '--base-href', baseHref);
    break;
  default:
    throw new Error(`Unsupported Angular command: ${command}`);
}

writeFileSync(
  runtimeConfigPath,
  angularApiUrl
    ? `window.__FORTRESSAUTH_RUNTIME_CONFIG__ = { apiUrl: ${inspect(angularApiUrl)} };\n`
    : 'window.__FORTRESSAUTH_RUNTIME_CONFIG__ = {};\n',
);

const child = spawn('pnpm', ['ng', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
