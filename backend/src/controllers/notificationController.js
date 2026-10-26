const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

exports.getNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
  const filter = { recipient: req.user._id };
  if (req.query.unreadOnly === 'true') filter.readAt = null;
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .populate('actor', 'name avatar')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: req.user._id, readAt: null }),
  ]);
  res.json({
    success: true,
    data: { notifications, page, pages: Math.ceil(total / limit), total, unreadCount },
  });
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({ recipient: req.user._id, readAt: null });
  res.json({ success: true, data: { unreadCount } });
});

exports.markRead = asyncHandler(async (req, res) => {
  const update = await Notification.updateOne(
    { _id: req.params.id, recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user._id })
    .populate('actor', 'name avatar');
  if (!notification) {
    throw new ApiError(404, 'Notification not found.');
  }
  res.json({ success: true, data: { notification, wasUnread: update.modifiedCount > 0 } });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ success: true, data: { modifiedCount: result.modifiedCount } });
});
