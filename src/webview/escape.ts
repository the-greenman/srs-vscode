// The one HTML escape used by every webview builder. No vscode dependency.
// Note: `'` is NOT escaped — keep attribute values double-quoted.
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
