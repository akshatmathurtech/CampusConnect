const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');
const { getReports, reviewReport } = require('../controllers/reportController');

router.use(protect, requireAdmin);
router.get('/', getReports);
router.patch('/:reportId', reviewReport);

module.exports = router;
