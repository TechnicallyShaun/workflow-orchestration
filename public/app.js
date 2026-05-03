const state = {
  workflows: [],
  tickets: [],
  selectedTicketId: null,
  draft: emptyWorkflow()
};

const els = {
  navButtons: document.querySelectorAll(".nav-button"),
  views: document.querySelectorAll(".view"),
  workflowName: document.querySelector("#workflow-name"),
  workflowDescription: document.querySelector("#workflow-description"),
  firstStep: document.querySelector("#first-step"),
  validationMessages: document.querySelector("#validation-messages"),
  workflowList: document.querySelector("#workflow-list"),
  stepChain: document.querySelector("#step-chain"),
  transitionList: document.querySelector("#transition-list"),
  ticketWorkflow: document.querySelector("#ticket-workflow"),
  ticketNumber: document.querySelector("#ticket-number"),
  ticketContent: document.querySelector("#ticket-content"),
  ticketFormMessages: document.querySelector("#ticket-form-messages"),
  ticketList: document.querySelector("#ticket-list"),
  ticketDetail: document.querySelector("#ticket-detail")
};

document.querySelector("#new-workflow").addEventListener("click", () => {
  state.draft = emptyWorkflow();
  render();
});
document.querySelector("#add-step").addEventListener("click", addStep);
document.querySelector("#add-transition").addEventListener("click", addTransition);
document.querySelector("#save-workflow").addEventListener("click", saveWorkflow);
document.querySelector("#create-ticket").addEventListener("click", () => createTicket(false));
document.querySelector("#create-start-ticket").addEventListener("click", () => createTicket(true));

els.workflowName.addEventListener("input", (event) => {
  state.draft.name = event.target.value;
});
els.workflowDescription.addEventListener("input", (event) => {
  state.draft.description = event.target.value;
});
els.firstStep.addEventListener("change", (event) => {
  state.draft.firstStepId = event.target.value;
});

for (const button of els.navButtons) {
  button.addEventListener("click", () => setView(button.dataset.view));
}

await loadState();

function emptyWorkflow() {
  return {
    id: "",
    name: "",
    description: "",
    firstStepId: "",
    steps: [],
    transitions: []
  };
}

function setView(viewName) {
  for (const button of els.navButtons) {
    button.classList.toggle("active", button.dataset.view === viewName);
  }
  for (const view of els.views) {
    view.classList.toggle("active", view.id === `${viewName}-view`);
  }
}

async function loadState() {
  const next = await api("/api/state");
  state.workflows = next.workflows;
  state.tickets = next.tickets;
  if (!state.draft.steps.length && state.workflows.length) {
    state.draft = clone(state.workflows[0]);
  }
  render();
}

function render() {
  renderWorkflowForm();
  renderWorkflowList();
  renderSteps();
  renderTransitions();
  renderTicketWorkflowOptions();
  renderTicketList();
  renderTicketDetail();
}

function renderWorkflowForm() {
  els.workflowName.value = state.draft.name;
  els.workflowDescription.value = state.draft.description;
  els.firstStep.innerHTML = [
    `<option value="">Choose first step</option>`,
    ...state.draft.steps.map((step) => (
      `<option value="${escapeHtml(step.id)}" ${step.id === state.draft.firstStepId ? "selected" : ""}>${escapeHtml(step.name || step.id)}</option>`
    ))
  ].join("");
}

function renderWorkflowList() {
  if (!state.workflows.length) {
    els.workflowList.innerHTML = `<p class="empty">No saved workflows yet.</p>`;
    return;
  }

  els.workflowList.innerHTML = state.workflows.map((workflow) => `
    <article class="list-item">
      <div>
        <strong>${escapeHtml(workflow.name)}</strong>
        <div class="muted">${workflow.steps.length} steps, ${workflow.transitions.length} transitions</div>
      </div>
      <button class="secondary" data-action="edit-workflow" data-id="${escapeHtml(workflow.id)}" type="button">Edit</button>
    </article>
  `).join("");

  els.workflowList.querySelectorAll("[data-action='edit-workflow']").forEach((button) => {
    button.addEventListener("click", () => {
      state.draft = clone(state.workflows.find((workflow) => workflow.id === button.dataset.id));
      showMessage(els.validationMessages, "");
      render();
    });
  });
}

