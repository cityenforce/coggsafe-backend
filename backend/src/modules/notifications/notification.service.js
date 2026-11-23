const Notification = require('./notification.model');
const User = require('../users/user.model');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../constants/roles');
const { USER_STATUS, SOS_STATUS } = require('../../constants/sosConstants');
const { parsePagination, buildPaginationMeta } = require('../../utils/paginate');
const CollectionMembership = require('../collections/collectionMembership.model');
const EmergencyContactMembership = require('../collections/emergencyContactMembership.model');
const EmergencyContact = require('../collections/emergencyContact.model');

/**
 * Recipients for an SOS's notifications/dispatch: every active admin,
 * plus every other active member of the same collection, EXCLUDING the
 * SOS's own creator. This is the single, dedicated place recipient
 * selection lives — notification.service.createForSos, and
 * dispatch.service's SMS/email fan-out, all call this same function, so
 * the business rule can change here without touching any controller or
 * the dispatch/notification infrastructure around it.
 *
 * WHY THE CREATOR IS EXCLUDED: a Notification record represents someone
 * else being alerted about an emergency. The triggering user's own SOS
 * status (pending/active/cancelled/etc., including full component
 * detail) is already fully visible to them via GET /api/sos/:id and
 * GET /api/sos — that is their "own in-app SOS status" per spec, served
 * by the SOS module directly rather than by a self-addressed
 * notification. This was re-checked against the original collection-based
 * notification requirement (every recipient gets only the SOS they're
 * meant to see; the creator already has direct, complete access to their
 * own record) and kept as-is.
 *
 * ASSUMPTION STILL OPEN FOR APPROVAL: the approved schema has no
 * separate "emergency contact" concept distinct from collection
 * membership, so "admins + the rest of the collection" remains the most
 * direct grounded reading of the notification requirements against what
 * Phase 3 actually built.
 */
async function getRecipientsForSos(sos) {
  const ids = sos.collectionIds?.length ? sos.collectionIds : [sos.collectionId];
  const memberships = await CollectionMembership.find({collectionId: {$in: ids}, status: 'active'}).select('userId');
  const memberIds = memberships.map(m => m.userId);
  const recipients = await User.find({
    deletedAt: null,
    status: USER_STATUS.ACTIVE,
    $or: [
      { role: ROLES.ADMIN },
      {_id: {$in: memberIds}},
      {role: ROLES.USER, collectionId: {$in: ids}, _id: {$ne: sos.userId}},
    ],
  });
  const unique = new Map();
  recipients.forEach(recipient => {
    if (String(recipient._id) !== String(sos.userId) && !unique.has(String(recipient._id))) {
      unique.set(String(recipient._id), recipient);
    }
  });
  return [...unique.values()];
}

async function getEmergencyContactsForSos(sos) {
  const ids = sos.collectionIds?.length ? sos.collectionIds : [sos.collectionId];
  const memberships = await EmergencyContactMembership.find({collectionId: {$in: ids}}).select('contactId');
  const contactIds = [...new Map(memberships.map(m => [String(m.contactId), m.contactId])).values()];
  return EmergencyContact.find({_id: {$in: contactIds}});
}

/**
 * Creates one Notification row per recipient for a newly-activated SOS.
 * Does NOT send the actual push — that's dispatch.service's job, using
 * the push provider abstraction; this only builds the queryable
 * notification-history data model described in the spec.
 */
async function createForSos(sos, { user, collection }) {
  const recipients = await getRecipientsForSos(sos);
  if (recipients.length === 0) return [];

  const title = `SOS Alert — ${user.username}`;
  const body = `Collection: ${collection.name}`;

  const docs = recipients.map((recipient) => ({
    sosId: sos._id,
    recipientUserId: recipient._id,
    title,
    body,
  }));

  const created = await Notification.insertMany(docs);
  return created.map((doc, i) => ({ notification: doc, recipient: recipients[i] }));
}

/**
 * Lists a recipient's own notifications. `onlyActive` filters out
 * notifications whose SOS is no longer ACTIVE (i.e. deactivated) — per
 * spec, a deactivated SOS's notification should no longer appear as
 * active, without deleting the underlying notification or SOS history.
 */
async function listForUser(userId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { recipientUserId: userId };
  if (String(query.unreadOnly) === 'true') filter.isRead = false;

  const onlyActive = String(query.onlyActive) === 'true';

  if (onlyActive) {
    // User-facing notification lists must exclude deactivated SOS records,
    // and their pagination/badge total must reflect that filtered set too.
    // Populate first, then paginate the active records so an inactive SOS
    // cannot leave a stale notification/count behind because it occupied a
    // page slot.
    const allItems = await Notification.find(filter)
      .populate({ path: 'sosId', select: 'status emergencyMessage components liveLocation location emergencyToken' })
      .sort({ createdAt: -1 });
    const activeItems = allItems.filter((n) => n.sosId && n.sosId.status === SOS_STATUS.ACTIVE);
    const pagedItems = activeItems.slice(skip, skip + limit);
    return {
      items: pagedItems,
      meta: buildPaginationMeta({ page, limit, total: activeItems.length }),
    };
  }

  const [items, total] = await Promise.all([
    Notification.find(filter)
      .populate({ path: 'sosId', select: 'status emergencyMessage components liveLocation location emergencyToken' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { recipientUserId: userId, isRead: false },
    { $set: { isRead: true } },
  );
  return result.modifiedCount || 0;
}

async function markRead(notificationId, userId) {
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }
  if (String(notification.recipientUserId) !== String(userId)) {
    throw ApiError.forbidden('You do not have permission to access this notification');
  }
  notification.isRead = true;
  await notification.save();
  return notification;
}

module.exports = {
  getRecipientsForSos,
  getEmergencyContactsForSos,
  createForSos,
  listForUser,
  markRead,
  markAllRead,
};
