// Satu instance backend terpisah (proses Node sendiri) untuk tes lintas-proses.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://fake.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.RATE_LIMIT_STORE = "supabase";
process.env.TRUST_PROXY = "1";
delete process.env.VERCEL;
require("./psqlFetchBridge");
const server = require("node:http").createServer(require("../../src/app"));
server.listen(0, "127.0.0.1", () => console.log(`PORT=${server.address().port}`));
