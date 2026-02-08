const { auth } = require("./auth");

async function checkRoutes() {
    console.log("Checking deleteAllExpiredApiKeys path...");
    const endpoint = auth.api.deleteAllExpiredApiKeys;
    if (endpoint) {
        console.log(`Endpoint found.`);
        console.log(`Path: ${endpoint.path}`);
        console.log(`Method: ${endpoint.method}`);
    } else {
        console.log("Endpoint not found in auth.api");
    }
}

checkRoutes().catch(console.error);
