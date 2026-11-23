const User = require('./user.model');
const Collection = require('../collections/collection.model');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../constants/roles');
const { USER_STATUS } = require('../../constants/sosConstants');
const { parsePagination, buildPaginationMeta } = require('../../utils/paginate');
const escapeRegex = require('../../utils/escapeRegex');
const { decryptCredentialPassword } = require('../../utils/password');

// Every read in this module excludes soft-deleted users by default —
// a deleted user should behave as gone from all admin management views,
// while still physically existing so future SOS records can reference it.
const NOT_DELETED = { deletedAt: null };

async function assertCollectionExists(collectionId) {
  const exists = await Collection.exists({ _id: collectionId });
  if (!exists) {
    throw ApiError.badRequest('collectionId does not reference an existing collection');
  }
}

/**
 * Creates a user inside a Collection.
 *
 * SECURITY: this function has no `role` parameter at all — there is no
 * code path through which a caller, even with a fully-trusted req.body,
 * can make this create anything other than ROLES.USER. The only place
 * ROLES.ADMIN is ever assigned is src/seeds/createAdmin.js.
 */
async function createUser({ username, mobileNumber, password, email, collectionId }) {
  await assertCollectionExists(collectionId);

  const user = new User({
    username,
    mobileNumber,
    email: email || undefined,
    collectionId,
    groupMemberships: [
      {
        collectionId,
        role: 'user',
        assignedAt: new Date(),
      },
    ],
    adminCreated: false, // membership-only user
    role: ROLES.USER, // hard-coded, never derived from caller input
  });
  await user.setPassword(password);
  await user.save();
  return user;
}

async function createOrAssignBoss({ username, mobileNumber, password, email, collectionIds, groupRole = 'boss' }) {
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
    throw ApiError.badRequest('At least one group must be assigned');
  }

  const existingCollections = await Collection.find({ _id: { $in: collectionIds } });
  if (existingCollections.length !== collectionIds.length) {
    throw ApiError.badRequest('One or more collectionIds do not reference an existing collection');
  }

  let user = await User.findOne({ mobileNumber, ...NOT_DELETED });

  if (user) {
    // Assign to existing user without creating a duplicate account
    if (username && username.trim() && username.trim() !== user.username) {
      const taken = await User.findOne({ username: username.trim(), _id: { $ne: user._id }, ...NOT_DELETED });
      if (taken) {
        throw ApiError.conflict('Username already taken by another user');
      }
      user.username = username.trim();
    }
    if (email !== undefined) {
      user.email = email === null || email === '' ? undefined : email.trim();
    }
    if (password && password.trim()) {
      if (password.length < 8) {
        throw ApiError.badRequest('Password must be at least 8 characters');
      }
      await user.setPassword(password);
    }

    user.adminCreated = true;

    if (!user.groupMemberships) {
      user.groupMemberships = [];
    }

    // Preserve existing group memberships
    if (user.collectionId && !user.groupMemberships.some(m => String(m.collectionId?._id || m.collectionId) === String(user.collectionId))) {
      user.groupMemberships.push({
        collectionId: user.collectionId,
        role: 'user',
        assignedAt: new Date(),
      });
    }

    collectionIds.forEach(colId => {
      const idx = user.groupMemberships.findIndex(m => String(m.collectionId?._id || m.collectionId) === String(colId));
      if (idx >= 0) {
        user.groupMemberships[idx].role = groupRole;
      } else {
        user.groupMemberships.push({
          collectionId: colId,
          role: groupRole,
          assignedAt: new Date(),
        });
      }
    });

    if (!user.collectionId && collectionIds.length > 0) {
      user.collectionId = collectionIds[0];
    }

    await user.save();
    const populated = await User.findById(user._id)
      .populate('collectionId', 'name type emergencyCallNumber')
      .populate('groupMemberships.collectionId', 'name type emergencyCallNumber');
    return { user: formatUserRecord(populated), isExistingUser: true };
  }

  // Brand new Boss user
  const usernameTaken = await User.findOne({ username: username.trim(), ...NOT_DELETED });
  if (usernameTaken) {
    throw ApiError.conflict('Username already taken');
  }

  if (!password || password.length < 8) {
    throw ApiError.badRequest('Password is required and must be at least 8 characters');
  }

  user = new User({
    username: username.trim(),
    mobileNumber: mobileNumber.trim(),
    email: email && email.trim() ? email.trim() : undefined,
    role: ROLES.USER, // hard-coded, never global admin
    adminCreated: true,
    collectionId: collectionIds[0],
    groupMemberships: collectionIds.map(id => ({
      collectionId: id,
      role: groupRole,
      assignedAt: new Date(),
    })),
  });

  await user.setPassword(password);
  await user.save();

  const populated = await User.findById(user._id)
    .populate('collectionId', 'name type emergencyCallNumber')
    .populate('groupMemberships.collectionId', 'name type emergencyCallNumber');
  return { user: formatUserRecord(populated), isExistingUser: false };
}

