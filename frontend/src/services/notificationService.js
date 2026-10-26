import api from './api';

export const getNotifications = (params) =>
  api.get('/notifications', { params }).then((response) => response.data.data);
export const markNotificationRead = (id) =>
  api.patch(`/notifications/${id}/read`).then((response) => response.data.data);
export const markAllNotificationsRead = () =>
  api.patch('/notifications/read-all').then((response) => response.data.data);
