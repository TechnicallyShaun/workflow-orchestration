#!/usr/bin/env node

import { listen } from "../src/index.js";

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : Number(process.env.PORT ?? 3000);

const { url } = await listen({
  port,
  dataFile: process.env.WORKFLOW_DATA_FILE ?? "data/store.json"
});

console.log(`Workflow Orchestration is running at ${url}`);
