const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { validateBookingInput, validateLocation } = require('../middleware/validation');

async function dbGet(sql, args = []) {
    const res = await db.execute({ sql, args });
    return res.rows[0] || null;
}

async function dbAll(sql, args = []) {
    const res = await db.execute({ sql, args });
    return res.rows;
}

// POST /api/deacons/book — One-shot: register/find deacon + create booking
router.post('/book', validateBookingInput, async (req, res) => {
    const { full_name, stage, diaconal_rank, phone, day_id, location } = req.body;

    const locResult = validateLocation(location);
    if (!locResult.valid) {
        return res.status(400).json({ success: false, message: locResult.message });
    }
    if (!day_id) {
        return res.status(400).json({ success: false, message: 'يجب اختيار اليوم' });
    }

    try {
        let deacon = await dbGet('SELECT * FROM deacons WHERE phone = ?', [phone]);
        if (deacon) {
            await db.execute({
                sql: 'UPDATE deacons SET full_name = ?, stage = ?, diaconal_rank = ? WHERE id = ?',
                args: [full_name, stage, diaconal_rank, deacon.id]
            });
            deacon = await dbGet('SELECT * FROM deacons WHERE id = ?', [deacon.id]);
        } else {
            const result = await db.execute({
                sql: 'INSERT INTO deacons (full_name, stage, diaconal_rank, phone) VALUES (?, ?, ?, ?)',
                args: [full_name, stage, diaconal_rank, phone]
            });
            deacon = await dbGet('SELECT * FROM deacons WHERE id = ?', [Number(result.lastInsertRowid)]);
        }

        const day = await dbGet('SELECT * FROM available_days WHERE id = ? AND is_active = 1', [day_id]);
        if (!day) {
            return res.status(404).json({ success: false, message: 'هذا اليوم غير متاح للحجز' });
        }

        const dup = await dbGet('SELECT id FROM bookings WHERE deacon_id = ? AND day_id = ?', [deacon.id, day_id]);
        if (dup) {
            return res.status(409).json({ success: false, message: 'لقد قمت بحجز هذا اليوم بالفعل بنفس رقم التليفون' });
        }

        if (location === 'church') {
            const capRow = await dbGet("SELECT value FROM settings WHERE key = 'church_capacity'");
            const churchCapacity = parseInt(capRow.value);
            
            const maxRow = await dbGet("SELECT value FROM settings WHERE key = 'max_church_per_deacon'");
            const maxPerDeacon = parseInt(maxRow.value);

            const cCountRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'church'", [day_id]);
            if (cCountRow.count >= churchCapacity) {
                return res.status(409).json({ success: false, message: 'الكنيسة ممتلئة في هذا اليوم', suggest_club: true });
            }

            const dChurchCountRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE deacon_id = ? AND location = 'church'", [deacon.id]);
            if (dChurchCountRow.count >= maxPerDeacon) {
                return res.status(403).json({ success: false, message: `وصلت للحد الأقصى (${maxPerDeacon}) للحجز في الكنيسة`, suggest_club: true });
            }
        }

        try {
            await db.execute({
                sql: 'INSERT INTO bookings (deacon_id, day_id, location) VALUES (?, ?, ?)',
                args: [deacon.id, day_id, location]
            });
        } catch (insertErr) {
            if (insertErr.message && insertErr.message.includes('UNIQUE constraint')) {
                return res.status(409).json({ success: false, message: 'لقد قمت بحجز هذا اليوم بالفعل' });
            }
            throw insertErr;
        }

        return res.status(201).json({
            success: true,
            message: 'تم الحجز بنجاح',
            deacon: { id: deacon.id, full_name: deacon.full_name, phone: deacon.phone, stage: deacon.stage, diaconal_rank: deacon.diaconal_rank },
            day: { label: day.label, day_date: day.day_date },
            location
        });

    } catch (err) {
        console.error('Error booking:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// GET /api/deacons/my-bookings — Get bookings by phone
router.get('/my-bookings', async (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'رقم التليفون مطلوب' });

    const cleaned = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+?2/, '');
    
    try {
        const deacon = await dbGet('SELECT id, full_name, phone FROM deacons WHERE phone = ?', [cleaned]);
        if (!deacon) {
            return res.json({ success: true, bookings: [], deacon: null });
        }

        const bookings = await dbAll(`
            SELECT b.id, b.location, d.label as day_label, d.day_date
            FROM bookings b
            JOIN available_days d ON b.day_id = d.id
            WHERE b.deacon_id = ?
            ORDER BY d.day_date ASC
        `, [deacon.id]);

        res.json({ success: true, bookings, deacon });
    } catch (err) {
        console.error('Error fetching my bookings:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

module.exports = router;
