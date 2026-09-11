import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('StayPilot workspace', () => {
  it('opens a domain-specific operational surface', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Occupancy calendar' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'arrivals' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Arrivals board' })).toBeVisible()
  })

  it('surfaces housekeeping state and in-stay guest requests', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'housekeeping' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Housekeeping board' })).toBeVisible()
    expect(screen.getByText('Room 302')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'guest service' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Guest-service queue' })).toBeVisible()
    expect(screen.getByText('Late checkout until 14:00')).toBeVisible()
  })
})
