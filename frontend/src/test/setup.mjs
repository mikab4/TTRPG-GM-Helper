import { transferableAbortController } from "node:util";

import "@testing-library/jest-dom/vitest";

globalThis.AbortController = transferableAbortController;
