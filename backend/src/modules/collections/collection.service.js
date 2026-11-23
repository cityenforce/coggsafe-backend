const Collection = require('./collection.model');
const User = require('../users/user.model');
const PushToken = require('../notifications/pushToken.model');
const Notification = require('../notifications/notification.model');
const ApiError = require('../../utils/ApiError');
const { COLLECTION_TYPES } = require('../../constants/sosConstants');
const { parsePagination, buildPaginationMeta } = require('../../utils/paginate');
const escapeRegex = require('../../utils/escapeRegex');
const CollectionMembership = require('./collectionMembership.model');
const EmergencyContact = require('./emergencyContact.model');
const EmergencyContactMembership = require('./emergencyContactMembership.model');

function titleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Resolves the final `name` for a collection given its type and the
 * (optional) name supplied by the admin.
 *   - type === "other": a non-empty custom name is REQUIRED.
 *   - any other type: name defaults to the title-cased type
 *     (e.g. "family" -> "Family") unless the admin supplied one.
 * This is the single place this rule is enforced, for both create and
 * update, so validation and business logic can't drift apart.
 */
function resolveName(type, name) {
  const trimmed = name && name.trim();
  if (type === COLLECTION_TYPES.OTHER) {
    if (!trimmed) {
      throw ApiError.badRequest('A custom collection name is required when type is "other"');
    }
    return trimmed;
  }
  if (type === COLLECTION_TYPES.PERSONAL) return 'Personal';
  if (type === COLLECTION_TYPES.EMPLOYEES) return 'Employees';
  // Preserve legacy records/clients exactly as they were stored.
  if (type === COLLECTION_TYPES.LEGACY_FAMILY || type === COLLECTION_TYPES.LEGACY_WORKERS) {
    return titleCase(type);
  }
  return trimmed || titleCase(type);
}

async function createCollection({ type, name, emergencyCallNumber, ownerId }) {
  const resolvedName = resolveName(type, name);
  const collection = await Collection.create({ type, name: resolvedName, emergencyCallNumber, ownerId: ownerId || null });
  return collection;
}

async function listCollections(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.search) filter.name = { $regex: escapeRegex(query.search), $options: 'i' };

  const [items, total] = await Promise.all([
    Collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Collection.countDocuments(filter),
  ]);

  const itemsWithCounts = await Promise.all(items.map(async item => {
    const userCount = await User.countDocuments({collectionId: item._id, deletedAt: null});
    const membershipCount = await CollectionMembership.countDocuments({collectionId: item._id, status: 'active'});
    return {...item.toObject(), userCount: membershipCount || userCount};
  }));

  return { items: itemsWithCounts, meta: buildPaginationMeta({ page, limit, total }) };
}

async function getCollectionById(id) {
  const collection = await Collection.findById(id);
  if (!collection) {
    throw ApiError.notFound('Collection not found');
  }
  return collection;
}

async function deleteCollection(id) {
  const collection = await getCollectionById(id);

  // A group owns its user memberships. When the group is permanently
  // deleted, remove those users, their registered push tokens, and their
  // notifications.
  // NOTE: SOS records (Sos) are deliberately PRESERVED so historical
  // emergency reporting remains durable and verifiable.
  const users = await User.find({ collectionId: collection._id }).select('_id');
  const userIds = users.map(user => user._id);

  if (userIds.length) {
    await PushToken.deleteMany({ userId: { $in: userIds } });
    await Notification.deleteMany({ userId: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds } });
  }

  await Notification.deleteMany({ collectionId: collection._id });
  await CollectionMembership.deleteMany({collectionId:collection._id});
  await EmergencyContactMembership.deleteMany({collectionId:collection._id});
  await Collection.deleteOne({ _id: collection._id });
  return null;
}

async function updateCollection(id, updates) {
  const collection = await getCollectionById(id);

  const nextType = updates.type !== undefined ? updates.type : collection.type;
  const nextNameInput = updates.name !== undefined ? updates.name : collection.name;
  const resolvedName = resolveName(nextType, nextNameInput);

  collection.type = nextType;
  collection.name = resolvedName;
  if (updates.emergencyCallNumber !== undefined) {
    collection.emergencyCallNumber = updates.emergencyCallNumber;
  }

  await collection.save();
  return collection;
}

