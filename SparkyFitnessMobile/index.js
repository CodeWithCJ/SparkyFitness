/**
 * @format
 */

import App from './App';
import { registerRootComponent } from 'expo';
import './src/services/backgroundSyncService';
import './src/services/gpsRecordingService';
import './src/services/medicationNotificationHandler';

//LogBox.ignoreAllLogs(true);

registerRootComponent(App);
