const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Block AVD data if someone recreates .android-nix inside the repo
const androidNix = path.resolve(__dirname, '.android-nix');
const esc = androidNix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${esc}(/|$)`)];

module.exports = config;
