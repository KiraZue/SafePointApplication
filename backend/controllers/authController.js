const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  const { userCode, password, fullName } = req.body;
  let user = null;
  if (userCode) {
    user = await User.findOne({ userCode });
  } else if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      user = await User.findOne({ firstName: new RegExp(`^${firstName}$`, 'i'), lastName: new RegExp(`^${lastName}$`, 'i') });
    }
  }
  if (!user) {
    return res.status(401).json({ message: 'User not found' });
  }
  if ((!user.registered || !user.password) && !['Admin', 'Security Personnel'].includes(user.role)) {
    return res.status(403).json({ message: 'User not registered. Please sign up.' });
  }
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  res.json({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    userCode: user.userCode,
    role: user.role,
    token: generateToken(user._id),
  });
};

// @desc    Register a new user
// @route   POST /api/users
// @access  Private/Admin
const registerUser = async (req, res) => {
  const { firstName, lastName, middleName, role } = req.body;

  // Generate 7-char random code
  const generateUserCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 7; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
  };

  let userCode = generateUserCode();
  // Check uniqueness (simple check)
  let userExists = await User.findOne({ userCode });
  while(userExists) {
      userCode = generateUserCode();
      userExists = await User.findOne({ userCode });
  }

  // Prevent duplicate names per role (case-insensitive, excluding deleted)
  const existing = await User.findOne({
    firstName: new RegExp(`^${firstName}$`, 'i'),
    lastName: new RegExp(`^${lastName}$`, 'i'),
    role,
    deleted: { $ne: true },
  });
  if (existing) {
    return res.status(400).json({ message: 'Duplicate name exists for this role' });
  }

  const user = await User.create({
    firstName,
    lastName,
    middleName,
    userCode,
    role,
    registered: false,
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      userCode: user.userCode,
      role: user.role,
    });
  } else {
    res.status(400).json({ message: 'Invalid user data' });
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  const users = await User.find({ deleted: { $ne: true } });
  res.json(users);
};

// @desc    Get deleted users
// @route   GET /api/users/deleted
// @access  Private/Admin
const getDeletedUsers = async (req, res) => {
  const users = await User.find({ deleted: true }).populate('deletedBy', 'firstName lastName userCode');
  res.json(users);
};

// @desc    Get users with changed passwords
// @route   GET /api/users/changed
// @access  Private/Admin
const getChangedUsers = async (req, res) => {
  const users = await User.find({ passwordChangedAt: { $exists: true, $ne: null } })
    .populate('passwordChangedBy', 'firstName lastName userCode');
  res.json(users);
};

// @desc    Delete user (soft delete) with admin password confirmation
// @route   POST /api/users/:id/delete
// @access  Private/Admin
const deleteUser = async (req, res) => {
  const { password } = req.body;
  const admin = await User.findById(req.user._id);
  if (!admin || !(await admin.matchPassword(password))) {
    return res.status(401).json({ message: 'Admin password incorrect' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.deleted = true;
  user.deletedBy = admin._id;
  user.deletedAt = new Date();
  await user.save();
  res.json({ message: 'User deleted', userId: user._id });
};

// @desc    Change user's password with admin confirmation
// @route   POST /api/users/:id/change-password
// @access  Private/Admin
const changeUserPassword = async (req, res) => {
  const { newPassword, password } = req.body; // password: admin's password
  const admin = await User.findById(req.user._id);
  if (!admin || !(await admin.matchPassword(password))) {
    return res.status(401).json({ message: 'Admin password incorrect' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.passwordChangedBy = admin._id;
  await user.save();
  res.json({ message: 'Password changed', userId: user._id });
};

// @desc    Lookup user by code (Public for signup)
// @route   GET /api/users/lookup/:code
const lookupByCode = async (req, res) => {
  const code = req.params.code;
  const user = await User.findOne({ userCode: code });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({
    firstName: user.firstName,
    lastName: user.lastName,
    middleName: user.middleName || '',
    role: user.role,
    userCode: user.userCode,
    registered: user.registered,
  });
};

// @desc    Set password for user during signup (Public)
// @route   POST /api/users/register-password
const setPassword = async (req, res) => {
  const { userCode, password } = req.body;
  const user = await User.findOne({ userCode });
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.registered) {
    return res.status(400).json({ message: 'This user is already registered' });
  }
  user.password = password;
  user.registered = true;
  await user.save();
  res.json({ message: 'Password set', userCode: user.userCode });
};

module.exports = { loginUser, registerUser, getUsers, getDeletedUsers, getChangedUsers, deleteUser, changeUserPassword, lookupByCode, setPassword };
