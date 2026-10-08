import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Lỗi giao diện (ErrorBoundary captured):', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center',
          color: '#1e293b',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '32px 40px',
            maxWidth: '560px',
            width: '100%',
            border: '1px solid #fee2e2'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: '#fee2e2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              color: '#ef4444',
              fontSize: '28px'
            }}>
              <i className="fas fa-exclamation-triangle"></i>
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '8px', color: '#991b1b' }}>
              Đã xảy ra lỗi khi tải giao diện
            </h2>
            <p style={{ fontSize: '0.925rem', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
              Trang web gặp sự cố không mong muốn trong quá trình xử lý dữ liệu. Bạn có thể thử tải lại hoặc liên hệ quản trị viên.
            </p>

            {this.state.error?.message && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'left',
                fontSize: '0.8rem',
                color: '#dc2626',
                fontFamily: 'monospace',
                marginBottom: '24px',
                maxHeight: '120px',
                overflowY: 'auto',
                wordBreak: 'break-word'
              }}>
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.9rem'
                }}
              >
                <i className="fas fa-redo"></i> Tải lại trang
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.9rem'
                }}
              >
                <i className="fas fa-home"></i> Về trang chủ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
