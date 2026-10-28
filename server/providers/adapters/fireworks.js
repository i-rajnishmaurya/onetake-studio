import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "fireworks",
  name: "Fireworks",
  baseUrl: "https://api.fireworks.ai/inference/v1",
  docsUrl: "https://docs.fireworks.ai",
  contextWindow: 128000,
  defaultModels: [
    "accounts/fireworks/models/llama-v3p1-70b-instruct",
    "accounts/fireworks/models/qwen2p5-72b-instruct",
  ],
});
