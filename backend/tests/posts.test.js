process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const User = require('../src/models/User');
const Post = require('../src/models/Post');
const Report = require('../src/models/Report');
const Notification = require('../src/models/Notification');

let mongod;
const student = (email, name) => ({
  name, email, password: 'Passw0rdX', college: 'ABC College', course: 'B.Tech CSE', year: 2,
});

async function register(email, name) {
  const response = await request(app).post('/api/auth/register').send(student(email, name));
  return { token: response.body.data.token, id: response.body.data.user._id };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
  await Post.init();
  await Report.init();
  await Notification.init();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Post.deleteMany({}), Report.deleteMany({}), Notification.deleteMany({})]);
});

describe('Student feed', () => {
  test('requires authentication and paginates/searches newest posts', async () => {
    expect((await request(app).get('/api/posts')).status).toBe(401);
    const alice = await register('alice@example.com', 'Alice');
    await request(app).post('/api/posts').set(auth(alice.token)).send({ content: 'First campus update' });
    await request(app).post('/api/posts').set(auth(alice.token)).send({ content: 'Second campus note' });

    const result = await request(app).get('/api/posts?limit=1&q=update').set(auth(alice.token));
    expect(result.status).toBe(200);
    expect(result.body.data.total).toBe(1);
    expect(result.body.data.posts[0].content).toBe('First campus update');
    expect(result.body.data.posts[0].author.name).toBe('Alice');
    expect(result.body.data.posts[0].isAuthor).toBe(true);
    const directPost = await request(app).get(`/api/posts/${result.body.data.posts[0]._id}`).set(auth(alice.token));
    expect(directPost.status).toBe(200);
    expect(directPost.body.data.post._id).toBe(result.body.data.posts[0]._id);
  });

  test('creates posts with validated images and rejects invalid image bytes', async () => {
    const alice = await register('alice@example.com', 'Alice');
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const created = await request(app).post('/api/posts').set(auth(alice.token))
      .field('content', 'Image post')
      .attach('image', image, { filename: 'campus.png', contentType: 'image/png' });
    expect(created.status).toBe(201);
    expect(created.body.data.post.image).toMatch(/^\/uploads\/[a-f0-9-]+\.png$/);
    const imageResponse = await request(app).get(created.body.data.post.image);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers['cross-origin-resource-policy']).toBe('cross-origin');

    const invalid = await request(app).post('/api/posts').set(auth(alice.token))
      .field('content', 'Spoofed upload')
      .attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'bad.png', contentType: 'image/png' });
    expect(invalid.status).toBe(422);
    expect((await request(app).delete(`/api/posts/${created.body.data.post._id}`).set(auth(alice.token))).status).toBe(200);
  });

  test('allows likes and comments, but only comment authors may delete their comments', async () => {
    const alice = await register('alice@example.com', 'Alice');
    const bob = await register('bob@example.com', 'Bob');
    const created = await request(app).post('/api/posts').set(auth(alice.token)).send({ content: 'Hello campus' });
    const postId = created.body.data.post._id;

    expect((await request(app).post(`/api/posts/${postId}/like`).set(auth(bob.token))).body.data)
      .toEqual({ liked: true, likesCount: 1 });
    expect(await Notification.countDocuments({ recipient: alice.id, type: 'post_like' })).toBe(1);
    expect((await request(app).post(`/api/posts/${postId}/like`).set(auth(bob.token))).body.data)
      .toEqual({ liked: false, likesCount: 0 });
    expect(await Notification.countDocuments({ recipient: alice.id, type: 'post_like' })).toBe(1);

    const comment = await request(app).post(`/api/posts/${postId}/comments`).set(auth(bob.token)).send({ text: 'Nice!' });
    expect(comment.status).toBe(201);
    expect(await Notification.countDocuments({ recipient: alice.id, type: 'post_comment' })).toBe(1);
    const commentId = comment.body.data.comments[0]._id;
    expect((await request(app).delete(`/api/posts/${postId}/comments/${commentId}`).set(auth(alice.token))).status).toBe(403);
    expect((await request(app).delete(`/api/posts/${postId}/comments/${commentId}`).set(auth(bob.token))).status).toBe(200);
  });

  test('only the post author can edit or delete a post', async () => {
    const alice = await register('alice@example.com', 'Alice');
    const bob = await register('bob@example.com', 'Bob');
    const created = await request(app).post('/api/posts').set(auth(alice.token)).send({ content: 'Original text' });
    const postId = created.body.data.post._id;
    expect((await request(app).patch(`/api/posts/${postId}`).set(auth(bob.token)).send({ content: 'Changed' })).status).toBe(403);
    expect((await request(app).delete(`/api/posts/${postId}`).set(auth(bob.token))).status).toBe(403);
    const updated = await request(app).patch(`/api/posts/${postId}`).set(auth(alice.token)).send({ content: 'Updated text' });
    expect(updated.body.data.post.content).toBe('Updated text');
    expect((await request(app).delete(`/api/posts/${postId}`).set(auth(alice.token))).status).toBe(200);
  });

  test('supports bookmarks and admin-only report review', async () => {
    const alice = await register('alice@example.com', 'Alice');
    const bob = await register('bob@example.com', 'Bob');
    const created = await request(app).post('/api/posts').set(auth(alice.token)).send({ content: 'Community event' });
    const postId = created.body.data.post._id;
    expect((await request(app).post(`/api/posts/${postId}/bookmark`).set(auth(bob.token))).body.data.bookmarked).toBe(true);
    const saved = await request(app).get('/api/posts?bookmarked=true').set(auth(bob.token));
    expect(saved.body.data.posts).toHaveLength(1);
    expect(saved.body.data.posts[0].bookmarkedByMe).toBe(true);

    const report = await request(app).post(`/api/posts/${postId}/report`).set(auth(bob.token)).send({ reason: 'Inappropriate content' });
    expect(report.status).toBe(201);
    expect((await request(app).get('/api/reports').set(auth(alice.token))).status).toBe(403);

    await User.updateOne({ email: 'alice@example.com' }, { $set: { role: 'admin' } });
    expect((await request(app).post('/api/posts').set(auth(alice.token)).send({ content: 'Admin post' })).status).toBe(403);
    const reports = await request(app).get('/api/reports').set(auth(alice.token));
    expect(reports.status).toBe(200);
    expect(reports.body.data.reports[0].status).toBe('pending');
    const reviewed = await request(app).patch(`/api/reports/${report.body.data.report._id}`).set(auth(alice.token))
      .send({ status: 'reviewed', adminNote: 'Reviewed by staff' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.report.status).toBe('reviewed');
  });
});
