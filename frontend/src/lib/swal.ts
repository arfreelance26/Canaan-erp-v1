import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { toastManager } from './toast-manager';

export const MySwal = withReactContent(Swal);

function isDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

function getBaseClass(extra: Record<string, string> = {}) {
  const dark = isDark();
  return {
    popup: `rounded-2xl shadow-xl border ${dark ? 'border-gray-700' : 'border-gray-100'}`,
    title: `text-xl font-bold ${dark ? 'text-gray-100' : 'text-gray-900'}`,
    htmlContainer: `text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`,
    confirmButton:
      'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2',
    cancelButton: `px-4 py-2 text-sm font-medium rounded-lg border focus:outline-none focus:ring-2 focus:ring-offset-2 ${
      dark
        ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
        : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
    }`,
    actions: 'gap-3 mt-6',
    ...extra,
  };
}

/**
 * Standard confirmation dialog for destructive actions (deletes, removals).
 */
export const confirmDelete = async (itemName: string) => {
  return MySwal.fire({
    title: `Delete ${itemName}?`,
    text: "You won't be able to revert this action!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete it',
    cancelButtonText: 'Cancel',
    buttonsStyling: false,
    customClass: getBaseClass({
      confirmButton:
        'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-red-600 hover:bg-red-700 focus:ring-red-500',
    }),
  });
};

/**
 * Standard confirmation dialog for generic actions.
 */
export const confirmAction = async (title: string, text?: string, confirmText = 'Confirm') => {
  return MySwal.fire({
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
    buttonsStyling: false,
    customClass: getBaseClass({
      confirmButton:
        'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    }),
  });
};

/**
 * Error notification dialog.
 */
export const showError = async (message: string, title = 'Error') => {
  return MySwal.fire({
    title,
    text: message,
    icon: 'error',
    confirmButtonText: 'OK',
    buttonsStyling: false,
    customClass: getBaseClass({
      confirmButton:
        'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    }),
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
  return MySwal.fire({
    title,
    text: message,
    icon: 'success',
    confirmButtonText: 'OK',
    timer: 2000,
    timerProgressBar: true,
    buttonsStyling: false,
    customClass: getBaseClass({
      confirmButton:
        'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    }),
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
  // Defer to a macrotask (not just a microtask): base-ui's Toast.Root calls
  // flushSync internally when a toast is added. A microtask can still run inside
  // React's commit/flush window, triggering "flushSync was called while React is
  // already rendering". setTimeout(0) guarantees the add runs after the commit.
  setTimeout(() => {
    toastManager.add({
      title: title ?? message,
      description: title ? message : undefined,
      type: icon,
    });
  }, 0);
};

/**
 * General info notification dialog.
 */
export const showInfo = async (message: string, title = 'Info') => {
  return MySwal.fire({
    title,
    text: message,
    icon: 'info',
    confirmButtonText: 'OK',
    buttonsStyling: false,
    customClass: getBaseClass({
      confirmButton:
        'px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    }),
  });
};
