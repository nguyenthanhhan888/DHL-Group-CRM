export const FACEBOOK_GROUP_ID = '1145443782801316';
export const FACEBOOK_GROUP_MEMBER_BASE_URL = `https://www.facebook.com/groups/${FACEBOOK_GROUP_ID}/user`;
export const FACEBOOK_PROFILE_BASE_URL = 'https://www.facebook.com';

export function buildFacebookGroupMemberUrl(facebookId) {
  const normalizedId = String(facebookId || '').trim();
  if (!normalizedId) return null;
  return `${FACEBOOK_GROUP_MEMBER_BASE_URL}/${encodeURIComponent(normalizedId)}`;
}
