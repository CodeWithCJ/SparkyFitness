/**
 * @format
 */

import { Platform, LogBox } from 'react-native';
import App from './App';
import { registerRootComponent } from 'expo';

//LogBox.ignoreAllLogs(true);

// Development-only override: force HealthKit to run on the iOS simulator for testing.
// Set to true only in __DEV__ so production builds are unaffected.
if (__DEV__ && Platform.OS === 'ios') {
	// Development toggle: leave `false` by default to avoid crashing the app on simulator.
	// To enable simulator HealthKit just for a short local test, set this to `true`
	// on your machine (do NOT commit that change) or toggle it at runtime.
	global.FORCE_HEALTHKIT_ON_SIM = false;
}
registerRootComponent(App);
