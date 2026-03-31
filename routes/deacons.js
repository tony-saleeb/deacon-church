const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { validateBookingInput, validateLocation } = require('../middleware/validation');

// POST /api/deacons/book — One-shot: register/find deacon + create booking
router.post('/book', validateBookingInput, (req, res) => {
    const { full_name, stage, diaconal_rank, phone, day_id, location } = req.body;

    // Validate location
    const locResult = validateLocation(location);
    if (!locResult.valid) {
        return res.status(400).json({ success: false, message: locResult.message });
    }
    if (!day_id) {
        return res.status(400).json({ success: false, message: 'يجب اختيار اليوم' });
    }

    const doBook = db.transaction(() => {
        // 1. Find or create deacon
        let deacon = db.prepare('SELECT * FROM deacons WHERE phone = ?').get(phone);
        if (deacon) {
            // Update info in case they changed anything
            db.prepare('UPDATE deacons SET full_name = ?, stage = ?, diaconal_rank = ? WHERE id = ?')
                .run(full_name, stage, diaconal_rank, deacon.id);
            deacon = db.prepare('SELECT * FROM deacons WHERE id = ?').get(deacon.id);
        } else {
            const result = db.prepare(
                'INSERT INTO deacons (full_name, stage, diaconal_rank, phone) VALUES (?, ?, ?, ?)'
            ).run(full_name, stage, diaconal_rank, phone);
            deacon = db.prepare('SELECT * FROM deacons WHERE id = ?').get(result.lastInsertRowid);
        }

        // 2. Verify day is active
        const day = db.prepare('SELECT * FROM available_days WHERE id = ? AND is_active = 1').get(day_id);
        if (!day) {
            return { status: 404, body: { success: false, message: 'هذا اليوم غير متاح للحجز' } };
        }

        // 3. Check duplicate (same deacon, same day)
        const dup = db.prepare('SELECT id FROM bookings WHERE deacon_id = ? AND day_id = ?').get(deacon.id, day_id);
        if (dup) {
            return { status: 409, body: { success: false, message: 'لقد قمت بحجز هذا اليوم بالفعل بنفس رقم التليفون' } };
        }

        // 4. Church constraints
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
                    body: {
                        success: false,
                        message: 'الكنيسة ممتلئة في هذا اليوم',
                        suggest_club: true
                    }
                };
            }

            const deaconChurchCount = db.prepare(
                "SELECT COUNT(*) as count FROM bookings WHERE deacon_id = ? AND location = 'church'"
            ).get(deacon.id).count;

            if (deaconChurchCount >= maxPerDeacon) {
                return {
                    status: 403,
                    body: {
                        success: false,
                        message: `وصلت للحد الأقصى (${maxPerDeacon}) للحجز في الكنيسة`,
                        suggest_club: true
                    }
                };
            }
        }

        // 5. Create booking
        db.prepare('INSERT INTO bookings (deacon_id, day_id, location) VALUES (?, ?, ?)')
            .run(deacon.id, day_id, location);

        return {
            status: 201,
            body: {
                success: true,
                message: 'تم الحجز بنجاح',
                deacon: { id: deacon.id, full_name: deacon.full_name, phone: deacon.phone, stage: deacon.stage, diaconal_rank: deacon.diaconal_rank },
                day: { label: day.label, day_date: day.day_date },
                location
            }
        };
    });

    try {
        const result = doBook();
        res.status(result.status).json(result.body);
    } catch (err) {
        console.error('Error booking:', err);
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ success: false, message: 'لقد قمت بحجز هذا اليوم بالفعل' });
        }
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

// GET /api/deacons/my-bookings — Get bookings by phone
router.get('/my-bookings', (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'رقم التليفون مطلوب' });

    const cleaned = phone.replace(/[\s\-\(\)]/g, '').replace(/^\+?2/, '');
    
    try {
        const deacon = db.prepare('SELECT id, full_name, phone FROM deacons WHERE phone = ?').get(cleaned);
        if (!deacon) {
            return res.json({ success: true, bookings: [], deacon: null });
        }

        const bookings = db.prepare(`
            SELECT b.id, b.location, d.label as day_label, d.day_date
            FROM bookings b
            JOIN available_days d ON b.day_id = d.id
            WHERE b.deacon_id = ?
            ORDER BY d.day_date ASC
        `).all(deacon.id);

        res.json({ success: true, bookings, deacon });
    } catch (err) {
        console.error('Error fetching my bookings:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ في النظام' });
    }
});

module.exports = router;
