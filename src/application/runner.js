import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

import { buildConditionContext, evaluateCondition } from "../domain/conditions.js";
import { validateWorkflow } from "../domain/workflow.js";

const exec = promisify(execCallback);

export async function runTicketWorkflow(ticket, workflow, deps = {}) {
  const validation = validateWorkflow(workflow);
  if (!validation.valid) {
    throw new Error(`Workflow is invalid: ${validation.errors.map((error) => error.message).join(" ")}`);
  }

  if (ticket.status === "assigned" || ticket.status === "created") {
    if (ticket.status === "created") {
      ticket.assignWorkflow(workflow, deps);
    }
    ticket.startWorkflow(workflow, deps);
  }

  while (ticket.status === "running" && ticket.currentStepId) {
    const step = workflow.steps.find((candidate) => candidate.id === ticket.currentStepId);
    if (!step) {
      ticket.recordFailure(
        { id: ticket.currentStepId, workflowId: workflow.id },
        new Error("Current step does not exist in the assigned workflow."),
        deps
      );
      break;
    }

    if (step.type === "manual") {
      ticket.recordManualGateReached(step, deps);
      break;
    }

    if (step.type === "error") {
      ticket.recordErrorStepReached(step, deps);
      break;
    }

    try {
      ticket.recordStepStarted(step, deps);
      const output = await executeStep(step, ticket, deps);
      ticket.recordStepCompleted(step, output, deps);
    } catch (error) {
      ticket.recordFailure(step, error, deps);
      break;
    }

    advanceAfterStep(ticket, workflow, step, deps);
  }

  return ticket;
}

export async function completeManualStep(ticket, workflow, actor = "human", deps = {}) {
  const step = workflow.steps.find((candidate) => candidate.id === ticket.currentStepId);
  if (!step) {
    throw new Error("Ticket is not positioned on a workflow step.");
  }

  ticket.recordManualCompletion(step, actor, deps);
  advanceAfterStep(ticket, workflow, step, deps);
  return runTicketWorkflow(ticket, workflow, deps);
}

export function selectTransition(ticket, workflow, step) {
  const outgoing = workflow.transitions.filter((transition) => transition.fromStepId === step.id);
  const conditional = outgoing.filter((transition) => transition.condition);
  const defaults = outgoing.filter((transition) => !transition.condition);
  const context = buildConditionContext(ticket);
  const matches = conditional.filter((transition) => evaluateCondition(transition.condition, context));

  if (matches.length === 1) {
    return { transition: matches[0] };
  }

  if (matches.length > 1) {
    return { error: "More than one transition matched. The workflow branch is ambiguous." };
  }

  if (defaults.length === 1) {
    return { transition: defaults[0] };
  }

  if (defaults.length > 1) {
    return { error: "More than one default transition exists for this step." };
  }

  if (outgoing.length === 0) {
    return { completed: true };
  }

  return { error: "No transition condition matched and no default transition exists." };
}

function advanceAfterStep(ticket, workflow, step, deps) {
  const next = selectTransition(ticket, workflow, step);

  if (next.completed) {
    ticket.completeWorkflow(workflow, step.id, deps);
    return;
  }

  if (next.error) {
    ticket.recordFailure(step, new Error(next.error), deps);
    return;
  }

  ticket.recordTransitionSelected(step, next.transition, deps);
}

async function executeStep(step, ticket, deps) {
  if (step.type === "cli") {
    const cliExecutor = deps.executeCli ?? defaultCliExecutor;
    return cliExecutor(step, ticket);
  }

  if (step.type === "agent") {
    const agentExecutor = deps.executeAgent ?? defaultAgentExecutor;
    return agentExecutor(step, ticket);
  }

  return {};
}

async function defaultCliExecutor(step) {
  const { stdout, stderr } = await exec(step.command, {
    shell: true,
    timeout: 30_000,
    windowsHide: true
  });

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim()
  };
}

async function defaultAgentExecutor(step) {
  return {
    result: "agent-step-recorded",
    prompt: step.agentPrompt || null,
    skill: step.agentSkill || null
  };
}
