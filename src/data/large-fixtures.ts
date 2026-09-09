import { DeterministicIdGenerator } from './id-generator'
import type { AtlasDataSnapshot } from './snapshot'
import {
  isoDate,
  isoDateTime,
  type ActivityEvent,
  type AuditEvent,
  type Comment,
  type CommentMention,
  type Issue,
  type IssuePriority,
  type IssueSubscription,
  type Label,
  type Membership,
  type Notification,
  type NotificationPreferences,
  type Project,
  type ProjectMember,
  type ProjectStatus,
  type ProjectSubscription,
  type User,
  type WorkflowStatus,
  type WorkspaceInvitation,
} from '../domain'

export interface LargeWorkspaceFixtureOptions {
  readonly projectCount?: number
  readonly issueCount?: number
  readonly memberCount?: number
  readonly activityEventCount?: number
  readonly auditEventCount?: number
  readonly notificationCount?: number
  readonly invitationCount?: number
  readonly namespace?: string
}

export const largeWorkspaceFixtureDefaults = {
  projectCount: 300,
  issueCount: 5_000,
  memberCount: 320,
  activityEventCount: 5_000,
  auditEventCount: 5_000,
  notificationCount: 4_000,
  invitationCount: 120,
  namespace: 'large',
} as const

const baseTime = isoDateTime('2026-01-01T08:00:00.000Z')
const priorities: readonly IssuePriority[] = [
  'urgent',
  'high',
  'medium',
  'low',
  'none',
]
const projectStatuses: readonly ProjectStatus[] = [
  'active',
  'active',
  'planned',
  'paused',
  'completed',
]
const workflowTemplates = [
  { name: 'Backlog', category: 'backlog' as const },
  { name: 'Ready', category: 'unstarted' as const },
  { name: 'In progress', category: 'started' as const },
  { name: 'Done', category: 'completed' as const },
] as const

export function createLargeWorkspaceFixtures(
  options: LargeWorkspaceFixtureOptions = {},
): AtlasDataSnapshot {
  const configuration = { ...largeWorkspaceFixtureDefaults, ...options }
  validateConfiguration(configuration)
  const ids = new DeterministicIdGenerator(configuration.namespace)
  const workspace = {
    id: ids.workspace('operations'),
    name: 'Sprintia Large Workspace',
    slug: 'atlas-large-operations',
    createdAt: baseTime,
  }
  const users = createUsers(ids, configuration.memberCount)
  const memberships = createMemberships(ids, workspace.id, users)
  const workspaceInvitations = createInvitations(
    ids,
    workspace.id,
    itemAt(users, 0, 'workspace members'),
    configuration.invitationCount,
  )
  const labels = createLabels(ids, workspace.id)
  const projects = createProjects(
    ids,
    workspace.id,
    users,
    configuration.projectCount,
  )
  const workflowStatuses = createWorkflowStatuses(ids, projects)
  const projectMembers = createProjectMembers(ids, projects, users)
  const projectSubscriptions = createProjectSubscriptions(ids, projects, users)
  const issues = createIssues(
    ids,
    workspace.id,
    projects,
    workflowStatuses,
    users,
    labels,
    configuration.issueCount,
  )
  const issueSubscriptions = createIssueSubscriptions(ids, issues, users)
  const comments = createComments(ids, issues, users)
  const commentMentions = createCommentMentions(ids, comments, users)
  const activityEvents = createActivityEvents(
    ids,
    workspace.id,
    issues,
    projects,
    users,
    configuration.activityEventCount,
  )
  const auditEvents = createAuditEvents(
    ids,
    workspace.id,
    users,
    configuration.auditEventCount,
  )
  const notifications = createNotifications(
    ids,
    workspace.id,
    issues,
    projects,
    users,
    configuration.notificationCount,
  )
  const notificationPreferences = createNotificationPreferences(
    ids,
    workspace.id,
    users,
  )

  return {
    workspaces: [workspace],
    users,
    memberships,
    workspaceInvitations,
    projects,
    projectMembers,
    projectSubscriptions,
    workflowStatuses,
    labels,
    issues,
    issueRelations: [],
    issueSubscriptions,
    comments,
    commentMentions,
    activityEvents,
    auditEvents,
    notifications,
    notificationPreferences,
  }
}

