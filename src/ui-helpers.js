// Shared UI helpers: selector, formatting and simple error/loading UI handlers
export function $(id) {
  return document.getElementById(id);
}

export function fullNameFrom(docData) {
  const tussen = (docData?.["Tussen voegsel"] || "").toString().trim();
  const parts = [
    (docData?.["Voor naam"] || "").toString().trim(),
    docData?.["Voor letters"] ? `(${(docData["Voor letters"]+"").trim()})` : "",
    tussen ? tussen : "",
    (docData?.["Naam"] || docData?.["name"] || docData?.["naam"] || "").toString().trim()
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function showError(message, isWarning = false, errorBoxId = "error") {
  const errBox = $(errorBoxId);
  if (!errBox) return;
  errBox.textContent = message;
  errBox.style.display = "block";
  errBox.style.color = isWarning ? "#fbbf24" : "#fca5a5";
}

export function hideError(errorBoxId = "error") {
  const errBox = $(errorBoxId);
  if (errBox) errBox.style.display = "none";
}

export function showLoading(loadingIndicatorId = "loadingIndicator") {
  const loadingIndicator = $(loadingIndicatorId);
  if (loadingIndicator) loadingIndicator.style.display = "flex";
}

export function hideLoading(loadingIndicatorId = "loadingIndicator") {
  const loadingIndicator = $(loadingIndicatorId);
  if (loadingIndicator) loadingIndicator.style.display = "none";
}
