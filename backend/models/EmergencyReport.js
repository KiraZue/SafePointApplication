// models/EmergencyReport.js — SQLite3 query helpers (replaces Mongoose model)
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const User = require('./User');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToReport(row) {
  if (!row) return null;
  return {
    _id: row.id,
    user: row.userId,
    type: row.type,
    location: {
      description: row.locationDescription || undefined,
      x: row.locationX !== null ? row.locationX : undefined,
      y: row.locationY !== null ? row.locationY : undefined,
      latitude: row.locationLatitude !== null ? row.locationLatitude : undefined,
      longitude: row.locationLongitude !== null ? row.locationLongitude : undefined,
    },
    status: row.status,
    description: row.description || undefined,
    imageUri: row.imageUri || undefined,
    message: row.message || undefined,
    syncedFromOffline: row.syncedFromOffline === 1,
    statusHistory: [],
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
  };
}

/** Fetch and attach statusHistory rows to a report, with optional user population */
function attachStatusHistory(report, populate = true) {
  const historyRows = db
    .prepare('SELECT * FROM status_history WHERE reportId = ? ORDER BY timestamp ASC')
    .all(report._id);

  report.statusHistory = historyRows.map(h => {
    const entry = {
      _id: h.id,
      status: h.status,
      updatedBy: h.updatedBy,
      timestamp: h.timestamp ? new Date(h.timestamp) : new Date(),
    };
    if (populate && h.updatedBy) {
      const u = User.findById(h.updatedBy);
      if (u) {
        entry.updatedBy = {
          _id: u._id,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.role,
          userCode: u.userCode,
        };
      }
    }
    return entry;
  });
  return report;
}

/** Attach populated user to a report */
function attachUser(report) {
  if (!report.user) return report;
  const userId = typeof report.user === 'object' ? report.user._id : report.user;
  const u = User.findById(userId);
  if (u) {
    report.user = {
      _id: u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      userCode: u.userCode,
    };
  }
  return report;
}

