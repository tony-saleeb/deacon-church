const express = require('express');
const router = express.Router();
const db = require('../db/database');

async function dbGet(sql, args = []) {
    const res = await db.execute({ sql, args });
    return res.rows[0] || null;
}

async function dbAll(sql, args = []) {
    const res = await db.execute({ sql, args });
    return res.rows;
}

// Simple admin auth middleware
async function adminAuth(req, res, next) {
    const token = req.headers['x-admin-token'];
    try {
        const adminPwRow = await dbGet("SELECT value FROM settings WHERE key = 'admin_password'");
        const adminPassword = adminPwRow ? adminPwRow.value : '';

        if (!token || token !== adminPassword) {
            return res.status(401).json({ success: false, message: 'غير مصرح بالدخول' });
        }
        next();
    } catch (err) {
        console.error('Auth error:', err);
        return res.status(500).json({ success: false, message: 'Server error during auth' });
    }
}

// POST /api/admin/login
router.post('/login', async (req, res) => {
    const { password } = req.body;
    try {
        const adminPwRow = await dbGet("SELECT value FROM settings WHERE key = 'admin_password'");
        const adminPassword = adminPwRow.value;

        if (password === adminPassword) {
            res.json({ success: true, token: adminPassword });
        } else {
            res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// GET /api/admin/bookings — Get all bookings with filters
router.get('/bookings', adminAuth, async (req, res) => {
    try {
        const { day_id, location, stage, rank } = req.query;

        let query = `
            SELECT b.id as booking_id, b.location, b.created_at as booking_date,
                   d.id as deacon_id, d.full_name, d.stage, d.diaconal_rank, d.phone, d.birth_date,
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

        const bookings = await dbAll(query, params);
        res.json({ success: true, bookings, total: bookings.length });
    } catch (err) {
        console.error('Error getting admin bookings:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// GET /api/admin/stats — Dashboard statistics
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const tdRow = await dbGet('SELECT COUNT(*) as count FROM deacons');
        const tbRow = await dbGet('SELECT COUNT(*) as count FROM bookings');
        const cbRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE location = 'church'");
        const clbRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE location = 'club'");

        const byDay = await dbAll(`
            SELECT ad.label, ad.day_date,
                   SUM(CASE WHEN b.location = 'church' THEN 1 ELSE 0 END) as church_count,
                   SUM(CASE WHEN b.location = 'club' THEN 1 ELSE 0 END) as club_count,
                   COUNT(b.id) as total
            FROM available_days ad
            LEFT JOIN bookings b ON ad.id = b.day_id
            WHERE ad.is_active = 1
            GROUP BY ad.id
            ORDER BY ad.day_date
        `);

        const byStage = await dbAll(`
            SELECT d.stage, COUNT(*) as count
            FROM bookings b JOIN deacons d ON b.deacon_id = d.id
            GROUP BY d.stage ORDER BY count DESC
        `);

        const byRank = await dbAll(`
            SELECT d.diaconal_rank, COUNT(*) as count
            FROM bookings b JOIN deacons d ON b.deacon_id = d.id
            GROUP BY d.diaconal_rank ORDER BY count DESC
        `);

        res.json({
            success: true,
            stats: { 
                totalDeacons: tdRow.count, 
                totalBookings: tbRow.count, 
                churchBookings: cbRow.count, 
                clubBookings: clbRow.count, 
                byDay, 
                byStage, 
                byRank 
            }
        });
    } catch (err) {
        console.error('Error getting stats:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// --- Available Days Management ---

// GET /api/admin/days
router.get('/days', adminAuth, async (req, res) => {
    try {
        const days = await dbAll('SELECT * FROM available_days ORDER BY day_date');
        res.json({ success: true, days });
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// POST /api/admin/days — Add a new day
router.post('/days', adminAuth, async (req, res) => {
    const { day_date, label } = req.body;
    if (!day_date || !label) {
        return res.status(400).json({ success: false, message: 'التاريخ والوصف مطلوبان' });
    }

    try {
        const result = await db.execute({
            sql: 'INSERT INTO available_days (day_date, label) VALUES (?, ?)',
            args: [day_date, label]
        });
        const day = await dbGet('SELECT * FROM available_days WHERE id = ?', [Number(result.lastInsertRowid)]);
        res.status(201).json({ success: true, day });
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint')) {
            return res.status(409).json({ success: false, message: 'هذا التاريخ مضاف بالفعل' });
        }
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// PUT /api/admin/days/:id — Update day
router.put('/days/:id', adminAuth, async (req, res) => {
    const { label, is_active } = req.body;
    try {
        const id = Number(req.params.id);
        const day = await dbGet('SELECT * FROM available_days WHERE id = ?', [id]);
        if (!day) {
            return res.status(404).json({ success: false, message: 'اليوم غير موجود' });
        }

        await db.execute({
            sql: 'UPDATE available_days SET label = ?, is_active = ? WHERE id = ?',
            args: [label || day.label, is_active !== undefined ? is_active : day.is_active, id]
        });

        const updated = await dbGet('SELECT * FROM available_days WHERE id = ?', [id]);
        res.json({ success: true, day: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// DELETE /api/admin/days/:id
router.delete('/days/:id', adminAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const bRow = await dbGet('SELECT COUNT(*) as count FROM bookings WHERE day_id = ?', [id]);
        const bookingCount = bRow.count;
        if (bookingCount > 0) {
            return res.status(400).json({
                success: false,
                message: `لا يمكن حذف هذا اليوم لأنه يحتوي على ${bookingCount} حجز. قم بتعطيله بدلاً من ذلك`
            });
        }

        await db.execute({ sql: 'DELETE FROM available_days WHERE id = ?', args: [id] });
        res.json({ success: true, message: 'تم حذف اليوم' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// --- Settings ---

// GET /api/admin/settings
router.get('/settings', adminAuth, async (req, res) => {
    try {
        const settings = await dbAll('SELECT * FROM settings');
        const obj = {};
        settings.forEach(s => obj[s.key] = s.value);
        res.json({ success: true, settings: obj });
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// PUT /api/admin/settings
router.put('/settings', adminAuth, async (req, res) => {
    const { key, value } = req.body;
    const allowed = ['church_capacity', 'admin_password', 'max_church_per_deacon'];
    if (!allowed.includes(key)) {
        return res.status(400).json({ success: false, message: 'إعداد غير معروف' });
    }

    try {
        await db.execute({ sql: 'UPDATE settings SET value = ? WHERE key = ?', args: [value, key] });
        res.json({ success: true, message: 'تم تحديث الإعداد' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// GET /api/admin/export — Export all bookings as CSV
router.get('/export', adminAuth, async (req, res) => {
    try {
        const result = await db.execute(`
            SELECT d.full_name as "الاسم", d.phone as "التليفون", d.birth_date as "تاريخ الميلاد",
                   d.stage as "المرحلة", d.diaconal_rank as "الرتبة",
                   ad.label as "اليوم", ad.birth_date as "التاريخ",
                   CASE b.location WHEN 'church' THEN 'الكنيسة' WHEN 'club' THEN 'نادي القديسة مارينا' END as "المكان",
                   b.created_at as "تاريخ الحجز"
            FROM bookings b
            JOIN deacons d ON b.deacon_id = d.id
            JOIN available_days ad ON b.day_id = ad.id
            ORDER BY ad.day_date, d.full_name
        `);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'لا توجد حجوزات للتصدير' });
        }

        const BOM = '\uFEFF';
        const headers = result.columns;
        const csv = BOM + headers.join(',') + '\n' +
            result.rows.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=bookings.csv');
        res.send(csv);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في التصدير' });
    }
});

// DELETE /api/admin/clear-all — Clear all bookings and deacons
router.delete('/clear-all', adminAuth, async (req, res) => {
    const { confirm } = req.body;
    if (confirm !== true) {
        return res.status(400).json({
            success: false,
            message: 'يجب تأكيد عملية المسح'
        });
    }

    try {
        const bCountRow = await dbGet('SELECT COUNT(*) as count FROM bookings');
        const dCountRow = await dbGet('SELECT COUNT(*) as count FROM deacons');

        // Execute batch for multiple statements (since we want simple transaction-like clearing)
        await db.executeMultiple('DELETE FROM bookings; DELETE FROM deacons;');

        res.json({
            success: true,
            message: `تم مسح ${bCountRow.count} حجز و ${dCountRow.count} شماس`,
            deleted: { bookings: bCountRow.count, deacons: dCountRow.count }
        });
    } catch (err) {
        console.error('Clear all error:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في مسح البيانات' });
    }
});

module.exports = router;
