import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "together",
  name: "Together AI",
  baseUrl: "https://api.together.xyz/v1",
  docsUrl: "https://docs.together.ai",
  contextWindow: 128000,
  defaultModels: [
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "Qwen/Qwen2.5-72B-Instruct-Turbo",
  ],
});
