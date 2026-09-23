export function syncDocumentLanguage(language: "zh" | "en"): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
}
