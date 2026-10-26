import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bookmark, Heart, ImagePlus, MessageCircle, Pencil, Share2, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/common/Avatar';
import Alert from '../components/common/Alert';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';
import { getErrorMessage } from '../services/api';
import {
  addComment, createPost, deleteComment, deletePost, getFeed, getPost, getPostImageUrl, reportPost,
  toggleBookmark, toggleLike, updatePost,
} from '../services/postService';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function PostComposer({ post, onSave, onCancel }) {
  const [content, setContent] = useState(post?.content || '');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const imageInput = useRef(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!image) {
      setImagePreview('');
      return undefined;
    }
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE) {
      setError('Choose a JPEG, PNG, or WebP image up to 5 MB.');
      event.target.value = '';
      return;
    }
    setError('');
    setImage(file);
    setRemoveImage(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!content.trim() && !image && (!post?.image || removeImage)) {
      setError('Add some text or an image to your post.');
      return;
    }
    const body = new FormData();
    body.append('content', content);
    if (image) body.append('image', image);
    if (removeImage) body.append('removeImage', 'true');
    setSaving(true);
    setError('');
    try {
      await onSave(body);
      if (!post) setContent('');
      setImage(null);
      setRemoveImage(false);
      if (imageInput.current) imageInput.current.value = '';
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="font-semibold">{post ? 'Edit post' : 'Share with your campus'}</h2>
      <Alert>{error}</Alert>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={5000}
        rows={3}
        placeholder="What would you like to share?"
        aria-label="Post text"
        className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {post?.image && !removeImage && !image && (
        <div className="flex items-center gap-3">
          <img src={getPostImageUrl(post.image)} alt="Current post" className="h-16 w-16 rounded-lg object-cover" />
          <button type="button" onClick={() => setRemoveImage(true)} className="text-sm text-red-600 hover:underline">
            Remove current image
          </button>
        </div>
      )}
      {removeImage && <p className="text-sm text-slate-500">Current image will be removed when saved.</p>}
      {image && (
        <div className="flex items-center gap-3">
          <img src={imagePreview} alt="Selected preview" className="h-16 w-16 rounded-lg object-cover" />
          <span className="truncate text-sm text-slate-600">{image.name}</span>
          <button type="button" aria-label="Remove selected image" onClick={() => { setImage(null); if (imageInput.current) imageInput.current.value = ''; }}><X className="h-4 w-4" /></button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900">
          <ImagePlus className="h-4 w-4" aria-hidden="true" /> Add image
          <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseImage} />
        </label>
        <div className="flex gap-2">
          {post && <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>}
          <Button type="submit" loading={saving}>{post ? 'Save changes' : 'Post'}</Button>
        </div>
      </div>
    </form>
  );
}

