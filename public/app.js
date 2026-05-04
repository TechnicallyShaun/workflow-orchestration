const state = {
  workflows: [],
  tickets: [],
  selectedTicketId: null,
  designerSelectedStepId: null,
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
  designerWorkflow: document.querySelector("#designer-workflow"),
  designerNewWorkflow: document.querySelector("#designer-new-workflow"),
  designerSaveWorkflow: document.querySelector("#designer-save-workflow"),
  designerMessages: document.querySelector("#designer-messages"),
  designerSummary: document.querySelector("#designer-summary"),
  designerCanvas: document.querySelector("#designer-canvas"),
  designerSidebar: document.querySelector("#designer-sidebar"),
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
els.designerNewWorkflow.addEventListener("click", () => {
  state.draft = emptyWorkflow();
  state.designerSelectedStepId = null;
  showMessage(els.validationMessages, "");
  showMessage(els.designerMessages, "");
  setView("designer");
  render();
});
els.designerSaveWorkflow.addEventListener("click", saveWorkflow);
document.querySelector("#create-ticket").addEventListener("click", () => createTicket(false));
document.querySelector("#create-start-ticket").addEventListener("click", () => createTicket(true));

els.workflowName.addEventListener("input", (event) => {
  state.draft.name = event.target.value;
  renderDesigner();
});
els.workflowDescription.addEventListener("input", (event) => {
  state.draft.description = event.target.value;
  renderDesigner();
});
els.firstStep.addEventListener("change", (event) => {
  state.draft.firstStepId = event.target.value;
  renderDesigner();
});
els.designerWorkflow.addEventListener("change", (event) => {
  const workflow = state.workflows.find((candidate) => candidate.id === event.target.value);
  state.draft = workflow ? clone(workflow) : state.draft;
  state.designerSelectedStepId = state.draft.steps[0]?.id ?? null;
  showMessage(els.validationMessages, "");
  showMessage(els.designerMessages, "");
  render();
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
  renderDesigner();
  renderDesignerSidebar();
  renderTicketWorkflowOptions();
  renderTicketList();
  renderTicketDetail();
}

function renderDesigner() {
  const selectedId = state.draft.id || "";
  els.designerWorkflow.innerHTML = [
    `<option value="">Current draft</option>`,
    ...state.workflows.map((workflow) => (
      `<option value="${escapeHtml(workflow.id)}" ${workflow.id === selectedId ? "selected" : ""}>${escapeHtml(workflow.name || workflow.id)}</option>`
    ))
  ].join("");

  const workflow = state.draft.id || state.draft.name || state.draft.steps.length || !state.workflows.length
    ? state.draft
    : state.workflows[0];
  if (!workflow || !workflow.steps.length) {
    els.designerSummary.innerHTML = "";
    els.designerCanvas.innerHTML = `
      <div class="designer-empty">
        <p class="empty">Create a workflow or choose an existing one.</p>
        <button data-action="designer-add-root" type="button">Add first step</button>
      </div>
    `;
    bindDesignerCanvas();
    return;
  }

  const branchCount = workflow.transitions.filter((transition) => transition.condition).length;
  els.designerSummary.innerHTML = `
    <div><strong>${escapeHtml(workflow.name || "Untitled workflow")}</strong><span>${escapeHtml(workflow.description || "No description")}</span></div>
    <div><strong>${workflow.steps.length}</strong><span>Steps</span></div>
    <div><strong>${workflow.transitions.length}</strong><span>Transitions</span></div>
    <div><strong>${branchCount}</strong><span>Conditional paths</span></div>
  `;

  els.designerCanvas.innerHTML = workflowDiagram(workflow);
  bindDesignerCanvas();
}

function bindDesignerCanvas() {
  els.designerCanvas.querySelectorAll("[data-action='designer-add-root']").forEach((button) => {
    button.addEventListener("click", () => addDesignerStep(null));
  });
  els.designerCanvas.querySelectorAll("[data-action='select-designer-step']").forEach((button) => {
    button.addEventListener("click", () => {
      state.designerSelectedStepId = button.dataset.stepId;
      renderDesigner();
      renderDesignerSidebar();
    });
  });
  els.designerCanvas.querySelectorAll("[data-action='add-designer-step']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      addDesignerStep(button.dataset.fromStepId, {
        branchValue: button.dataset.branchValue,
        branchField: button.dataset.branchField
      });
    });
  });
}

