/**
 * Metro configuration for FortressAuth Expo Example
 * Allows importing shared utilities from outside the project root.
 *
 * @see https://docs.expo.dev/guides/customizing-metro/
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the shared folder for changes
config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(monorepoRoot, 'examples/shared'),
];

// Allow importing from the shared folder
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths || []),
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Avoid duplicate React copies from workspace packages.
config.resolver.disableHierarchicalLookup = true;

// Ensure Metro can resolve files outside the project root
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
};

module.exports = config;
