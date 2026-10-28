import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "chutes",
  name: "Chutes",
  baseUrl: "https://llm.chutes.ai/v1",
  docsUrl: "https://chutes.ai",
  contextWindow: 128000,
  defaultModels: [],
});
