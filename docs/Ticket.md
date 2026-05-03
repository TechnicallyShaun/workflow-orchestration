# Ticket

## Purpose

A ticket is a piece of work moving through a workflow.

Tickets store the original work content, the assigned workflow, the current workflow position, and the history of state changes.

## Ticket

Fields:

```text
Ticket
  id
  number
  content
  workflowId
  currentStepId
  status
  createdAt
  updatedAt
```

`number` is the human-facing alphanumeric ticket identifier.

Examples:

```text
WO-1
BUG-123
STORY-45
```

`content` stores the ticket payload. The payload should be structured data so workflows can branch on fields such as ticket type, priority, area, or requested action.

Example:

```json
{
  "type": "story",
  "title": "Add workflow editor",
  "description": "Users need to create workflows and chain steps together."
}
```

## Ticket State

Ticket state records where the ticket currently is and what happened during execution.

Fields:

```text
TicketState
  id
  ticketId
  workflowId
  stepId
  status
  content
  error
  output
  createdAt
```

`content` stores state data for the current point in the workflow.

`output` stores successful output from a workflow step.

`error` stores failure information when a step fails or workflow execution cannot continue safely.

State content and output should be structured so workflow conditions can query them through UI-friendly selectors. The goal is to bring relevant information into the system before branching on it.

Example condition-friendly state:

```json
{
  "type": "bug",
  "priority": "high",
  "result": "needs-human-review"
}
```

## Status Values

Initial status values:

```text
created
assigned
running
waiting
errored
completed
cancelled
```

`created` means the ticket exists but has not started a workflow.

`assigned` means the ticket has a workflow but has not started running.

`running` means the workflow runner is executing an automated step.

`waiting` means the ticket is paused at a manual gate.

`errored` means the ticket needs human attention before it can continue. In the MVP, the human action is to do the required work manually and mark that step as completed.

`completed` means the workflow reached a terminal successful state.

`cancelled` means a human stopped the ticket.

## State History

Ticket state changes should be append-only.

The current ticket row stores the latest state for fast reads. A separate history table stores every state transition and step result.

Suggested event fields:

```text
TicketStateEvent
  id
  ticketId
  workflowId
  fromStepId
  toStepId
  fromStatus
  toStatus
  eventType
  content
  error
  output
  createdAt
```

Initial event types:

```text
ticket-created
workflow-assigned
workflow-started
step-started
step-completed
step-failed
manual-gate-reached
manual-work-completed
transition-selected
workflow-completed
ticket-cancelled
```

The append-only event stream allows the UI and future diagnostics to show how a ticket reached its current state.

## Domain Rules

The `Ticket` domain model owns state changes.

State transitions should go through explicit methods such as:

```ts
ticket.assignWorkflow(workflow);
ticket.startWorkflow(workflow);
ticket.recordStepStarted(step);
ticket.recordStepCompleted(step, output);
ticket.changeState(nextState, workflow);
ticket.recordFailure(step, error);
ticket.recordManualCompletion(step, actor);
```

Application code should not directly mutate ticket status, current step, or state history. It should call domain methods and persist the resulting ticket and events in one transaction.
