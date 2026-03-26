export type ProblemEditorBulkNotification = {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
};
