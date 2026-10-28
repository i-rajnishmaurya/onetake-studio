import openai from "./adapters/openai.js";
import anthropic from "./adapters/anthropic.js";
import google from "./adapters/google.js";
import groq from "./adapters/groq.js";
import mistral from "./adapters/mistral.js";
import together from "./adapters/together.js";
import openrouter from "./adapters/openrouter.js";
import deepseek from "./adapters/deepseek.js";
import fireworks from "./adapters/fireworks.js";
import cohere from "./adapters/cohere.js";
import perplexity from "./adapters/perplexity.js";
import cerebras from "./adapters/cerebras.js";
import sambanova from "./adapters/sambanova.js";
import chutes from "./adapters/chutes.js";
import hyperbolic from "./adapters/hyperbolic.js";
import novita from "./adapters/novita.js";
import tokenrouter from "./adapters/tokenrouter.js";
import opencode_zen from "./adapters/opencode_zen.js";

const adapters = [
  openai,
  anthropic,
  google,
  groq,
  mistral,
  together,
  openrouter,
  deepseek,
  fireworks,
  cohere,
  perplexity,
  cerebras,
  sambanova,
  chutes,
  hyperbolic,
  novita,
  tokenrouter,
  opencode_zen,
];

const byId = new Map(adapters.map((a) => [a.id, a]));

export function listProviders() {
  return adapters.map((a) => ({
    id: a.id,
    name: a.name,
    auth: a.auth,
    docsUrl: a.docsUrl ?? null,
    limitations: a.limitations ?? null,
    supports: a.supports ?? { modelDiscovery: false, streaming: false },
    contextWindow: a.contextWindow ?? null,
  }));
}

export function getProvider(id) {
  return byId.get(id) || null;
}

export function getAdapter(id) {
  return byId.get(id) || null;
}

export { adapters };
