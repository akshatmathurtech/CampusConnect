export function notificationText(notification) {
  return notification.message;
}

export function notificationPath(notification) {
  const id = notification.resourceId;
  if (!id) return '/notifications';
  if (notification.resourceType === 'post') return `/feed?post=${id}#post-${id}`;
  if (notification.resourceType === 'user') return `/profile/${id}`;
  if (notification.resourceType === 'conversation') return `/messages/${id}`;
  if (notification.resourceType === 'event') return `/events/${id}`;
  return '/notifications';
}
