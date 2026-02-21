//reportRoutes.js
const express = require('express');
const router = express.Router();
const {
    createReport,
    getReports,
    getMyReports,
    getActiveReports,
    getUnseenReportsCount,
    updateReportStatus,
    acknowledgeReport,
    bulkUpdateReportStatus,
    extractReport,
    bulkExtractReports,
} = require('../controllers/reportController');
const { protect, staffCanUpdate } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, createReport)
    .get(protect, getReports);

router.route('/my')
    .get(protect, getMyReports);

router.route('/active')
    .get(protect, getActiveReports);

router.route('/unseen')
    .get(protect, getUnseenReportsCount);

router.route('/bulk/status')
    .put(protect, bulkUpdateReportStatus);

router.route('/:id/status')
    .put(protect, staffCanUpdate, updateReportStatus);

router.route('/:id/acknowledge')
    .put(protect, acknowledgeReport);

router.route('/:id/extract')
    .get(protect, extractReport);

router.route('/bulk-extract')
    .post(protect, bulkExtractReports);

module.exports = router;