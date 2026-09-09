import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'

import '../pages/pages.css'

export function RouteErrorBoundary() {
  const error = useRouteError()
  const isResponse = isRouteErrorResponse(error)
  const title = isResponse
    ? `${String(error.status)} ${error.statusText}`
    : 'Something went wrong'
  const detail =
    error instanceof Error && import.meta.env.DEV
      ? error.message
      : 'FalconTrack could not load this view. Return to the dashboard and try again.'

  return (
    <main className="error-page" role="alert">
      <p className="page-eyebrow">Application error</p>
      <h1>{title}</h1>
      <p>{detail}</p>
      <Link className="text-link" to="/">
        Return to dashboard
      </Link>
    </main>
  )
}
