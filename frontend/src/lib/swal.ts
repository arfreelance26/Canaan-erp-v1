import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

export const MySwal = withReactContent(Swal);

const baseCustomClass = {
  popup: 'rounded-2xl shadow-xl border border-gray-100',
  title: 'text-xl font-bold text-gray-900',
  htmlContainer: 'text-gray-500 text-sm',
  confirmButton: 'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2',
  cancelButton: 'px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2',
  actions: 'gap-3 mt-6'
};

// Base configuration to match ERP styling
const baseSwal = MySwal.mixin({
  customClass: baseCustomClass,
  buttonsStyling: false
});

/**
 * Standard confirmation dialog for destructive actions (deletes, removals).
 */
export const confirmDelete = async (itemName: string) => {
  return baseSwal.fire({
    title: `Delete ${itemName}?`,
    text: "You won't be able to revert this action!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete it',
    cancelButtonText: 'Cancel',
    customClass: {
      ...baseCustomClass,
      confirmButton: 'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-red-600 hover:bg-red-700 focus:ring-red-500',
    }
  });
};

/**
 * Standard confirmation dialog for generic actions.
 */
export const confirmAction = async (title: string, text?: string, confirmText = 'Confirm') => {
  return baseSwal.fire({
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
    customClass: {
      ...baseCustomClass,
      confirmButton: 'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    }
  });
};

/**
 * Error notification dialog.
 */
export const showError = async (message: string, title = 'Error') => {
  return baseSwal.fire({
    title,
    text: message,
    icon: 'error',
    confirmButtonText: 'OK',
    customClass: {
      ...baseCustomClass,
      confirmButton: 'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    }
  });
};

/**
 * Standard upload size limit for all file types across the app.
 * Must stay in sync with the backend cap (MAX_FILE_SIZE in routers/files.py).
 */
export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Validate a file against the standard size limit. If it's too large, this shows
 * an error popup and returns false; otherwise returns true. Callers should abort
 * (and reset the input) when this returns false.
 */
export const validateFileSize = (file: File): boolean => {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    showError(`File too large. The maximum allowed size is ${MAX_FILE_SIZE_MB}MB.`);
    return false;
  }
  return true;
};

/**
 * Success notification dialog.
 */
export const showSuccess = async (message: string, title = 'Success') => {
  return baseSwal.fire({
    title,
    text: message,
    icon: 'success',
    confirmButtonText: 'OK',
    timer: 2000,
    timerProgressBar: true,
    customClass: {
      ...baseCustomClass,
      confirmButton: 'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    }
  });
};

/**
 * Non-blocking corner toast — used for realtime pop-up notifications that should
 * not interrupt what the user is doing (e.g. an edit request being approved/rejected).
 */
export const showToast = (
  message: string,
  icon: 'success' | 'error' | 'info' | 'warning' = 'info',
  title?: string,
) => {
  return MySwal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title: title ?? message,
    text: title ? message : undefined,
    showConfirmButton: false,
    timer: 6000,
    timerProgressBar: true,
    customClass: {
      popup: 'rounded-xl shadow-lg border border-gray-100',
      title: 'text-sm font-semibold text-gray-900',
      htmlContainer: 'text-gray-500 text-xs',
    },
  });
};

/**
 * General info notification dialog.
 */
export const showInfo = async (message: string, title = 'Info') => {
  return baseSwal.fire({
    title,
    text: message,
    icon: 'info',
    confirmButtonText: 'OK',
    customClass: {
      ...baseCustomClass,
      confirmButton: 'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    }
  });
};
