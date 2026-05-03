import assert from "node:assert/strict";
import test from "node:test";

import { createWorkflow, runWorkflow } from "../src/index.js";

test("runs workflow steps in insertion order", async () => {
  const workflow = createWorkflow()
    .step("first", async () => 1)
    .step("second", async ({ first }) => first + 1);

  const result = await runWorkflow(workflow);

  assert.deepEqual(result, {
    first: 1,
    second: 2
  });
});

test("passes initial context to workflow steps", async () => {
  const workflow = createWorkflow().step("total", async ({ count }) => count + 2);

  const result = await runWorkflow(workflow, { count: 5 });

  assert.equal(result.total, 7);
});

test("rejects duplicate step names", () => {
  const workflow = createWorkflow().step("duplicate", () => null);

  assert.throws(
    () => workflow.step("duplicate", () => null),
    /already exists/
  );
});
