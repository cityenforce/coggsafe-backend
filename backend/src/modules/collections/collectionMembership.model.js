const mongoose = require('mongoose');
const { Schema } = mongoose;

const collectionMembershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true }
);

collectionMembershipSchema.index({ userId: 1, collectionId: 1 }, { unique: true });
collectionMembershipSchema.index({ collectionId: 1, status: 1 });
collectionMembershipSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('CollectionMembership', collectionMembershipSchema);
