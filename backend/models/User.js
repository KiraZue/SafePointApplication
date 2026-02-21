// models/User.js — SQLite3 query helpers (replaces Mongoose model)
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a flat DB row into a structured user object */
function rowToUser(row, { includePassword = false } = {}) {
  if (!row) return null;
  const user = {
    _id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    middleName: row.middleName || undefined,
    userCode: row.userCode,
    role: row.role,
    registered: row.registered === 1,
    deleted: row.deleted === 1,
    deletedBy: row.deletedBy || undefined,
    deletedAt: row.deletedAt || undefined,
    passwordChangedAt: row.passwordChangedAt || undefined,
    passwordChangedBy: row.passwordChangedBy || undefined,
    emergencyContact: {
      name: row.emergencyContactName || undefined,
      relation: row.emergencyContactRelation || undefined,
      number: row.emergencyContactNumber || undefined,
      address: row.emergencyContactAddress || undefined,
    },
    personalInfo: {
      levelGroup: row.personalInfoLevelGroup || undefined,
      gradeLevel: row.personalInfoGradeLevel || undefined,
      strandCourse: row.personalInfoStrandCourse || undefined,
      contactNumber: row.personalInfoContactNumber || undefined,
    },
    pushToken: row.pushToken || undefined,
    lastSeenReport: row.lastSeenReport ? new Date(row.lastSeenReport) : new Date(),
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
  };
  if (includePassword) user.password = row.password;
  return user;
}

/** Build flat column object from structured user fields */
function userToRow(data) {
  const row = {};
  if (data.firstName !== undefined) row.firstName = data.firstName;
  if (data.lastName !== undefined) row.lastName = data.lastName;
  if (data.middleName !== undefined) row.middleName = data.middleName;
  if (data.userCode !== undefined) row.userCode = data.userCode;
  if (data.password !== undefined) row.password = data.password;
  if (data.role !== undefined) row.role = data.role;
  if (data.registered !== undefined) row.registered = data.registered ? 1 : 0;
  if (data.deleted !== undefined) row.deleted = data.deleted ? 1 : 0;
  if (data.deletedBy !== undefined) row.deletedBy = data.deletedBy;
  if (data.deletedAt !== undefined) row.deletedAt = data.deletedAt instanceof Date ? data.deletedAt.toISOString() : data.deletedAt;
  if (data.passwordChangedAt !== undefined) row.passwordChangedAt = data.passwordChangedAt instanceof Date ? data.passwordChangedAt.toISOString() : data.passwordChangedAt;
  if (data.passwordChangedBy !== undefined) row.passwordChangedBy = data.passwordChangedBy;
  if (data.pushToken !== undefined) row.pushToken = data.pushToken;
  if (data.lastSeenReport !== undefined) row.lastSeenReport = data.lastSeenReport instanceof Date ? data.lastSeenReport.toISOString() : data.lastSeenReport;

  if (data.emergencyContact) {
    if (data.emergencyContact.name !== undefined) row.emergencyContactName = data.emergencyContact.name;
    if (data.emergencyContact.relation !== undefined) row.emergencyContactRelation = data.emergencyContact.relation;
    if (data.emergencyContact.number !== undefined) row.emergencyContactNumber = data.emergencyContact.number;
    if (data.emergencyContact.address !== undefined) row.emergencyContactAddress = data.emergencyContact.address;
  }
  if (data.personalInfo) {
    if (data.personalInfo.levelGroup !== undefined) row.personalInfoLevelGroup = data.personalInfo.levelGroup;
    if (data.personalInfo.gradeLevel !== undefined) row.personalInfoGradeLevel = data.personalInfo.gradeLevel;
    if (data.personalInfo.strandCourse !== undefined) row.personalInfoStrandCourse = data.personalInfo.strandCourse;
    if (data.personalInfo.contactNumber !== undefined) row.personalInfoContactNumber = data.personalInfo.contactNumber;
  }
  return row;
}

// ─── Query API ────────────────────────────────────────────────────────────────

