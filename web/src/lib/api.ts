export class ApiError extends Error {
  code: string;
  detail?: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.detail = detail;
  }
}

type Options = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function api<T = unknown>(
  path: string,
  options: Options = {}
): Promise<T> {
  const { body, ...rest } = options;
  const headers = new Headers(rest.headers);
  const multipart = body instanceof FormData;

  if (body !== undefined && !multipart) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(
      path.startsWith("/api/") ? path : `/api${path}`,
      {
        ...rest,
        credentials: "include",
        headers,
        body:
          body === undefined
            ? undefined
            : multipart
              ? body
              : JSON.stringify(body)
      }
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "network",
      "Unable to reach the studio server. Check your connection and try again."
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(
      "invalid_response",
      `The server returned an unexpected response (${response.status}).`
    );
  }

  if (!response.ok) {
    const envelope = data as {
      error?: { code?: string; message?: string; detail?: unknown };
    };
    if (response.status === 401) {
      window.dispatchEvent(new Event("onetake:unauthorized"));
    }
    throw new ApiError(
      envelope?.error?.code ?? `http_${response.status}`,
      envelope?.error?.message ?? `Request failed (${response.status}).`,
      envelope?.error?.detail
    );
  }

  return data as T;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function list<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const nested = (value as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
}

export function unwrap<T>(value: unknown, key: string): T {
  if (value && typeof value === "object" && key in value) {
    return (value as Record<string, unknown>)[key] as T;
  }
  return value as T;
}
