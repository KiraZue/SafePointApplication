//EmergencyReport.js
const mongoose = require('mongoose');

const emergencyReportSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    type: {
      type: String,
      required: true,
      enum: ['medical', 'fire', 'earthquake', 'security', 'accident', 'other', 'Medical', 'Fire', 'Earthquake', 'Security', 'Accident', 'Other'],
    },
    location: {
      description: { type: String },
      // 2D map coordinates (percentage values 0..100 of image width/height)
      x: { type: Number },
      y: { type: Number },
      // GPS coordinates (for mobile app compatibility)
      latitude: { type: Number },
      longitude: { type: Number },
    },
    status: {
      type: String,
      required: true,
      enum: ['REPORTED', 'ACKNOWLEDGED', 'RESPONDING', 'RESOLVED'],
      default: 'REPORTED',
    },
    statusHistory: [
      {
        status: String,
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    // Optional description for additional context
    description: {
      type: String,
    },
    // Optional image URI (for mobile reports)
    imageUri: {
      type: String,
    },
    // Optional user message/details
    message: {
      type: String,
    },
    // Flag to indicate if this was synced from offline
    syncedFromOffline: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const EmergencyReport = mongoose.model('EmergencyReport', emergencyReportSchema);

module.exports = EmergencyReport;