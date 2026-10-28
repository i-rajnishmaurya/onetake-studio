import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "cerebras",
  name: "Cerebras",
  baseUrl: "https://api.cerebras.ai/v1",
  docsUrl: "https://inference-docs.cerebras.ai",
  contextWindow: 128000,
  defaultModels: ["llama-3.3-70b", "llama3.1-8b", "qwen-3-32b"],
});
