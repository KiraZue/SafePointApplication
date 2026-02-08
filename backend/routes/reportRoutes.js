//reportRoutes.js
const express = require('express');
const router = express.Router();
const { 
  createReport, 
  getReports, 
  getActiveReports, 
  updateReportStatus, 
  acknowledgeReport,
  bulkUpdateReportStatus 
} = require('../controllers/reportController');
const { protect, staffCanUpdate } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, createReport)
    .get(protect, getReports);

router.route('/active')
    .get(protect, getActiveReports);

router.route('/bulk/status')
    .put(protect, bulkUpdateReportStatus);

router.route('/:id/status')
    .put(protect, staffCanUpdate, updateReportStatus);

router.route('/:id/acknowledge')
    .put(protect, acknowledgeReport);

module.exports = router;