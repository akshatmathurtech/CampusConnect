import api from './api';

export const getReports = () => api.get('/reports').then((r) => r.data.data.reports);
export const reviewReport = (id, status, adminNote) =>
  api.patch(`/reports/${id}`, { status, adminNote }).then((r) => r.data.data.report);
