import { createPortal } from "react-dom";
import "./ConfirmModal.css";

export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onCancel,
}) {
  // Portaled straight to <body> rather than rendered in place. ConfirmModal
  // gets invoked from all over the tree (small popovers like ProfilesMenu,
  // panels, etc.) — a `position: fixed` backdrop still re-scopes itself to
  // the nearest ancestor with a transform/filter/perspective instead of
  // the real viewport if one exists anywhere above it, and that's exactly
  // the kind of thing that's easy to reintroduce by accident later. A
  // portal sidesteps the ancestor chain entirely, so this dialog is always
  // sized to and centered on the actual window no matter where it's used.
  return createPortal(
    <div className="confirm-modal__backdrop" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal__title">{title}</div>
        <p className="confirm-modal__message">{message}</p>
        <div className="confirm-modal__actions">
          <button className="confirm-modal__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={
              "confirm-modal__confirm" +
              (danger ? " confirm-modal__confirm--danger" : "")
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
