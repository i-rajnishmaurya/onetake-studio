import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "hyperbolic",
  name: "Hyperbolic",
  baseUrl: "https://api.hyperbolic.xyz/v1",
  docsUrl: "https://docs.hyperbolic.xyz",
  contextWindow: 128000,
  defaultModels: [
    "meta-llama/Meta-Llama-3.1-70B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
  ],
});
