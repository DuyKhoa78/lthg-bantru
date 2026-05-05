import { useEffect, useRef } from 'react';

/**
 * ConfirmDialog – hộp thoại xác nhận tùy chỉnh thay thế window.confirm()
 *
 * Props:
 *   open       {bool}     – hiển thị hay ẩn
 *   title      {string}   – tiêu đề (mặc định: "Xác nhận")
 *   message    {string}   – nội dung câu hỏi
 *   confirmText{string}   – nhãn nút xác nhận (mặc định: "Xác nhận")
 *   cancelText {string}   – nhãn nút hủy (mặc định: "Hủy")
 *   variant    {string}   – "danger" | "warning" | "primary" (mặc định: "danger")
 *   onConfirm  {fn}       – callback khi bấm xác nhận
 *   onCancel   {fn}       – callback khi bấm hủy / bấm ngoài
 */
export default function ConfirmDialog({
  open,
  title = 'Xác nhận',
  message,
  confirmText = 'Xác nhận',
  cancelText  = 'Hủy',
  variant     = 'danger',
  onConfirm,
  onCancel,
}) {
  const confirmBtnRef = useRef();

  // Auto-focus nút xác nhận khi mở
  useEffect(() => {
    if (open) setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [open]);

  // Đóng khi bấm Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const colors = {
    danger:  { icon: 'fa-exclamation-triangle', iconColor: '#dc2626', btnClass: 'btn-danger'  },
    warning: { icon: 'fa-exclamation-circle',   iconColor: '#d97706', btnClass: 'btn-warning' },
    primary: { icon: 'fa-question-circle',       iconColor: 'var(--primary)', btnClass: 'btn-primary' },
  };
  const { icon, iconColor, btnClass } = colors[variant] || colors.danger;

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
      style={{ zIndex: 2000 }}
    >
      <div
        className="modal-box"
        style={{ maxWidth: 420, width: '90vw', animation: 'fadeInScale .18s ease' }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-msg"
      >
        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="modal-title" id="confirm-title">
            <i className={`fas ${icon}`} style={{ color: iconColor, marginRight: 8 }}></i>
            {title}
          </div>
        </div>

        {/* Body */}
        <div className="modal-body" id="confirm-msg" style={{ padding: '20px 24px', fontSize: '.95rem', lineHeight: 1.6 }}>
          {message}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onCancel}>
            <i className="fas fa-times"></i> {cancelText}
          </button>
          <button ref={confirmBtnRef} className={`btn ${btnClass}`} onClick={onConfirm}>
            <i className="fas fa-check"></i> {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
