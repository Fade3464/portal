export function getCsrfToken() {
  if (typeof document === "undefined") {
    return "";
  }

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("csrftoken="));

  if (!cookie) {
    return "";
  }

  return decodeURIComponent(cookie.slice("csrftoken=".length));
}
