import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "sambanova",
  name: "SambaNova",
  baseUrl: "https://api.sambanova.ai/v1",
  docsUrl: "https://docs.sambanova.ai",
  contextWindow: 128000,
  defaultModels: [
    "Meta-Llama-3.1-70B-Instruct",
    "Meta-Llama-3.1-8B-Instruct",
    "Qwen2.5-72B-Instruct",
  ],
});
