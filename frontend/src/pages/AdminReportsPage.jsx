import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../services/api';
import { getReports, reviewReport } from '../services/reportService';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';

export default function AdminReportsPage() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    getReports().then(setReports).catch((err) => setError(getErrorMessage(err)));
  }, []);

  const updateReport = async (report, status) => {
    setBusy(report._id);
    setError('');
    try {
      const updated = await reviewReport(report._id, status, '');
      setReports((current) => current.map((item) => item._id === updated._id ? updated : item));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  if (!reports && !error) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Content reports</h1>
        <p className="mt-1 text-sm text-slate-500">Review student reports and record an outcome.</p>
      </header>
      <Alert>{error}</Alert>
      {error && !reports ? <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Reports are unavailable. Administrator access may be required.</p> : null}
      {reports?.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">There are no reported posts.</p>}
      {reports?.map((report) => (
        <article key={report._id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              Reported by <Link className="font-medium text-indigo-700 hover:underline" to={`/profile/${report.reporter._id}`}>{report.reporter.name}</Link>
              {' · '}{new Date(report.createdAt).toLocaleString()}
            </p>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${report.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
              {report.status}
            </span>
          </div>
          <p className="text-sm"><span className="font-semibold">Reason:</span> {report.reason}</p>
          {report.post ? (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">
                Post by {report.post.author?.name || 'Unknown student'}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{report.post.content || '[Image post]'}</p>
              {report.post.image && <p className="mt-1 text-xs text-slate-500">This post includes an image.</p>}
              <Link to={`/feed?post=${report.post._id}#post-${report.post._id}`} className="mt-2 inline-block text-sm text-indigo-700 hover:underline">Open feed post</Link>
            </div>
          ) : <p className="text-sm text-slate-500">The reported post has been deleted.</p>}
          {report.adminNote && <p className="text-sm text-slate-600">Review note: {report.adminNote}</p>}
          {report.status === 'pending' && (
            <div className="flex gap-2">
              <Button loading={busy === report._id} disabled={!!busy && busy !== report._id} onClick={() => updateReport(report, 'reviewed')}>Mark reviewed</Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => updateReport(report, 'dismissed')}>Dismiss</Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
