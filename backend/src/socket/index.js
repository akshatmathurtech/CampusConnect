const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { calculateExpiryDate } = require('../utils/messageExpiry');

let io = null;

// Simple cache for recently sent messages to prevent rapid double-submits
const recentSubmissions = new Map();

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
      methods: ['GET', 'POST'],
    },
    maxHttpBufferSize: 1e7, // 10MB to support camera snapshots and images
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // JWT Authentication Middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const authHeader = socket.handshake.headers?.authorization;
      const token =
        socket.handshake.auth?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded || !decoded.id) {
        return next(new Error('Invalid token payload'));
      }

      const user = await User.findById(decoded.id).select(
        '_id name email avatar college course year'
      );
      if (!user) {
        return next(new Error('User account not found'));
      }

      socket.user = user;
      next();
    } catch (err) {
      return next(new Error('Socket authentication failed: ' + err.message));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    const userId = socket.user._id.toString();

    // Join personal room for notifications and conversation updates
    socket.join(`user:${userId}`);

    /**
     * join_conversation
     * Authorizes user before joining conversation room
     */
    socket.on('join_conversation', async ({ conversationId }, callback = () => {}) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          return callback({ success: false, message: 'Invalid conversation ID' });
        }

        const conv = await Conversation.findOne({
          _id: conversationId,
          participants: socket.user._id,
        });

        if (!conv) {
          return callback({
            success: false,
            message: 'Not authorized to join this conversation',
          });
        }

        socket.join(`conversation:${conversationId}`);
        callback({ success: true, conversationId });
      } catch (err) {
        callback({ success: false, message: err.message });
      }
    });

    /**
     * leave_conversation
     */
    socket.on('leave_conversation', ({ conversationId }) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    /**
     * send_message
     */
    socket.on('send_message', async (data, callback = () => {}) => {
      try {
        const { conversationId, text, image, idempotencyKey } = data || {};

        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          return callback({ success: false, message: 'Invalid conversation ID' });
        }

        const trimmedText = typeof text === 'string' ? text.trim() : '';
        const imageStr = typeof image === 'string' && (image.startsWith('data:image/') || image.startsWith('http')) ? image : null;

        if (!trimmedText && !imageStr) {
          return callback({ success: false, message: 'Message text or image is required' });
        }
        if (trimmedText.length > 2000) {
          return callback({ success: false, message: 'Message exceeds 2000 characters' });
        }

        // Idempotency check to prevent duplicate messages
        const dedupeKey = idempotencyKey || `${userId}:${conversationId}:${trimmedText}:${imageStr ? imageStr.slice(0, 30) : ''}`;
        const lastSent = recentSubmissions.get(dedupeKey);
        if (lastSent && Date.now() - lastSent < 2000) {
          return callback({ success: false, message: 'Duplicate message detected. Please wait.' });
        }
        recentSubmissions.set(dedupeKey, Date.now());
        // Clean up old dedupe keys periodically
        if (recentSubmissions.size > 5000) {
          const cut = Date.now() - 10000;
          for (const [k, v] of recentSubmissions.entries()) {
            if (v < cut) recentSubmissions.delete(k);
          }
        }

        // Verify conversation & membership
        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: socket.user._id,
        });

        if (!conversation) {
          return callback({
            success: false,
            message: 'Conversation not found or unauthorized',
          });
        }

        const recipientId = conversation.participants.find(
          (p) => p.toString() !== userId
        );

        if (!recipientId) {
          return callback({ success: false, message: 'Recipient not found in conversation' });
        }

        // Create message in MongoDB with null readAt and null expiresAt
        const message = await Message.create({
          conversationId,
          senderId: socket.user._id,
          recipientId,
          text: trimmedText,
          image: imageStr,
          readAt: null,
          expiresAt: null,
        });

        // Update conversation's lastMessage reference and updatedAt timestamp
        conversation.lastMessage = message._id;
        await conversation.save();

        const populatedMessage = await Message.findById(message._id)
          .populate('senderId', 'name avatar')
          .lean();

        // Broadcast to conversation room
        io.to(`conversation:${conversationId}`).emit('new_message', populatedMessage);

        // Also notify the recipient's personal user room so their conversation list updates
        io.to(`user:${recipientId.toString()}`).emit('conversation_updated', {
          conversationId,
          lastMessage: populatedMessage,
          senderId: socket.user._id,
        });

        callback({ success: true, data: populatedMessage });
      } catch (err) {
        callback({ success: false, message: err.message });
      }
    });

    /**
     * mark_read
     * Triggered when recipient opens the conversation.
     * Atomically starts 24-hour countdown on unread messages addressed to them.
     */
    socket.on('mark_read', async ({ conversationId }, callback = () => {}) => {
      try {
        if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
          return callback({ success: false, message: 'Invalid conversation ID' });
        }

        // Verify conversation membership
        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: socket.user._id,
        });

        if (!conversation) {
          return callback({ success: false, message: 'Unauthorized or conversation not found' });
        }

        // Select unread messages addressed to the caller
        const unreadMessages = await Message.find({
          conversationId,
          recipientId: socket.user._id,
          readAt: null,
        }).select('_id');

        if (unreadMessages.length === 0) {
          return callback({ success: true, count: 0 });
        }

        const now = new Date();
        const expiresAt = calculateExpiryDate(now);
        const ids = unreadMessages.map((m) => m._id);

        // Atomic update prevents concurrent reads from restarting the timer
        await Message.updateMany(
          { _id: { $in: ids }, readAt: null },
          { $set: { readAt: now, expiresAt } }
        );

        const payload = {
          conversationId,
          messageIds: ids.map((id) => id.toString()),
          readAt: now,
          expiresAt,
        };

        // Notify both participants in the room
        io.to(`conversation:${conversationId}`).emit('message_expiry_started', payload);

        // Also update unread counts on personal rooms
        io.to(`user:${userId}`).emit('messages_marked_read', { conversationId });

        callback({ success: true, count: ids.length, ...payload });
      } catch (err) {
        callback({ success: false, message: err.message });
      }
    });

    socket.on('disconnect', () => {
      // Disconnection handled automatically by Socket.IO
    });
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function closeSocket() {
  if (!io) return Promise.resolve();
  const instance = io;
  io = undefined;
  return new Promise((resolve) => instance.close(resolve));
}

module.exports = { initializeSocket, emitToUser, closeSocket };
function getIO() {
  return io;
}

module.exports = {
  initSocket,
  getIO,
};
