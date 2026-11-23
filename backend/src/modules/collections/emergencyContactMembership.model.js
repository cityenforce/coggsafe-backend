const mongoose = require('mongoose');
const { Schema } = mongoose;

const emergencyContactMembershipSchema = new Schema(
  {
    contactId: { type: Schema.Types.ObjectId, ref: 'EmergencyContact', required: true },
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
  },
  { timestamps: true }
);

emergencyContactMembershipSchema.index({ contactId: 1, collectionId: 1 }, { unique: true });
emergencyContactMembershipSchema.index({ collectionId: 1 });

module.exports = mongoose.model('EmergencyContactMembership', emergencyContactMembershipSchema);