function renderSteps() {
  if (!state.draft.steps.length) {
    els.stepChain.innerHTML = `<p class="empty">Add at least one step to start the workflow chain.</p>`;
    return;
  }

  els.stepChain.innerHTML = state.draft.steps.map((step) => `
    <article class="step-card" data-step-id="${escapeHtml(step.id)}">
      <div class="section-title">
        <h3>${escapeHtml(step.name || "Untitled step")}</h3>
        <button class="danger" data-action="delete-step" type="button">Delete</button>
      </div>
      <div class="step-grid">
        <label>
          Step key
          <input data-field="id" value="${escapeAttr(step.id)}">
        </label>
        <label>
          Type
          <select data-field="type">
            ${["cli", "agent", "manual", "error"].map((type) => `<option value="${type}" ${step.type === type ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </label>
        <label>
          Name
          <input data-field="name" value="${escapeAttr(step.name)}">
        </label>
        <label class="wide">
          Description
          <textarea data-field="description">${escapeHtml(step.description)}</textarea>
        </label>
        <label>
          Command
          <input data-field="command" value="${escapeAttr(step.command)}">
        </label>
        <label>
          Agent prompt
          <input data-field="agentPrompt" value="${escapeAttr(step.agentPrompt)}">
        </label>
        <label>
          Agent skill
          <input data-field="agentSkill" value="${escapeAttr(step.agentSkill)}">
        </label>
      </div>
      ${step.type === "manual" ? `<div class="manual-note">This step pauses until someone clicks "I did this bit manually" on the ticket.</div>` : ""}
      ${step.type === "error" ? `<div class="error-note">This step pauses for human review and uses the same manual completion action.</div>` : ""}
    </article>
  `).join("");

  els.stepChain.querySelectorAll(".step-card").forEach((card) => {
    const step = state.draft.steps.find((candidate) => candidate.id === card.dataset.stepId);
    card.querySelectorAll("[data-field]").forEach((control) => {
      control.addEventListener("input", () => updateStep(step.id, control.dataset.field, control.value));
      control.addEventListener("change", () => updateStep(step.id, control.dataset.field, control.value));
    });
    card.querySelector("[data-action='delete-step']").addEventListener("click", () => deleteStep(step.id));
  });
}

function renderTransitions() {
  if (!state.draft.transitions.length) {
    els.transitionList.innerHTML = `<p class="empty">Add transitions to connect steps. A blank condition is the default path.</p>`;
    return;
  }

  els.transitionList.innerHTML = state.draft.transitions.map((transition) => `
    <article class="transition-card" data-transition-id="${escapeHtml(transition.id)}">
      <div class="section-title">
        <h3>${escapeHtml(transition.fromStepId || "from")} -> ${escapeHtml(transition.toStepId || "to")}</h3>
        <button class="danger" data-action="delete-transition" type="button">Delete</button>
      </div>
      <div class="transition-grid">
        <label>
          From
          <select data-field="fromStepId">${stepOptions(transition.fromStepId)}</select>
        </label>
        <label>
          To
          <select data-field="toStepId">${stepOptions(transition.toStepId)}</select>
        </label>
        <label>
          Operator
          <select data-field="operator">
            ${["default", "equals", "notEquals", "exists", "notExists", "contains"].map((operator) => `<option value="${operator}" ${transition.condition?.operator === operator || (!transition.condition && operator === "default") ? "selected" : ""}>${operator}</option>`).join("")}
          </select>
        </label>
        <label>
          Field
          <select data-field="field">
            ${["ticket.content.type", "ticket.content.priority", "ticket.state.type", "ticket.state.result", "steps.classify.output.kind"].map((field) => `<option value="${field}" ${transition.condition?.field === field ? "selected" : ""}>${field}</option>`).join("")}
          </select>
        </label>
        <label>
          Value
          <input data-field="value" value="${escapeAttr(transition.condition?.value ?? "")}">
        </label>
      </div>
    </article>
  `).join("");

  els.transitionList.querySelectorAll(".transition-card").forEach((card) => {
    const transition = state.draft.transitions.find((candidate) => candidate.id === card.dataset.transitionId);
    card.querySelectorAll("[data-field]").forEach((control) => {
      control.addEventListener("input", () => updateTransition(transition.id, control.dataset.field, control.value));
      control.addEventListener("change", () => updateTransition(transition.id, control.dataset.field, control.value));
    });
    card.querySelector("[data-action='delete-transition']").addEventListener("click", () => deleteTransition(transition.id));
  });
}

function renderTicketWorkflowOptions() {
  els.ticketWorkflow.innerHTML = [
    `<option value="">Choose workflow</option>`,
    ...state.workflows.map((workflow) => `<option value="${escapeHtml(workflow.id)}">${escapeHtml(workflow.name)}</option>`)
  ].join("");
}

function renderTicketList() {
  if (!state.tickets.length) {
    els.ticketList.innerHTML = `<tr><td colspan="6" class="empty">No tickets yet.</td></tr>`;
    return;
  }

  els.ticketList.innerHTML = state.tickets.map((ticket) => `
    <tr>
      <td><strong>${escapeHtml(ticket.number)}</strong></td>
      <td>${escapeHtml(ticket.workflowName || "Unassigned")}</td>
      <td>${escapeHtml(ticket.currentStepName || "")}</td>
      <td><span class="status ${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span></td>
      <td>${formatDate(ticket.updatedAt)}</td>
      <td>
        <div class="row-actions">
          <button class="secondary" data-action="select-ticket" data-id="${escapeHtml(ticket.id)}" type="button">View</button>
          ${ticket.workflowId && ["created", "assigned"].includes(ticket.status) ? `<button data-action="start-ticket" data-id="${escapeHtml(ticket.id)}" type="button">Start</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");

  els.ticketList.querySelectorAll("[data-action='select-ticket']").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTicketId = button.dataset.id;
      renderTicketDetail();
    });
  });
  els.ticketList.querySelectorAll("[data-action='start-ticket']").forEach((button) => {
    button.addEventListener("click", () => startTicket(button.dataset.id));
  });
}

function renderTicketDetail() {
  const ticket = state.tickets.find((candidate) => candidate.id === state.selectedTicketId) ?? state.tickets[0];
  if (!ticket) {
    els.ticketDetail.innerHTML = `Select a ticket to inspect its state.`;
    return;
  }
  state.selectedTicketId = ticket.id;

  const humanAction = ["waiting", "errored"].includes(ticket.status)
    ? `<button id="manual-complete" data-testid="manual-complete" type="button">I did this bit manually</button>`
    : "";

  els.ticketDetail.innerHTML = `
    <h3>${escapeHtml(ticket.number)}</h3>
    <p class="muted">${escapeHtml(ticket.workflowName || "Unassigned")} ${ticket.currentStepName ? `- ${escapeHtml(ticket.currentStepName)}` : ""}</p>
    <p><span class="status ${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span></p>
    <h3>Content</h3>
    <pre>${escapeHtml(JSON.stringify(ticket.content, null, 2))}</pre>
    <h3>Latest output</h3>
    <pre>${escapeHtml(JSON.stringify(ticket.latestOutput, null, 2))}</pre>
    <h3>Latest error</h3>
    <pre>${escapeHtml(JSON.stringify(ticket.latestError, null, 2))}</pre>
    <div class="button-row">${humanAction}</div>
    <h3>State history</h3>
    ${ticket.events.slice().reverse().map((event) => `
      <div class="event">
        <strong>${escapeHtml(event.eventType)}</strong>
        <div class="muted">${formatDate(event.createdAt)} ${escapeHtml(event.fromStatus ?? "")} -> ${escapeHtml(event.toStatus ?? "")}</div>
      </div>
    `).join("")}
  `;

  const manualButton = document.querySelector("#manual-complete");
  if (manualButton) {
    manualButton.addEventListener("click", () => completeManual(ticket.id));
  }
}

function addStep() {
  const index = state.draft.steps.length + 1;
  const step = {
    id: `step-${index}`,
    type: "manual",
    name: `Step ${index}`,
    description: "",
    command: "",
    agentPrompt: "",
    agentSkill: ""
  };
  state.draft.steps.push(step);
  state.draft.firstStepId ||= step.id;
  render();
}

function updateStep(stepId, field, value) {
  const step = state.draft.steps.find((candidate) => candidate.id === stepId);
  if (!step) {
    return;
  }
  if (field === "id") {
    state.draft.transitions.forEach((transition) => {
      if (transition.fromStepId === step.id) {
        transition.fromStepId = value;
      }
      if (transition.toStepId === step.id) {
        transition.toStepId = value;
      }
    });
    if (state.draft.firstStepId === step.id) {
      state.draft.firstStepId = value;
    }
  }
  step[field] = value;
  renderWorkflowForm();
  renderTransitions();
}

function deleteStep(stepId) {
  state.draft.steps = state.draft.steps.filter((step) => step.id !== stepId);
  state.draft.transitions = state.draft.transitions.filter((transition) => transition.fromStepId !== stepId && transition.toStepId !== stepId);
  if (state.draft.firstStepId === stepId) {
    state.draft.firstStepId = state.draft.steps[0]?.id ?? "";
  }
  render();
}

function addTransition() {
  state.draft.transitions.push({
    id: `transition-${Date.now()}`,
    fromStepId: state.draft.steps[0]?.id ?? "",
    toStepId: state.draft.steps[1]?.id ?? state.draft.steps[0]?.id ?? "",
    condition: null
  });
  render();
}

function updateTransition(transitionId, field, value) {
  const transition = state.draft.transitions.find((candidate) => candidate.id === transitionId);
  if (!transition) {
    return;
  }
  if (field === "fromStepId" || field === "toStepId") {
    transition[field] = value;
  } else if (field === "operator" && value === "default") {
    transition.condition = null;
  } else {
    transition.condition ||= { field: "ticket.content.type", operator: "equals", value: "" };
    transition.condition[field] = value;
  }
}

function deleteTransition(transitionId) {
  state.draft.transitions = state.draft.transitions.filter((transition) => transition.id !== transitionId);
  render();
}

async function saveWorkflow() {
  try {
    const result = await api("/api/workflows", {
      method: "POST",
      body: state.draft
    });

    if (!result.ok) {
      showMessage(els.validationMessages, result.errors.map((error) => error.message).join(" "));
      return;
    }

    showMessage(els.validationMessages, "Workflow saved.", true);
    state.draft = clone(result.workflow);
    await loadState();
  } catch (error) {
    showMessage(els.validationMessages, error.message);
  }
}

async function createTicket(start) {
  try {
    const ticket = await api("/api/tickets", {
      method: "POST",
      body: {
        number: els.ticketNumber.value,
        content: JSON.parse(els.ticketContent.value),
        workflowId: els.ticketWorkflow.value,
        start
      }
    });
    showMessage(els.ticketFormMessages, start ? "Ticket created and started." : "Ticket created.", true);
    state.selectedTicketId = ticket.ticket.id;
    els.ticketNumber.value = "";
    await loadState();
    setView("tickets");
  } catch (error) {
    showMessage(els.ticketFormMessages, error.message);
  }
}

async function startTicket(ticketId) {
  const result = await api(`/api/tickets/${encodeURIComponent(ticketId)}/start`, {
    method: "POST",
    body: {}
  });
  state.selectedTicketId = result.ticket.id;
  await loadState();
}

async function completeManual(ticketId) {
  const result = await api(`/api/tickets/${encodeURIComponent(ticketId)}/manual-complete`, {
    method: "POST",
    body: { actor: "human" }
  });
  state.selectedTicketId = result.ticket.id;
  await loadState();
}

function stepOptions(selectedId) {
  return [
    `<option value="">Choose step</option>`,
    ...state.draft.steps.map((step) => `<option value="${escapeHtml(step.id)}" ${step.id === selectedId ? "selected" : ""}>${escapeHtml(step.name || step.id)}</option>`)
  ].join("");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed.");
  }
  return body;
}

function showMessage(element, message, ok = false) {
  element.textContent = message;
  element.classList.toggle("ok", ok);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
