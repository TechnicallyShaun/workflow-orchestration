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