function formatUserRecord(userDoc) {
  if (!userDoc) return null;
  const doc = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  const groupMap = new Map();

  if (doc.collectionId && (doc.collectionId._id || doc.collectionId.id)) {
    const colId = doc.collectionId._id || doc.collectionId.id;
    groupMap.set(String(colId), {
      id: colId,
      _id: colId,
      name: doc.collectionId.name || 'Group',
      type: doc.collectionId.type || 'other',
      emergencyCallNumber: doc.collectionId.emergencyCallNumber,
      role: 'user',
    });
  }

  if (Array.isArray(doc.groupMemberships)) {
    doc.groupMemberships.forEach(m => {
      if (m && m.collectionId) {
        const colObj = typeof m.collectionId === 'object' ? m.collectionId : {};
        const colId = colObj._id || colObj.id || m.collectionId;
        if (colId) {
          groupMap.set(String(colId), {
            id: colId,
            _id: colId,
            name: colObj.name || (groupMap.get(String(colId))?.name || 'Group'),
            type: colObj.type || (groupMap.get(String(colId))?.type || 'other'),
            emergencyCallNumber: colObj.emergencyCallNumber,
            role: m.role || 'user',
          });
        }
      }
    });
  }

  doc.assignedGroups = Array.from(groupMap.values());
  const hasBossRole = doc.assignedGroups.some(g => g.role === 'boss');
  doc.isBoss = hasBossRole;
  doc.displayRole = doc.role === ROLES.ADMIN ? 'Admin' : (hasBossRole ? 'Boss' : 'User');
  doc.isMembershipOnly = !doc.adminCreated && !hasBossRole && doc.role !== ROLES.ADMIN;
  doc.canEditDelete = doc.adminCreated || hasBossRole;

  return doc;
}

async function removeUserFromCollection(collectionId, userId) {
  const user = await getUserById(userId);

  user.groupMemberships = (user.groupMemberships || []).filter(
    m => String(m.collectionId?._id || m.collectionId) !== String(collectionId)
  );

  if (String(user.collectionId?._id || user.collectionId) === String(collectionId)) {
    user.collectionId = user.groupMemberships[0]?.collectionId?._id || user.groupMemberships[0]?.collectionId || null;
  }

  await user.save();
  return formatUserRecord(user);
}

async function listUsers(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { ...NOT_DELETED };

  if (query.status) filter.status = query.status;
  if (query.collectionId) {
    filter.$or = [
      { collectionId: query.collectionId },
      { 'groupMemberships.collectionId': query.collectionId },
    ];
  }
  if (query.excludeUserId) {
    filter._id = { $ne: query.excludeUserId };
  }
  if (query.role) {
    filter.role = query.role;
  }
  if (query.groupRole) {
    filter['groupMemberships.role'] = query.groupRole;
  }
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ username: regex }, { mobileNumber: regex }, { email: regex }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .populate('collectionId', 'name type emergencyCallNumber')
      .populate('groupMemberships.collectionId', 'name type emergencyCallNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  const formattedItems = items.map(formatUserRecord);

  return { items: formattedItems, meta: buildPaginationMeta({ page, limit, total }) };
}

async function listContacts(userId) {
  const currentUser = await User.findOne({ _id: userId, ...NOT_DELETED });
  if (!currentUser) {
    throw ApiError.notFound('User not found');
  }

  if (!currentUser.collectionId) {
    return [];
  }

  const { items } = await listUsers({
    collectionId: currentUser.collectionId,
    excludeUserId: userId,
  });

  return items;
}

/**
 * Emergency SMS recipients are broader than the normal Contacts screen:
 * active admins plus every other active user in the triggering user's
 * collection. Keeping this as a dedicated endpoint prevents admin users from
 * unexpectedly appearing in the ordinary Contacts UI.
 */
async function listEmergencySmsRecipients(userId) {
  const currentUser = await User.findOne({ _id: userId, ...NOT_DELETED });
  if (!currentUser) throw ApiError.notFound('User not found');
  if (!currentUser.collectionId) return [];

  return User.find({
    ...NOT_DELETED,
    status: USER_STATUS.ACTIVE,
    mobileNumber: { $exists: true, $nin: ['', null] },
    $or: [
      { role: ROLES.ADMIN },
      { role: ROLES.USER, collectionId: currentUser.collectionId, _id: { $ne: userId } },
    ],
  }).select('_id username mobileNumber role collectionId').sort({ role: 1, username: 1 });
}

async function getUserById(id) {
  const user = await User.findOne({ _id: id, ...NOT_DELETED });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
}