function createUsers(
  ids: DeterministicIdGenerator,
  count: number,
): User[] {
  return Array.from({ length: count }, (_, index) => ({
    id: ids.user(sequence('member', index)),
    displayName: `Workspace Member ${sequenceNumber(index)}`,
    email: `member-${sequenceNumber(index)}@example.test`,
    initials: `M${(index % 10).toString()}`,
  }))
}

function createMemberships(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
  users: readonly User[],
): Membership[] {
  return users.map((user, index) => ({
    id: ids.membership(sequence('member', index)),
    workspaceId,
    userId: user.id,
    role:
      index === 0
        ? 'owner'
        : index === 1
          ? 'admin'
          : index % 7 === 0
            ? 'viewer'
            : 'member',
    status: 'active',
    joinedAt: timestampAt(index),
    revision: 1,
  }))
}

function createInvitations(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
  inviter: User,
  count: number,
): WorkspaceInvitation[] {
  return Array.from({ length: count }, (_, index) => ({
    id: ids.workspaceInvitation(sequence('candidate', index)),
    workspaceId,
    email: `candidate-${sequenceNumber(index)}@example.test`,
    role: index % 2 === 0 ? 'member' : 'viewer',
    state: 'pending',
    invitedById: inviter.id,
    createdAt: timestampAt(index),
    lastSentAt: timestampAt(index + 1),
    expiresAt: timestampAt(index + 10_081),
    acceptedAt: null,
    revokedAt: null,
    revision: 1,
  }))
}

function createLabels(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
): Label[] {
  return Array.from({ length: 8 }, (_, index) => ({
    id: ids.label(sequence('portfolio', index)),
    workspaceId,
    name: `Portfolio label ${sequenceNumber(index)}`,
    color: index % 2 === 0 ? '#175cd3' : '#b42318',
    description: `Deterministic large-workspace label ${sequenceNumber(index)}.`,
  }))
}

function createProjects(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
  users: readonly User[],
  count: number,
): Project[] {
  return Array.from({ length: count }, (_, index) => ({
    id: ids.project(sequence('portfolio', index)),
    workspaceId,
    key: projectKey(index),
    name: `Operations project ${sequenceNumber(index)}`,
    description: `Scaled operational program ${sequenceNumber(index)} for deterministic performance scenarios.`,
    leadId: itemAt(
      users,
      2 + (index % (users.length - 2)),
      'workspace members',
    ).id,
    status: cyclicItem(projectStatuses, index, 'project statuses'),
    revision: 1,
    createdAt: timestampAt(index),
    updatedAt: timestampAt(index + 1_000),
  }))
}

function createWorkflowStatuses(
  ids: DeterministicIdGenerator,
  projects: readonly Project[],
): WorkflowStatus[] {
  return projects.flatMap((project, projectIndex) =>
    workflowTemplates.map((template, order) => ({
      id: ids.workflowStatus(sequence(`project_${projectIndex.toString()}`, order)),
      projectId: project.id,
      name: template.name,
      category: template.category,
      order,
    })),
  )
}

function createProjectMembers(
  ids: DeterministicIdGenerator,
  projects: readonly Project[],
  users: readonly User[],
): ProjectMember[] {
  return projects.flatMap((project, projectIndex) => {
    const leadIndex = users.findIndex(({ id }) => id === project.leadId)
    const memberIndexes = [0, 1, 2, 3]
      .map((offset) => 2 + ((projectIndex * 5 + offset) % (users.length - 2)))
      .filter((userIndex) => userIndex !== leadIndex)
      .slice(0, 3)
    return [
      {
        id: ids.projectMember(sequence('lead', projectIndex)),
        projectId: project.id,
        userId: project.leadId,
        role: 'lead' as const,
      },
      ...memberIndexes.map((userIndex, memberIndex) => ({
        id: ids.projectMember(
          sequence(`project_${projectIndex.toString()}_member`, memberIndex),
        ),
        projectId: project.id,
        userId: itemAt(users, userIndex, 'project members').id,
        role: memberIndex === 2 ? 'viewer' as const : 'contributor' as const,
      })),
    ]
  })
}

function createProjectSubscriptions(
  ids: DeterministicIdGenerator,
  projects: readonly Project[],
  users: readonly User[],
): ProjectSubscription[] {
  return projects.flatMap((project, index) =>
    index % 3 === 0
      ? [{
          id: ids.projectSubscription(sequence('watch', index)),
          projectId: project.id,
          userId: cyclicItem(users, index * 11, 'project subscribers').id,
          createdAt: timestampAt(index),
        }]
      : [],
  )
}

