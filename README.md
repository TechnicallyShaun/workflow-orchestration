# Workflow Orchestration

A dependency-free local workflow application for defining workflows, creating tickets, assigning workflows, and moving tickets through visible state.

## Quick Start

```bash
npm test
npm start
```

`npm start` serves the web UI at `http://127.0.0.1:3000` by default. Set `PORT` or pass `--port=3138` to use another port.

Workflow and ticket data is stored in `data/store.json` unless `WORKFLOW_DATA_FILE` is set.

## What It Does

- Build workflows with named steps and transitions.
- Supported step types: `cli`, `agent`, `manual`, and `error`.
- Define structured transition conditions with `field`, `operator`, and `value`.
- Create tickets with machine-readable JSON content.
- Assign and start a workflow from the ticket form.
- View ticket status, current step, latest output, latest error, and append-only state history.
- Complete manual and error gates with the MVP action: `I did this bit manually`.

## Library Example

The original small ordered-workflow helper is still exported:

```js
import { createWorkflow, runWorkflow } from "./src/index.js";

const workflow = createWorkflow()
  .step("extract", async () => ({ records: 10 }))
  .step("transform", async ({ extract }) => ({ processed: extract.records }))
  .step("load", async ({ transform }) => ({ inserted: transform.processed }));

const result = await runWorkflow(workflow);
console.log(result.load);
```

The ticket runner uses workflow definitions:

```js
import { Ticket, createWorkflowDefinition, runTicketWorkflow } from "./src/index.js";

const workflow = createWorkflowDefinition({
  name: "Story intake",
  firstStepId: "review",
  steps: [{ id: "review", type: "manual", name: "Review" }]
});

const ticket = Ticket.create({
  number: "WO-1",
  content: { type: "story", title: "Add workflow editor" }
});

await runTicketWorkflow(ticket, workflow);
console.log(ticket.status); // waiting
```

## Project Structure

```text
.
|-- bin/                 # CLI entry point for the web app
|-- public/              # Static web UI
|-- src/application/     # Use cases and runner
|-- src/domain/          # Workflow, ticket, and condition rules
|-- src/http/            # Node HTTP server and API routes
|-- src/infrastructure/  # JSON-backed local store
`-- test/                # Node test runner tests
```

## Scripts

```bash
npm start   # run the web app
npm test    # run tests with node:test
```

## License

MIT
