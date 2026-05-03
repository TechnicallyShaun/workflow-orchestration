import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Ticket } from "../domain/ticket.js";

export function createMemoryStore(initial = {}) {
  const state = {
    workflows: [...(initial.workflows ?? [])],
    tickets: [...(initial.tickets ?? [])]
  };

  return {
    async load() {
      return cloneState(state);
    },

    async save(nextState) {
      state.workflows = [...(nextState.workflows ?? [])];
      state.tickets = [...(nextState.tickets ?? [])];
      return cloneState(state);
    }
  };
}

export function createFileStore(filePath) {
  const memory = createMemoryStore();

  return {
    async load() {
      try {
        const text = await readFile(filePath, "utf8");
        const parsed = JSON.parse(text);
        await memory.save(parsed);
        return normalizeLoadedState(parsed);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
        return memory.load();
      }
    },

    async save(nextState) {
      const normalized = normalizeLoadedState(nextState);
      await memory.save(normalized);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
      return cloneState(normalized);
    }
  };
}

export function normalizeLoadedState(state = {}) {
  return {
    workflows: [...(state.workflows ?? [])],
    tickets: (state.tickets ?? []).map((ticket) => new Ticket(ticket).toJSON())
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(normalizeLoadedState(state)));
}
