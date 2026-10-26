import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import { notificationPath, notificationText } from './notificationUtils';
import Avatar from '../common/Avatar';
import Alert from '../common/Alert';

function NotificationItem({ notification, onOpen }) {
  return (
    <Link
      to={notificationPath(notification)}
      onClick={(event) => { event.preventDefault(); onOpen(notification); }}
      className={`flex gap-3 border-b border-slate-100 p-3 transition hover:bg-slate-50 ${
        notification.readAt ? '' : 'bg-indigo-50/60'
      }`}
    >
      <Avatar user={notification.actor} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-800">
          <span className="font-semibold">{notification.actor?.name || 'CampusConnect'}</span>
          {' '}{notificationText(notification)}
        </span>
        <time dateTime={notification.createdAt} className="mt-1 block text-xs text-slate-500">
          {new Date(notification.createdAt).toLocaleString()}
        </time>
      </span>
      {!notification.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-600" aria-label="Unread" />}
    </Link>
  );
}

export default function NotificationBell() {
  const { notifications, unreadCount, notificationError, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const root = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const openNotification = async (notification) => {
    setError('');
    if (!notification.readAt) {
      try {
        await markRead(notification._id);
      } catch (cause) {
        setError(cause.response?.data?.message || 'Could not mark this notification as read.');
        return;
      }
    }
    setOpen(false);
    navigate(notificationPath(notification));
  };

  const markEverythingRead = async () => {
    try {
      setError('');
      await markAllRead();
    } catch (cause) {
      setError(cause.response?.data?.message || 'Could not mark notifications as read.');
    }
  };

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-indigo-700"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold">Notifications</h2>
            <button type="button" onClick={markEverythingRead} disabled={!unreadCount} className="text-xs font-medium text-indigo-700 hover:underline disabled:text-slate-400">
              Mark all read
            </button>
          </div>
          {error && <div className="p-3"><Alert>{error}</Alert></div>}
          {notificationError && <div className="p-3"><Alert>{notificationError}</Alert></div>}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length ? notifications.slice(0, 6).map((notification) => (
              <NotificationItem key={notification._id} notification={notification} onOpen={openNotification} />
            )) : <p className="p-6 text-center text-sm text-slate-500">You’re all caught up.</p>}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 p-3 text-center text-sm font-medium text-indigo-700 hover:bg-slate-50">
            View notification history
          </Link>
        </div>
      )}
    </div>
  );
}