const User = {
  /** @returns {object|null} user without password by default */
  findById(id, { includePassword = false } = {}) {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return rowToUser(row, { includePassword });
  },

  /** Find one user by filter. Supported: { userCode }, { firstName, lastName }, { firstName, lastName, role, deleted } */
  findOne(filter = {}, { includePassword = false } = {}) {
    if (filter.userCode) {
      const row = db.prepare('SELECT * FROM users WHERE userCode = ?').get(filter.userCode);
      return rowToUser(row, { includePassword });
    }
    if (filter.firstName !== undefined && filter.lastName !== undefined) {
      let sql = 'SELECT * FROM users WHERE LOWER(firstName) = LOWER(?) AND LOWER(lastName) = LOWER(?)';
      const params = [filter.firstName, filter.lastName];
      if (filter.role !== undefined) { sql += ' AND role = ?'; params.push(filter.role); }
      if (filter.deleted !== undefined && filter.deleted !== null && typeof filter.deleted === 'object' && filter.deleted.$ne !== undefined) {
        sql += ' AND deleted != ?'; params.push(filter.deleted.$ne ? 1 : 0);
      } else if (filter.deleted !== undefined) {
        sql += ' AND deleted = ?'; params.push(filter.deleted ? 1 : 0);
      }
      const row = db.prepare(sql).get(...params);
      return rowToUser(row, { includePassword });
    }
    return null;
  },

  /**
   * Find many users. Supported filters: { deleted }, { pushToken: { $exists, $ne } }, { passwordChangedAt: { $exists } }
   * Returns array of user objects (with .populate stub)
   */
  find(filter = {}) {
    let sql = 'SELECT * FROM users WHERE 1=1';
    const params = [];

    if (filter.deleted !== undefined) {
      if (filter.deleted === true) { sql += ' AND deleted = 1'; }
      else if (filter.deleted === false) { sql += ' AND deleted = 0'; }
      else if (filter.deleted && filter.deleted.$ne !== undefined) {
        sql += ' AND deleted != ?'; params.push(filter.deleted.$ne ? 1 : 0);
      }
    }
    if (filter.pushToken) {
      if (filter.pushToken.$exists === true && filter.pushToken.$ne !== undefined) {
        sql += " AND pushToken IS NOT NULL AND pushToken != ''";
      }
    }
    if (filter.passwordChangedAt) {
      if (filter.passwordChangedAt.$exists === true && filter.passwordChangedAt.$ne === null) {
        sql += ' AND passwordChangedAt IS NOT NULL';
      }
    }
    if (filter._id && filter._id.$ne !== undefined) {
      sql += ' AND id != ?'; params.push(filter._id.$ne);
    }

    const rows = db.prepare(sql).all(...params);
    const users = rows.map(r => rowToUser(r));

    // .populate() stub — populate deletedBy or passwordChangedBy fields inline
    users.populate = (field, selectFields) => {
      for (const u of users) {
        if (field === 'deletedBy' && u.deletedBy) {
          const ref = User.findById(u.deletedBy);
          if (ref) u.deletedBy = ref;
        }
        if (field === 'passwordChangedBy' && u.passwordChangedBy) {
          const ref = User.findById(u.passwordChangedBy);
          if (ref) u.passwordChangedBy = ref;
        }
      }
      return users;
    };

    return users;
  },

  /** Count documents matching filter. Supported: {} */
  countDocuments(filter = {}) {
    let sql = 'SELECT COUNT(*) as cnt FROM users WHERE 1=1';
    const params = [];
    if (filter.deleted !== undefined) {
      if (typeof filter.deleted === 'boolean') { sql += ' AND deleted = ?'; params.push(filter.deleted ? 1 : 0); }
    }
    const row = db.prepare(sql).get(...params);
    return row ? row.cnt : 0;
  },

  /** Create a new user. Hashes password if provided. Returns the created user object. */
  async create(data) {
    const id = uuidv4();
    let password = data.password || null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      password = await bcrypt.hash(password, salt);
    }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (
        id, firstName, lastName, middleName, userCode, password, role,
        registered, deleted, lastSeenReport, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id, data.firstName, data.lastName, data.middleName || null,
      data.userCode, password, data.role,
      data.registered ? 1 : 0, now, now, now
    );
    return User.findById(id);
  },

  /** Save (update) a user object. Hashes password if it changed. */
  async save(userObj) {
    // Check if password needs hashing (raw, not yet a bcrypt hash)
    if (userObj.password && !userObj.password.startsWith('$2')) {
      const salt = await bcrypt.genSalt(10);
      userObj.password = await bcrypt.hash(userObj.password, salt);
    }
    const row = userToRow(userObj);
    if (userObj.password) row.password = userObj.password;
    row.updatedAt = new Date().toISOString();

    const sets = Object.keys(row).map(k => `${k} = ?`).join(', ');
    const vals = Object.values(row);
    db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...vals, userObj._id);
    return User.findById(userObj._id);
  },

  /** Compare plain password with stored hash */
  async matchPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
  },
};

module.exports = User;
