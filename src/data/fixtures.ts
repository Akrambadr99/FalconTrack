import { FixedClock, type Clock } from './clock'
import { DeterministicIdGenerator } from './id-generator'
import type { AtlasDataSnapshot } from './snapshot'
import { isoDate, isoDateTime } from '../domain'

export interface FixtureOptions {
  readonly clock?: Clock
  readonly idGenerator?: DeterministicIdGenerator
}

export function createAtlasFixtures(
  options: FixtureOptions = {},
): AtlasDataSnapshot {
  const clock =
    options.clock ??
    new FixedClock(isoDateTime('2026-01-15T09:00:00.000Z'))
  const ids = options.idGenerator ?? new DeterministicIdGenerator('fixture')
  const createdAt = clock.now()

  const workspace = {
    id: ids.workspace('operations'),
    name: 'FalconTrack Workspace',
    slug: 'atlas-operations',
    createdAt,
  }

  const productLead = {
    id: ids.user('product_lead'),
    displayName: 'Maya Chen',
    email: 'maya@example.test',
    initials: 'MC',
  }
  const operationsLead = {
    id: ids.user('operations_lead'),
    displayName: 'Omar Haddad',
    email: 'omar@example.test',
    initials: 'OH',
  }
  const engineer = {
    id: ids.user('engineer'),
    displayName: 'Lena Ortiz',
    email: 'lena@example.test',
    initials: 'LO',
  }
  const observer = {
    id: ids.user('observer'),
    displayName: 'Theo Martin',
    email: 'theo@example.test',
    initials: 'TM',
  }

  const launchProject = {
    id: ids.project('launch'),
    workspaceId: workspace.id,
    key: 'OPS',
    name: 'Launch readiness',
    description: 'Coordinate cross-functional launch readiness and decisions.',
    leadId: operationsLead.id,
    status: 'active' as const,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  }
  const reliabilityProject = {
    id: ids.project('reliability'),
    workspaceId: workspace.id,
    key: 'REL',
    name: 'Field reliability',
    description: 'Track reliability risks, incidents, and corrective work.',
    leadId: engineer.id,
    status: 'active' as const,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  }

  const launchBacklog = {
    id: ids.workflowStatus('launch_backlog'),
    projectId: launchProject.id,
    name: 'Backlog',
    category: 'backlog' as const,
    order: 0,
  }
  const launchActive = {
    id: ids.workflowStatus('launch_active'),
    projectId: launchProject.id,
    name: 'In progress',
    category: 'started' as const,
    order: 1,
  }
  const launchDone = {
    id: ids.workflowStatus('launch_done'),
    projectId: launchProject.id,
    name: 'Done',
    category: 'completed' as const,
    order: 2,
  }
  const reliabilityBacklog = {
    id: ids.workflowStatus('reliability_backlog'),
    projectId: reliabilityProject.id,
    name: 'Triage',
    category: 'unstarted' as const,
    order: 0,
  }
  const reliabilityActive = {
    id: ids.workflowStatus('reliability_active'),
    projectId: reliabilityProject.id,
    name: 'Investigating',
    category: 'started' as const,
    order: 1,
  }
  const reliabilityDone = {
    id: ids.workflowStatus('reliability_done'),
    projectId: reliabilityProject.id,
    name: 'Resolved',
    category: 'completed' as const,
    order: 2,
  }

  const launchBrief = {
    id: ids.issue('launch_brief'),
    workspaceId: workspace.id,
    projectId: launchProject.id,
    number: 1,
    type: 'task' as const,
    title: 'Publish the launch readiness brief',
    description: 'Consolidate owners, dependencies, and launch criteria.',
    statusId: launchActive.id,
    priority: 'urgent' as const,
    assigneeId: operationsLead.id,
    parentIssueId: null,
    dueDate: isoDate('2026-02-02'),
    labelIds: [] as const,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  }
  const riskReview = {
    id: ids.issue('risk_review'),
    workspaceId: workspace.id,
    projectId: launchProject.id,
    number: 2,
    type: 'task' as const,
    title: 'Complete launch risk review',
    description: 'Review open operational and product risks with owners.',
    statusId: launchBacklog.id,
    priority: 'high' as const,
    assigneeId: productLead.id,
    parentIssueId: null,
    dueDate: isoDate('2026-02-05'),
    labelIds: [] as const,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  }
  const supportRunbook = {
    id: ids.issue('support_runbook'),
    workspaceId: workspace.id,
    projectId: launchProject.id,
    number: 3,
    type: 'story' as const,
    title: 'Validate the support escalation runbook',
    description: 'Exercise escalation paths before launch day.',
    statusId: launchDone.id,
    priority: 'medium' as const,
    assigneeId: operationsLead.id,
    parentIssueId: null,
    dueDate: null,
    labelIds: [] as const,
    revision: 2,
    createdAt,
    updatedAt: createdAt,
  }
  const telemetryGap = {
    id: ids.issue('telemetry_gap'),
    workspaceId: workspace.id,
    projectId: reliabilityProject.id,
    number: 1,
    type: 'bug' as const,
    title: 'Close the device telemetry coverage gap',
    description: 'Identify and restore missing health events in field telemetry.',
    statusId: reliabilityActive.id,
    priority: 'urgent' as const,
    assigneeId: engineer.id,
    parentIssueId: null,
    dueDate: isoDate('2026-01-30'),
    labelIds: [] as const,
    revision: 3,
    createdAt,
    updatedAt: createdAt,
  }
  const incidentReview = {
    id: ids.issue('incident_review'),
    workspaceId: workspace.id,
    projectId: reliabilityProject.id,
    number: 2,
    type: 'task' as const,
    title: 'Review intermittent restart incidents',
    description: 'Group correlated reports and document reproduction evidence.',
    statusId: reliabilityBacklog.id,
    priority: 'high' as const,
    assigneeId: engineer.id,
    parentIssueId: null,
    dueDate: null,
    labelIds: [] as const,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  }
  const alertTuning = {
    id: ids.issue('alert_tuning'),
    workspaceId: workspace.id,
    projectId: reliabilityProject.id,
    number: 3,
    type: 'task' as const,
    title: 'Tune restart anomaly alerts',
    description: 'Reduce noise without suppressing confirmed incident patterns.',
    statusId: reliabilityDone.id,
    priority: 'low' as const,
    assigneeId: null,
    parentIssueId: incidentReview.id,
    dueDate: null,
    labelIds: [] as const,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
  }

  const urgentLabel = {
    id: ids.label('urgent_attention'),
    workspaceId: workspace.id,
    name: 'Urgent attention',
    color: '#b42318',
    description: 'Requires immediate cross-functional attention.',
  }
  const customerLabel = {
    id: ids.label('customer_impact'),
    workspaceId: workspace.id,
    name: 'Customer impact',
    color: '#175cd3',
    description: 'Directly affects the customer experience.',
  }

  return {
    workspaces: [workspace],
    users: [productLead, operationsLead, engineer, observer],
    memberships: [
      {
        id: ids.membership('product_lead'),
        workspaceId: workspace.id,
        userId: productLead.id,
        role: 'owner',
        status: 'active',
        joinedAt: createdAt,
        revision: 1,
      },
      {
        id: ids.membership('operations_lead'),
        workspaceId: workspace.id,
        userId: operationsLead.id,
        role: 'admin',
        status: 'active',
        joinedAt: createdAt,
        revision: 1,
      },
      {
        id: ids.membership('engineer'),
        workspaceId: workspace.id,
        userId: engineer.id,
        role: 'member',
        status: 'active',
        joinedAt: createdAt,
        revision: 1,
      },
      {
        id: ids.membership('observer'),
        workspaceId: workspace.id,
        userId: observer.id,
        role: 'viewer',
        status: 'active',
        joinedAt: createdAt,
        revision: 1,
      },
    ],
    workspaceInvitations: [],
    projects: [launchProject, reliabilityProject],
    projectMembers: [
      {
        id: ids.projectMember('launch_lead'),
        projectId: launchProject.id,
        userId: operationsLead.id,
        role: 'lead',
      },
      {
        id: ids.projectMember('launch_product'),
        projectId: launchProject.id,
        userId: productLead.id,
        role: 'contributor',
      },
      {
        id: ids.projectMember('reliability_lead'),
        projectId: reliabilityProject.id,
        userId: engineer.id,
        role: 'lead',
      },
    ],
    projectSubscriptions: [
      {
        id: ids.projectSubscription('launch_product'),
        projectId: launchProject.id,
        userId: productLead.id,
        createdAt,
      },
    ],
    workflowStatuses: [
      launchBacklog,
      launchActive,
      launchDone,
      reliabilityBacklog,
      reliabilityActive,
      reliabilityDone,
    ],
    labels: [urgentLabel, customerLabel],
    issues: [
      { ...launchBrief, labelIds: [urgentLabel.id] },
      riskReview,
      supportRunbook,
      { ...telemetryGap, labelIds: [urgentLabel.id, customerLabel.id] },
      { ...incidentReview, labelIds: [customerLabel.id] },
      alertTuning,
    ],
    issueSubscriptions: [
      {
        id: ids.issueSubscription('launch_assignee'),
        issueId: launchBrief.id,
        userId: operationsLead.id,
        createdAt,
      },
      {
        id: ids.issueSubscription('launch_commenter'),
        issueId: launchBrief.id,
        userId: productLead.id,
        createdAt,
      },
    ],
    issueRelations: [
      {
        id: ids.issueRelation('launch_risk'),
        sourceIssueId: launchBrief.id,
        targetIssueId: riskReview.id,
        type: 'blocks',
      },
      {
        id: ids.issueRelation('incident_alert'),
        sourceIssueId: incidentReview.id,
        targetIssueId: alertTuning.id,
        type: 'relates-to',
      },
    ],
    comments: [
      {
        id: ids.comment('launch_brief'),
        issueId: launchBrief.id,
        authorId: productLead.id,
        body: 'Please include explicit rollback owners in the final brief.',
        revision: 1,
        createdAt,
        editedAt: null,
        deletedAt: null,
        deletedById: null,
      },
    ],
    commentMentions: [],
    activityEvents: [
      {
        id: ids.activity('launch_brief'),
        workspaceId: workspace.id,
        actorId: operationsLead.id,
        entityKind: 'issue',
        entityId: launchBrief.id,
        action: 'issue.updated',
        occurredAt: createdAt,
        summary: 'Moved the launch brief into progress.',
      },
    ],
    auditEvents: [
      {
        id: ids.audit('fixtures_created'),
        workspaceId: workspace.id,
        actorId: null,
        requestId: 'fixture-bootstrap-001',
        action: 'fixtures.created',
        outcome: 'succeeded',
        occurredAt: createdAt,
        metadata: { projectCount: 2, issueCount: 6 },
      },
      {
        id: ids.audit('issue_updated'),
        workspaceId: workspace.id,
        actorId: operationsLead.id,
        requestId: 'fixture-issue-update-001',
        action: 'issue.updated',
        outcome: 'succeeded',
        occurredAt: createdAt,
        metadata: { issueNumber: 1, revision: 2 },
      },
      {
        id: ids.audit('member_access_rejected'),
        workspaceId: workspace.id,
        actorId: observer.id,
        requestId: 'fixture-access-check-001',
        action: 'issue.updated',
        outcome: 'rejected',
        occurredAt: createdAt,
        metadata: { reason: 'forbidden' },
      },
      {
        id: ids.audit('delivery_failed'),
        workspaceId: workspace.id,
        actorId: operationsLead.id,
        requestId: 'fixture-delivery-001',
        action: 'notification.delivery',
        outcome: 'failed',
        occurredAt: createdAt,
        metadata: { retryable: true },
      },
    ],
    notifications: [
      {
        id: ids.notification('launch_comment'),
        workspaceId: workspace.id,
        recipientId: operationsLead.id,
        kind: 'comment',
        target: { kind: 'issue', id: launchBrief.id },
        title: 'New comment on OPS-1',
        body: 'Maya Chen commented on Publish the launch readiness brief.',
        occurredAt: createdAt,
        readAt: null,
      },
      {
        id: ids.notification('support_update'),
        workspaceId: workspace.id,
        recipientId: operationsLead.id,
        kind: 'issue-update',
        target: { kind: 'issue', id: supportRunbook.id },
        title: 'OPS-3 was updated',
        body: 'Validate the support escalation runbook has new activity.',
        occurredAt: createdAt,
        readAt: createdAt,
      },
    ],
    notificationPreferences: [
      productLead,
      operationsLead,
      engineer,
      observer,
    ].map((user) => ({
      id: ids.notificationPreference(user.initials.toLocaleLowerCase()),
      workspaceId: workspace.id,
      userId: user.id,
      assignments: true,
      comments: true,
      issueUpdates: true,
      projectUpdates: true,
      revision: 1,
    })),
  }
}
