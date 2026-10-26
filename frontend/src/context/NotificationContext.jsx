import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { TOKEN_KEY } from '../services/api';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notificationService';

const NotificationContext = createContext(null);
export const useNotifications = () => useContext(NotificationContext);

const apiOrigin = new URL(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').origin;

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState('');
  const socketRef = useRef(null);

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    const result = await getNotifications({ limit: 8 });
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationError('');
      return undefined;
    }

    let active = true;
    getNotifications({ limit: 8 }).then((result) => {
      if (!active) return;
      setNotificationError('');
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    }).catch((error) => {
      if (active) setNotificationError(error.response?.data?.message || 'Could not load notifications.');
    });

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return () => { active = false; };
    const socket = io(apiOrigin, { auth: { token } });
    socket.on('notification:new', (notification) => {
      setNotificationError('');
      setNotifications((current) => [
        notification,
        ...current.filter((item) => item._id !== notification._id),
      ].slice(0, 8));
      if (!notification.readAt) setUnreadCount((count) => count + 1);
    });
    socket.on('connect_error', () => {
      setNotificationError('Live notifications are unavailable. Your notification history is still saved.');
    });
    socketRef.current = socket;

    return () => {
      active = false;
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [user]);

  const markRead = useCallback(async (id) => {
    const result = await markNotificationRead(id);
    setNotifications((current) => current.map((item) => item._id === id ? result.notification : item));
    if (result.wasUnread) {
      setUnreadCount((count) => Math.max(count - 1, 0));
    }
    return result;
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || readAt })));
    setUnreadCount(0);
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, notificationError, markRead, markAllRead, refreshNotifications,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}
