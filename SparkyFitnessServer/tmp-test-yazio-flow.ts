// Test: Simulate the exact flow from Frontend -> Server
import {
  resolveYazioCredentials,
  hasYazioProviderOAuthConfig,
} from './integrations/yazio/yazioService.ts';

// Simulate existing DB values (packed JSON) — this is what's stored in the DB
const existingAppId = JSON.stringify({
  username: 'user@email.com',
  clientId: 'my-client-id',
});
const existingAppKey = JSON.stringify({
  password: 'my-password',
  clientSecret: 'my-client-secret',
});

console.log('=== Existing DB values ===');
console.log('existingAppId:', existingAppId);
console.log('existingAppKey:', existingAppKey);

// Simulate Frontend decode for edit form
// decodeYazioAppId extracts username and clientId from packed JSON
function decodeYazioAppId(value: string | null | undefined) {
  if (!value) return { username: '', clientId: '' };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        username: typeof parsed.username === 'string' ? parsed.username : '',
        clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      };
    }
  } catch {
    /* legacy plain */
  }
  return { username: value, clientId: '' };
}

const decoded = decodeYazioAppId(existingAppId);
console.log('\n=== Frontend decoded ===');
console.log('decoded.username:', decoded.username);
console.log('decoded.clientId:', decoded.clientId);

// Simulate User edits: only changes Client Secret, leaves everything else blank
const editData = {
  app_id: '', // User didn't change username
  app_key: '', // User didn't change password
  yazio_client_id: '', // User didn't change Client ID
  yazio_client_secret: 'new-secret', // User only changed Client Secret
};

console.log('\n=== User edit data ===');
console.log('editData:', JSON.stringify(editData));

// Frontend merge logic (from ExternalProviderList.tsx)
const existingAppKeyDecoded = (() => {
  if (!existingAppKey) return { password: '', clientSecret: '' };
  try {
    const parsed = JSON.parse(existingAppKey);
    if (parsed && typeof parsed === 'object') {
      return {
        password: typeof parsed.password === 'string' ? parsed.password : '',
        clientSecret:
          typeof parsed.clientSecret === 'string' ? parsed.clientSecret : '',
      };
    }
  } catch {
    /* legacy */
  }
  return { password: existingAppKey, clientSecret: '' };
})();

const mergedUsername = editData.app_id?.trim() || decoded.username;
const mergedClientId = editData.yazio_client_id?.trim() || decoded.clientId;
const mergedPassword =
  editData.app_key?.trim() || existingAppKeyDecoded.password;
const mergedClientSecret =
  editData.yazio_client_secret?.trim() || existingAppKeyDecoded.clientSecret;

console.log('\n=== Frontend merged ===');
console.log('mergedUsername:', mergedUsername);
console.log('mergedClientId:', mergedClientId);
console.log('mergedPassword:', mergedPassword);
console.log('mergedClientSecret:', mergedClientSecret);

// Frontend encode
const yazioAppId = JSON.stringify({
  username: mergedUsername,
  clientId: mergedClientId,
});
const yazioAppKey = JSON.stringify({
  password: mergedPassword,
  clientSecret: mergedClientSecret,
});

console.log('\n=== Frontend encoded (sent to server) ===');
console.log('yazioAppId:', yazioAppId);
console.log('yazioAppKey:', yazioAppKey);

// Server resolve
const serverCredentials = resolveYazioCredentials({
  username: yazioAppId,
  password: yazioAppKey,
});
console.log('\n=== Server resolveYazioCredentials ===');
console.log('serverCredentials:', JSON.stringify(serverCredentials, null, 2));

// Server validation
const hasOAuth = hasYazioProviderOAuthConfig({
  username: yazioAppId,
  password: yazioAppKey,
});
console.log('\n=== Server hasYazioProviderOAuthConfig ===');
console.log('hasOAuth:', hasOAuth);

if (!hasOAuth) {
  console.log('\n❌ BUG REPRODUCED: OAuth config not detected!');
  console.log('clientId:', serverCredentials.clientId);
  console.log('clientSecret:', serverCredentials.clientSecret);
} else {
  console.log('\n✅ OAuth config detected correctly');
}

// Now test: what if the user enters ALL fields fresh (first-time setup)?
console.log('\n\n=== TEST 2: Fresh YAZIO setup (all fields filled) ===');
const freshAppId = JSON.stringify({
  username: 'new@email.com',
  clientId: 'fresh-client-id',
});
const freshAppKey = JSON.stringify({
  password: 'fresh-password',
  clientSecret: 'fresh-secret',
});
const freshCredentials = resolveYazioCredentials({
  username: freshAppId,
  password: freshAppKey,
});
console.log('freshCredentials:', JSON.stringify(freshCredentials, null, 2));
const freshHasOAuth = hasYazioProviderOAuthConfig({
  username: freshAppId,
  password: freshAppKey,
});
console.log('hasOAuth:', freshHasOAuth);
console.log(freshHasOAuth ? '✅ OK' : '❌ FAIL');
