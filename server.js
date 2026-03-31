const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Active admin sessions (in-memory, keyed by session token)
const adminSessions = new Map();
const SESSION_TTL = 4 * 60 * 60 * 1000; // 4 hours

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files EXCEPT admin pages (protected)
app.use((req, res, next) => {
    // Block direct access to admin.html and admin-login.html via URL
    if (req.path === '/admin.html' || req.path === '/admin-login.html') {
        return res.status(403).send('Forbidden');
    }
    next();
});
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.html')) {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');
        }
    }
}));

// Initialize database (runs schema on require)
const db = require('./db/database');

// ── Admin Auth Routes (server-side session) ──

// Parse session cookie helper
function getSessionFromCookie(req) {
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/admin_session=([^;]+)/);
    return match ? match[1] : null;
}

function isAdminAuthenticated(req) {
    const token = getSessionFromCookie(req);
    if (!token) return false;
    const session = adminSessions.get(token);
    if (!session) return false;
    if (Date.now() > session.expires) {
        adminSessions.delete(token);
        return false;
    }
    return true;
}

// Admin login page (shows password form)
app.get('/admin/login', (req, res) => {
    if (isAdminAuthenticated(req)) {
        return res.redirect('/admin');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Admin login POST (validates password, sets session cookie)
app.post('/admin/login', async (req, res) => {
    const { password } = req.body;
    try {
        const result = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'admin_password'", args: [] });
        const adminPassword = result.rows[0].value;

        if (password === adminPassword) {
            const sessionToken = generateSessionToken();
            adminSessions.set(sessionToken, { expires: Date.now() + SESSION_TTL });

            res.cookie('admin_session', sessionToken, {
                httpOnly: true,
                maxAge: SESSION_TTL,
                sameSite: 'strict',
                path: '/'
            });
            res.redirect('/admin');
        } else {
            res.redirect('/admin/login?error=1');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.redirect('/admin/login?error=1');
    }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
    const token = getSessionFromCookie(req);
    if (token) adminSessions.delete(token);
    res.clearCookie('admin_session');
    res.redirect('/admin/login');
});

// Admin dashboard (protected — requires valid session)
app.get('/admin', (req, res) => {
    if (!isAdminAuthenticated(req)) {
        return res.redirect('/admin/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API: Get admin token from cookie session (so JS can bootstrap)
app.get('/api/admin/token', async (req, res) => {
    if (isAdminAuthenticated(req)) {
        try {
            const result = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'admin_password'", args: [] });
            const pw = result.rows[0].value;
            res.json({ success: true, token: pw });
        } catch (err) {
            res.status(500).json({ success: false });
        }
    } else {
        res.status(401).json({ success: false });
    }
});

// API Routes
app.use('/api/deacons', require('./routes/deacons'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/admin', require('./routes/admin'));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'حدث خطأ غير متوقع. حاول مرة أخرى'
    });
});

// For local development, listen on port. For Vercel, export the app.
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Deacon Booking System running at http://localhost:${PORT}`);
        console.log(`Admin panel at http://localhost:${PORT}/admin`);
    });
}

module.exports = app;
