const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { validateLocation } = require('../middleware/validation');

async function dbGet(sql, args = []) {
    const res = await db.execute({ sql, args });
    return res.rows[0] || null;
}

async function dbAll(sql, args = []) {
    const res = await db.execute({ sql, args });
    return res.rows;
}

// GET /api/bookings/availability?phone=xxx
router.get('/availability', async (req, res) => {
    try {
        const churchCapRow = await dbGet("SELECT value FROM settings WHERE key = 'church_capacity'");
        const churchCapacity = parseInt(churchCapRow.value);

        const days = await dbAll('SELECT * FROM available_days WHERE is_active = 1 ORDER BY day_date');

        const { phone } = req.query;
        let bookedDayIds = [];
        let userChurchCount = 0;
        
        const maxRow = await dbGet("SELECT value FROM settings WHERE key = 'max_church_per_deacon'");
        const maxPerDeacon = parseInt(maxRow.value);

        if (phone) {
            const cleaned = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+?2/, '');
            const deacon = await dbGet('SELECT id FROM deacons WHERE phone = ?', [cleaned]);
            if (deacon) {
                const bRows = await dbAll('SELECT day_id FROM bookings WHERE deacon_id = ?', [deacon.id]);
                bookedDayIds = bRows.map(b => b.day_id);
                
                const ucRow = await dbGet("SELECT COUNT(*) as c FROM bookings WHERE deacon_id = ? AND location = 'church'", [deacon.id]);
                userChurchCount = ucRow.c;
            }
        }

        const availability = [];
        for (const day of days) {
            const churchRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'church'", [day.id]);
            const clubRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'club'", [day.id]);

            availability.push({
                ...day,
                church_booked: churchRow.count,
                church_remaining: Math.max(0, churchCapacity - churchRow.count),
                church_capacity: churchCapacity,
                church_full: churchRow.count >= churchCapacity,
                club_booked: clubRow.count,
                booked_by_user: bookedDayIds.includes(day.id)
            });
        }

        res.json({
            success: true,
            availability,
            user_church_count: userChurchCount,
            max_church_per_deacon: maxPerDeacon
        });
    } catch (err) {
        console.error('Error getting availability:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// POST /api/bookings — Create a booking
router.post('/', async (req, res) => {
    const { deacon_id, day_id, location } = req.body;

    const locResult = validateLocation(location);
    if (!locResult.valid) {
        return res.status(400).json({ success: false, message: locResult.message });
    }

    if (!deacon_id || !day_id) {
        return res.status(400).json({ success: false, message: 'بيانات الحجز غير مكتملة' });
    }

    try {
        const deacon = await dbGet('SELECT id FROM deacons WHERE id = ?', [deacon_id]);
        if (!deacon) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الشماس' });
        }

        const day = await dbGet('SELECT * FROM available_days WHERE id = ? AND is_active = 1', [day_id]);
        if (!day) {
            return res.status(404).json({ success: false, message: 'هذا اليوم غير متاح للحجز' });
        }

        const duplicate = await dbGet('SELECT id FROM bookings WHERE deacon_id = ? AND day_id = ?', [deacon_id, day_id]);
        if (duplicate) {
            return res.status(409).json({ success: false, message: 'لقد قمت بحجز هذا اليوم بالفعل' });
        }

        if (location === 'church') {
            const capRow = await dbGet("SELECT value FROM settings WHERE key = 'church_capacity'");
            const churchCapacity = parseInt(capRow.value);
            
            const maxRow = await dbGet("SELECT value FROM settings WHERE key = 'max_church_per_deacon'");
            const maxPerDeacon = parseInt(maxRow.value);

            const cCountRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'church'", [day_id]);
            if (cCountRow.count >= churchCapacity) {
                return res.status(409).json({ success: false, message: 'الكنيسة ممتلئة في هذا اليوم', suggest_club: true, church_full: true });
            }

            const dChurchCountRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE deacon_id = ? AND location = 'church'", [deacon_id]);
            if (dChurchCountRow.count >= maxPerDeacon) {
                return res.status(403).json({ success: false, message: `وصلت للحد الأقصى (${maxPerDeacon}) للحجز في الكنيسة`, suggest_club: true });
            }
        }

        try {
            const result = await db.execute({
                sql: 'INSERT INTO bookings (deacon_id, day_id, location) VALUES (?, ?, ?)',
                args: [deacon_id, day_id, location]
            });
            const insertId = Number(result.lastInsertRowid);
            const booking = await dbGet(`
                SELECT b.*, d.day_date, d.label as day_label
                FROM bookings b JOIN available_days d ON b.day_id = d.id
                WHERE b.id = ?
            `, [insertId]);

            return res.status(201).json({ success: true, message: 'تم الحجز بنجاح', booking });
        } catch (insertErr) {
            if (insertErr.message && insertErr.message.includes('UNIQUE constraint')) {
                return res.status(409).json({ success: false, message: 'لقد قمت بحجز هذا اليوم بالفعل' });
            }
            throw insertErr;
        }

    } catch (err) {
        console.error('Error creating booking:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// PUT /api/bookings/:id — Edit booking
router.put('/:id', async (req, res) => {
    const { location, day_id } = req.body;
    const bookingId = Number(req.params.id);

    try {
        const existing = await dbGet(`
            SELECT b.*, d.day_date FROM bookings b
            JOIN available_days d ON b.day_id = d.id
            WHERE b.id = ?
        `, [bookingId]);

        if (!existing) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الحجز' });
        }

        const newDayId = day_id || existing.day_id;
        const newLocation = location || existing.location;

        if (location) {
            const locResult = validateLocation(location);
            if (!locResult.valid) {
                return res.status(400).json({ success: false, message: locResult.message });
            }
        }

        if (day_id) {
            const day = await dbGet('SELECT * FROM available_days WHERE id = ? AND is_active = 1', [day_id]);
            if (!day) {
                return res.status(404).json({ success: false, message: 'هذا اليوم غير متاح' });
            }

            const dup = await dbGet('SELECT id FROM bookings WHERE deacon_id = ? AND day_id = ? AND id != ?', [existing.deacon_id, day_id, bookingId]);
            if (dup) {
                return res.status(409).json({ success: false, message: 'لديك حجز بالفعل في هذا اليوم' });
            }
        }

        if (newLocation === 'church') {
            const capRow = await dbGet("SELECT value FROM settings WHERE key = 'church_capacity'");
            const churchCapacity = parseInt(capRow.value);
            
            const maxRow = await dbGet("SELECT value FROM settings WHERE key = 'max_church_per_deacon'");
            const maxPerDeacon = parseInt(maxRow.value);

            const exclusion = existing.location === 'church' && existing.day_id === newDayId ? 1 : 0;
            const churchCountRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'church' AND id != ?", [newDayId, exclusion ? bookingId : -1]);
            
            if (churchCountRow.count >= churchCapacity) {
                return res.status(409).json({ success: false, message: 'الكنيسة ممتلئة في هذا اليوم', suggest_club: true });
            }

            const deaconChurchCountRow = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE deacon_id = ? AND location = 'church' AND id != ?", [existing.deacon_id, bookingId]);
            if (deaconChurchCountRow.count >= maxPerDeacon) {
                return res.status(403).json({ success: false, message: 'وصلت للحد الأقصى للحجز في الكنيسة', suggest_club: true });
            }
        }

        await db.execute({
            sql: 'UPDATE bookings SET day_id = ?, location = ? WHERE id = ?',
            args: [newDayId, newLocation, bookingId]
        });

        const updated = await dbGet(`
            SELECT b.*, d.day_date, d.label as day_label
            FROM bookings b JOIN available_days d ON b.day_id = d.id
            WHERE b.id = ?
        `, [bookingId]);

        return res.status(200).json({ success: true, message: 'تم تعديل الحجز بنجاح', booking: updated });
    } catch (err) {
        console.error('Error editing booking:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// DELETE /api/bookings/:id — Cancel booking
router.delete('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const booking = await dbGet('SELECT * FROM bookings WHERE id = ?', [id]);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الحجز' });
        }

        await db.execute({ sql: 'DELETE FROM bookings WHERE id = ?', args: [id] });
        res.json({ success: true, message: 'تم إلغاء الحجز بنجاح' });
    } catch (err) {
        console.error('Error canceling booking:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

module.exports = router;
