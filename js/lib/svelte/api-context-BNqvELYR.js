import { P as setContext, O as getContext } from "./disclose-version-et9wt-4m.js";
const API_KEY = "pcr-api";
function provideApi(api) {
  setContext(API_KEY, api);
}
function useApi() {
  return getContext(API_KEY);
}
class HttpError extends Error {
  constructor(status, statusText, body) {
    super(`HTTP ${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}
async function safeJson(resp) {
  if (!resp.ok) {
    let body = null;
    try {
      body = await resp.text();
    } catch {
    }
    throw new HttpError(resp.status, resp.statusText, body);
  }
  if (resp.status === 204) return {};
  const len = resp.headers.get("content-length");
  if (len === "0") return {};
  const text = await resp.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new HttpError(resp.status, "Invalid JSON body", text);
  }
}
export {
  HttpError as H,
  provideApi as p,
  safeJson as s,
  useApi as u
};
//# sourceMappingURL=api-context-BNqvELYR.js.map
