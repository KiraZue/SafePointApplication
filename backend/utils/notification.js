const { Expo } = require('expo-server-sdk');
const User = require('../models/User');

let expo = new Expo();

/**
 * Send push notification to specific users or all users
 * @param {Object} options 
 * @param {Array} options.userIds - Optional: specific user IDs to notify
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {Object} options.data - Optional data payload
 * @param {number} options.badge - Optional badge count
 */
const sendPushNotification = async ({ userIds, title, body, data, badge }) => {
  console.log(`[Push] Attempting to send: "${title}" to ${userIds ? userIds.length : 'all'} users`);

  let query = {};
  if (userIds && userIds.length > 0) {
    query._id = { $in: userIds };
  }

  // Only target users with a push token
  query.pushToken = { $exists: true, $ne: '' };

  const users = await User.find(query).select('pushToken firstName lastName');
  console.log(`[Push] Found ${users.length} users with push tokens in database`);

  const tokens = users.map(u => u.pushToken).filter(token => {
    const isValid = Expo.isExpoPushToken(token);
    if (!isValid) console.log(`[Push] Invalid token found: ${token}`);
    return isValid;
  });

  if (tokens.length === 0) {
    console.log('[Push] No valid Expo push tokens found. Message skipped.');
    return;
  }

  console.log(`[Push] Sending to ${tokens.length} valid tokens...`);

  let messages = [];
  for (let pushToken of tokens) {
    messages.push({
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data || {},
      badge: badge || 0,
      android: {
        channelId: 'default', // Required for Android 8+
        priority: 'high',
      },
    });
  }

  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];

  for (let chunk of chunks) {
    try {
      console.log(`[Push] Dispatching chunk of ${chunk.length} messages to Expo...`);
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log(`[Push] Expo tickets:`, JSON.stringify(ticketChunk));
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('[Push] Fatal error sending chunk to Expo:', error);
    }
  }
};

module.exports = { sendPushNotification };
