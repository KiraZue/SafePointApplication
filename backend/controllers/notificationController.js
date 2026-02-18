const { sendPushNotification } = require('../utils/notification');
const User = require('../models/User');

// @desc    Notify users about a new Wi-Fi Direct group
// @route   POST /api/notifications/group
// @access  Private
const notifyGroupStarted = async (req, res) => {
    const { groupName, hostIp } = req.body;
    const hostUser = req.user;

    try {
        // Notify all other users
        // We can exclude the host if needed, but sendPushNotification handles userIds if provided.
        // If userIds is not provided, it sends to ALL users with pushToken.
        // We should probably exclude the sender.

        // Find all users except the host
        const otherUsers = await User.find({
            _id: { $ne: hostUser._id },
            pushToken: { $exists: true, $ne: '' }
        }).select('_id');

        if (otherUsers.length === 0) {
            return res.status(200).json({ message: 'No users to notify' });
        }

        const userIds = otherUsers.map(u => u._id);

        await sendPushNotification({
            userIds,
            title: '📶 New Wi-Fi Direct Group!',
            body: `${hostUser.firstName} started a group: ${groupName || 'SafePoint Group'}`,
            data: {
                type: 'NEW_GROUP',
                hostIp: hostIp,
                hostName: `${hostUser.firstName} ${hostUser.lastName}`
            }
        });

        res.status(200).json({ message: 'Notification sent', count: userIds.length });
    } catch (error) {
        console.error('[Notification] Group notification failed:', error);
        res.status(500).json({ message: 'Failed to send notification' });
    }
};

module.exports = { notifyGroupStarted };
