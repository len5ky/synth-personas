export const API_BASE = "https://openrouter.ai/api/v1";

export class RateLimited extends Error {
  readonly retryAfter: number | undefined;
  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = "RateLimited";
    this.retryAfter = retryAfter;
  }
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number | null;
  responseSchema?: unknown;
  responseSchemaName?: string;
  reasoning?: Record<string, unknown> | null;
  extraParams?: Record<string, unknown>;
}

export interface ChatResponse {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  usage?: Record<string, number | undefined>;
  [k: string]: unknown;
}

export interface OpenRouterClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  httpReferer?: string;
  xTitle?: string;
  fetchImpl?: typeof fetch;
}

export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenRouterClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY not set (pass via options.apiKey or environment variable).",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? API_BASE).replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (opts.httpReferer) this.headers["HTTP-Referer"] = opts.httpReferer;
    if (opts.xTitle ?? "synth-personas") this.headers["X-Title"] = opts.xTitle ?? "synth-personas";
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const payload: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
    };
    if (req.maxTokens != null) payload.max_tokens = req.maxTokens;
    if (req.reasoning) payload.reasoning = req.reasoning;
    if (req.extraParams) Object.assign(payload, req.extraParams);

    if (req.responseSchema != null) {
      payload.response_format = {
        type: "json_schema",
        json_schema: {
          name: req.responseSchemaName ?? "response",
          strict: true,
          schema: req.responseSchema,
        },
      };
    }

    let resp = await this.send(payload);
    if (resp.status === 400 && req.responseSchema != null) {
      payload.response_format = { type: "json_object" };
      resp = await this.send(payload);
    }
    return this.handle(resp);
  }

  private async send(payload: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      throw new TransportError(`network failure: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async handle(resp: Response): Promise<ChatResponse> {
    if (resp.status === 429) {
      const ra = resp.headers.get("Retry-After");
      let retryAfter: number | undefined;
      if (ra) {
        const n = Number(ra);
        if (!Number.isNaN(n)) retryAfter = n;
      }
      const body = await resp.text();
      throw new RateLimited(`429: ${body.slice(0, 500)}`, retryAfter);
    }
    if (resp.status >= 500 && resp.status < 600) {
      throw new ProviderError(`${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    }
    if (resp.status >= 400 && resp.status < 500) {
      throw new ClientError(`${resp.status}: ${(await resp.text()).slice(0, 500)}`);
    }
    try {
      return (await resp.json()) as ChatResponse;
    } catch (e) {
      throw new ClientError(`failed to parse JSON response: ${(e as Error).message}`);
    }
  }

  static extractText(response: ChatResponse): string {
    const choices = response.choices ?? [];
    if (choices.length === 0) throw new Error("no choices in response");
    const msg = choices[0]?.message;
    if (!msg) throw new Error("no message in choice[0]");
    const content = msg.content;
    if (content == null) throw new Error("no content in choice[0].message");
    if (Array.isArray(content)) {
      return content.map((p) => (typeof p === "object" && p && "text" in p ? p.text ?? "" : "")).join("");
    }
    return content;
  }
}
