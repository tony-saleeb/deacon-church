const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { validateLocation } = require('../middleware/validation');

// GET /api/bookings/availability?phone=xxx
router.get('/availability', (req, res) => {
    try {
        const churchCapacity = parseInt(
            db.prepare("SELECT value FROM settings WHERE key = 'church_capacity'").get().value
        );

        const days = db.prepare('SELECT * FROM available_days WHERE is_active = 1 ORDER BY day_date').all();

        // Check which days this phone already booked + their church count
        const { phone } = req.query;
        let bookedDayIds = [];
        let userChurchCount = 0;
        const maxPerDeacon = parseInt(
            db.prepare("SELECT value FROM settings WHERE key = 'max_church_per_deacon'").get().value
        );
        if (phone) {
            const cleaned = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+?2/, '');
            const deacon = db.prepare('SELECT id FROM deacons WHERE phone = ?').get(cleaned);
            if (deacon) {
                bookedDayIds = db.prepare('SELECT day_id FROM bookings WHERE deacon_id = ?')
                    .all(deacon.id).map(b => b.day_id);
                userChurchCount = db.prepare(
                    "SELECT COUNT(*) as c FROM bookings WHERE deacon_id = ? AND location = 'church'"
                ).get(deacon.id).c;
            }
        }

        const availability = days.map(day => {
            const churchCount = db.prepare(
                "SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'church'"
            ).get(day.id).count;

            const clubCount = db.prepare(
                "SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'club'"
            ).get(day.id).count;

            return {
                ...day,
                church_booked: churchCount,
                church_remaining: Math.max(0, churchCapacity - churchCount),
                church_capacity: churchCapacity,
                church_full: churchCount >= churchCapacity,
                club_booked: clubCount,
                booked_by_user: bookedDayIds.includes(day.id)
            };
        });

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

// POST /api/bookings — Create a booking (transactional)
router.post('/', (req, res) => {
    const { deacon_id, day_id, location } = req.body;

    const locResult = validateLocation(location);
    if (!locResult.valid) {
        return res.status(400).json({ success: false, message: locResult.message });
    }

    if (!deacon_id || !day_id) {
        return res.status(400).json({ success: false, message: 'بيانات الحجز غير مكتملة' });
    }

    const createBooking = db.transaction(() => {
        const deacon = db.prepare('SELECT id FROM deacons WHERE id = ?').get(deacon_id);
        if (!deacon) {
            return { status: 404, body: { success: false, message: 'لم يتم العثور على الشماس' } };
        }

        const day = db.prepare('SELECT * FROM available_days WHERE id = ? AND is_active = 1').get(day_id);
        if (!day) {
            return { status: 404, body: { success: false, message: 'هذا اليوم غير متاح للحجز' } };
        }

        const duplicate = db.prepare(
            'SELECT id FROM bookings WHERE deacon_id = ? AND day_id = ?'
        ).get(deacon_id, day_id);
        if (duplicate) {
            return { status: 409, body: { success: false, message: 'لقد قمت بحجز هذا اليوم بالفعل' } };
        }

        if (location === 'church') {
            const churchCapacity = parseInt(
                db.prepare("SELECT value FROM settings WHERE key = 'church_capacity'").get().value
            );
            const maxPerDeacon = parseInt(
                db.prepare("SELECT value FROM settings WHERE key = 'max_church_per_deacon'").get().value
            );

            const churchCount = db.prepare(
                "SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'church'"
            ).get(day_id).count;

            if (churchCount >= churchCapacity) {
                return {
                    status: 409,
                    body: { success: false, message: 'الكنيسة ممتلئة في هذا اليوم', suggest_club: true, church_full: true }
                };
            }

            const deaconChurchCount = db.prepare(
                "SELECT COUNT(*) as count FROM bookings WHERE deacon_id = ? AND location = 'church'"
            ).get(deacon_id).count;

            if (deaconChurchCount >= maxPerDeacon) {
                return {
                    status: 403,
                    body: { success: false, message: `وصلت للحد الأقصى (${maxPerDeacon}) للحجز في الكنيسة`, suggest_club: true }
                };
            }
        }

        const stmt = db.prepare('INSERT INTO bookings (deacon_id, day_id, location) VALUES (?, ?, ?)');
        const result = stmt.run(deacon_id, day_id, location);

        const booking = db.prepare(`
            SELECT b.*, d.day_date, d.label as day_label
            FROM bookings b JOIN available_days d ON b.day_id = d.id
            WHERE b.id = ?
        `).get(result.lastInsertRowid);

        return { status: 201, body: { success: true, message: 'تم الحجز بنجاح', booking } };
    });

    try {
        const result = createBooking();
        res.status(result.status).json(result.body);
    } catch (err) {
        console.error('Error creating booking:', err);
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ success: false, message: 'لقد قمت بحجز هذا اليوم بالفعل' });
        }
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// PUT /api/bookings/:id — Edit booking
router.put('/:id', (req, res) => {
    const { location, day_id } = req.body;
    const bookingId = req.params.id;

    const editBooking = db.transaction(() => {
        const existing = db.prepare(`
            SELECT b.*, d.day_date FROM bookings b
            JOIN available_days d ON b.day_id = d.id
            WHERE b.id = ?
        `).get(bookingId);

        if (!existing) {
            return { status: 404, body: { success: false, message: 'لم يتم العثور على الحجز' } };
        }

        const newDayId = day_id || existing.day_id;
        const newLocation = location || existing.location;

        if (location) {
            const locResult = validateLocation(location);
            if (!locResult.valid) {
                return { status: 400, body: { success: false, message: locResult.message } };
            }
        }

        if (day_id) {
            const day = db.prepare('SELECT * FROM available_days WHERE id = ? AND is_active = 1').get(day_id);
            if (!day) {
                return { status: 404, body: { success: false, message: 'هذا اليوم غير متاح' } };
            }

            const dup = db.prepare(
                'SELECT id FROM bookings WHERE deacon_id = ? AND day_id = ? AND id != ?'
            ).get(existing.deacon_id, day_id, bookingId);
            if (dup) {
                return { status: 409, body: { success: false, message: 'لديك حجز بالفعل في هذا اليوم' } };
            }
        }

        if (newLocation === 'church') {
            const churchCapacity = parseInt(
                db.prepare("SELECT value FROM settings WHERE key = 'church_capacity'").get().value
            );
            const maxPerDeacon = parseInt(
                db.prepare("SELECT value FROM settings WHERE key = 'max_church_per_deacon'").get().value
            );

            const exclusion = existing.location === 'church' && existing.day_id === newDayId ? 1 : 0;
            const churchCount = db.prepare(
                "SELECT COUNT(*) as count FROM bookings WHERE day_id = ? AND location = 'church' AND id != ?"
            ).get(newDayId, exclusion ? bookingId : -1).count;

            if (churchCount >= churchCapacity) {
                return { status: 409, body: { success: false, message: 'الكنيسة ممتلئة في هذا اليوم', suggest_club: true } };
            }

            const deaconChurchCount = db.prepare(
                "SELECT COUNT(*) as count FROM bookings WHERE deacon_id = ? AND location = 'church' AND id != ?"
            ).get(existing.deacon_id, bookingId).count;

            if (deaconChurchCount >= maxPerDeacon) {
                return { status: 403, body: { success: false, message: 'وصلت للحد الأقصى للحجز في الكنيسة', suggest_club: true } };
            }
        }

        db.prepare('UPDATE bookings SET day_id = ?, location = ? WHERE id = ?')
            .run(newDayId, newLocation, bookingId);

        const updated = db.prepare(`
            SELECT b.*, d.day_date, d.label as day_label
            FROM bookings b JOIN available_days d ON b.day_id = d.id
            WHERE b.id = ?
        `).get(bookingId);

        return { status: 200, body: { success: true, message: 'تم تعديل الحجز بنجاح', booking: updated } };
    });

    try {
        const result = editBooking();
        res.status(result.status).json(result.body);
    } catch (err) {
        console.error('Error editing booking:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// DELETE /api/bookings/:id — Cancel booking
router.delete('/:id', (req, res) => {
    try {
        const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الحجز' });
        }

        db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: 'تم إلغاء الحجز بنجاح' });
    } catch (err) {
        console.error('Error canceling booking:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

module.exports = router;
