const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro'); 
/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 * @type {import('expo/metro-config').MetroConfig} 
*/

const config = getDefaultConfig(__dirname);
config.transformer.minifierConfig = {
  compress: {
    // The option below removes all console logs statements in production.
    drop_console: ['log', 'info'] ,
  },
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
  extraThemes: ['amoled']
});