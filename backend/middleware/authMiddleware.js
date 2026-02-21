// authMiddleware.js — SQLite3 version
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // findById returns user without password by default
      req.user = User.findById(decoded.id);

      if (!req.user) throw new Error('User not found');

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'Admin') {
    next();
  } else {
    res.status(401).json({ message: 'Not authorized as an admin' });
  }
};

const staffCanUpdate = (req, res, next) => {
  if (req.user && ['Admin', 'Security Personnel', 'Teacher'].includes(req.user.role)) {
    next();
  } else {
    res.status(401).json({ message: 'Not authorized' });
  }
};

module.exports = { protect, adminOnly, staffCanUpdate };
