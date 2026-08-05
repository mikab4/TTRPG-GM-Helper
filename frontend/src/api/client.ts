import { apiBaseUrl } from "../config";

type ApiRequestOptions = {
  body?: BodyInit;
  headers?: Record<string, string>;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  signal?: AbortSignal;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<unknown> {
  const requestMethod = options.method ?? "GET";
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body,
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
    method: requestMethod,
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiError(await getApiErrorMessage(response), response.status);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}

async function getApiErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("Content-Type");
  if (contentType?.includes("application/json") !== true) {
    return `Request failed with status ${String(response.status)}.`;
  }

  const payload = (await response.json()) as unknown;
  if (typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string") {
    return payload.detail;
  }

  return `Request failed with status ${String(response.status)}.`;
}
