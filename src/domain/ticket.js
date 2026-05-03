import { randomUUID } from "node:crypto";

export const TICKET_STATUSES = [
  "created",
  "assigned",
  "running",
  "waiting",
  "errored",
  "completed",
  "cancelled"
];

export class Ticket {
  constructor(input = {}, deps = {}) {
    const now = deps.now ?? new Date().toISOString();

    this.id = input.id ?? deps.id?.() ?? randomId("ticket");
    this.number = input.number ?? "";
    this.content = input.content ?? {};
    this.workflowId = input.workflowId ?? null;
    this.currentStepId = input.currentStepId ?? null;
    this.status = input.status ?? "created";
    this.stateContent = input.stateContent ?? {};
    this.latestOutput = input.latestOutput ?? null;
    this.latestError = input.latestError ?? null;
    this.createdAt = input.createdAt ?? now;
    this.updatedAt = input.updatedAt ?? now;
    this.events = [...(input.events ?? [])];
  }

  static create(input, deps = {}) {
    if (!input.number || !/^[a-z0-9-]+$/i.test(input.number)) {
      throw new Error("Ticket number must be alphanumeric and may include hyphens.");
    }

    if (!isPlainObject(input.content)) {
      throw new Error("Ticket content must be structured JSON.");
    }

    const ticket = new Ticket(input, deps);
    ticket.appendEvent("ticket-created", {
      toStatus: "created",
      content: ticket.content,
      now: deps.now
    });
    return ticket;
  }

  assignWorkflow(workflow, deps = {}) {
    if (!workflow?.id) {
      throw new Error("Workflow is required.");
    }

    this.appendEvent("workflow-assigned", {
      workflowId: workflow.id,
      fromStatus: this.status,
      toStatus: "assigned",
      fromStepId: this.currentStepId,
      toStepId: null,
      now: deps.now
    });
    this.workflowId = workflow.id;
    this.currentStepId = null;
    this.status = "assigned";
    this.latestError = null;
    this.touch(deps.now);
  }

  startWorkflow(workflow, deps = {}) {
    this.ensureWorkflow(workflow);

    this.appendEvent("workflow-started", {
      workflowId: workflow.id,
      fromStatus: this.status,
      toStatus: "running",
      fromStepId: this.currentStepId,
      toStepId: workflow.firstStepId,
      now: deps.now
    });
    this.workflowId = workflow.id;
    this.currentStepId = workflow.firstStepId;
    this.status = "running";
    this.latestError = null;
    this.touch(deps.now);
  }

  recordStepStarted(step, deps = {}) {
    this.appendEvent("step-started", {
      workflowId: step.workflowId,
      fromStatus: this.status,
      toStatus: "running",
      fromStepId: this.currentStepId,
      toStepId: step.id,
      now: deps.now
    });
    this.currentStepId = step.id;
    this.status = "running";
    this.touch(deps.now);
  }

  recordStepCompleted(step, output = {}, deps = {}) {
    this.latestOutput = output;
    this.latestError = null;
    this.stateContent = mergeStructured(this.stateContent, output);
    this.appendEvent("step-completed", {
      workflowId: step.workflowId,
      fromStatus: this.status,
      toStatus: "running",
      fromStepId: step.id,
      toStepId: step.id,
      output,
      content: this.stateContent,
      stepId: step.id,
      now: deps.now
    });
    this.status = "running";
    this.touch(deps.now);
  }

  recordManualGateReached(step, deps = {}) {
    this.appendEvent("manual-gate-reached", {
      workflowId: step.workflowId,
      fromStatus: this.status,
      toStatus: "waiting",
      fromStepId: this.currentStepId,
      toStepId: step.id,
      stepId: step.id,
      now: deps.now
    });
    this.currentStepId = step.id;
    this.status = "waiting";
    this.latestError = null;
    this.touch(deps.now);
  }

  recordErrorStepReached(step, deps = {}) {
    const error = { message: step.description || "Human review is required." };
    this.latestError = error;
    this.appendEvent("step-failed", {
      workflowId: step.workflowId,
      fromStatus: this.status,
      toStatus: "errored",
      fromStepId: this.currentStepId,
      toStepId: step.id,
      stepId: step.id,
      error,
      now: deps.now
    });
    this.currentStepId = step.id;
    this.status = "errored";
    this.touch(deps.now);
  }

