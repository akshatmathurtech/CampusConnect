const Notification = require('../models/Notification');
const { emitToUser } = require('../socket');

const NOTIFICATION_TYPES = new Set([
  'connection_request',
  'connection_accepted',
  'new_message',
  'post_like',
  'post_comment',
  'event_announcement',
  'event_update',
]);

async function createNotification({ recipient, actor = null, type, resourceType = null, resourceId = null, message }) {
  if (!NOTIFICATION_TYPES.has(type)) throw new Error(`Unsupported notification type: ${type}`);
  if (!recipient) throw new Error('Notification recipient is required.');
  if (actor && actor.toString() === recipient.toString()) return null;

  const notification = await Notification.create({
    recipient,
    actor,
    type,
    resourceType,
    resourceId,
    message,
  });
  await notification.populate('actor', 'name avatar');
  emitToUser(recipient, 'notification:new', notification);
  return notification;
}

module.exports = { createNotification };
