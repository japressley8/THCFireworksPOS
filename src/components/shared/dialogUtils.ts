export const defaultConfirm = async (
  message: string,
  _title?: string,
  _options?: { confirmText?: string; cancelText?: string; isDanger?: boolean }
): Promise<boolean> => {
  if (typeof window !== 'undefined' && window.confirm) {
    return window.confirm(message);
  }
  return true;
};

export const defaultAlert = async (message: string, _title?: string): Promise<void> => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message);
  } else {
    console.log(message);
  }
};
