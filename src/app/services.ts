import {
  createAtlasFixtures,
  InMemoryDataStore,
  MockAtlasGateway,
  SimulatedNetwork,
  type AuthorizationSession,
  type AtlasGateway,
  type Clock,
  type RequestSimulator,
} from '../data'
import {
  getPermissionFingerprint,
  type UserId,
  type WorkspaceId,
} from '../domain'
import { UserPreferenceRepository } from '../preferences/repository'
import {
  MemoryPreferenceStorage,
  type PreferenceStorage,
} from '../preferences/storage'

export type AppSession = AuthorizationSession

export interface AppServices {
  readonly gateway: AtlasGateway
  readonly preferences: UserPreferenceRepository
  readonly session: AppSession
  readonly workspaceId: WorkspaceId
}

export interface CreateAppServicesOptions {
  readonly clock?: Clock
  readonly simulator?: RequestSimulator
  readonly actorId?: UserId
  readonly preferenceStorage?: PreferenceStorage
  readonly dataStore?: InMemoryDataStore
}

export function createAppServices(
  options: CreateAppServicesOptions = {},
): AppServices {
  const dataStore = options.dataStore ?? new InMemoryDataStore(createAtlasFixtures())
  const initialSnapshot = dataStore.read()
  const fixtures = initialSnapshot.data
  const workspaceId = fixtures.workspaces[0]?.id

  if (!workspaceId) {
    throw new Error('Sprintia requires a default workspace fixture.')
  }

  const defaultMembership = fixtures.memberships.find(
    ({ role, status, workspaceId: memberWorkspaceId }) =>
      memberWorkspaceId === workspaceId && role === 'admin' && status === 'active',
  )
  const actorId = options.actorId ?? defaultMembership?.userId
  const user = fixtures.users.find(({ id }) => id === actorId)
  const workspaceMembership = fixtures.memberships.find(
    (membership) =>
      membership.workspaceId === workspaceId && membership.userId === actorId,
  )

  if (!actorId || !user || !workspaceMembership) {
    throw new Error('Sprintia requires an actor with workspace membership.')
  }

  const projectMemberships = fixtures.projectMembers.filter(
    (membership) => membership.userId === actorId,
  )
  const session: AppSession = {
    user,
    workspaceMembership,
    projectMemberships,
    snapshotVersion: initialSnapshot.version,
    permissionFingerprint: getPermissionFingerprint(
      workspaceMembership,
      projectMemberships,
    ),
  }

  const simulator =
    options.simulator ??
    new SimulatedNetwork({
      latency: (operation) => (operation.endsWith('.list') ? 80 : 120),
    })
  const gatewayOptions = {
    actorId,
    store: dataStore,
    simulator,
    ...(options.clock ? { clock: options.clock } : {}),
  }
  const preferences = new UserPreferenceRepository({
    storage: options.preferenceStorage ?? new MemoryPreferenceStorage(),
    storageKey: `atlas-ops:${workspaceId}:${actorId}:preferences`,
    ...(options.clock ? { clock: options.clock } : {}),
  })

  return {
    workspaceId,
    session,
    gateway: new MockAtlasGateway(gatewayOptions),
    preferences,
  }
}
