const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Post = require('../models/Post');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const escapeRegex = require('../utils/escapeRegex');
const { createNotification } = require('../services/notificationService');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

function identifyImage(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

async function saveImage(file) {
  if (!file) return '';
  const extension = identifyImage(file.buffer);
  if (!extension) throw new ApiError(422, 'Image must be a valid JPEG, PNG, or WebP file.');
  const filename = `${crypto.randomUUID()}.${extension}`;
  await fs.promises.writeFile(path.join(uploadDir, filename), file.buffer, { flag: 'wx' });
  return `/uploads/${filename}`;
}

async function removeImage(image) {
  if (!image || !image.startsWith('/uploads/')) return;
  const filename = path.basename(image);
  await fs.promises.rm(path.join(uploadDir, filename), { force: true });
}

function toPostResponse(post, userId) {
  const data = post.toObject();
  data.likesCount = data.likes.length;
  data.commentsCount = data.comments.length;
  data.likedByMe = data.likes.some((id) => id.toString() === userId.toString());
  data.bookmarkedByMe = data.bookmarks.some((id) => id.toString() === userId.toString());
  data.isAuthor = data.author._id.toString() === userId.toString();
  delete data.likes;
  delete data.bookmarks;
  return data;
}

async function findPost(id) {
  const post = await Post.findById(id);
  if (!post) throw new ApiError(404, 'Post not found.');
  return post;
}

function requireOwner(post, userId) {
  if (!post.author.equals(userId)) throw new ApiError(403, 'You can only modify your own post.');
}

exports.getFeed = asyncHandler(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 30);
  const filter = {};
  if (req.query.bookmarked === 'true') filter.bookmarks = req.user._id;
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const query = req.query.q.trim().slice(0, 100);
    const expression = new RegExp(escapeRegex(query), 'i');
    const authors = await User.find({ name: expression }).select('_id');
    filter.$or = [{ content: expression }, { author: { $in: authors.map(({ _id }) => _id) } }];
  }
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .populate('author', 'name avatar college')
      .populate('comments.author', 'name avatar')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Post.countDocuments(filter),
  ]);
  res.json({
    success: true,
    data: { posts: posts.map((post) => toPostResponse(post, req.user._id)), page, pages: Math.ceil(total / limit), total },
  });
});

exports.getPost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id)
    .populate('author', 'name avatar college')
    .populate('comments.author', 'name avatar');
  if (!post) throw new ApiError(404, 'Post not found.');
  res.json({ success: true, data: { post: toPostResponse(post, req.user._id) } });
});

exports.createPost = asyncHandler(async (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (content.length > 5000) throw new ApiError(422, 'Post text can be at most 5000 characters.');
  if (!content && !req.file) throw new ApiError(422, 'Add some text or an image to your post.');
  const image = await saveImage(req.file);
  try {
    const post = await Post.create({ author: req.user._id, content, image });
    await post.populate('author', 'name avatar college');
    res.status(201).json({ success: true, data: { post: toPostResponse(post, req.user._id) } });
  } catch (error) {
    await removeImage(image);
    throw error;
  }
});

exports.updatePost = asyncHandler(async (req, res) => {
  const post = await findPost(req.params.id);
  requireOwner(post, req.user._id);
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : post.content;
  if (content.length > 5000) throw new ApiError(422, 'Post text can be at most 5000 characters.');
  let image = post.image;
  let newImage = '';
  if (req.file) {
    newImage = await saveImage(req.file);
    image = newImage;
  } else if (req.body.removeImage === 'true') {
    image = '';
  }
  if (!content && !image) {
    await removeImage(newImage);
    throw new ApiError(422, 'A post must include text or an image.');
  }
  const oldImage = post.image;
  post.content = content;
  post.image = image;
  try {
    await post.save();
  } catch (error) {
    await removeImage(newImage);
    throw error;
  }
  if (oldImage !== image) await removeImage(oldImage);
  await post.populate('author', 'name avatar college');
  await post.populate('comments.author', 'name avatar');
  res.json({ success: true, data: { post: toPostResponse(post, req.user._id) } });
});

exports.deletePost = asyncHandler(async (req, res) => {
  const post = await findPost(req.params.id);
  requireOwner(post, req.user._id);
  await post.deleteOne();
  await removeImage(post.image);
  res.json({ success: true, data: { message: 'Post deleted.' } });
});

exports.toggleLike = asyncHandler(async (req, res) => {
  const post = await findPost(req.params.id);
  const index = post.likes.findIndex((id) => id.equals(req.user._id));
  if (index === -1) post.likes.push(req.user._id);
  else post.likes.splice(index, 1);
  await post.save();
  if (index === -1) {
    await createNotification({
      recipient: post.author,
      actor: req.user._id,
      type: 'post_like',
      resourceType: 'post',
      resourceId: post._id,
      message: 'liked your post.',
    });
  }
  res.json({ success: true, data: { liked: index === -1, likesCount: post.likes.length } });
});

exports.addComment = asyncHandler(async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!text || text.length > 2000) throw new ApiError(422, 'Comment must contain 1 to 2000 characters.');
  const post = await findPost(req.params.id);
  post.comments.push({ author: req.user._id, text });
  await post.save();
  await createNotification({
    recipient: post.author,
    actor: req.user._id,
    type: 'post_comment',
    resourceType: 'post',
    resourceId: post._id,
    message: 'commented on your post.',
  });
  await post.populate('comments.author', 'name avatar');
  res.status(201).json({ success: true, data: { comments: post.comments, commentsCount: post.comments.length } });
});

exports.deleteComment = asyncHandler(async (req, res) => {
  const post = await findPost(req.params.id);
  const comment = post.comments.id(req.params.commentId);
  if (!comment) throw new ApiError(404, 'Comment not found.');
  if (!comment.author.equals(req.user._id)) throw new ApiError(403, 'You can only delete your own comment.');
  comment.deleteOne();
  await post.save();
  res.json({ success: true, data: { commentsCount: post.comments.length } });
});

exports.toggleBookmark = asyncHandler(async (req, res) => {
  const post = await findPost(req.params.id);
  const index = post.bookmarks.findIndex((id) => id.equals(req.user._id));
  if (index === -1) post.bookmarks.push(req.user._id);
  else post.bookmarks.splice(index, 1);
  await post.save();
  res.json({ success: true, data: { bookmarked: index === -1 } });
});
