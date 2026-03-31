require('dotenv').config();
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
    throw new Error('TURSO_DATABASE_URL is not set. Please check your .env file or Vercel Environment Variables.');
}

const db = createClient({
    url: url,
    authToken: authToken,
});

(async () => {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        await db.executeMultiple(schema);
        console.log('Turso database connected and schema initialized.');
    } catch (err) {
        console.error('Failed to initialize Turso schema:', err);
    }
})();

module.exports = db;
