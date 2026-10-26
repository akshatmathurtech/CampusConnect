import api from './api';

export const getFeed = (params) => api.get('/posts', { params }).then((r) => r.data.data);
export const getPost = (id) => api.get(`/posts/${id}`).then((r) => r.data.data.post);
export const createPost = (data) => api.post('/posts', data).then((r) => r.data.data.post);
export const updatePost = (id, data) => api.patch(`/posts/${id}`, data).then((r) => r.data.data.post);
export const deletePost = (id) => api.delete(`/posts/${id}`);
export const toggleLike = (id) => api.post(`/posts/${id}/like`).then((r) => r.data.data);
export const addComment = (id, text) => api.post(`/posts/${id}/comments`, { text }).then((r) => r.data.data);
export const deleteComment = (id, commentId) => api.delete(`/posts/${id}/comments/${commentId}`).then((r) => r.data.data);
export const toggleBookmark = (id) => api.post(`/posts/${id}/bookmark`).then((r) => r.data.data);
export const reportPost = (id, reason) => api.post(`/posts/${id}/report`, { reason }).then((r) => r.data.data.report);

const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
export const getPostImageUrl = (image) => new URL(image, apiOrigin).toString();
