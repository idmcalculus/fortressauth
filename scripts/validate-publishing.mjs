import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

const desktop = readJson('packages/desktop-sdk/package.json');
const electron = readJson('packages/electron-sdk/package.json');
const workflow = readFileSync(resolve(root, '.github/workflows/publish.yml'), 'utf8');

assert.deepEqual(desktop.repository, {
  type: 'git',
  url: 'git+https://github.com/idmcalculus/fortressauth.git',
  directory: 'packages/desktop-sdk',
});
assert.equal(desktop.version, electron.version, 'desktop and Electron versions must stay aligned');
assert.equal(
  electron.dependencies?.['@fortressauth/desktop-sdk'],
  'workspace:*',
  'Electron must retain a workspace dependency so pnpm rewrites it during publication',
);

const desktopPublish = 'publish_if_needed packages/desktop-sdk';
const electronPublish = 'publish_if_needed packages/electron-sdk';
assert.equal(workflow.split(desktopPublish).length - 1, 1, 'desktop-sdk must publish exactly once');
assert.equal(workflow.split(electronPublish).length - 1, 1, 'electron-sdk must publish exactly once');
assert.ok(
  workflow.indexOf(desktopPublish) < workflow.indexOf(electronPublish),
  'desktop-sdk must publish before electron-sdk',
);

console.log('Publishing metadata and desktop package order are valid.');
