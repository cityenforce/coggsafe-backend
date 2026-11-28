/**
 * The ONLY roles that may ever exist in the system.
 * Role assignment must always be derived server-side from this list —
 * never trust a role value coming from a client request.
 */
const ROLES = Object.freeze({
  ADMIN: 'admin',
  PEOPLE_LEADER: 'people leader',
  USER: 'user',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

const GROUP_ROLES = Object.freeze({
  PEOPLE_LEADER: 'people leader',
  BOSS: 'boss',
  USER: 'user',
  MEMBER: 'member',
});

const ALL_GROUP_ROLES = Object.freeze(Object.values(GROUP_ROLES));

module.exports = { ROLES, ALL_ROLES, GROUP_ROLES, ALL_GROUP_ROLES };
