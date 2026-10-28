import { createOpenAICompatible } from "../openaiCompatible.js";

export default createOpenAICompatible({
  id: "groq",
  name: "Groq",
  baseUrl: "https://api.groq.com/openai/v1",
  docsUrl: "https://console.groq.com/docs",
  contextWindow: 128000,
  defaultModels: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],
});
