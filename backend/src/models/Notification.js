const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: {
      type: String,
      enum: [
        'connection_request',
        'connection_accepted',
        'new_message',
        'post_like',
        'post_comment',
        'event_announcement',
        'event_update',
      ],
      required: true,
    },
    resourceType: { type: String, enum: ['user', 'post', 'conversation', 'event'], default: null },
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    message: { type: String, required: true, trim: true, maxlength: 240 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
notificationSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Notification', notificationSchema);