  recordManualCompletion(step, actor = "human", deps = {}) {
    if (!["waiting", "errored"].includes(this.status)) {
      throw new Error("Manual completion is only available for waiting or errored tickets.");
    }

    const output = { result: "manual-work-completed", actor };
    this.latestOutput = output;
    this.latestError = null;
    this.stateContent = mergeStructured(this.stateContent, output);
    this.appendEvent("manual-work-completed", {
      workflowId: step.workflowId,
      fromStatus: this.status,
      toStatus: "running",
      fromStepId: step.id,
      toStepId: step.id,
      stepId: step.id,
      output,
      content: this.stateContent,
      now: deps.now
    });
    this.status = "running";
    this.touch(deps.now);
  }

  recordTransitionSelected(fromStep, transition, deps = {}) {
    this.appendEvent("transition-selected", {
      workflowId: fromStep.workflowId,
      fromStatus: this.status,
      toStatus: "running",
      fromStepId: fromStep.id,
      toStepId: transition.toStepId,
      stepId: fromStep.id,
      content: transition.condition,
      now: deps.now
    });
    this.currentStepId = transition.toStepId;
    this.status = "running";
    this.touch(deps.now);
  }

  completeWorkflow(workflow, fromStepId = this.currentStepId, deps = {}) {
    this.appendEvent("workflow-completed", {
      workflowId: workflow.id,
      fromStatus: this.status,
      toStatus: "completed",
      fromStepId,
      toStepId: null,
      now: deps.now
    });
    this.currentStepId = null;
    this.status = "completed";
    this.touch(deps.now);
  }

  recordFailure(step, error, deps = {}) {
    const normalizedError = normalizeError(error);
    this.latestError = normalizedError;
    this.appendEvent("step-failed", {
      workflowId: step.workflowId,
      fromStatus: this.status,
      toStatus: "errored",
      fromStepId: step.id,
      toStepId: step.id,
      stepId: step.id,
      error: normalizedError,
      now: deps.now
    });
    this.currentStepId = step.id;
    this.status = "errored";
    this.touch(deps.now);
  }

  cancel(deps = {}) {
    this.appendEvent("ticket-cancelled", {
      workflowId: this.workflowId,
      fromStatus: this.status,
      toStatus: "cancelled",
      fromStepId: this.currentStepId,
      toStepId: null,
      now: deps.now
    });
    this.status = "cancelled";
    this.touch(deps.now);
  }

  toJSON() {
    return {
      id: this.id,
      number: this.number,
      content: this.content,
      workflowId: this.workflowId,
      currentStepId: this.currentStepId,
      status: this.status,
      stateContent: this.stateContent,
      latestOutput: this.latestOutput,
      latestError: this.latestError,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      events: this.events
    };
  }

  ensureWorkflow(workflow) {
    if (!workflow?.id || this.workflowId !== workflow.id) {
      throw new Error("Ticket must be assigned to the workflow before it can run.");
    }

    if (!workflow.firstStepId) {
      throw new Error("Workflow must have a first step.");
    }
  }

  appendEvent(eventType, details = {}) {
    const createdAt = details.now ?? new Date().toISOString();
    this.events.push({
      id: randomId("event"),
      ticketId: this.id,
      workflowId: details.workflowId ?? this.workflowId,
      fromStepId: details.fromStepId ?? null,
      toStepId: details.toStepId ?? null,
      stepId: details.stepId ?? details.toStepId ?? null,
      fromStatus: details.fromStatus ?? null,
      toStatus: details.toStatus ?? this.status,
      eventType,
      content: details.content ?? null,
      error: details.error ?? null,
      output: details.output ?? null,
      createdAt
    });
  }

  touch(now) {
    this.updatedAt = now ?? new Date().toISOString();
  }
}

function mergeStructured(current, output) {
  if (!isPlainObject(output)) {
    return current;
  }
  return { ...current, ...output };
}

function normalizeError(error) {
  if (error && typeof error === "object") {
    return {
      message: error.message ?? "Workflow step failed.",
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr
    };
  }
  return { message: String(error ?? "Workflow step failed.") };
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function randomId(prefix) {
  return `${prefix}-${randomUUID()}`;
}
