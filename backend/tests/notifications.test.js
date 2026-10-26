process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';
const http = require('http');
const request = require('supertest');
const mongoose = require('mongoose');
const { once } = require('events');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: createSocket } = require('socket.io-client');
const app = require('../src/app');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const { createNotification } = require('../src/services/notificationService');
const { initializeSocket, closeSocket } = require('../src/socket');

let mongod;
let server;
let clients = [];
const student = (email, name) => ({
  name, email, password: 'Passw0rdX', college: 'ABC College', course: 'B.Tech CSE', year: 2,
});
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function register(email, name) {
  const response = await request(app).post('/api/auth/register').send(student(email, name));
  return { id: response.body.data.user._id, token: response.body.data.token };
}

async function connectClient(token) {
  const client = createSocket(`http://127.0.0.1:${server.address().port}`, {
    auth: token ? { token } : {},
    reconnection: false,
    timeout: 5000,
  });
  clients.push(client);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
  await Notification.init();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  initializeSocket(server);
});

afterAll(async () => {
  clients.forEach((client) => client.disconnect());
  await closeSocket();
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Notification.deleteMany({})]);
});

describe('Notifications', () => {
  test('requires authentication and only returns notifications to their recipient', async () => {
    const alice = await register('alice@example.com', 'Alice');
    const bob = await register('bob@example.com', 'Bob');
    await createNotification({
      recipient: alice.id,
      actor: bob.id,
      type: 'connection_request',
      resourceType: 'user',
      resourceId: bob.id,
      message: 'sent you a connection request.',
    });
    await createNotification({
      recipient: bob.id,
      actor: alice.id,
      type: 'connection_accepted',
      resourceType: 'user',
      resourceId: alice.id,
      message: 'accepted your connection request.',
    });

    expect((await request(app).get('/api/notifications')).status).toBe(401);
    const response = await request(app).get('/api/notifications').set(auth(alice.token));
    expect(response.status).toBe(200);
    expect(response.body.data.notifications).toHaveLength(1);
    expect(response.body.data.notifications[0].actor.name).toBe('Bob');
    expect(response.body.data.unreadCount).toBe(1);
    expect((await request(app).get('/api/notifications').set(auth(bob.token))).body.data.notifications).toHaveLength(1);
  });

  test('marks individual and all notifications read and persists read state', async () => {
    const alice = await register('alice@example.com', 'Alice');
    const bob = await register('bob@example.com', 'Bob');
    const first = await createNotification({
      recipient: alice.id,
      actor: bob.id,
      type: 'new_message',
      resourceType: 'conversation',
      resourceId: new mongoose.Types.ObjectId(),
      message: 'sent you a message.',
    });
    await createNotification({
      recipient: alice.id,
      actor: bob.id,
      type: 'event_announcement',
      resourceType: 'event',
      resourceId: new mongoose.Types.ObjectId(),
      message: 'announced a new event.',
    });

    expect((await request(app).patch(`/api/notifications/${first._id}/read`).set(auth(bob.token))).status).toBe(404);
    const marked = await request(app).patch(`/api/notifications/${first._id}/read`).set(auth(alice.token));
    expect(marked.body.data.wasUnread).toBe(true);
    expect(marked.body.data.notification.readAt).toBeTruthy();
    expect((await request(app).patch(`/api/notifications/${first._id}/read`).set(auth(alice.token))).body.data.wasUnread).toBe(false);
    expect((await request(app).get('/api/notifications/unread-count').set(auth(alice.token))).body.data.unreadCount).toBe(1);

    const allRead = await request(app).patch('/api/notifications/read-all').set(auth(alice.token));
    expect(allRead.body.data.modifiedCount).toBe(1);
    const history = await request(app).get('/api/notifications?page=1&limit=1').set(auth(alice.token));
    expect(history.body.data.notifications).toHaveLength(1);
    expect(history.body.data.total).toBe(2);
    expect(history.body.data.unreadCount).toBe(0);
    expect(history.body.data.notifications[0].readAt).toBeTruthy();
  });

  test('delivers live notifications only to the authenticated recipient socket', async () => {
    const alice = await register('alice@example.com', 'Alice');
    const bob = await register('bob@example.com', 'Bob');
    const aliceSocket = await connectClient(alice.token);
    const bobSocket = await connectClient(bob.token);
    let bobReceivedNotification = false;
    bobSocket.on('notification:new', () => { bobReceivedNotification = true; });
    const delivered = once(aliceSocket, 'notification:new');

    const notification = await createNotification({
      recipient: alice.id,
      actor: bob.id,
      type: 'post_like',
      resourceType: 'post',
      resourceId: new mongoose.Types.ObjectId(),
      message: 'liked your post.',
    });
    const [payload] = await delivered;
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(payload._id).toBe(notification._id.toString());
    expect(payload.actor.name).toBe('Bob');
    expect(bobReceivedNotification).toBe(false);
    expect(await Notification.countDocuments({ recipient: alice.id })).toBe(1);
    await expect(connectClient(null)).rejects.toThrow('Authentication required.');
  });
});
