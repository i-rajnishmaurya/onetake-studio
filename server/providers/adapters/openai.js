import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "openai",
  name: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  docsUrl: "https://platform.openai.com/docs",
  contextWindow: 128000,
  defaultModels: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "o3-mini",
    "o4-mini",
  ],
});
