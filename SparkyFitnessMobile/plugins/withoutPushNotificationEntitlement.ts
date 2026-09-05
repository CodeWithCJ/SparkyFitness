import { ConfigPlugin, withEntitlementsPlist } from 'expo/config-plugins';

/**
 * Strips the `aps-environment` entitlement that `expo-notifications` adds on iOS.
 *
 * Free Apple "Personal Team" accounts cannot create a provisioning profile that
 * includes the Push Notifications capability, so a local device build fails
 * signing with:
 *
 *   Cannot create a iOS App Development provisioning profile for "<bundle id>".
 *   Personal development teams, including "<name>", do not support the Push
 *   Notifications capability.
 *
 * SparkyFitness only uses *local* notifications (rest-timer chime, medication
 * reminders, etc.), which do not require this entitlement — remote/APNs push is
 * not used — so dropping it does not change app behavior.
 *
 * Applied to dev builds only (see app.config.ts), so production builds signed
 * with a paid team keep the entitlement.
 *
 * Must be registered FIRST in app.config.ts's `plugins` array, not last: for
 * a given mod type, @expo/config-plugins runs each newly-registered mod
 * before delegating to the previously-registered one, so execution order is
 * the reverse of registration order. Registering first here makes this
 * delete the last thing that runs, after expo-notifications and
 * expo-widgets have both already added the entitlement back.
 */
const withoutPushNotificationEntitlement: ConfigPlugin = (config) =>
  withEntitlementsPlist(config, (innerConfig) => {
    delete innerConfig.modResults['aps-environment'];
    return innerConfig;
  });

export default withoutPushNotificationEntitlement;