function createIssues(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
  projects: readonly Project[],
  statuses: readonly WorkflowStatus[],
  users: readonly User[],
  labels: readonly Label[],
  count: number,
): Issue[] {
  const projectIssueNumbers = new Array<number>(projects.length).fill(0)
  const statusesByProject = new Map(
    projects.map((project) => [
      project.id,
      statuses
        .filter(({ projectId }) => projectId === project.id)
        .sort((left, right) => left.order - right.order),
    ]),
  )
  return Array.from({ length: count }, (_, index) => {
    const projectIndex = index % projects.length
    const project = itemAt(projects, projectIndex, 'projects')
    const projectWorkflow = statusesByProject.get(project.id)
    if (!projectWorkflow) throw new Error('Expected every project to have a workflow.')
    projectIssueNumbers[projectIndex] = (projectIssueNumbers[projectIndex] ?? 0) + 1
    const issueNumber = projectIssueNumbers[projectIndex] ?? 1
    return {
      id: ids.issue(sequence('work', index)),
      workspaceId,
      projectId: project.id,
      number: issueNumber,
      type: index % 7 === 0 ? 'bug' : index % 3 === 0 ? 'story' : 'task',
      title: `${issueTopic(index)} ${sequenceNumber(index)}`,
      description: `Deterministic work item ${sequenceNumber(index)} in ${project.name}.`,
      statusId: cyclicItem(projectWorkflow, index, 'workflow statuses').id,
      priority: cyclicItem(priorities, index, 'issue priorities'),
      assigneeId:
        index % 9 === 0
          ? null
          : cyclicItem(users, index * 17, 'issue assignees').id,
      parentIssueId: null,
      dueDate: index % 3 === 0 ? dateAt(index % 180) : null,
      labelIds:
        index % 4 === 0
          ? [cyclicItem(labels, index, 'workspace labels').id]
          : [],
      revision: 1 + (index % 4),
      createdAt: timestampAt(index),
      updatedAt: timestampAt(index + 2_000),
    }
  })
}

function createIssueSubscriptions(
  ids: DeterministicIdGenerator,
  issues: readonly Issue[],
  users: readonly User[],
): IssueSubscription[] {
  return issues.flatMap((issue, index) =>
    index % 4 === 0
      ? [{
          id: ids.issueSubscription(sequence('watch', index)),
          issueId: issue.id,
          userId: cyclicItem(users, index * 13, 'issue subscribers').id,
          createdAt: issue.createdAt,
        }]
      : [],
  )
}

function createComments(
  ids: DeterministicIdGenerator,
  issues: readonly Issue[],
  users: readonly User[],
): Comment[] {
  return issues.flatMap((issue, index) =>
    index % 5 === 0
      ? [{
          id: ids.comment(sequence('discussion', index)),
          issueId: issue.id,
          authorId: cyclicItem(users, index * 19, 'comment authors').id,
          body: `Scaled collaboration note for ${issue.title}.`,
          revision: 1,
          createdAt: timestampAt(index + 3_000),
          editedAt: null,
          deletedAt: null,
          deletedById: null,
        }]
      : [],
  )
}

function createCommentMentions(
  ids: DeterministicIdGenerator,
  comments: readonly Comment[],
  users: readonly User[],
): CommentMention[] {
  return comments.flatMap((comment, index) =>
    index % 2 === 0
      ? [{
          id: ids.commentMention(sequence('recipient', index)),
          commentId: comment.id,
          userId: cyclicItem(users, index * 23 + 1, 'mention recipients').id,
          createdAt: comment.createdAt,
          removedAt: null,
        }]
      : [],
  )
}

function createActivityEvents(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
  issues: readonly Issue[],
  projects: readonly Project[],
  users: readonly User[],
  count: number,
): ActivityEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const issue = cyclicItem(issues, index, 'activity issues')
    const project = cyclicItem(projects, index, 'activity projects')
    const usesIssue = index % 4 !== 0
    return {
      id: ids.activity(sequence('history', index)),
      workspaceId,
      actorId: cyclicItem(users, index * 29, 'activity actors').id,
      entityKind: usesIssue ? 'issue' : 'project',
      entityId: usesIssue ? issue.id : project.id,
      action: usesIssue ? 'issue.updated' : 'project.updated',
      occurredAt: timestampAt(index + 4_000),
      summary: usesIssue
        ? `Updated ${issue.title}.`
        : `Updated ${project.name}.`,
    }
  })
}

