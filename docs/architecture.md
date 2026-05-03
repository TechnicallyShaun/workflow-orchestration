# Architecture

## Storage Decision

Use SQLite as the local database.

The application needs durable local storage for tickets, workflow definitions, workflow step relationships, ticket state, and ticket state history. SQLite is a good fit because the expected data volume is modest, the data is relational, and the application does not need a separate database server for local use.

Browser localStorage should not be used for workflow or ticket data. It is only appropriate for lightweight UI preferences. If the application ever becomes browser-only with no Node.js backend or local service, IndexedDB would be the browser-native alternative.

If the application later needs hosted multi-user access, remote concurrency, or operational database administration, PostgreSQL is the likely upgrade path.

## TypeScript Architecture

Use a DDD-lite architecture with a rich domain model:

```text
src/
  domain/
    Ticket.ts
    WorkflowDefinition.ts
    events.ts

  application/
    changeTicketState.ts
    createTicket.ts
    advanceTicket.ts

  infrastructure/
    db/
      schema.ts
      migrations/
    repositories/
      DrizzleTicketRepository.ts
      DrizzleWorkflowRepository.ts

  http/
    routes.ts
    handlers.ts
```

The domain layer owns business rules. The application layer coordinates use cases. The infrastructure layer owns persistence, SQL schema, migrations, and repository implementations. HTTP or UI handlers should stay thin and call application use cases.

## Domain Model

Tickets should be rich domain objects, not passive database records.

State-machine rules belong inside the `Ticket` aggregate, exposed through methods such as:

```ts
ticket.changeState(nextState, workflowDefinition);
ticket.advance(workflowDefinition, input);
```

The use-case layer should load the required aggregate and workflow definition, call the domain method, then persist the result in a transaction.

Example shape:

```ts
export async function changeTicketState(command, deps) {
  const ticket = await deps.tickets.getById(command.ticketId);
  const workflow = await deps.workflows.getById(ticket.workflowId);

  ticket.changeState(command.nextState, workflow);

  await deps.transaction(async (tx) => {
    await tx.tickets.save(ticket);
    await tx.ticketEvents.append(ticket.pullEvents());
  });

  return ticket;
}
```

The ORM should not define the domain model. Repositories should map database rows into domain objects and map domain objects back into database updates.

## Persistence

Use Drizzle with SQLite for schema management, type-safe queries, and migration generation.

Drizzle is preferred here because it gives TypeScript-friendly schema definitions and migrations without forcing ORM entities to become the domain model. This keeps the fat domain model intact while still making database evolution straightforward.

Avoid coupling business behavior to generated database models. Database rows should remain persistence concerns.

## Suggested Tables

```text
tickets
  id
  title
  status
  current_workflow_id
  current_step_id
  created_at
  updated_at

workflow_definitions
  id
  name
  version
  is_active
  created_at

workflow_steps
  id
  workflow_id
  key
  name
  type
  config_json
  position

workflow_transitions
  id
  workflow_id
  from_step_id
  to_step_id
  condition_json

ticket_state_events
  id
  ticket_id
  from_status
  to_status
  from_step_id
  to_step_id
  reason
  metadata_json
  created_at
```

`tickets` stores the current snapshot. `ticket_state_events` stores the append-only history of state changes. This allows the application to answer both "where is this ticket now?" and "how did this ticket get here?".

## Dependency Style

Prefer explicit dependency passing over a global dependency injection container:

```ts
await changeTicketState(command, {
  tickets,
  workflows,
  transaction,
});
```

A framework-level DI container can be introduced later if the project adopts something like NestJS, but it is not required for the current size or architecture.
