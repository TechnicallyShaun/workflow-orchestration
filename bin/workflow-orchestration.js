#!/usr/bin/env node

import { createWorkflow, runWorkflow } from "../src/index.js";

const workflow = createWorkflow()
  .step("extract", async () => ({ records: 3 }))
  .step("transform", async ({ extract }) => ({ processed: extract.records }))
  .step("load", async ({ transform }) => ({ inserted: transform.processed }));

const result = await runWorkflow(workflow);

console.log(JSON.stringify(result, null, 2));