/**
 * Edits ONLY username / mobileNumber / email — the exact set of fields
 * the Admin Edit User form is allowed to change (per spec section 3/10).
 * role, status, password, and collectionId are not accepted here; each
 * has its own dedicated function/endpoint below.
 *
 * Email removal: passing `email: null` or `email: ''` clears it back to
 * "not configured" (field omitted, per the sparse-unique schema design).
 */
async function updateUser(id, { username, mobileNumber, email }) {
  const user = await getUserById(id);

  if (username !== undefined) user.username = username;
  if (mobileNumber !== undefined) user.mobileNumber = mobileNumber;
  if (email !== undefined) {
    user.email = email === null || email === '' ? undefined : email;
  }

  await user.save();
  return user;
}

/**
 * Self-service profile edit for the authenticated user (PATCH /users/me).
 * Distinct from updateUser (the Admin Edit User form) because this is the
 * ONLY place emergencyMessage is ever written - it is the single source of
 * truth the SOS/SMS flow reads from (see
 * frontend/src/features/sos/services/emergencyMessage.js and
 * backend sos.service.js resolveEmergencyMessage). role/status/password/
 * collectionId are deliberately not accepted here (also enforced by
 * user.validation.js's updateMyProfileValidation `.not().exists()` rules),
 * so a user can never elevate their own account through this route.
 *
 * ROOT CAUSE FIX: user.controller.js's updateMyProfile handler has always
 * called `userService.updateOwnProfile(...)`, but this function did not
 * exist on this module - every profile save (including the emergency
 * message) threw a TypeError ("userService.updateOwnProfile is not a
 * function"), which asyncHandler/errorHandler normalized into a generic
 * 500 "Something went wrong". The edit still *looked* saved in the app
 * because the client applies it to local/cached state immediately
 * (offline-first UI update) before attempting the network call - but the
 * backend never actually persisted it, and the user was shown that
 * generic failure right after. This is the fix: an actual working
 * implementation of the missing function, following the exact same
 * pattern as updateUser above, plus the emergencyMessage field.
 */
async function updateOwnProfile(id, { username, mobileNumber, email, emergencyMessage }) {
  const user = await getUserById(id);

  if (username !== undefined) user.username = username;
  if (mobileNumber !== undefined) user.mobileNumber = mobileNumber;
  if (email !== undefined) {
    user.email = email === null || email === '' ? undefined : email;
  }
  if (emergencyMessage !== undefined) {
    const trimmed = typeof emergencyMessage === 'string' ? emergencyMessage.trim() : emergencyMessage;
    user.emergencyMessage = trimmed === null || trimmed === '' ? undefined : trimmed;
  }

  await user.save();
  return user;
}

async function setPassword(id, newPassword) {
  const user = await getUserById(id);
  await user.setPassword(newPassword);
  await user.save();
  return user;
}

async function getCredentials(id) {
  const user = await User.findOne({ _id: id, ...NOT_DELETED }).select('+credentialPasswordEncrypted');
  if (!user) throw ApiError.notFound('User not found');
  if (!user.credentialPasswordEncrypted) {
    throw ApiError.conflict('Credentials are not available for this user. Reset the password to generate copyable credentials.');
  }
  let password;
  try { password = decryptCredentialPassword(user.credentialPasswordEncrypted); }
  catch (_) { throw ApiError.internal('Stored credentials could not be recovered.'); }
  return { username: user.username, password };
}

async function setStatus(id, status) {
  const user = await getUserById(id);
  user.status = status;
  await user.save();
  return user;
}

function activateUser(id) {
  return setStatus(id, USER_STATUS.ACTIVE);
}

function deactivateUser(id) {
  return setStatus(id, USER_STATUS.INACTIVE);
}

/**
 * Soft-deletes a user (see user.model.js `deletedAt`). The document is
 * never physically removed — a hard delete would orphan any historical
 * SOS record's `userId` reference (added in a later phase) and lose the
 * ability to show who an old emergency belonged to. Deletion also forces
 * status to "inactive" so the account can never authenticate again,
 * consistent with an already-deactivated account.
 *
 * Because getUserById (used by every other function in this module)
 * excludes deletedAt != null, a soft-deleted user is automatically and
 * permanently excluded from all further admin management operations —
 * it cannot be fetched, edited, reactivated, or deleted again through
 * this API.
 */
async function deleteUser(id) {
  const user = await getUserById(id);
  await User.deleteOne({ _id: user._id });
  return null;
}

module.exports = {
  createUser,
  createOrAssignBoss,
  removeUserFromCollection,
  formatUserRecord,
  listUsers,
  listContacts,
  listEmergencySmsRecipients,
  getUserById,
  updateUser,
  updateOwnProfile,
  setPassword,
  getCredentials,
  activateUser,
  deactivateUser,
  deleteUser,
};
