const API_KEY_STORAGE_KEY = "reconpulse_api_key";

export function loadApiKey(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

export function saveApiKey(value: string): string {
  const normalized = value.trim();

  if (typeof window === "undefined") {
    return normalized;
  }

  if (normalized) {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, normalized);
  } else {
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  }

  return normalized;
}
