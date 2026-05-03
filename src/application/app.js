import { completeManualStep, runTicketWorkflow } from "./runner.js";
import { Ticket } from "../domain/ticket.js";
import { createWorkflowDefinition, validateWorkflow } from "../domain/workflow.js";

export function createWorkflowApp(store) {
  return {
    async getState() {
      return withDerived(await store.load());
    },

    async listWorkflows() {
      const state = await store.load();
      return state.workflows;
    },

    async saveWorkflow(input) {
      const state = await store.load();
      const workflow = createWorkflowDefinition(input);
      const validation = validateWorkflow(workflow);

      if (!validation.valid) {
        return { ok: false, workflow, errors: validation.errors };
      }

      const workflows = upsertById(state.workflows, workflow);
      await store.save({ ...state, workflows });
      return { ok: true, workflow, errors: [] };
    },

    async createTicket(input) {
      const state = await store.load();
      const content = parseContent(input.content);
      const ticket = Ticket.create({
        number: input.number,
        content
      });

      if (input.workflowId) {
        const workflow = findWorkflow(state, input.workflowId);
        ticket.assignWorkflow(workflow);
        if (input.start) {
          await runTicketWorkflow(ticket, workflow);
        }
      }

      await store.save({ ...state, tickets: [...state.tickets, ticket.toJSON()] });
      return withDerivedTicket(ticket.toJSON(), state.workflows);
    },

    async startTicket(ticketId, workflowId) {
      const state = await store.load();
      const ticket = findTicket(state, ticketId);
      const workflow = findWorkflow(state, workflowId ?? ticket.workflowId);

      if (ticket.workflowId !== workflow.id) {
        ticket.assignWorkflow(workflow);
      }

      await runTicketWorkflow(ticket, workflow);
      await store.save({ ...state, tickets: upsertById(state.tickets, ticket.toJSON()) });
      return withDerivedTicket(ticket.toJSON(), state.workflows);
    },

    async completeManual(ticketId, actor = "human") {
      const state = await store.load();
      const ticket = findTicket(state, ticketId);
      const workflow = findWorkflow(state, ticket.workflowId);

      await completeManualStep(ticket, workflow, actor);
      await store.save({ ...state, tickets: upsertById(state.tickets, ticket.toJSON()) });
      return withDerivedTicket(ticket.toJSON(), state.workflows);
    },

    async validateWorkflow(input) {
      const workflow = createWorkflowDefinition(input);
      return validateWorkflow(workflow);
    }
  };
}

function findWorkflow(state, workflowId) {
  const workflow = state.workflows.find((candidate) => candidate.id === workflowId);
  if (!workflow) {
    throw new Error("Workflow was not found.");
  }
  return workflow;
}

function findTicket(state, ticketId) {
  const ticket = state.tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket) {
    throw new Error("Ticket was not found.");
  }
  return new Ticket(ticket);
}

function parseContent(content) {
  if (typeof content === "string") {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Ticket content must be a JSON object.");
    }
    return parsed;
  }
  return content ?? {};
}

function upsertById(items, item) {
  const next = items.filter((candidate) => candidate.id !== item.id);
  next.push(item);
  return next;
}

function withDerived(state) {
  return {
    workflows: state.workflows,
    tickets: state.tickets.map((ticket) => withDerivedTicket(ticket, state.workflows))
  };
}

function withDerivedTicket(ticket, workflows) {
  const workflow = workflows.find((candidate) => candidate.id === ticket.workflowId);
  const currentStep = workflow?.steps.find((step) => step.id === ticket.currentStepId);

  return {
    ...ticket,
    workflowName: workflow?.name ?? "",
    currentStepName: currentStep?.name ?? ""
  };
}
