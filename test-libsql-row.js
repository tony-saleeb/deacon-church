require('dotenv').config();
const { createClient } = require('@libsql/client');

(async () => {
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
    });
    
    const res = await db.execute('SELECT 1 as "id", "hello" as "name"');
    console.log("res.rows[0]:", res.rows[0]);
    console.log("Object.keys:", Object.keys(res.rows[0]));
    console.log("JSON.stringify:", JSON.stringify(res.rows[0]));
})();
