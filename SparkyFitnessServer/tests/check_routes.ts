import { auth } from '../auth.js';
async function checkRoutes() {
  console.log('Checking deleteAllExpiredApiKeys path...');
  // @ts-expect-error TS(2339): Property 'deleteAllExpiredApiKeys' does not exist ... Remove this comment to see the full error message
  const endpoint = auth.api.deleteAllExpiredApiKeys;
  if (endpoint) {
    console.log('Endpoint found.');
    console.log(`Path: ${endpoint.path}`);
    console.log(`Method: ${endpoint.method}`);
  } else {
    console.log('Endpoint not found in auth.api');
  }
}
checkRoutes().catch(console.error);
