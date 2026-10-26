const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireStudent } = require('../middleware/roles');
const upload = require('../middleware/upload');
const posts = require('../controllers/postController');
const reports = require('../controllers/reportController');

router.use(protect);
router.get('/', posts.getFeed);
router.get('/:id', posts.getPost);
router.post('/', requireStudent, upload.single('image'), posts.createPost);
router.patch('/:id', requireStudent, upload.single('image'), posts.updatePost);
router.delete('/:id', requireStudent, posts.deletePost);
router.post('/:id/like', requireStudent, posts.toggleLike);
router.post('/:id/comments', requireStudent, posts.addComment);
router.delete('/:id/comments/:commentId', requireStudent, posts.deleteComment);
router.post('/:id/bookmark', requireStudent, posts.toggleBookmark);
router.post('/:id/report', requireStudent, reports.createReport);

module.exports = router;