async function listMine(userId) {
  const memberships = await CollectionMembership.find({ userId, status: 'active' }).select('collectionId');
  const ids = memberships.map(m => m.collectionId);
  const legacyUser = await User.findById(userId).select('collectionId');
  if (legacyUser?.collectionId && !ids.some(id => String(id) === String(legacyUser.collectionId))) {
    await CollectionMembership.updateOne(
      { userId, collectionId: legacyUser.collectionId },
      {$set: {status: 'active'}},
      {upsert: true}
    );
    ids.push(legacyUser.collectionId);
  }

  const items = await Collection.find({_id: {$in: ids}});
  return Promise.all(items.map(async item => {
    const userCount = await CollectionMembership.countDocuments({collectionId: item._id, status: 'active'});
    const legacyCount = await User.countDocuments({collectionId: item._id, deletedAt: null});
    return {...item.toObject(), userCount: userCount || legacyCount};
  }));
}

async function assertCollectionOwner(collectionId, ownerId) {
  const collection = await getCollectionById(collectionId);
  if (collection.ownerId && String(collection.ownerId) !== String(ownerId)) {
    throw ApiError.forbidden('You do not own this collection');
  }
  if (!collection.ownerId) {
    collection.ownerId = ownerId;
    await collection.save();
  }
  return collection;
}

async function addMember(collectionId, userId, ownerId) {
  await assertCollectionOwner(collectionId, ownerId);
  const user = await User.findOne({_id: userId, deletedAt: null});
  if (!user) throw ApiError.notFound('User not found');
  await CollectionMembership.updateOne(
    {collectionId, userId},
    {$set: {status: 'active'}},
    {upsert: true}
  );
  return user;
}

async function removeMember(collectionId, userId, ownerId) {
  await assertCollectionOwner(collectionId, ownerId);
  await CollectionMembership.updateOne(
    {collectionId, userId},
    {$set: {status: 'inactive'}}
  );
  return null;
}

async function listMembers(collectionId, ownerId) {
  await assertCollectionOwner(collectionId, ownerId);
  const memberships = await CollectionMembership.find({collectionId, status: 'active'}).select('userId');
  const ids = memberships.map(m => m.userId);
  const legacy = await User.find({collectionId, deletedAt: null}).select('_id');
  legacy.forEach(u => { if (!ids.some(id => String(id) === String(u._id))) ids.push(u._id); });
  return User.find({_id: {$in: ids}, deletedAt: null, status: 'active'});
}

async function addEmergencyContact(collectionId, ownerId, {name, mobileNumber}) {
  await assertCollectionOwner(collectionId, ownerId);
  const normalized = mobileNumber.replace(/[\s()-]/g, '');
  let contact = await EmergencyContact.findOne({mobileNumber: normalized});
  if (!contact) contact = await EmergencyContact.create({name: name.trim(), mobileNumber: normalized});
  await EmergencyContactMembership.updateOne(
    {contactId: contact._id, collectionId},
    {$setOnInsert: {contactId: contact._id, collectionId}},
    {upsert: true}
  );
  return contact;
}

async function removeEmergencyContact(collectionId, contactId, ownerId) {
  await assertCollectionOwner(collectionId, ownerId);
  await EmergencyContactMembership.deleteOne({collectionId, contactId});
  return null;
}

async function listEmergencyContacts(collectionId, ownerId) {
  await assertCollectionOwner(collectionId, ownerId);
  const memberships = await EmergencyContactMembership.find({collectionId}).select('contactId');
  return EmergencyContact.find({_id: {$in: memberships.map(m => m.contactId)}}).sort({name: 1});
}

module.exports = {
  createCollection,
  listCollections,
  getCollectionById,
  updateCollection,
  deleteCollection,
  listMine,
  assertCollectionOwner,
  addMember,
  removeMember,
  listMembers,
  addEmergencyContact,
  removeEmergencyContact,
  listEmergencyContacts,
};
