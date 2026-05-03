# Workflow Orchestration

A small, dependency-free JavaScript starter for defining and running ordered workflows.

This repository is set up as a public project: it includes a license, contribution guide, security policy, issue templates, a pull request template, tests, and a GitHub Actions CI workflow.

## Quick Start

```bash
npm test
npm start
```

## Example

```js
import { createWorkflow, runWorkflow } from "./src/index.js";

const workflow = createWorkflow()
  .step("extract", async () => ({ records: 10 }))
  .step("transform", async ({ extract }) => ({ processed: extract.records }))
  .step("load", async ({ transform }) => ({ inserted: transform.processed }));

const result = await runWorkflow(workflow);
console.log(result.load);
```

## Project Structure

```text
.
├── bin/                         # CLI entry point
├── src/                         # Library code
├── test/                        # Node test runner tests
├── .github/                     # Public contribution workflows and templates
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── SECURITY.md
└── package.json
```

## Scripts

```bash
npm start   # run the sample CLI
npm test    # run tests with node:test
```

## License

MIT
