const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { auth } = require("./auth");
console.log("Auth object keys:", Object.keys(auth));
console.log("Auth.handler type:", typeof auth.handler);
console.log("Auth.api keys:", auth.api ? Object.keys(auth.api) : "No api object");
process.exit(0);
