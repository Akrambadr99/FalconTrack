import { lazy, Suspense, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'

import { NotificationCenter } from '../../features/notifications/NotificationCenter'
import { GlobalSearch } from '../../features/search/GlobalSearch'
import { useKeyboardShortcuts } from '../../interactions/keyboard-shortcuts'
import { PrimaryNavigation } from '../navigation/PrimaryNavigation'
import { useAuthorization } from '../providers/authorization-context'
import './app-shell.css'

const CommandPalette = lazy(async () => {
  const module = await import('../../features/commands/CommandPalette')
  return { default: module.CommandPalette }
})

export function AppShell() {
  const authorization = useAuthorization()
  const { session } = authorization
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  useKeyboardShortcuts([
    {
      id: 'commands.open',
      key: 'k',
      controlOrMeta: true,
      allowInEditable: true,
      handler: () => {
        setCommandPaletteOpen(true)
      },
    },
  ])

  if (authorization.isSessionExpired) {
    return (
      <main className="session-state" role="alert">
        <p className="page-eyebrow">Session security</p>
        <h1>Workspace access changed</h1>
        <p>
          Your membership is no longer active. Sprintia removed workspace data
          from the active view.
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            void authorization.refresh()
          }}
        >
          Check access again
        </button>
      </main>
    )
  }

  if (authorization.isStale) {
    return (
      <main className="session-state" role="alert">
        <p className="page-eyebrow">Session security</p>
        <h1>Permissions could not be verified</h1>
        <p>
          Sprintia removed workspace data from this view until your access can
          be confirmed.
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            void authorization.refresh()
          }}
        >
          Verify access
        </button>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="app-sidebar">
        <Link className="app-brand" to="/" aria-label="Sprintia dashboard">
          <span className="app-brand__mark" aria-hidden="true">
            TK
          </span>
          <span>Sprintia</span>
        </Link>

        <PrimaryNavigation />

        <button
          className="command-palette-trigger"
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            setCommandPaletteOpen(true)
          }}
        >
          <span>Commands</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>

        <p className="app-sidebar__environment">
          <span className="status-dot" aria-hidden="true" />
          Local workspace
        </p>
      </aside>

      <div className="app-content">
        <header className="app-topbar">
          <div>
            <p className="app-topbar__label">Workspace</p>
            <p className="app-topbar__name">Sprintia Workspace</p>
          </div>
          <GlobalSearch />
          <NotificationCenter />
          <div
            className="user-summary"
            aria-label={`Signed in as ${session.user.displayName}`}
          >
            <span className="user-summary__avatar" aria-hidden="true">
              {session.user.initials}
            </span>
            <span className="user-summary__name">{session.user.displayName}</span>
          </div>
        </header>

        <main className="app-main" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {commandPaletteOpen ? (
        <Suspense
          fallback={
            <p className="command-palette-loading" role="status">
              Opening command palette…
            </p>
          }
        >
          <CommandPalette
            onClose={() => {
              setCommandPaletteOpen(false)
            }}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
