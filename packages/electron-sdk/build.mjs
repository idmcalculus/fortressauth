import * as esbuild from 'esbuild';

// Build CommonJS version for Electron's require()
await esbuild.build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: './dist/index.cjs',
  external: ['electron', 'electron-store'],
  sourcemap: true,
});

console.log('Built CommonJS bundle: dist/index.cjs');