function renderDesignerSidebar() {
  const step = state.draft.steps.find((candidate) => candidate.id === state.designerSelectedStepId)
    ?? state.draft.steps[0];
  if (!state.draft.steps.length) {
    els.designerSidebar.innerHTML = `
      <h2>Workflow</h2>
      <label>Name<input data-designer-workflow-field="name" value="${escapeAttr(state.draft.name)}" placeholder="New workflow"></label>
      <label>Description<textarea data-designer-workflow-field="description" rows="3">${escapeHtml(state.draft.description)}</textarea></label>
      <button data-action="designer-add-root" type="button">Add first step</button>
    `;
    bindDesignerSidebar();
    return;
  }
  state.designerSelectedStepId = step.id;
  const designer = designerMeta(step);

  els.designerSidebar.innerHTML = `
    <h2>Step Design</h2>
    <label>Workflow name<input data-designer-workflow-field="name" value="${escapeAttr(state.draft.name)}"></label>
    <label>Step key<input data-designer-step-field="id" value="${escapeAttr(step.id)}"></label>
    <label>Name<input data-designer-step-field="name" value="${escapeAttr(step.name)}"></label>
    <label>Designer kind
      <select data-designer-step-field="designer.kind">
        ${["step", "condition", "switch"].map((kind) => `<option value="${kind}" ${designer.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}
      </select>
    </label>
    <label>Action type
      <select data-designer-step-field="type">
        ${["manual", "cli", "agent", "error"].map((type) => `<option value="${type}" ${step.type === type ? "selected" : ""}>${type}</option>`).join("")}
      </select>
    </label>
    ${designer.kind === "condition" ? `
      <label>True/false field<input data-designer-step-field="designer.conditionField" value="${escapeAttr(designer.conditionField)}" placeholder="ticket.content.approved"></label>
      <div class="designer-branch-actions">
        <button data-action="add-designer-step" data-from-step-id="${escapeAttr(step.id)}" data-branch-field="${escapeAttr(designer.conditionField)}" data-branch-value="true" ${branchExists(step.id, "true") ? "disabled" : ""} type="button">+ True</button>
        <button data-action="add-designer-step" data-from-step-id="${escapeAttr(step.id)}" data-branch-field="${escapeAttr(designer.conditionField)}" data-branch-value="false" ${branchExists(step.id, "false") ? "disabled" : ""} type="button">+ False</button>
      </div>
    ` : ""}
    ${designer.kind === "switch" ? `
      <label>Text match field<input data-designer-step-field="designer.switchField" value="${escapeAttr(designer.switchField)}" placeholder="ticket.content.type"></label>
      <div class="designer-case-list">
        ${designer.switchCases.map((caseValue, index) => `
          <div class="designer-case">
            <input data-designer-case-index="${index}" value="${escapeAttr(caseValue)}">
            <button data-action="add-designer-step" data-from-step-id="${escapeAttr(step.id)}" data-branch-field="${escapeAttr(designer.switchField)}" data-branch-value="${escapeAttr(caseValue)}" ${branchExists(step.id, caseValue) ? "disabled" : ""} type="button">+</button>
          </div>
        `).join("")}
      </div>
      <button class="secondary" data-action="add-designer-case" type="button">Add case</button>
    ` : ""}
    <label>Description<textarea data-designer-step-field="description" rows="4">${escapeHtml(step.description)}</textarea></label>
    ${step.type === "cli" ? `<label>Command<input data-designer-step-field="command" value="${escapeAttr(step.execution?.command ?? step.command)}"></label>` : ""}
    ${step.type === "agent" ? `<label>Agent prompt<textarea data-designer-step-field="agentPrompt" rows="5">${escapeHtml(step.execution?.prompt ?? step.agentPrompt)}</textarea></label>` : ""}
    <div class="designer-branch-actions">
      <button data-action="add-designer-step" data-from-step-id="${escapeAttr(step.id)}" ${branchExists(step.id) ? "disabled" : ""} type="button">+ Next step</button>
      <button class="danger" data-action="delete-designer-step" data-step-id="${escapeAttr(step.id)}" type="button">Delete</button>
    </div>
  `;
  bindDesignerSidebar();
}

function bindDesignerSidebar() {
  els.designerSidebar.querySelectorAll("[data-designer-workflow-field]").forEach((control) => {
    control.addEventListener("input", () => {
      state.draft[control.dataset.designerWorkflowField] = control.value;
      renderWorkflowForm();
      renderDesigner();
    });
  });
  els.designerSidebar.querySelectorAll("[data-designer-step-field]").forEach((control) => {
    control.addEventListener("input", () => updateDesignerStep(control.dataset.designerStepField, control.value));
    control.addEventListener("change", () => updateDesignerStep(control.dataset.designerStepField, control.value));
  });
  els.designerSidebar.querySelectorAll("[data-designer-case-index]").forEach((control) => {
    control.addEventListener("input", () => updateDesignerCase(Number(control.dataset.designerCaseIndex), control.value));
  });
  els.designerSidebar.querySelectorAll("[data-action='designer-add-root']").forEach((button) => {
    button.addEventListener("click", () => addDesignerStep(null));
  });
  els.designerSidebar.querySelectorAll("[data-action='add-designer-step']").forEach((button) => {
    button.addEventListener("click", () => addDesignerStep(button.dataset.fromStepId, {
      branchValue: button.dataset.branchValue,
      branchField: button.dataset.branchField
    }));
  });
  els.designerSidebar.querySelectorAll("[data-action='add-designer-case']").forEach((button) => {
    button.addEventListener("click", addDesignerCase);
  });
  els.designerSidebar.querySelectorAll("[data-action='delete-designer-step']").forEach((button) => {
    button.addEventListener("click", () => {
      deleteStep(button.dataset.stepId);
      state.designerSelectedStepId = state.draft.steps[0]?.id ?? null;
      renderDesignerSidebar();
    });
  });
}

function updateDesignerStep(field, value) {
  const step = state.draft.steps.find((candidate) => candidate.id === state.designerSelectedStepId);
  if (!step) {
    return;
  }
  const previousDesigner = { ...designerMeta(step) };
  updateStep(step.id, field, value);
  if (field === "designer.conditionField") {
    updateOutgoingConditionField(step.id, previousDesigner.conditionField, value);
  }
  if (field === "designer.switchField") {
    updateOutgoingConditionField(step.id, previousDesigner.switchField, value);
  }
  if (field === "id") {
    state.designerSelectedStepId = value;
  }
  renderDesignerSidebar();
}

function updateOutgoingConditionField(stepId, previousField, nextField) {
  state.draft.transitions.forEach((transition) => {
    if (transition.fromStepId === stepId && transition.condition?.field === previousField) {
      transition.condition.field = nextField;
    }
  });
}

function updateDesignerCase(index, value) {
  const step = state.draft.steps.find((candidate) => candidate.id === state.designerSelectedStepId);
  if (!step) {
    return;
  }
  step.designer ||= {};
  step.designer.switchCases ||= [];
  const previous = step.designer.switchCases[index];
  step.designer.switchCases[index] = value;
  state.draft.transitions.forEach((transition) => {
    if (transition.fromStepId === step.id && transition.condition?.value === previous) {
      transition.condition.value = value;
    }
  });
  renderDesigner();
}

function addDesignerCase() {
  const step = state.draft.steps.find((candidate) => candidate.id === state.designerSelectedStepId);
  if (!step) {
    return;
  }
  step.designer ||= {};
  step.designer.kind = "switch";
  step.designer.switchCases ||= [];
  step.designer.switchCases.push(`case-${step.designer.switchCases.length + 1}`);
  renderDesigner();
  renderDesignerSidebar();
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
          Mode
          <select data-field="execution.mode">
            ${executionModeOptions(step)}
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
        <label class="${step.type === "cli" ? "" : "hidden-field"}">
          Command
          <input data-field="command" value="${escapeAttr(step.execution?.command ?? step.command)}">
        </label>
        <label class="${step.type === "agent" ? "" : "hidden-field"}">
          Agent target
          <select data-field="execution.agent.target">
            ${["codex", "copilot", "custom"].map((target) => `<option value="${target}" ${step.execution?.agent?.target === target ? "selected" : ""}>${target}</option>`).join("")}
          </select>
        </label>
        <label class="${step.type === "agent" ? "" : "hidden-field"}">
          Agent command
          <input data-field="execution.agent.command" value="${escapeAttr(step.execution?.agent?.command ?? "codex")}">
        </label>
        <label class="${step.type === "agent" ? "wide" : "hidden-field"}">
          Agent prompt
          <textarea data-field="agentPrompt">${escapeHtml(step.execution?.prompt ?? step.agentPrompt)}</textarea>
        </label>
        <label class="${step.type === "agent" ? "" : "hidden-field"}">
          Agent skill
          <input data-field="agentSkill" value="${escapeAttr(step.execution?.skill ?? step.agentSkill)}">
        </label>
        <label class="${["cli", "agent"].includes(step.type) ? "" : "hidden-field"}">
          Output format
          <select data-field="execution.output.format">
            ${["text", "json"].map((format) => `<option value="${format}" ${step.execution?.output?.format === format ? "selected" : ""}>${format}</option>`).join("")}
          </select>
        </label>
        <label class="${["cli", "agent"].includes(step.type) ? "" : "hidden-field"}">
          State key
          <input data-field="execution.output.stateKey" value="${escapeAttr(step.execution?.output?.stateKey ?? "")}" placeholder="worktree">
        </label>
        <label class="${["cli", "agent"].includes(step.type) ? "" : "hidden-field"}">
          Working directory
          <input data-field="execution.workingDirectory" value="${escapeAttr(step.execution?.workingDirectory ?? "")}" placeholder="{{workspace.root}}">
        </label>
        <label class="${["cli", "agent"].includes(step.type) ? "" : "hidden-field"}">
          Timeout seconds
          <input data-field="execution.timeoutSeconds" type="number" min="1" value="${escapeAttr(step.execution?.timeoutSeconds ?? 300)}">
        </label>
      </div>
      ${step.type === "manual" ? `<div class="manual-note">This step pauses until someone clicks "I did this bit manually" on the ticket.</div>` : ""}
      ${["cli", "agent"].includes(step.type) && step.execution?.mode === "interactive" ? `<div class="manual-note">Interactive mode opens Windows Terminal with PowerShell and then pauses until the ticket is completed manually.</div>` : ""}
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

function workflowDiagram(workflow) {
  const layout = buildWorkflowLayout(workflow);
  if (!layout.nodes.length) {
    return `<p class="empty">Add at least one step to start the workflow chain.</p>`;
  }

  const nodes = layout.nodes.map((node) => {
    const step = node.step;
    return `
      <article class="designer-node ${escapeHtml(step.type)} ${step.id === workflow.firstStepId ? "first" : ""} ${step.id === state.designerSelectedStepId ? "selected" : ""}" style="left: ${node.x}px; top: ${node.y}px;">
        <button class="designer-node-hit" data-action="select-designer-step" data-step-id="${escapeAttr(step.id)}" type="button" aria-label="Select ${escapeAttr(step.name || step.id)}"></button>
        <div class="node-topline">
          <span class="node-type">${escapeHtml(nodeKind(step))}</span>
          ${step.id === workflow.firstStepId ? `<span class="node-start">Start</span>` : ""}
        </div>
        <h3>${escapeHtml(step.name || step.id)}</h3>
        <p>${escapeHtml(step.description || nodeDetail(step))}</p>
        <div class="node-footer">
          <span>${escapeHtml(step.id)}</span>
          ${nodeBranchButtons(step)}
        </div>
      </article>
    `;
  }).join("");

  const edges = layout.edges.map((edge) => `
    <g>
      <path class="${edge.condition ? "conditional" : ""}" d="${edge.path}" marker-end="url(#designer-arrow)"></path>
      <text x="${edge.labelX}" y="${edge.labelY}">${escapeHtml(edge.label)}</text>
    </g>
  `).join("");

  return `
    <div class="designer-stage" style="width: ${layout.width}px; height: ${layout.height}px;">
      <svg class="designer-lines" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Workflow transitions">
        <defs>
          <marker id="designer-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L8,3 z"></path>
          </marker>
        </defs>
        ${edges}
      </svg>
      ${nodes}
    </div>
  `;
}

function buildWorkflowLayout(workflow) {
  const nodeWidth = 240;
  const nodeHeight = 132;
  const columnGap = 150;
  const rowGap = 58;
  const margin = 34;
  const stepById = new Map(workflow.steps.map((step) => [step.id, step]));
  const outgoing = new Map();
  for (const transition of workflow.transitions) {
    if (!outgoing.has(transition.fromStepId)) {
      outgoing.set(transition.fromStepId, []);
    }
    outgoing.get(transition.fromStepId).push(transition);
  }

  const columns = new Map();
  const queued = [{ id: workflow.firstStepId || workflow.steps[0]?.id, depth: 0 }];
  const visited = new Set();
  while (queued.length) {
    const next = queued.shift();
    if (!next.id || visited.has(next.id) || !stepById.has(next.id)) {
      continue;
    }
    visited.add(next.id);
    columns.set(next.id, next.depth);
    for (const transition of outgoing.get(next.id) ?? []) {
      queued.push({ id: transition.toStepId, depth: next.depth + 1 });
    }
  }

  for (const step of workflow.steps) {
    if (!columns.has(step.id)) {
      columns.set(step.id, Math.max(0, columns.size));
    }
  }

  const rowsByColumn = new Map();
  for (const step of workflow.steps) {
    const column = columns.get(step.id) ?? 0;
    if (!rowsByColumn.has(column)) {
      rowsByColumn.set(column, []);
    }
    rowsByColumn.get(column).push(step);
  }

  const nodes = [];
  for (const [column, steps] of [...rowsByColumn.entries()].sort((a, b) => a[0] - b[0])) {
    steps.forEach((step, row) => {
      nodes.push({
        step,
        x: margin + column * (nodeWidth + columnGap),
        y: margin + row * (nodeHeight + rowGap)
      });
    });
  }

  const nodeByStepId = new Map(nodes.map((node) => [node.step.id, node]));
  const edges = workflow.transitions
    .map((transition) => {
      const from = nodeByStepId.get(transition.fromStepId);
      const to = nodeByStepId.get(transition.toStepId);
      if (!from || !to) {
        return null;
      }
      const startX = from.x + nodeWidth;
      const startY = from.y + nodeHeight / 2;
      const endX = to.x;
      const endY = to.y + nodeHeight / 2;
      const midX = startX + Math.max(40, (endX - startX) / 2);
      return {
        condition: Boolean(transition.condition),
        label: transitionLabel(transition),
        labelX: midX - 28,
        labelY: Math.min(startY, endY) - 10,
        path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
      };
    })
    .filter(Boolean);

  const maxColumn = Math.max(0, ...nodes.map((node) => columns.get(node.step.id) ?? 0));
  const maxRows = Math.max(1, ...rowsByColumn.values().map((steps) => steps.length));
  return {
    nodes,
    edges,
    width: margin * 2 + (maxColumn + 1) * nodeWidth + maxColumn * columnGap,
    height: margin * 2 + maxRows * nodeHeight + (maxRows - 1) * rowGap
  };
}

function nodeBranchButtons(step) {
  const designer = designerMeta(step);
  if (designer.kind === "condition") {
    return `
      <span class="node-branches">
        <button data-action="add-designer-step" data-from-step-id="${escapeAttr(step.id)}" data-branch-field="${escapeAttr(designer.conditionField)}" data-branch-value="true" ${branchExists(step.id, "true") ? "disabled" : ""} type="button" title="Add true branch">+T</button>
        <button data-action="add-designer-step" data-from-step-id="${escapeAttr(step.id)}" data-branch-field="${escapeAttr(designer.conditionField)}" data-branch-value="false" ${branchExists(step.id, "false") ? "disabled" : ""} type="button" title="Add false branch">+F</button>
      </span>
    `;
  }
  if (designer.kind === "switch" && designer.switchCases.length) {
    return `
      <span class="node-branches">
        ${designer.switchCases.map((caseValue) => `<button data-action="add-designer-step" data-from-step-id="${escapeAttr(step.id)}" data-branch-field="${escapeAttr(designer.switchField)}" data-branch-value="${escapeAttr(caseValue)}" ${branchExists(step.id, caseValue) ? "disabled" : ""} type="button" title="Add ${escapeAttr(caseValue)} case">+</button>`).join("")}
      </span>
    `;
  }
  return `<button class="node-add" data-action="add-designer-step" data-from-step-id="${escapeAttr(step.id)}" ${branchExists(step.id) ? "disabled" : ""} type="button" title="Add next step">+</button>`;
}

function branchExists(fromStepId, branchValue) {
  return state.draft.transitions.some((transition) => (
    transition.fromStepId === fromStepId &&
    (branchValue ? transition.condition?.value === branchValue : !transition.condition)
  ));
}

function nodeKind(step) {
  const designer = designerMeta(step);
  return designer.kind === "step" ? step.type : designer.kind;
}

function designerMeta(step) {
  step.designer ||= {};
  step.designer.kind ||= "step";
  step.designer.conditionField ||= "ticket.content.type";
  step.designer.switchField ||= "ticket.content.type";
  step.designer.switchCases ||= [];
  return step.designer;
}

function nodeDetail(step) {
  if (step.type === "cli") {
    return step.execution?.command || step.command || "Run command";
  }
  if (step.type === "agent") {
    return step.execution?.prompt || step.agentPrompt || "Ask an agent";
  }
  if (step.type === "error") {
    return "Route to human review";
  }
  return "Manual approval or action";
}

function transitionLabel(transition) {
  if (!transition.condition) {
    return "default";
  }
  const value = transition.condition.value ? ` ${transition.condition.value}` : "";
  return `${transition.condition.operator}${value}`;
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
    agentSkill: "",
    designer: {
      kind: "step",
      conditionField: "ticket.content.type",
      switchField: "ticket.content.type",
      switchCases: []
    },
    execution: {
      mode: "manual"
    }
  };
  state.draft.steps.push(step);
  state.draft.firstStepId ||= step.id;
  render();
}

function addDesignerStep(fromStepId, options = {}) {
  if (fromStepId && branchExists(fromStepId, options.branchValue)) {
    return;
  }
  if (!state.draft.name) {
    state.draft.name = "New workflow";
  }
  const step = createDesignerStep(options.branchValue);
  state.draft.steps.push(step);
  state.draft.firstStepId ||= step.id;

  if (fromStepId) {
    state.draft.transitions.push({
      id: `transition-${Date.now()}-${state.draft.transitions.length + 1}`,
      fromStepId,
      toStepId: step.id,
      condition: options.branchValue
        ? {
            field: options.branchField || "ticket.content.type",
            operator: "equals",
            value: options.branchValue
          }
        : null
    });
  }

  state.designerSelectedStepId = step.id;
  render();
}

function createDesignerStep(branchValue) {
  const index = state.draft.steps.length + 1;
  const suffix = branchValue ? ` ${branchValue}` : "";
  return {
    id: uniqueStepId(`step-${index}`),
    type: "manual",
    name: `Step ${index}${suffix}`,
    description: "",
    command: "",
    agentPrompt: "",
    agentSkill: "",
    designer: {
      kind: "step",
      conditionField: "ticket.content.type",
      switchField: "ticket.content.type",
      switchCases: []
    },
    execution: {
      mode: "manual"
    }
  };
}

function uniqueStepId(base) {
  const existing = new Set(state.draft.steps.map((step) => step.id));
  let candidate = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "step";
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
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
  setStepField(step, field, value);
  normalizeStepDraft(step);
  renderWorkflowForm();
  renderTransitions();
  renderDesigner();
  if (field === "type" || field === "execution.mode") {
    renderSteps();
  }
}

function setStepField(step, field, value) {
  if (!field.includes(".")) {
    step[field] = value;
    if (field === "command") {
      step.execution ||= {};
      step.execution.command = value;
    }
    if (field === "agentPrompt") {
      step.execution ||= {};
      step.execution.prompt = value;
    }
    if (field === "agentSkill") {
      step.execution ||= {};
      step.execution.skill = value;
    }
    return;
  }

  const segments = field.split(".");
  let target = step;
  for (const segment of segments.slice(0, -1)) {
    target[segment] ||= {};
    target = target[segment];
  }
  target[segments.at(-1)] = value;
}

function normalizeStepDraft(step) {
  step.execution ||= {};

  if (step.type === "manual" || step.type === "error") {
    step.execution = { mode: "manual" };
    return;
  }

  if (!["silent", "interactive"].includes(step.execution.mode)) {
    step.execution.mode = "silent";
  }

  step.execution.output ||= {};
  step.execution.output.format ||= "text";
  step.execution.output.stateKey ||= "";
  step.execution.workingDirectory ||= "";
  step.execution.timeoutSeconds = Number(step.execution.timeoutSeconds || 300);

  if (step.type === "cli") {
    step.execution.shell ||= "powershell";
    step.execution.command ??= step.command ?? "";
    step.command = step.execution.command;
  }

  if (step.type === "agent") {
    step.execution.agent ||= {};
    step.execution.agent.target ||= "codex";
    step.execution.agent.command ||= "codex";
    step.execution.prompt ??= step.agentPrompt ?? "";
    step.execution.skill ??= step.agentSkill ?? "";
    step.agentPrompt = step.execution.prompt;
    step.agentSkill = step.execution.skill;
  }
}

function executionModeOptions(step) {
  const modes = step.type === "manual" || step.type === "error"
    ? ["manual"]
    : ["silent", "interactive"];
  const selected = step.execution?.mode ?? (modes.includes("manual") ? "manual" : "silent");
  return modes.map((mode) => `<option value="${mode}" ${selected === mode ? "selected" : ""}>${mode}</option>`).join("");
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
  renderDesigner();
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
      const message = result.errors.map((error) => error.message).join(" ");
      showMessage(els.validationMessages, message);
      showMessage(els.designerMessages, message);
      return;
    }

    showMessage(els.validationMessages, "Workflow saved.", true);
    showMessage(els.designerMessages, "Workflow saved.", true);
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
