export const defaultConfirm = async (
  message: string,
  _title?: string,
  _options?: { confirmText?: string; cancelText?: string; isDanger?: boolean }
): Promise<boolean> => {
  return window.confirm(message);
};

export const defaultAlert = async (message: string, _title?: string): Promise<void> => {
  window.alert(message);
};