function PostCard({ post, onUpdate, onRemove }) {
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState(post.comments || []);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const own = post.author._id === user._id;

  const act = async (operation) => {
    setError('');
    setBusy(true);
    try {
      await operation();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async (event) => {
    event.preventDefault();
    if (!comment.trim()) return;
    await act(async () => {
      const result = await addComment(post._id, comment);
      setComments(result.comments);
      setComment('');
      onUpdate(post._id, { commentsCount: result.commentsCount });
    });
  };

  const removeComment = async (commentId) => {
    await act(async () => {
      await deleteComment(post._id, commentId);
      setComments((current) => current.filter((item) => item._id !== commentId));
      onUpdate(post._id, { commentsCount: Math.max(comments.length - 1, 0) });
    });
  };

  const submitReport = async (event) => {
    event.preventDefault();
    await act(async () => {
      await reportPost(post._id, reportReason);
      setReporting(false);
      setReportReason('');
      setReportMessage('Report sent for administrative review.');
    });
  };

  const sharePost = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/feed?post=${post._id}#post-${post._id}`);
      setReportMessage('Post link copied.');
    } catch {
      setError('Could not copy the post link. Check browser clipboard permissions.');
    }
  };

  const togglePostLike = () => act(async () => {
    const result = await toggleLike(post._id);
    onUpdate(post._id, { likedByMe: result.liked, likesCount: result.likesCount });
  });

  const togglePostBookmark = () => act(async () => {
    const result = await toggleBookmark(post._id);
    onUpdate(post._id, { bookmarkedByMe: result.bookmarked });
  });

  const submitPostDelete = () => {
    if (window.confirm('Delete this post? This cannot be undone.')) {
      act(async () => { await deletePost(post._id); onRemove(post._id); });
    }
  };

  return (
    <article id={`post-${post._id}`} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <Link to={`/profile/${post.author._id}`} aria-label={`View ${post.author.name}'s profile`}>
          <Avatar user={post.author} size={42} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/profile/${post.author._id}`} className="font-semibold text-slate-900 hover:text-indigo-700">
            {post.author.name}
          </Link>
          <p className="text-xs text-slate-500">
            {post.author.college} · <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time>
            {post.updatedAt !== post.createdAt && ' · edited'}
          </p>
        </div>
        {own && (
          <div className="flex gap-1">
            <button onClick={() => onUpdate(post._id, { editing: true })} aria-label="Edit post" className="rounded p-2 text-slate-500 hover:bg-slate-100">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={submitPostDelete} aria-label="Delete post" className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>
      {post.content && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{post.content}</p>}
      {post.image && <img src={getPostImageUrl(post.image)} alt={`Post shared by ${post.author.name}`} className="max-h-[32rem] w-full rounded-lg bg-slate-50 object-contain" />}
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-100 py-2 text-sm text-slate-500">
        <span>{post.likesCount} {post.likesCount === 1 ? 'like' : 'likes'}</span>
        <span>{comments.length || post.commentsCount} {post.commentsCount === 1 ? 'comment' : 'comments'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={togglePostLike} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 ${post.likedByMe ? 'font-medium text-red-600' : 'text-slate-600'}`}>
          <Heart className={`h-4 w-4 ${post.likedByMe ? 'fill-current' : ''}`} /> {post.likedByMe ? 'Unlike' : 'Like'}
        </button>
        <a href="#comments" onClick={(event) => { event.preventDefault(); document.getElementById(`comment-${post._id}`)?.focus(); }} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          <MessageCircle className="h-4 w-4" /> Comment
        </a>
        <button onClick={sharePost} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          <Share2 className="h-4 w-4" /> Share
        </button>
        <button disabled={busy} onClick={togglePostBookmark} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 ${post.bookmarkedByMe ? 'font-medium text-indigo-700' : 'text-slate-600'}`}>
          <Bookmark className={`h-4 w-4 ${post.bookmarkedByMe ? 'fill-current' : ''}`} /> {post.bookmarkedByMe ? 'Saved' : 'Save'}
        </button>
        {!own && <button onClick={() => { setReporting((value) => !value); setReportMessage(''); }} className="ml-auto px-3 py-2 text-sm text-slate-500 hover:text-red-600">Report</button>}
      </div>
      {reporting && (
        <form onSubmit={submitReport} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row">
          <input value={reportReason} onChange={(event) => setReportReason(event.target.value)} maxLength={500} required placeholder="Why are you reporting this post?" aria-label="Report reason" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <Button type="submit" loading={busy}>Send report</Button>
        </form>
      )}
      {reportMessage && <p role="status" className="text-sm text-green-700">{reportMessage}</p>}
      <Alert>{error}</Alert>
      <div className="space-y-3">
        {comments.map((item) => (
          <div key={item._id} className="flex items-start gap-2">
            <Link to={`/profile/${item.author._id}`}><Avatar user={item.author} size={30} /></Link>
            <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/profile/${item.author._id}`} className="text-sm font-medium hover:text-indigo-700">{item.author.name}</Link>
                {item.author._id === user._id && <button onClick={() => removeComment(item._id)} className="text-xs text-slate-500 hover:text-red-600">Delete</button>}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.text}</p>
              <time dateTime={item.createdAt} className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</time>
            </div>
          </div>
        ))}
        <form onSubmit={submitComment} className="flex gap-2">
          <label htmlFor={`comment-${post._id}`} className="sr-only">Write a comment</label>
          <input id={`comment-${post._id}`} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Write a comment..." className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <Button type="submit" disabled={!comment.trim() || busy}>Send</Button>
        </form>
      </div>
    </article>
  );
}

