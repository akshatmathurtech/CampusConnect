const Post = require('../models/Post');
const Report = require('../models/Report');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

exports.createReport = asyncHandler(async (req, res) => {
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 500) throw new ApiError(422, 'Report reason must contain 1 to 500 characters.');
  const post = await Post.findById(req.params.id);
  if (!post) throw new ApiError(404, 'Post not found.');
  if (post.author.equals(req.user._id)) throw new ApiError(422, 'You cannot report your own post.');
  const report = await Report.create({ post: post._id, reporter: req.user._id, reason });
  res.status(201).json({ success: true, data: { report } });
});

exports.getReports = asyncHandler(async (req, res) => {
  const reports = await Report.find()
    .populate({ path: 'post', populate: { path: 'author', select: 'name avatar' } })
    .populate('reporter', 'name avatar')
    .populate('reviewedBy', 'name')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: { reports } });
});

exports.reviewReport = asyncHandler(async (req, res) => {
  if (!['reviewed', 'dismissed'].includes(req.body.status)) {
    throw new ApiError(422, 'Status must be reviewed or dismissed.');
  }
  const adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.trim() : '';
  if (adminNote.length > 500) throw new ApiError(422, 'Admin note can be at most 500 characters.');
  const report = await Report.findById(req.params.reportId);
  if (!report) throw new ApiError(404, 'Report not found.');
  report.status = req.body.status;
  report.adminNote = adminNote;
  report.reviewedBy = req.user._id;
  await report.save();
  await report.populate([
    { path: 'post', populate: { path: 'author', select: 'name avatar' } },
    { path: 'reporter', select: 'name avatar' },
    { path: 'reviewedBy', select: 'name' },
  ]);
  res.json({ success: true, data: { report } });
});
