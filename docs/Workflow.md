# Workflow

## Purpose

A workflow is a named definition of the steps that a piece of work is expected to traverse.

Workflows support automated steps, agent-driven steps, human approval gates, and error states that require human attention.

## Workflow

Fields:

```text
Workflow
  id
  name
  description
  createdAt
  updatedAt
```

`name` is the human-readable workflow name.

`description` explains what kind of work the workflow is intended to process.

## Step

A step is one node in a workflow.

Fields:

```text
Step
  id
  workflowId
  type
  name
  description
  command
  agentPrompt
  agentSkill
  createdAt
  updatedAt
```

Supported step types:

```text
cli
agent
manual
error
```

### CLI Step

A `cli` step runs a local command.

The command is stored in `command`.

Example:

```text
npm test
```

### Agent Step

An `agent` step runs an agent task.

The prompt is stored in `agentPrompt`.

If a specific reusable capability is required, the skill name is stored in `agentSkill`.

### Manual Step

A `manual` step pauses workflow execution and waits for a human to continue.

The MVP UI action is a single button meaning "I did this bit manually". Pressing the button records the manual completion and allows the workflow to continue.

### Error Step

An `error` step represents a failure that needs human review.

Automated step failures should move the ticket into an error state and surface the error to the user.

For the MVP, error handling uses the same simple manual completion pattern: a human reviews the error, does whatever is needed outside the system, then clicks "I did this bit manually" to continue. More specific actions such as retry, cancel, redirect, or edit-and-retry can be added after the first workflow loop is working.

## Step Transitions

Workflow steps are connected through transitions.

Fields:

```text
StepTransition
  id
  workflowId
  fromStepId
  toStepId
  condition
  createdAt
  updatedAt
```

Transitions define the next step after the current step completes.

If a step has one outgoing transition with no condition, that transition is the default next step.

If a step has multiple outgoing transitions, each transition can define a condition. Conditions decide which branch the ticket follows.

## Condition Data

Information used by conditions must be brought into the system before it can be interrogated.

Steps should write structured state that later transitions can query. This can include ticket content, normalized ticket state, and outputs from previous steps.

The condition editor should use simple selectors over this known state rather than making users write code.

Example selector paths:

```text
ticket.content.type
ticket.state.type
ticket.state.result
steps.classify.output.kind
```

The exact storage shape can evolve, but the UI contract should stay simple: users pick a field, an operator, and a value.

## Conditional Branching

Conditional branching is required so different ticket types can take different paths.

Example:

```text
intake
  -> story-analysis when ticket.content.type == "story"
  -> bug-triage when ticket.content.type == "bug"
  -> manual-review otherwise
```

The first implementation should support simple conditions over ticket content, ticket state, and previous step output. Conditions should be stored as structured data, not as arbitrary executable code.

Example condition shape:

```json
{
  "field": "ticket.state.type",
  "operator": "equals",
  "value": "story"
}
```

Supported operators for the first implementation:

```text
equals
notEquals
exists
notExists
contains
```

The workflow runner evaluates outgoing transitions after a step completes. If exactly one condition matches, the ticket moves to that transition's target step. If no condition matches and a default transition exists, the ticket follows the default transition. If no condition matches and no default transition exists, the ticket moves to an error state.

If more than one condition matches, the ticket moves to an error state because the workflow definition is ambiguous.

## Execution Rules

Workflow execution starts at the workflow's configured first step.

A step can produce output. The output is stored as structured ticket state so later steps and transition conditions can use it.

A step can fail. Failures are recorded against the ticket state and surfaced to a human.

Manual gates pause execution until a human records that the manual work has been completed.

The workflow runner should never silently skip an error. Error handling must be visible in the ticket's current status and history.
