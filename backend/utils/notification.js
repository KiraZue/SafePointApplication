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
  let query = {};
  if (userIds && userIds.length > 0) {
    query._id = { $in: userIds };
  }
  
  // Only target users with a push token
  query.pushToken = { $exists: true, $ne: '' };
  
  const users = await User.find(query).select('pushToken');
  const tokens = users.map(u => u.pushToken).filter(token => Expo.isExpoPushToken(token));
  
  if (tokens.length === 0) {
    console.log('[Push] No valid tokens found for notification');
    return;
  }

  let messages = [];
  for (let pushToken of tokens) {
    messages.push({
      to: pushToken,
      sound: 'default',
      title,
      body,
      data: data || {},
      badge: badge || 0,
    });
  }

  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];
  
  (async () => {
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('[Push] Error sending chunk:', error);
      }
    }
  })();
};

module.exports = { sendPushNotification };
