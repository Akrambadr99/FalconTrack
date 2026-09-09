import { Link } from 'react-router-dom'

import './pages.css'

export function NotFoundPage() {
  return (
    <section className="page" aria-labelledby="not-found-title">
      <header className="page-header">
        <p className="page-eyebrow">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p>The requested Sprintia view does not exist.</p>
      </header>
      <Link className="text-link" to="/">
        Return to dashboard
      </Link>
    </section>
  )
}
