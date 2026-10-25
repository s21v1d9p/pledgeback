import { Component, lazy, Suspense } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from '@/components/Navbar'
import { Home } from '@/pages/Home'
import { NewCampaign } from '@/pages/NewCampaign'
import { Campaign } from '@/pages/Campaign'

// Lazy-load /deploy so the 400 KB artifact is not downloaded by regular visitors
const Deploy = lazy(() => import('@/pages/Deploy').then((m) => ({ default: m.Deploy })))

// Simple page-level error boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(_err: Error, _info: ErrorInfo) { /* intentional */ }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh items-center justify-center px-5">
          <div className="max-w-md text-center">
            <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--danger)' }}>
              Something went wrong.
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {(this.state.error as Error).message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
        <Navbar />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/new" element={<NewCampaign />} />
            <Route path="/c/:id" element={<Campaign />} />
            <Route
              path="/deploy"
              element={
                <Suspense fallback={
                  <div className="flex min-h-dvh items-center justify-center">
                    <p style={{ color: 'var(--muted)' }}>Loading...</p>
                  </div>
                }>
                  <Deploy />
                </Suspense>
              }
            />
          </Routes>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  )
}
