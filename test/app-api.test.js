import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryStore, createServer, createWorkflowApp } from "../src/index.js";

test("application API creates a ticket, assigns a workflow, starts, and exposes derived status fields", async () => {
  const app = createWorkflowApp(createMemoryStore());
  const saved = await app.saveWorkflow({
    id: "workflow-ui",
    name: "UI workflow",
    firstStepId: "review",
    steps: [{ id: "review", type: "manual", name: "Review" }]
  });

  assert.equal(saved.ok, true);

  const ticket = await app.createTicket({
    number: "WO-10",
    content: { type: "story" },
    workflowId: "workflow-ui",
    start: true
  });

  assert.equal(ticket.status, "waiting");
  assert.equal(ticket.workflowName, "UI workflow");
  assert.equal(ticket.currentStepName, "Review");

  const completed = await app.completeManual(ticket.id, "tester");

  assert.equal(completed.status, "completed");
  assert.equal(completed.latestOutput.actor, "tester");
});

test("HTTP server serves state and accepts workflow saves", async () => {
  const app = createWorkflowApp(createMemoryStore());
  const server = createServer({ app });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${url}/api/workflows`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "workflow-http",
        name: "HTTP workflow",
        firstStepId: "review",
        steps: [{ id: "review", type: "manual", name: "Review" }]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);

    const stateResponse = await fetch(`${url}/api/state`);
    const state = await stateResponse.json();

    assert.equal(state.workflows.length, 1);
    assert.equal(state.workflows[0].name, "HTTP workflow");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
