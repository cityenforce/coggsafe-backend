// src/features/sos/services/emergencyMessage.js
//
// SINGLE SOURCE OF TRUTH for the emergency message text and the
// GPS-location-enhanced version of it that gets sent in the first
// emergency SMS.
//
// Previously the app had at least three independently-typed copies of the
// "default" emergency message (UserProfileScreen default text, and two
// slightly different fallback strings inside App.js's two SOS trigger
// paths). That drift is exactly what produced the reported bug where the
// profile screen displayed one message while the SMS that actually went
// out contained different wording. Every screen/service that needs the
// user's emergency message OR the default fallback text must import it
// from here instead of re-typing it.

/**
 * The fallback message used only when the user has never saved a custom
 * emergency message. This must be the ONLY place this fallback text is
 * defined.
 */
export function getDefaultEmergencyMessage(username) {
  return username
    ? `I am ${username}, I may be in danger.`
    : 'I may be in danger, please help.';
}

/**
 * Resolves the canonical emergency message for a user: their saved
 * message if present, otherwise the shared default template. This is the
 * exact text that must be shown on the Profile screen AND used to build
 * the emergency SMS - never two different values.
 */
export function getUserEmergencyMessage(user) {
  const saved = typeof user?.emergencyMessage === 'string' ? user.emergencyMessage.trim() : '';
  const message = saved || getDefaultEmergencyMessage(user?.username);
  return message.replace(/\[Username\]/gi, user?.username || 'the user');
}

/**
 * Builds the Google Maps link for a GPS location. Returns null when the
 * location is not a valid, real fix (never fabricates coordinates).
 */
export function buildGoogleMapsLink(location) {
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Builds the FIRST emergency SMS: the user's exact saved/custom message
 * from their profile.
 */
export function buildFirstEmergencySms({user, baseMessage} = {}) {
  const base = typeof baseMessage === 'string' && baseMessage.trim() ? baseMessage.trim() : getUserEmergencyMessage(user);
  return {
    message: base,
    includesLocation: false,
  };
}

/**
 * Builds the SECOND emergency SMS carrying the user's emergency message
 * along with the GPS Google Maps location link.
 */
export function buildLocationFollowUpSms({location, baseMessage, user} = {}) {
  const mapsLink = buildGoogleMapsLink(location);
  if (!mapsLink) return null;
  const base = typeof baseMessage === 'string' && baseMessage.trim()
    ? baseMessage.trim()
    : (user ? getUserEmergencyMessage(user) : '');
  if (base) {
    return `${base}\nMy current location:\n${mapsLink}`;
  }
  return `My current location:\n${mapsLink}`;
}

/**
 * Builds the THIRD emergency SMS carrying the backend live tracking link
 * containing live location, photos, and audio.
 */
export function buildEmergencyLinkSms({emergencyLink} = {}) {
  if (!emergencyLink) return null;
  return `Emergency tracking link (live location, photos & audio):\n${emergencyLink}`;
}

export default {
  getDefaultEmergencyMessage,
  getUserEmergencyMessage,
  buildGoogleMapsLink,
  buildFirstEmergencySms,
  buildLocationFollowUpSms,
  buildEmergencyLinkSms,
};
