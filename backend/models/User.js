//User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    middleName: {
      type: String,
    },
    userCode: {
      type: String,
      required: true,
      unique: true,
      minlength: 7,
      maxlength: 7,
    },
    password: {
      type: String,
      required: false,
    },
    role: {
      type: String,
      required: true,
      enum: ['Student', 'Teacher', 'Admin', 'Security Personnel'],
    },
    registered: {
      type: Boolean,
      default: false,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    deletedAt: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
    passwordChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    emergencyContact: {
      name: { type: String },
      relation: { type: String },
      number: { type: String },
      address: { type: String },
    },
    personalInfo: {
      levelGroup: { type: String },
      gradeLevel: { type: String },
      strandCourse: { type: String },
      contactNumber: { type: String },
    },
    pushToken: {
      type: String,
    },
    lastSeenReport: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);

module.exports = User;
