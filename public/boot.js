const status = document.getElementById("status");

const setStatus = (message) => {
  if (status) {
    status.textContent = message;
  }
};

window.addEventListener("error", (event) => {
  if (event?.message) {
    setStatus(`Error: ${event.message}`);
    console.error("[NetworkView] Unhandled error", event.error || event.message);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  const message = reason?.message || String(reason || "Unknown error");
  setStatus(`Error: ${message}`);
  console.error("[NetworkView] Unhandled rejection", reason || message);
});

setStatus("Booting up...");

const APP_VERSION = "2025-12-25-7";

const loadApp = async () => {
  try {
    await import(`./app.js?v=${APP_VERSION}`);
    setStatus("Loading app...");
  } catch (error) {
    try {
      const res = await fetch(`./app.js?v=${APP_VERSION}`, { cache: "no-store" });
      setStatus(`Failed to load app: ${error.message} (app.js ${res.status})`);
    } catch (fetchError) {
      setStatus(`Failed to load app: ${error.message} (${fetchError.message})`);
    }
  }
};

loadApp();
