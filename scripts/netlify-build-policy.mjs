const project = process.argv[2]?.trim();
const context = process.env.CONTEXT?.trim() || 'unknown';

const demoProjects = new Set(['react', 'vue', 'svelte', 'angular']);

if (!project) {
  console.error('Usage: node scripts/netlify-build-policy.mjs <landing|react|vue|svelte|angular>');
  process.exit(1);
}

if (demoProjects.has(project) && ['deploy-preview', 'branch-deploy'].includes(context)) {
  console.log(`Skipping ${project} demo ${context} build; demo auth origins are production-only.`);
  process.exit(0);
}

console.log(`Building ${project} for Netlify context "${context}".`);
process.exit(1);
