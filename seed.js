// Seed script — add the specific Holy Week days
const db = require('./db/database');

// Clean slate
db.prepare('DELETE FROM bookings').run();
db.prepare('DELETE FROM available_days').run();
db.prepare('DELETE FROM deacons').run();

const days = [
    { day_date: '2026-04-05', label: Buffer.from('d8a3d8add8af20d8a7d984d8b4d8b9d8a7d986d98ad986', 'hex').toString('utf8') },       // أحد الشعانين
    { day_date: '2026-04-09', label: Buffer.from('d8aed985d98ad8b320d8a7d984d8b9d987d8af', 'hex').toString('utf8') },                   // خميس العهد
    { day_date: '2026-04-10', label: Buffer.from('d8a7d984d8acd985d8b9d8a920d8a7d984d8b9d8b8d98ad985d8a9', 'hex').toString('utf8') },   // الجمعة العظيمة
    { day_date: '2026-04-11', label: Buffer.from('d984d98ad984d8a920d8a7d984d8b9d98ad8af', 'hex').toString('utf8') },                   // ليلة العيد
];

const stmt = db.prepare('INSERT INTO available_days (day_date, label) VALUES (?, ?)');

days.forEach(d => {
    stmt.run(d.day_date, d.label);
});

// Verify
const all = db.prepare('SELECT * FROM available_days').all();
require('fs').writeFileSync('./db/seed_verify.json', JSON.stringify(all, null, 2), 'utf8');
console.log('Seed complete! Verify in db/seed_verify.json');
process.exit(0);
