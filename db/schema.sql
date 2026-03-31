-- Deacons table (الشمامسة)
CREATE TABLE IF NOT EXISTS deacons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    stage TEXT NOT NULL,
    diaconal_rank TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Available days (الأيام المتاحة)
CREATE TABLE IF NOT EXISTS available_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_date TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bookings table (الحجوزات)
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deacon_id INTEGER NOT NULL,
    day_id INTEGER NOT NULL,
    location TEXT NOT NULL CHECK(location IN ('church', 'club')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (deacon_id) REFERENCES deacons(id) ON DELETE CASCADE,
    FOREIGN KEY (day_id) REFERENCES available_days(id) ON DELETE CASCADE,
    UNIQUE(deacon_id, day_id)
);

-- Settings table (الإعدادات)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('church_capacity', '90');
INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'admin123');
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_church_per_deacon', '2');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_day_location ON bookings(day_id, location);
CREATE INDEX IF NOT EXISTS idx_bookings_deacon ON bookings(deacon_id);
CREATE INDEX IF NOT EXISTS idx_deacons_phone ON deacons(phone);
