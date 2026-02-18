//authRoutes.js
const express = require('express');
const router = express.Router();
const {
  loginUser,
  registerUser,
  getUsers,
  getDeletedUsers,
  getChangedUsers,
  deleteUser,
  changeUserPassword,
  lookupByCode,
  setPassword,
  updateUserProfile,
  getUserProfile,
  getUserById
} = require('../controllers/authController');
const { protect, adminOnly, staffCanUpdate } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.get('/lookup/:code', lookupByCode);
router.post('/register-password', setPassword);
router.route('/profile').put(protect, updateUserProfile);
router.route('/profile/:id').get(protect, staffCanUpdate, getUserById);
router.route('/me').get(protect, getUserProfile);
router.route('/').post(protect, adminOnly, registerUser).get(protect, adminOnly, getUsers);
router.get('/deleted', protect, adminOnly, getDeletedUsers);
router.get('/changed', protect, adminOnly, getChangedUsers);
router.post('/:id/delete', protect, adminOnly, deleteUser);
router.post('/:id/change-password', protect, adminOnly, changeUserPassword);

module.exports = router;
