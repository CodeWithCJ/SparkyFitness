module.exports = function(api) {
  const isIOS = api.caller(caller => caller?.platform === 'ios');

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: isIOS ? [['react-native-nitro-modules/babel', { debugPrints: false }]] : [],
  };
};
