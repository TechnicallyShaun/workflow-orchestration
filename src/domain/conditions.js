export function evaluateCondition(condition, context) {
  const value = readPath(context, condition.field);

  switch (condition.operator) {
    case "equals":
      return String(value) === String(condition.value);
    case "notEquals":
      return String(value) !== String(condition.value);
    case "exists":
      return value !== undefined && value !== null;
    case "notExists":
      return value === undefined || value === null;
    case "contains":
      if (Array.isArray(value)) {
        return value.map(String).includes(String(condition.value));
      }
      return String(value ?? "").includes(String(condition.value));
    default:
      return false;
  }
}

export function buildConditionContext(ticket) {
  const steps = {};

  for (const event of ticket.events) {
    if (event.stepId && event.output !== undefined && event.output !== null) {
      steps[event.stepId] = { output: event.output };
    }
  }

  return {
    ticket: {
      content: ticket.content,
      state: ticket.stateContent ?? {}
    },
    steps
  };
}

export function readPath(source, path) {
  if (!path || typeof path !== "string") {
    return undefined;
  }

  return path.split(".").reduce((value, segment) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    return value[segment];
  }, source);
}
