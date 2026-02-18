const express = require('express');
const router = express.Router();
const { notifyGroupStarted } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.post('/group', protect, notifyGroupStarted);

module.exports = router;
