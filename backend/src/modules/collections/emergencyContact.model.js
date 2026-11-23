const mongoose = require('mongoose');
const { Schema } = mongoose;

const emergencyContactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);
