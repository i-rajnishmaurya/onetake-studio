import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "novita",
  name: "Novita",
  baseUrl: "https://api.novita.ai/v3/openai",
  docsUrl: "https://novita.ai/docs",
  contextWindow: 128000,
  defaultModels: [],
});
