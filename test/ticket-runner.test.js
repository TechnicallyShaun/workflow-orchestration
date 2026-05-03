import assert from "node:assert/strict";
import test from "node:test";

import {
  Ticket,
  completeManualStep,
  createWorkflowDefinition,
  runTicketWorkflow
} from "../src/index.js";

test("starts a ticket at the first step and follows a ticket-content branch", async () => {
  const workflow = createWorkflowDefinition({
    id: "workflow-branching",
    name: "Branching intake",
    firstStepId: "intake",
    steps: [
      { id: "intake", type: "agent", name: "Classify", agentPrompt: "Classify the ticket." },
      { id: "story-analysis", type: "manual", name: "Story analysis" },
      { id: "bug-triage", type: "manual", name: "Bug triage" },
      { id: "manual-review", type: "manual", name: "Manual review" }
    ],
    transitions: [
      {
        fromStepId: "intake",
        toStepId: "story-analysis",
        condition: { field: "ticket.content.type", operator: "equals", value: "story" }
      },
      {
        fromStepId: "intake",
        toStepId: "bug-triage",
        condition: { field: "ticket.content.type", operator: "equals", value: "bug" }
      },
      {
        fromStepId: "intake",
        toStepId: "manual-review",
        condition: null
      }
    ]
  });
  const ticket = Ticket.create({
    number: "WO-1",
    content: { type: "story", title: "Add workflow editor" }
  });

  await runTicketWorkflow(ticket, workflow, {
    executeAgent: async () => ({ kind: "story", result: "classified" })
  });

  assert.equal(ticket.status, "waiting");
  assert.equal(ticket.currentStepId, "story-analysis");
  assert.equal(ticket.latestOutput.kind, "story");
  assert.deepEqual(
    ticket.events.map((event) => event.eventType),
    [
      "ticket-created",
      "workflow-assigned",
      "workflow-started",
      "step-started",
      "step-completed",
      "transition-selected",
      "manual-gate-reached"
    ]
  );
});

test("manual completion records history and completes when no transition remains", async () => {
  const workflow = createWorkflowDefinition({
    id: "workflow-manual",
    name: "Manual flow",
    firstStepId: "review",
    steps: [{ id: "review", type: "manual", name: "Review" }]
  });
  const ticket = Ticket.create({
    number: "WO-2",
    content: { type: "bug" }
  });

  await runTicketWorkflow(ticket, workflow);
  await completeManualStep(ticket, workflow, "Shaun");

  assert.equal(ticket.status, "completed");
  assert.equal(ticket.currentStepId, null);
  assert.equal(ticket.latestOutput.actor, "Shaun");
  assert.deepEqual(
    ticket.events.map((event) => event.eventType),
    [
      "ticket-created",
      "workflow-assigned",
      "workflow-started",
      "manual-gate-reached",
      "manual-work-completed",
      "workflow-completed"
    ]
  );
});

test("ambiguous runtime transition matches move the ticket to a visible error", async () => {
  const workflow = createWorkflowDefinition({
    id: "workflow-runtime-error",
    name: "Runtime ambiguous",
    firstStepId: "classify",
    steps: [
      { id: "classify", type: "agent", name: "Classify", agentPrompt: "Classify." },
      { id: "left", type: "manual", name: "Left" },
      { id: "right", type: "manual", name: "Right" }
    ],
    transitions: [
      {
        fromStepId: "classify",
        toStepId: "left",
        condition: { field: "ticket.state.kind", operator: "equals", value: "story" }
      },
      {
        fromStepId: "classify",
        toStepId: "right",
        condition: { field: "ticket.content.type", operator: "equals", value: "story" }
      }
    ]
  });
  const ticket = Ticket.create({
    number: "WO-3",
    content: { type: "story" }
  });

  await runTicketWorkflow(ticket, workflow, {
    executeAgent: async () => ({ kind: "story" })
  });

  assert.equal(ticket.status, "errored");
  assert.equal(ticket.currentStepId, "classify");
  assert.match(ticket.latestError.message, /ambiguous/);
  assert.equal(ticket.events.at(-1).eventType, "step-failed");
});
