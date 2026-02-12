import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--bg, #1a1a1a)',
            color: 'var(--text, #e0d6cc)',
            fontFamily: "'Noto Serif SC', serif",
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--primary, #d4a574)' }}>
            出了点问题
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #a09890)', marginBottom: '1.5rem', maxWidth: '400px' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid var(--border, #3a3530)',
              background: 'var(--primary-subtle, rgba(212,165,116,0.1))',
              color: 'var(--primary, #d4a574)',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            重新加载
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
