import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "tokenrouter",
  name: "TokenRouter",
  baseUrl: "https://api.tokenrouter.io/v1",
  docsUrl: "https://tokenrouter.io",
  contextWindow: 200000,
  defaultModels: [],
});
