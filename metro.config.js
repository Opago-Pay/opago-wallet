const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Metro to resolve the 'browser' exports in package.json to fix 'jose' Node polyfill errors
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require'];

// Add 'mjs' to handle the uuid ESM resolution issue in the Privy SDK on Web
config.resolver.sourceExts.push('mjs', 'cjs');

module.exports = config;
