// Admin authentication check for admin pages
// `checkAdminAuth` removed during cleanup. Authentication gating is expected
// to be handled outside this module in the hosting application.

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
      
      // Show dropdown for root admin
      const dropdown = document.querySelector(".admin-nav-dropdown");
      if (dropdown) {
        dropdown.style.display = "";
        dropdown.removeAttribute("hidden");
      }
    } else {
      // Beperkte admin: QR + Handmatig + Lunch overzicht zichtbaar
      document.body.dataset.role = "admin";
      cards.forEach(card => {
        const id = card.id || "";
        // Lunch overzicht is nu ook zichtbaar voor normale admins
        const keep = (id === "qrScanCard") || (id === "manualRideCard") || (id === "cardLunchOverview") || (id === "cardPastRidesRegister");
        if (keep) {
          card.style.display = "block";
          card.removeAttribute("hidden");
        } else {
          card.style.display = "none";
          card.setAttribute("hidden", "hidden");
        }
      });
      
      // Hide navigation for regular admin (they only have access to scan page)
      const nav = document.querySelector(".subtabs");
      if (nav) nav.setAttribute("hidden", "");
      
      // Hide dropdown for regular admin
      const dropdown = document.querySelector(".admin-nav-dropdown");
      if (dropdown) {
        dropdown.style.display = "none";
        dropdown.setAttribute("hidden", "hidden");
      }
    }
  } catch (_) {}
}
