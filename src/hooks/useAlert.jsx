/**
 * useAlert – hook toàn cục thay thế window.alert()
 *
 * Cách dùng:
 *   const { showAlert, AlertUI } = useAlert();
 *   ...
 *   showAlert('Lưu thất bại');                         // lỗi (mặc định)
 *   showAlert('Thêm thành công!', 'success');           // thành công
 *   showAlert('Dữ liệu chưa đủ', 'warning', 'Chú ý'); // warning + tiêu đề tùy
 *   ...
 *   return <>{AlertUI} ...nội dung trang... </>;
 */

import { useState, useCallback, useRef, useEffect } from 'react';

const VARIANTS = {
  error:   { icon: 'fa-times-circle',       iconColor: '#dc2626', btnClass: 'btn-danger',  title: 'Lỗi'          },
  warning: { icon: 'fa-exclamation-triangle', iconColor: '#d97706', btnClass: 'btn-warning', title: 'Cảnh báo'     },
  success: { icon: 'fa-check-circle',        iconColor: '#16a34a', btnClass: 'btn-success', title: 'Thành công'   },
  info:    { icon: 'fa-info-circle',          iconColor: 'var(--primary)', btnClass: 'btn-primary', title: 'Thông báo' },
};

export function useAlert() {
  const [state, setState] = useState(null); // { message, variant, title }
  const btnRef = useRef();

  const showAlert = useCallback((message, variant = 'error', title = null) => {
    setState({ message, variant, title });
  }, []);

  const close = useCallback(() => setState(null), []);

  // Auto-focus nút OK khi mở
  useEffect(() => {
    if (state) setTimeout(() => btnRef.current?.focus(), 50);
  }, [state]);

  // Đóng bằng Escape
  useEffect(() => {
    if (!state) return;
    const handler = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, close]);

  const AlertUI = state ? (() => {
    const v = VARIANTS[state.variant] || VARIANTS.error;
    const heading = state.title || v.title;
    return (
      <div
        className="modal-overlay open"
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        style={{ zIndex: 9999 }}
      >
        <div
          className="modal-box"
          style={{ maxWidth: 400, width: '90vw' }}
          role="alertdialog"
          aria-modal="true"
        >
          <div className="modal-header" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="modal-title">
              <i className={`fas ${v.icon}`} style={{ color: v.iconColor, marginRight: 8 }}></i>
              {heading}
            </div>
          </div>
          <div className="modal-body" style={{ padding: '20px 24px', fontSize: '.93rem', lineHeight: 1.65 }}>
            {state.message}
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
            <button ref={btnRef} className={`btn ${v.btnClass}`} onClick={close}>
              <i className="fas fa-check"></i> Đã hiểu
            </button>
          </div>
        </div>
      </div>
    );
  })() : null;

  return { showAlert, AlertUI };
}
