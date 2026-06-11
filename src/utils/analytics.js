export function trackEvent(eventName, params = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") {
    console.warn("GA4 gtag not found:", eventName);
    return;
  }
  window.gtag("event", eventName, params);
  console.log("GA4 event sent:", eventName, params);
}
