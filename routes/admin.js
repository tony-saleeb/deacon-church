const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Simple admin auth middleware
function adminAuth(req, res, next) {
    const token = req.headers['x-admin-token'];
    const adminPassword = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get().value;

    if (!token || token !== adminPassword) {
        return res.status(401).json({ success: false, message: 'غير مصرح بالدخول' });
    }
    next();
}

// POST /api/admin/login
router.post('/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get().value;

    if (password === adminPassword) {
        res.json({ success: true, token: adminPassword });
    } else {
        res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
    }
});

// GET /api/admin/stats
router.get('/stats', adminAuth, (req, res) => {
    try {
        const total_deacons = db.prepare('SELECT COUNT(*) as c FROM deacons').get().c;
        const total_bookings = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
        const church_bookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE location = 'church'").get().c;
        const club_bookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE location = 'club'").get().c;

        res.json({
            success: true,
            stats: { total_deacons, total_bookings, church_bookings, club_bookings }
        });
    } catch (err) {
        console.error('Error getting stats:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ' });
    }
});

// GET /api/admin/bookings — Get all bookings with filters
router.get('/bookings', adminAuth, (req, res) => {
    try {
        const { day_id, location, stage, rank } = req.query;

        let query = `
            SELECT b.id as booking_id, b.location, b.created_at as booking_date,
                   d.id as deacon_id, d.full_name, d.stage, d.diaconal_rank, d.phone,
                   ad.day_date, ad.label as day_label
            FROM bookings b
            JOIN deacons d ON b.deacon_id = d.id
            JOIN available_days ad ON b.day_id = ad.id
            WHERE 1=1
        `;
        const params = [];

        if (day_id) { query += ' AND b.day_id = ?'; params.push(day_id); }
        if (location) { query += ' AND b.location = ?'; params.push(location); }
        if (stage) { query += ' AND d.stage = ?'; params.push(stage); }
        if (rank) { query += ' AND d.diaconal_rank = ?'; params.push(rank); }

        query += ' ORDER BY ad.day_date, d.full_name';

        const bookings = db.prepare(query).all(...params);
        res.json({ success: true, bookings, total: bookings.length });
    } catch (err) {
        console.error('Error getting admin bookings:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// GET /api/admin/stats — Dashboard statistics
router.get('/stats', adminAuth, (req, res) => {
    try {
        const totalDeacons = db.prepare('SELECT COUNT(*) as count FROM deacons').get().count;
        const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
        const churchBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE location = 'church'").get().count;
        const clubBookings = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE location = 'club'").get().count;

        const byDay = db.prepare(`
            SELECT ad.label, ad.day_date,
                   SUM(CASE WHEN b.location = 'church' THEN 1 ELSE 0 END) as church_count,
                   SUM(CASE WHEN b.location = 'club' THEN 1 ELSE 0 END) as club_count,
                   COUNT(*) as total
            FROM available_days ad
            LEFT JOIN bookings b ON ad.id = b.day_id
            WHERE ad.is_active = 1
            GROUP BY ad.id
            ORDER BY ad.day_date
        `).all();

        const byStage = db.prepare(`
            SELECT d.stage, COUNT(*) as count
            FROM bookings b JOIN deacons d ON b.deacon_id = d.id
            GROUP BY d.stage ORDER BY count DESC
        `).all();

        const byRank = db.prepare(`
            SELECT d.diaconal_rank, COUNT(*) as count
            FROM bookings b JOIN deacons d ON b.deacon_id = d.id
            GROUP BY d.diaconal_rank ORDER BY count DESC
        `).all();

        res.json({
            success: true,
            stats: { totalDeacons, totalBookings, churchBookings, clubBookings, byDay, byStage, byRank }
        });
    } catch (err) {
        console.error('Error getting stats:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// --- Available Days Management ---

// GET /api/admin/days
router.get('/days', adminAuth, (req, res) => {
    const days = db.prepare('SELECT * FROM available_days ORDER BY day_date').all();
    res.json({ success: true, days });
});

// POST /api/admin/days — Add a new day
router.post('/days', adminAuth, (req, res) => {
    const { day_date, label } = req.body;
    if (!day_date || !label) {
        return res.status(400).json({ success: false, message: 'التاريخ والوصف مطلوبان' });
    }

    try {
        const stmt = db.prepare('INSERT INTO available_days (day_date, label) VALUES (?, ?)');
        const result = stmt.run(day_date, label);
        const day = db.prepare('SELECT * FROM available_days WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json({ success: true, day });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ success: false, message: 'هذا التاريخ مضاف بالفعل' });
        }
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// PUT /api/admin/days/:id — Update day
router.put('/days/:id', adminAuth, (req, res) => {
    const { label, is_active } = req.body;
    try {
        const day = db.prepare('SELECT * FROM available_days WHERE id = ?').get(req.params.id);
        if (!day) {
            return res.status(404).json({ success: false, message: 'اليوم غير موجود' });
        }

        db.prepare('UPDATE available_days SET label = ?, is_active = ? WHERE id = ?')
            .run(label || day.label, is_active !== undefined ? is_active : day.is_active, req.params.id);

        const updated = db.prepare('SELECT * FROM available_days WHERE id = ?').get(req.params.id);
        res.json({ success: true, day: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// DELETE /api/admin/days/:id
router.delete('/days/:id', adminAuth, (req, res) => {
    try {
        const bookingCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE day_id = ?')
            .get(req.params.id).count;
        if (bookingCount > 0) {
            return res.status(400).json({
                success: false,
                message: `لا يمكن حذف هذا اليوم لأنه يحتوي على ${bookingCount} حجز. قم بتعطيله بدلاً من ذلك`
            });
        }

        db.prepare('DELETE FROM available_days WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: 'تم حذف اليوم' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// --- Settings ---

// GET /api/admin/settings
router.get('/settings', adminAuth, (req, res) => {
    const settings = db.prepare('SELECT * FROM settings').all();
    const obj = {};
    settings.forEach(s => obj[s.key] = s.value);
    res.json({ success: true, settings: obj });
});

// PUT /api/admin/settings
router.put('/settings', adminAuth, (req, res) => {
    const { key, value } = req.body;
    const allowed = ['church_capacity', 'admin_password', 'max_church_per_deacon'];
    if (!allowed.includes(key)) {
        return res.status(400).json({ success: false, message: 'إعداد غير معروف' });
    }

    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key);
    res.json({ success: true, message: 'تم تحديث الإعداد' });
});

// GET /api/admin/export — Export all bookings as CSV
router.get('/export', adminAuth, (req, res) => {
    try {
        const bookings = db.prepare(`
            SELECT d.full_name as "الاسم", d.phone as "التليفون",
                   d.stage as "المرحلة", d.diaconal_rank as "الرتبة",
                   ad.label as "اليوم", ad.day_date as "التاريخ",
                   CASE b.location WHEN 'church' THEN 'الكنيسة' WHEN 'club' THEN 'نادي القديسة مارينا' END as "المكان",
                   b.created_at as "تاريخ الحجز"
            FROM bookings b
            JOIN deacons d ON b.deacon_id = d.id
            JOIN available_days ad ON b.day_id = ad.id
            ORDER BY ad.day_date, d.full_name
        `).all();

        if (bookings.length === 0) {
            return res.status(404).json({ success: false, message: 'لا توجد حجوزات للتصدير' });
        }

        // BOM for Excel UTF-8 compatibility
        const BOM = '\uFEFF';
        const headers = Object.keys(bookings[0]);
        const csv = BOM + headers.join(',') + '\n' +
            bookings.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=bookings.csv');
        res.send(csv);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في التصدير' });
    }
});

// DELETE /api/admin/clear-all — Clear all bookings and deacons
router.delete('/clear-all', adminAuth, (req, res) => {
    const { confirm } = req.body;
    if (confirm !== true) {
        return res.status(400).json({
            success: false,
            message: 'يجب تأكيد عملية المسح'
        });
    }

    try {
        const bookingCount = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
        const deaconCount = db.prepare('SELECT COUNT(*) as count FROM deacons').get().count;

        db.prepare('DELETE FROM bookings').run();
        db.prepare('DELETE FROM deacons').run();

        res.json({
            success: true,
            message: `تم مسح ${bookingCount} حجز و ${deaconCount} شماس`,
            deleted: { bookings: bookingCount, deacons: deaconCount }
        });
    } catch (err) {
        console.error('Clear all error:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في مسح البيانات' });
    }
});

module.exports = router;
