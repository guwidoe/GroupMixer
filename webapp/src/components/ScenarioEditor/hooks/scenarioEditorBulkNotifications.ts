export type ScenarioEditorBulkNotification = {
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
};
