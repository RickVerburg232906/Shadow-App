// Admin authentication check for admin pages
export function checkAdminAuth() {
  const isAdminOk = sessionStorage.getItem("admin_ok") === "1";
  const adminLevel = sessionStorage.getItem("admin_level") || "admin";
  
  if (!isAdminOk) {
    // Redirect to main page if not authenticated
    window.location.href = "index.html";
    return false;
  }
  
  // Set the body role based on admin level
  document.body.dataset.role = (adminLevel === "root") ? "rootadmin" : "admin";
  
  return true;
}

// Apply admin level restrictions to the UI
export function applyAdminLevel() {
  try {
    const lvl = sessionStorage.getItem("admin_level") || "admin";
    const adminView = document.getElementById("viewAdmin");
    if (!adminView) return;
    
    const cards = Array.from(adminView.querySelectorAll(".card"));
    if (lvl === "root") {
      // Hoofdadmin: toon alles
      cards.forEach(card => { 
        card.style.display = ""; 
        card.removeAttribute("hidden"); 
      });
      document.body.dataset.role = "rootadmin";
      
      // Show navigation for root admin
      const nav = document.querySelector(".subtabs");
      if (nav) nav.removeAttribute("hidden");
    } else {
      // Beperkte admin: alleen QR + Handmatig
      document.body.dataset.role = "admin";
      cards.forEach(card => {
        const id = card.id || "";
        const keep = (id === "qrScanCard") || (id === "manualRideCard");
        card.style.display = keep ? "" : "none";
        if (!keep) card.setAttribute("hidden", "hidden");
      });
      
      // Hide navigation for regular admin (they only have access to scan page)
      const nav = document.querySelector(".subtabs");
      if (nav) nav.setAttribute("hidden", "");
    }
  } catch (_) {}
}
