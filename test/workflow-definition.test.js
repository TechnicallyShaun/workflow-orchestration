import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflowDefinition, validateWorkflow } from "../src/index.js";

test("documents the minimum valid workflow definition", () => {
  const workflow = createWorkflowDefinition({
    id: "workflow-1",
    name: "Story intake",
    firstStepId: "intake",
    steps: [
      {
        id: "intake",
        type: "manual",
        name: "Intake"
      }
    ]
  });

  assert.deepEqual(validateWorkflow(workflow), {
    valid: true,
    errors: []
  });
});

test("generates a durable workflow id when UI drafts submit an empty id", () => {
  const workflow = createWorkflowDefinition(
    {
      id: "",
      name: "UI draft",
      steps: [{ id: "review", type: "manual", name: "Review" }]
    },
    {
      id: () => "workflow-generated"
    }
  );

  assert.equal(workflow.id, "workflow-generated");
  assert.equal(workflow.steps[0].workflowId, "workflow-generated");
});

test("reports validation problems at the field that needs attention", () => {
  const workflow = createWorkflowDefinition({
    name: "",
    firstStepId: "missing-step",
    steps: [
      {
        id: "run-tests",
        type: "cli",
        name: "",
        command: ""
      },
      {
        id: "ask-agent",
        type: "agent",
        name: "Ask agent"
      }
    ],
    transitions: [
      {
        fromStepId: "run-tests",
        toStepId: "missing-step",
        condition: { field: "", operator: "equals", value: "story" }
      }
    ]
  });

  const validation = validateWorkflow(workflow);

  assert.equal(validation.valid, false);
  assert.deepEqual(
    validation.errors.map((error) => error.message),
    [
      "Workflow has a name.",
      "Workflow has a valid first step.",
      "Each step has a name.",
      "CLI steps have a command.",
      "Agent steps have either a prompt or a skill.",
      "Transitions point to valid steps.",
      "Transition conditions choose a field."
    ]
  );
});

test("detects statically ambiguous branches on the same step", () => {
  const workflow = createWorkflowDefinition({
    name: "Ambiguous intake",
    firstStepId: "classify",
    steps: [
      { id: "classify", type: "manual", name: "Classify" },
      { id: "story", type: "manual", name: "Story" },
      { id: "bug", type: "manual", name: "Bug" }
    ],
    transitions: [
      {
        fromStepId: "classify",
        toStepId: "story",
        condition: { field: "ticket.content.type", operator: "equals", value: "story" }
      },
      {
        fromStepId: "classify",
        toStepId: "bug",
        condition: { field: "ticket.content.type", operator: "equals", value: "story" }
      }
    ]
  });

  const validation = validateWorkflow(workflow);

  assert.equal(validation.valid, false);
  assert.match(
    validation.errors.map((error) => error.message).join("\n"),
    /ambiguous matches/
  );
});
