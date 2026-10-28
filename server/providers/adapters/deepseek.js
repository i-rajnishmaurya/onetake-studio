import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "deepseek",
  name: "DeepSeek",
  baseUrl: "https://api.deepseek.com/v1",
  docsUrl: "https://platform.deepseek.com/docs",
  contextWindow: 64000,
  defaultModels: ["deepseek-chat", "deepseek-reasoner"],
});
