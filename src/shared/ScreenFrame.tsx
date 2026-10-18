import type { ReactNode } from 'react'

// The gallery's look for a single page: animated colour backdrop with grain around the dark "screen" panel.
// Styles live in App.css (.backdrop, .blobs, .grain, .panel). Children fill the panel.
export function ScreenFrame({ children }: { children: ReactNode }) {
  return (
    <div className="backdrop" style={{ cursor: 'auto' }}>
      <div className="blobs" aria-hidden><i /><i /><i /><i /><i /></div>
      <div className="grain" aria-hidden />
      <main className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  )
}
