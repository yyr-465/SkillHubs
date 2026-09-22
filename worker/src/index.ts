import { createHandler } from "./handler.ts";

const handler = createHandler();

export default {
  fetch: handler,
};
