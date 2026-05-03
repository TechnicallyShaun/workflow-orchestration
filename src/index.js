import { createServer, listen } from "./http/server.js";

export { completeManualStep, runTicketWorkflow, selectTransition } from "./application/runner.js";
export { createWorkflowApp } from "./application/app.js";
export { evaluateCondition, readPath } from "./domain/conditions.js";
export { Ticket, TICKET_STATUSES } from "./domain/ticket.js";
export {
  CONDITION_OPERATORS,
  STEP_TYPES,
  createWorkflowDefinition,
  validateWorkflow
} from "./domain/workflow.js";
export { createFileStore, createMemoryStore } from "./infrastructure/store.js";
export { createServer, listen };

export function createWorkflow() {
  const steps = [];

  return {
    step(name, handler) {
      if (typeof name !== "string" || name.trim() === "") {
        throw new TypeError("Step name must be a non-empty string.");
      }

      if (typeof handler !== "function") {
        throw new TypeError("Step handler must be a function.");
      }

      if (steps.some((step) => step.name === name)) {
        throw new Error(`Step "${name}" already exists.`);
      }

      steps.push({ name, handler });
      return this;
    },

    getSteps() {
      return steps.map((step) => ({ ...step }));
    }
  };
}

export async function runWorkflow(workflow, initialContext = {}) {
  if (!workflow || typeof workflow.getSteps !== "function") {
    throw new TypeError("Workflow must be created with createWorkflow().");
  }

  const context = { ...initialContext };

  for (const step of workflow.getSteps()) {
    context[step.name] = await step.handler(context);
  }

  return context;
}
