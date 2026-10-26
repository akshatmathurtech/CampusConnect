import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { getNotifications } from '../services/notificationService';
import { getErrorMessage } from '../services/api';
import { notificationPath, notificationText } from '../components/notifications/notificationUtils';
import Avatar from '../components/common/Avatar';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';

export default function NotificationsPage() {
  const { markRead, markAllRead, refreshNotifications } = useNotifications();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setError('');
    try {
      setResult(await getNotifications({ page, limit: 20 }));
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const openNotification = async (notification) => {
    if (!notification.readAt) {
      setBusy(true);
      try {
        const updated = await markRead(notification._id);
        setResult((current) => ({
          ...current,
          unreadCount: Math.max(current.unreadCount - (updated.wasUnread ? 1 : 0), 0),
          notifications: current.notifications.map((item) =>
            item._id === notification._id ? { ...item, readAt: new Date().toISOString() } : item
          ),
        }));
      } catch (cause) {
        setError(getErrorMessage(cause));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    navigate(notificationPath(notification));
  };

  const markEverythingRead = async () => {
    setBusy(true);
    setError('');
    try {
      await markAllRead();
      setResult((current) => ({
        ...current,
        unreadCount: 0,
        notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })),
      }));
      await refreshNotifications();
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notification history</h1>
          <p className="mt-1 text-sm text-slate-500">
            {result ? `${result.unreadCount} unread · ${result.total} total` : 'Your recent activity'}
          </p>
        </div>
        <Button variant="secondary" disabled={busy || !result?.unreadCount} onClick={markEverythingRead}>Mark all read</Button>
      </header>
      <Alert>{error}</Alert>
      {!result && !error && <Spinner />}
      {result?.notifications.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No notifications yet.</p>
      )}
      {result?.notifications.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {result.notifications.map((notification) => (
            <Link
              key={notification._id}
              to={notificationPath(notification)}
              onClick={(event) => { event.preventDefault(); if (!busy) openNotification(notification); }}
              className={`flex gap-4 border-b border-slate-100 p-4 last:border-b-0 hover:bg-slate-50 ${
                notification.readAt ? '' : 'bg-indigo-50/50'
              }`}
            >
              <Avatar user={notification.actor} size={44} />
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
          ))}
        </div>
      )}
      {result && result.pages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
          <span className="text-sm text-slate-500">Page {page} of {result.pages}</span>
          <Button variant="secondary" disabled={page >= result.pages} onClick={() => setPage((current) => current + 1)}>Next</Button>
        </div>
      )}
      <Link to="/feed" className="inline-block text-sm font-medium text-indigo-700 hover:underline">Back to feed</Link>
    </section>
  );
}
