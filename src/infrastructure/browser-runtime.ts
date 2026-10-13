import type { Runtime } from '../application/ports/runtime';

export class BrowserRuntime implements Runtime {
  id() {
    return crypto.randomUUID();
  }
  now() {
    return new Date().toISOString();
  }
}