function createAuditEvents(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
  users: readonly User[],
  count: number,
): AuditEvent[] {
  const actions = ['issue.updated', 'project.updated', 'member.role.updated'] as const
  return Array.from({ length: count }, (_, index) => ({
    id: ids.audit(sequence('governance', index)),
    workspaceId,
    actorId:
      index % 17 === 0
        ? null
        : cyclicItem(users, index * 31, 'audit actors').id,
    requestId: `large-request-${sequenceNumber(index)}`,
    action: cyclicItem(actions, index, 'audit actions'),
    outcome: index % 19 === 0 ? 'rejected' : index % 47 === 0 ? 'failed' : 'succeeded',
    occurredAt: timestampAt(index + 5_000),
    metadata: { sequence: index, scaled: true },
  }))
}

function createNotifications(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
  issues: readonly Issue[],
  projects: readonly Project[],
  users: readonly User[],
  count: number,
): Notification[] {
  return Array.from({ length: count }, (_, index) => {
    const issue = cyclicItem(issues, index, 'notification issues')
    const project = cyclicItem(projects, index, 'notification projects')
    const targetsProject = index % 5 === 0
    return {
      id: ids.notification(sequence('inbox', index)),
      workspaceId,
      recipientId: cyclicItem(users, index * 37, 'notification recipients').id,
      kind: targetsProject ? 'project-update' : index % 3 === 0 ? 'comment' : 'issue-update',
      target: targetsProject
        ? { kind: 'project' as const, id: project.id }
        : { kind: 'issue' as const, id: issue.id },
      title: targetsProject ? `${project.key} changed` : `${project.key}-${issue.number.toString()} changed`,
      body: `Deterministic notification ${sequenceNumber(index)}.`,
      occurredAt: timestampAt(index + 6_000),
      readAt: index % 3 === 0 ? timestampAt(index + 6_001) : null,
    }
  })
}

function createNotificationPreferences(
  ids: DeterministicIdGenerator,
  workspaceId: AtlasDataSnapshot['workspaces'][number]['id'],
  users: readonly User[],
): NotificationPreferences[] {
  return users.map((user, index) => ({
    id: ids.notificationPreference(sequence('member', index)),
    workspaceId,
    userId: user.id,
    assignments: true,
    comments: index % 5 !== 0,
    issueUpdates: true,
    projectUpdates: index % 7 !== 0,
    revision: 1,
  }))
}

function validateConfiguration(
  configuration: Required<LargeWorkspaceFixtureOptions>,
): void {
  const counts = [
    configuration.projectCount,
    configuration.issueCount,
    configuration.memberCount,
    configuration.activityEventCount,
    configuration.auditEventCount,
    configuration.notificationCount,
    configuration.invitationCount,
  ]
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new RangeError('Large-workspace fixture counts must be non-negative safe integers.')
  }
  if (configuration.projectCount < 1 || configuration.memberCount < 8) {
    throw new RangeError('Large-workspace fixtures require at least one project and eight members.')
  }
  if (
    configuration.issueCount < 1 &&
    (configuration.activityEventCount > 0 || configuration.notificationCount > 0)
  ) {
    throw new RangeError('Large-workspace history and notifications require at least one issue.')
  }
}

function sequence(scope: string, index: number): string {
  return `${scope}_${sequenceNumber(index)}`
}

function sequenceNumber(index: number): string {
  return (index + 1).toString().padStart(6, '0')
}

function projectKey(index: number): string {
  return `P${index.toString(36).toLocaleUpperCase().padStart(4, '0')}`
}

function issueTopic(index: number): string {
  const topics = [
    'Review customer rollout',
    'Investigate reliability signal',
    'Prepare operations readiness',
    'Coordinate dependency handoff',
  ] as const
  return cyclicItem(topics, index, 'issue topics')
}

function itemAt<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index]
  if (value === undefined) throw new Error(`Expected ${label} at index ${index.toString()}.`)
  return value
}

function cyclicItem<T>(values: readonly T[], index: number, label: string): T {
  if (values.length === 0) throw new Error(`Expected at least one ${label}.`)
  return itemAt(values, index % values.length, label)
}

function timestampAt(offsetMinutes: number) {
  return isoDateTime(
    new Date(Date.parse(baseTime) + offsetMinutes * 60_000).toISOString(),
  )
}

function dateAt(offsetDays: number) {
  return isoDate(
    new Date(Date.parse(baseTime) + offsetDays * 86_400_000)
      .toISOString()
      .slice(0, 10),
  )
}
