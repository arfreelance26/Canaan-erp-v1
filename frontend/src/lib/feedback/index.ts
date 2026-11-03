/**
 * User feedback: toasts and confirm / prompt dialogs. The single import path
 * for telling the user something or asking them something.
 *
 *   import { notify, confirm, prompt } from "@/lib/feedback";
 *
 * Rendered by <Toaster/> and <ConfirmHost/> (src/components/feedback), both
 * mounted once in app/layout.tsx. Never use window.alert / window.confirm.
 */
export { notify, showSuccess, showError, showInfo, showToast, type NotifyOptions } from "./notify";
export {
  confirm,
  prompt,
  confirmDelete,
  confirmAction,
  type ConfirmOptions,
  type PromptOptions,
  type ConfirmResult,
} from "./confirm";
