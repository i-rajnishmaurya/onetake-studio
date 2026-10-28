import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "mistral",
  name: "Mistral",
  baseUrl: "https://api.mistral.ai/v1",
  docsUrl: "https://docs.mistral.ai",
  contextWindow: 128000,
  defaultModels: [
    "mistral-large-latest",
    "mistral-medium-latest",
    "mistral-small-latest",
    "codestral-latest",
  ],
});
