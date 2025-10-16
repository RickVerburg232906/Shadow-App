import { initMemberView } from "./member.js";
import { initAdminView } from "./admin.js";

const $ = (id) => document.getElementById(id);

const tabMember = $("tabMember");
const tabAdmin  = $("tabAdmin");
const viewMember = $("viewMember");
const viewAdmin  = $("viewAdmin");

function switchTo(which) {
  const isMember = which === "member";
  tabMember.classList.toggle("active", isMember);
  tabAdmin.classList.toggle("active", !isMember);
  viewMember.classList.toggle("active", isMember);
  viewAdmin.classList.toggle("active", !isMember);
  tabMember.setAttribute("aria-pressed", String(isMember));
  tabAdmin.setAttribute("aria-pressed", String(!isMember));
}

tabMember?.addEventListener("click", () => switchTo("member"));
tabAdmin?.addEventListener("click", () => switchTo("admin"));

initMemberView();
initAdminView();
