const router = require('express').Router();
const { protect } = require('../middleware/auth');
const notifications = require('../controllers/notificationController');

router.use(protect);
router.get('/', notifications.getNotifications);
router.get('/unread-count', notifications.getUnreadCount);
router.patch('/read-all', notifications.markAllRead);
router.patch('/:id/read', notifications.markRead);

module.exports = router;
