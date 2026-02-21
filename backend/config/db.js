// config/db.js — SQLite3 database initialization
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'safepoint.db');

let db;

try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log('[SQLite] Connected to', DB_PATH);
} catch (err) {
  console.error('[SQLite] Failed to open database:', err.message);
  process.exit(1);
}

// ─── Create Tables ───────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    middleName TEXT,
    userCode TEXT UNIQUE NOT NULL,
    password TEXT,
    role TEXT NOT NULL,
    registered INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    deletedBy TEXT,
    deletedAt TEXT,
    passwordChangedAt TEXT,
    passwordChangedBy TEXT,
    emergencyContactName TEXT,
    emergencyContactRelation TEXT,
    emergencyContactNumber TEXT,
    emergencyContactAddress TEXT,
    personalInfoLevelGroup TEXT,
    personalInfoGradeLevel TEXT,
    personalInfoStrandCourse TEXT,
    personalInfoContactNumber TEXT,
    pushToken TEXT,
    lastSeenReport TEXT DEFAULT (datetime('now')),
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS emergency_reports (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    locationDescription TEXT,
    locationX REAL,
    locationY REAL,
    locationLatitude REAL,
    locationLongitude REAL,
    status TEXT DEFAULT 'REPORTED',
    description TEXT,
    imageUri TEXT,
    message TEXT,
    syncedFromOffline INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS status_history (
    id TEXT PRIMARY KEY,
    reportId TEXT NOT NULL REFERENCES emergency_reports(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    updatedBy TEXT REFERENCES users(id),
    timestamp TEXT DEFAULT (datetime('now'))
  );
`);

console.log('[SQLite] Tables initialized');

module.exports = db;
