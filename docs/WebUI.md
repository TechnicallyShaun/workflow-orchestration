# Web UI

## Purpose

The web UI lets users define workflows, create tickets, start workflow execution, and monitor ticket status.

The first screen should be the working application, not a landing page.

## Workflow Builder

Users need to create workflows and chain steps together.

The workflow builder should feel similar to tools such as Power Automate or Azure Logic Apps: a visual chain of connected steps with branches.

Required capabilities:

```text
create workflow
edit workflow name and description
add step
edit step
delete step
connect steps
define transition conditions
choose first step
validate workflow
save workflow
```

Step editor fields:

```text
type
name
description
command
agentPrompt
agentSkill
```

For manual steps, the editor should show that the MVP runtime action is a single "I did this bit manually" button.

For error steps, the editor should show that execution pauses for human review and can continue after the same manual completion action.

## Conditional Branches

Users need to define branches from a step.

Example:

```text
if ticket.content.type equals story -> story-analysis
if ticket.content.type equals bug -> bug-triage
otherwise -> manual-review
```

The UI should expose condition editing as structured controls, not raw code.

Conditions should target information already brought into the system: ticket content, normalized ticket state, or previous step output. The UI should make this feel like choosing fields from known state, not writing expressions.

Initial condition controls:

```text
field
operator
value
```

Example fields:

```text
ticket.content.type
ticket.state.type
ticket.state.result
steps.classify.output.kind
```

Supported operators:

```text
equals
notEquals
exists
notExists
contains
```

## Add Ticket

Users need to create a ticket, assign a workflow, and start execution.

Required capabilities:

```text
create ticket
enter alphanumeric ticket number
enter structured ticket content
select workflow
start workflow
```

The first implementation can use a JSON editor or structured form for ticket content. The content must remain machine-readable so workflow conditions can branch on it.

## Ticket Status

Users need to view tickets and understand their current workflow status.

Required list fields:

```text
ticket number
workflow name
current step
status
last updated
```

Required detail view:

```text
ticket content
assigned workflow
current step
current status
latest output
latest error
state history
available human actions
```

Manual gates should show an "I did this bit manually" action.

Errored tickets should show the error details and expose the same "I did this bit manually" action for the MVP.

## Navigation

Initial navigation:

```text
Workflows
Tickets
```

`Workflows` opens the workflow builder and saved workflow list.

`Tickets` opens the ticket list and ticket detail view.

## Validation

The UI should validate workflow definitions before saving or starting a ticket.

Validation rules:

```text
workflow has a name
workflow has a first step
each step has a name
each step has a type
cli steps have a command
agent steps have either a prompt or skill
transitions point to valid steps
conditional branches do not produce ambiguous matches where this can be detected statically
manual steps can continue to another step or terminate the workflow
```

If validation fails, show the problem at the relevant workflow node or transition.
