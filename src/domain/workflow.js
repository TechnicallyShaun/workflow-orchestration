import { randomUUID } from "node:crypto";

export const STEP_TYPES = ["cli", "agent", "manual", "error"];
export const CONDITION_OPERATORS = [
  "equals",
  "notEquals",
  "exists",
  "notExists",
  "contains"
];

export function createWorkflowDefinition(input = {}, deps = {}) {
  const now = deps.now ?? new Date().toISOString();
  const id = input.id || deps.id?.() || randomId("workflow");
  const steps = (input.steps ?? []).map((step) => ({
    id: step.id ?? deps.id?.() ?? randomId("step"),
    workflowId: id,
    type: step.type ?? "manual",
    name: step.name ?? "",
    description: step.description ?? "",
    command: step.command ?? "",
    agentPrompt: step.agentPrompt ?? "",
    agentSkill: step.agentSkill ?? "",
    createdAt: step.createdAt ?? now,
    updatedAt: step.updatedAt ?? now
  }));

  const transitions = (input.transitions ?? []).map((transition) => ({
    id: transition.id ?? deps.id?.() ?? randomId("transition"),
    workflowId: id,
    fromStepId: transition.fromStepId ?? "",
    toStepId: transition.toStepId ?? "",
    condition: normalizeCondition(transition.condition),
    createdAt: transition.createdAt ?? now,
    updatedAt: transition.updatedAt ?? now
  }));

  return {
    id,
    name: input.name ?? "",
    description: input.description ?? "",
    firstStepId: input.firstStepId ?? steps[0]?.id ?? "",
    steps,
    transitions,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
}

export function validateWorkflow(workflow) {
  const errors = [];
  const steps = workflow?.steps ?? [];
  const transitions = workflow?.transitions ?? [];
  const stepIds = new Set(steps.map((step) => step.id));

  if (!workflow || typeof workflow !== "object") {
    return { valid: false, errors: [{ path: "workflow", message: "Workflow is required." }] };
  }

  if (!workflow.name || workflow.name.trim() === "") {
    errors.push({ path: "name", message: "Workflow has a name." });
  }

  if (!workflow.firstStepId || !stepIds.has(workflow.firstStepId)) {
    errors.push({ path: "firstStepId", message: "Workflow has a valid first step." });
  }

  for (const step of steps) {
    const stepPath = `steps.${step.id}`;

    if (!step.name || step.name.trim() === "") {
      errors.push({ path: `${stepPath}.name`, message: "Each step has a name." });
    }

    if (!STEP_TYPES.includes(step.type)) {
      errors.push({ path: `${stepPath}.type`, message: "Each step has a supported type." });
    }

    if (step.type === "cli" && (!step.command || step.command.trim() === "")) {
      errors.push({ path: `${stepPath}.command`, message: "CLI steps have a command." });
    }

    if (
      step.type === "agent" &&
      (!step.agentPrompt || step.agentPrompt.trim() === "") &&
      (!step.agentSkill || step.agentSkill.trim() === "")
    ) {
      errors.push({
        path: `${stepPath}.agentPrompt`,
        message: "Agent steps have either a prompt or a skill."
      });
    }
  }

  const transitionsByStep = new Map();
  for (const transition of transitions) {
    const transitionPath = `transitions.${transition.id}`;

    if (!stepIds.has(transition.fromStepId)) {
      errors.push({
        path: `${transitionPath}.fromStepId`,
        message: "Transitions start at a valid step."
      });
    }

    if (!stepIds.has(transition.toStepId)) {
      errors.push({
        path: `${transitionPath}.toStepId`,
        message: "Transitions point to valid steps."
      });
    }

    const condition = normalizeCondition(transition.condition);
    if (condition && !CONDITION_OPERATORS.includes(condition.operator)) {
      errors.push({
        path: `${transitionPath}.condition.operator`,
        message: "Transition conditions use a supported operator."
      });
    }

    if (condition && (!condition.field || condition.field.trim() === "")) {
      errors.push({
        path: `${transitionPath}.condition.field`,
        message: "Transition conditions choose a field."
      });
    }

    const group = transitionsByStep.get(transition.fromStepId) ?? [];
    group.push({ ...transition, condition });
    transitionsByStep.set(transition.fromStepId, group);
  }

  for (const [fromStepId, outgoing] of transitionsByStep) {
    const defaultCount = outgoing.filter((transition) => !transition.condition).length;
    if (defaultCount > 1) {
      errors.push({
        path: `steps.${fromStepId}.transitions`,
        message: "A step can only have one default transition."
      });
    }

    const seenConditions = new Set();
    for (const transition of outgoing) {
      if (!transition.condition) {
        continue;
      }

      const key = JSON.stringify(transition.condition);
      if (seenConditions.has(key)) {
        errors.push({
          path: `steps.${fromStepId}.transitions`,
          message: "Conditional branches must not produce ambiguous matches."
        });
        break;
      }
      seenConditions.add(key);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeCondition(condition) {
  if (!condition || condition.operator === "default") {
    return null;
  }

  return {
    field: condition.field ?? "",
    operator: condition.operator ?? "equals",
    value: condition.value ?? ""
  };
}

function randomId(prefix) {
  return `${prefix}-${randomUUID()}`;
}