/** Add statusHistory entry to DB */
function insertStatusHistory(reportId, status, updatedBy, timestamp) {
  db.prepare(`
    INSERT INTO status_history (id, reportId, status, updatedBy, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), reportId, status, updatedBy || null, timestamp ? new Date(timestamp).toISOString() : new Date().toISOString());
}

// ─── Query API ────────────────────────────────────────────────────────────────

const EmergencyReport = {
  /**
   * Find a report by ID, with populated user and statusHistory.
   */
  findById(id) {
    const row = db.prepare('SELECT * FROM emergency_reports WHERE id = ?').get(id);
    if (!row) return null;
    const report = rowToReport(row);
    attachUser(report);
    attachStatusHistory(report);
    return report;
  },

  /**
   * Find many reports. filter supports: { status: { $ne: 'RESOLVED' } }, { user: id }, {}
   * opts: { sort: { createdAt: -1 }, limit: 100, select: '...' }
   */
  find(filter = {}, opts = {}) {
    let sql = 'SELECT * FROM emergency_reports WHERE 1=1';
    const params = [];

    if (filter.status) {
      if (filter.status.$ne !== undefined) {
        sql += ' AND status != ?'; params.push(filter.status.$ne);
      } else if (typeof filter.status === 'string') {
        sql += ' AND status = ?'; params.push(filter.status);
      }
    }
    if (filter.user !== undefined) {
      sql += ' AND userId = ?'; params.push(typeof filter.user === 'object' ? filter.user._id : filter.user);
    }
    if (filter.syncedFromOffline !== undefined) {
      sql += ' AND syncedFromOffline = ?'; params.push(filter.syncedFromOffline ? 1 : 0);
    }

    // Date range filter (for cleanup): { updatedAt: { $lt: date } }
    if (filter.updatedAt && filter.updatedAt.$lt) {
      sql += ' AND updatedAt < ?'; params.push(new Date(filter.updatedAt.$lt).toISOString());
    }
    if (filter.createdAt && filter.createdAt.$gt) {
      sql += ' AND createdAt > ?'; params.push(new Date(filter.createdAt.$gt).toISOString());
    }

    // Sort
    if (opts.sort) {
      const [col, dir] = Object.entries(opts.sort)[0];
      const sqlCol = col === 'createdAt' ? 'createdAt' : col;
      sql += ` ORDER BY ${sqlCol} ${dir === -1 ? 'DESC' : 'ASC'}`;
    } else {
      sql += ' ORDER BY createdAt DESC';
    }

    if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }

    const rows = db.prepare(sql).all(...params);
    const reports = rows.map(r => {
      const report = rowToReport(r);
      attachUser(report);
      attachStatusHistory(report);
      return report;
    });

    // Chainable stubs to match Mongoose API patterns
    const chain = {
      _reports: reports,
      populate() { return chain; },
      select() { return chain; },
      sort(s) {
        if (s && s.createdAt === -1) chain._reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return chain;
      },
      limit(n) { chain._reports = chain._reports.slice(0, n); return chain; },
      then(resolve) { return Promise.resolve(chain._reports).then(resolve); },
      [Symbol.iterator]() { return chain._reports[Symbol.iterator](); },
    };

    // Make it behave as array directly too
    Object.setPrototypeOf(reports, Object.getPrototypeOf([]));
    reports.populate = () => reports;
    reports.select = () => reports;
    reports.sort = (fn) => { if (typeof fn === 'function') Array.prototype.sort.call(reports, fn); return reports; };
    reports.limit = (n) => reports.slice(0, n);

    return reports;
  },

  /**
   * Find one report matching a filter. Supports checking for duplicates by createdAt range + user + type + coords.
   */
  findOne(filter = {}) {
    let sql = 'SELECT * FROM emergency_reports WHERE 1=1';
    const params = [];

    if (filter.$or) {
      const orClauses = [];
      for (const clause of filter.$or) {
        const clauseParts = [];
        if (clause.user !== undefined) { clauseParts.push('userId = ?'); params.push(clause.user); }
        if (clause.type !== undefined) { clauseParts.push('type = ?'); params.push(clause.type); }
        if (clause['location.latitude'] !== undefined) { clauseParts.push('locationLatitude = ?'); params.push(clause['location.latitude']); }
        if (clause['location.longitude'] !== undefined) { clauseParts.push('locationLongitude = ?'); params.push(clause['location.longitude']); }
        if (clause.createdAt) {
          if (clause.createdAt.$gte) { clauseParts.push('createdAt >= ?'); params.push(new Date(clause.createdAt.$gte).toISOString()); }
          if (clause.createdAt.$lte) { clauseParts.push('createdAt <= ?'); params.push(new Date(clause.createdAt.$lte).toISOString()); }
        }
        if (clauseParts.length) orClauses.push(`(${clauseParts.join(' AND ')})`);
      }
      if (orClauses.length) sql += ` AND (${orClauses.join(' OR ')})`;
    }

    const row = db.prepare(sql + ' LIMIT 1').get(...params);
    if (!row) return null;
    const report = rowToReport(row);
    attachUser(report);
    attachStatusHistory(report);
    return report;
  },

  /** Count documents matching simple filters */
  countDocuments(filter = {}) {
    let sql = 'SELECT COUNT(*) as cnt FROM emergency_reports WHERE 1=1';
    const params = [];
    if (filter.status && filter.status.$ne !== undefined) {
      sql += ' AND status != ?'; params.push(filter.status.$ne);
    }
    if (filter.createdAt && filter.createdAt.$gt) {
      sql += ' AND createdAt > ?'; params.push(new Date(filter.createdAt.$gt).toISOString());
    }
    const row = db.prepare(sql).get(...params);
    return row ? row.cnt : 0;
  },

  /** Delete many reports (for cleanup) */
  deleteMany(filter = {}) {
    let sql = 'DELETE FROM emergency_reports WHERE 1=1';
    const params = [];
    if (filter.status && typeof filter.status === 'string') {
      sql += ' AND status = ?'; params.push(filter.status);
    }
    if (filter.updatedAt && filter.updatedAt.$lt) {
      sql += ' AND updatedAt < ?'; params.push(new Date(filter.updatedAt.$lt).toISOString());
    }
    const result = db.prepare(sql).run(...params);
    return { deletedCount: result.changes };
  },

  /**
   * Create a new report (with optional statusHistory array).
   * Returns the fully populated report.
   */
  async create(data) {
    const id = uuidv4();
    const now = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    const userId = data.user?._id || data.user;

    db.prepare(`
      INSERT INTO emergency_reports (
        id, userId, type,
        locationDescription, locationX, locationY, locationLatitude, locationLongitude,
        status, description, imageUri, message, syncedFromOffline,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, userId, data.type,
      data.location?.description || null,
      data.location?.x ?? null,
      data.location?.y ?? null,
      data.location?.latitude ?? null,
      data.location?.longitude ?? null,
      data.status || 'REPORTED',
      data.description || null,
      data.imageUri || null,
      data.message || null,
      data.syncedFromOffline ? 1 : 0,
      now, now
    );

    // Insert provided statusHistory (for offline sync)
    if (data.statusHistory && Array.isArray(data.statusHistory)) {
      for (const h of data.statusHistory) {
        const hUserId = h.updatedBy?._id || h.updatedBy || userId;
        insertStatusHistory(id, h.status, hUserId, h.timestamp || h.updatedAt);
      }
    }

    return EmergencyReport.findById(id);
  },

  /**
   * Save (update) an existing report object.
   * Writes status, statusHistory additions, and updatedAt.
   */
  async save(reportObj) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE emergency_reports
      SET status = ?, syncedFromOffline = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      reportObj.status,
      reportObj.syncedFromOffline ? 1 : 0,
      now,
      reportObj._id
    );

    // Sync statusHistory: insert any entries not yet in DB
    const existingRows = db
      .prepare('SELECT * FROM status_history WHERE reportId = ?')
      .all(reportObj._id);

    for (const h of (reportObj.statusHistory || [])) {
      const hUserId = h.updatedBy?._id || h.updatedBy;
      const alreadyExists = existingRows.some(
        e => e.status === h.status && e.updatedBy === hUserId
      );
      if (!alreadyExists && hUserId) {
        insertStatusHistory(reportObj._id, h.status, hUserId, h.timestamp);
      }
    }

    return EmergencyReport.findById(reportObj._id);
  },
};

module.exports = EmergencyReport;