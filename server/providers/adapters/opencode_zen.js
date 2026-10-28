import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "opencode_zen",
  name: "OpenCode Zen",
  baseUrl: "https://opencode.ai/zen/v1",
  docsUrl: "https://opencode.ai",
  contextWindow: 128000,
  defaultModels: [],
});