export default function FeedPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [sharedPostId, setSharedPostId] = useState(searchParams.get('post') || '');
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [page, setPage] = useState(1);
  const [feed, setFeed] = useState({ posts: [], pages: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (sharedPostId) {
        const post = await getPost(sharedPostId);
        setFeed({ posts: [post], page: 1, pages: 1, total: 1 });
        return;
      }
      const result = await getFeed({
        page, limit: 10, q: search.trim() || undefined, bookmarked: showBookmarks || undefined,
      });
      setFeed(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, showBookmarks, sharedPostId]);

  useEffect(() => { loadFeed(); }, [loadFeed]);
  useEffect(() => {
    if (!sharedPostId || !feed.posts.length) return;
    document.getElementById(`post-${sharedPostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [feed.posts, sharedPostId]);
  useEffect(() => {
    const nextQuery = searchParams.get('q') || '';
    setQuery(nextQuery);
    setSearch(nextQuery);
    setSharedPostId(searchParams.get('post') || '');
    setPage(1);
  }, [searchParams]);

  const submitSearch = (event) => {
    event.preventDefault();
    const nextQuery = query.trim();
    setPage(1);
    setSearch(nextQuery);
    setSearchParams(nextQuery ? { q: nextQuery } : {});
  };

  const savePost = async (body) => {
    if (editing) {
      const updated = await updatePost(editing, body);
      setFeed((current) => ({ ...current, posts: current.posts.map((post) => post._id === editing ? updated : post) }));
      setEditing(null);
    } else {
      const created = await createPost(body);
      setFeed((current) => ({ ...current, posts: [created, ...current.posts], total: current.total + 1 }));
    }
  };

  const updatePostInFeed = (id, changes) => {
    if (changes.editing) {
      setEditing(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setFeed((current) => ({ ...current, posts: current.posts.map((post) => post._id === id ? { ...post, ...changes } : post) }));
  };

  const removePostFromFeed = (id) => {
    setFeed((current) => ({ ...current, posts: current.posts.filter((post) => post._id !== id), total: Math.max(current.total - 1, 0) }));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Campus feed</h1>
        <p className="mt-1 text-sm text-slate-500">See what students in your community are sharing.</p>
      </header>
      <PostComposer key={editing || 'new-post'} post={feed.posts.find((post) => post._id === editing)} onSave={savePost} onCancel={() => setEditing(null)} />
      <div className="flex flex-wrap gap-2">
        <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2">
          <label htmlFor="feed-search" className="sr-only">Search posts</label>
          <input id="feed-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search posts or students..." className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <Button type="button" variant="secondary" onClick={() => { setShowBookmarks((current) => !current); setPage(1); }}>
          <Bookmark className="h-4 w-4" /> {showBookmarks ? 'All posts' : 'Saved'}
        </Button>
      </div>
      <Alert>{error}</Alert>
      {loading ? <Spinner /> : feed.posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-medium text-slate-700">{query ? 'No posts match your search.' : 'No posts yet.'}</p>
          <p className="mt-1 text-sm text-slate-500">{query ? 'Try a different keyword.' : `Be the first to share something, ${user.name.split(' ')[0]}!`}</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {feed.posts.map((post) => <PostCard key={post._id} post={post} onUpdate={updatePostInFeed} onRemove={removePostFromFeed} />)}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-500">Page {page} of {Math.max(feed.pages, 1)}</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</Button>
              <Button variant="secondary" disabled={page >= feed.pages || loading} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
