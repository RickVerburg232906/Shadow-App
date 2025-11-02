import{i as z,d as T,a as I,g as w,s as j,b as B}from"./main-BdMzd3JJ.js";import{c as R,a as N}from"./auth-j86TSB5S.js";R();N();z();const k=T(I,"globals","lunch");let C=null;async function b(a,e){clearTimeout(C),C=setTimeout(async()=>{try{await j(k,{vastEten:a,keuzeEten:e,updatedAt:B()},{merge:!0}),console.log("Lunch data opgeslagen")}catch(t){console.error("Fout bij opslaan lunch data:",t)}},500)}function g(){const a=Array.from(i.querySelectorAll("input")).map(t=>t.value.trim()).filter(Boolean),e=Array.from(u.querySelectorAll("input")).map(t=>t.value.trim()).filter(Boolean);return{vastItems:a,keuzeItems:e}}const l=a=>document.getElementById(a),d=l("lunchSchedule"),y=l("btnLunchCreate"),E=l("btnLunchSave"),f=l("btnLunchExportCsv"),i=l("vastEtenList"),x=l("btnAddVastEten");let S=0;function p(a=""){const e=document.createElement("div");e.className="vast-eten-row",e.style.cssText=`
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 12px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.2s ease;
        `,e.addEventListener("mouseenter",()=>{e.style.background="rgba(255, 255, 255, 0.04)",e.style.borderColor="rgba(255, 255, 255, 0.1)"}),e.addEventListener("mouseleave",()=>{e.style.background="rgba(255, 255, 255, 0.02)",e.style.borderColor="rgba(255, 255, 255, 0.05)"});const t=document.createElement("input");t.type="text",t.placeholder="🥖 Bijv: brood, beleg, fruit, drankjes",t.value=a,t.style.cssText="flex: 1; padding: 10px 14px; font-size: 15px;",t.dataset.id=S++,t.addEventListener("input",()=>{const{vastItems:r,keuzeItems:s}=g();b(r,s)});const n=document.createElement("button");return n.type="button",n.innerHTML="✕",n.style.cssText=`
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          transition: all 0.2s ease;
          min-width: 44px;
        `,n.addEventListener("mouseenter",()=>{n.style.background="rgba(239, 68, 68, 0.2)",n.style.borderColor="rgba(239, 68, 68, 0.4)"}),n.addEventListener("mouseleave",()=>{n.style.background="rgba(239, 68, 68, 0.1)",n.style.borderColor="rgba(239, 68, 68, 0.2)"}),n.addEventListener("click",()=>{e.style.transform="scale(0.95)",e.style.opacity="0",setTimeout(()=>{e.remove();const{vastItems:r,keuzeItems:s}=g();b(r,s)},200)}),e.appendChild(t),e.appendChild(n),e}(async()=>{try{const a=await w(k);if(a.exists()){const e=a.data(),t=Array.isArray(e.vastEten)?e.vastEten:[];t.length>0?t.forEach(n=>i.appendChild(p(n))):i.appendChild(p())}else i.appendChild(p())}catch(a){console.error("Fout bij laden vast eten:",a),i.appendChild(p())}})();x==null||x.addEventListener("click",()=>{i.appendChild(p())});const u=l("keuzeEtenList"),L=l("btnAddKeuzeEten");let q=0;function m(a=""){const e=document.createElement("div");e.className="keuze-eten-row",e.style.cssText=`
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 12px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          transition: all 0.2s ease;
        `,e.addEventListener("mouseenter",()=>{e.style.background="rgba(255, 255, 255, 0.04)",e.style.borderColor="rgba(255, 255, 255, 0.1)"}),e.addEventListener("mouseleave",()=>{e.style.background="rgba(255, 255, 255, 0.02)",e.style.borderColor="rgba(255, 255, 255, 0.05)"});const t=document.createElement("input");t.type="text",t.placeholder="🍴 Bijv: vegetarisch, halal, vegan, glutenvrij",t.value=a,t.style.cssText="flex: 1; padding: 10px 14px; font-size: 15px;",t.dataset.id=q++,t.addEventListener("input",()=>{const{vastItems:r,keuzeItems:s}=g();b(r,s)});const n=document.createElement("button");return n.type="button",n.innerHTML="✕",n.style.cssText=`
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          transition: all 0.2s ease;
          min-width: 44px;
        `,n.addEventListener("mouseenter",()=>{n.style.background="rgba(239, 68, 68, 0.2)",n.style.borderColor="rgba(239, 68, 68, 0.4)"}),n.addEventListener("mouseleave",()=>{n.style.background="rgba(239, 68, 68, 0.1)",n.style.borderColor="rgba(239, 68, 68, 0.2)"}),n.addEventListener("click",()=>{e.style.transform="scale(0.95)",e.style.opacity="0",setTimeout(()=>{e.remove();const{vastItems:r,keuzeItems:s}=g();b(r,s)},200)}),e.appendChild(t),e.appendChild(n),e}(async()=>{try{const a=await w(k);if(a.exists()){const e=a.data(),t=Array.isArray(e.keuzeEten)?e.keuzeEten:[];t.length>0?t.forEach(n=>u.appendChild(m(n))):u.appendChild(m())}else u.appendChild(m())}catch(a){console.error("Fout bij laden keuze eten:",a),u.appendChild(m())}})();L==null||L.addEventListener("click",()=>{u.appendChild(m())});y==null||y.addEventListener("click",()=>{const a=l("lunchDays").value.trim(),e=l("lunchSlots").value.trim();if(!a||!e){alert("Vul dagen en tijdsloten in.");return}const t=a.split(",").map(s=>s.trim()).filter(Boolean),n=e.split(",").map(s=>s.trim()).filter(Boolean);d.innerHTML="",d.style.display="grid",d.style.gridTemplateColumns=`150px repeat(${t.length}, 1fr)`,d.style.gap="8px";const r=document.createElement("div");r.className="row header",r.appendChild(document.createElement("div"));for(const s of t){const o=document.createElement("div");o.textContent=s,o.className="cell head",r.appendChild(o)}d.appendChild(r);for(const s of n){const o=document.createElement("div");o.className="row";const c=document.createElement("div");c.textContent=s,c.className="cell head",o.appendChild(c);for(const A of t){const v=document.createElement("div");v.className="cell";const h=document.createElement("input");h.type="text",h.placeholder="Naam",v.appendChild(h),o.appendChild(v)}d.appendChild(o)}document.getElementById("cardLunchAssign").hidden=!1,document.getElementById("cardLunchExport").hidden=!1});E==null||E.addEventListener("click",()=>{alert("Lunchschema opgeslagen (client-side voorbeeld).")});f==null||f.addEventListener("click",()=>{const e=Array.from(d.querySelectorAll(".row")).map(s=>Array.from(s.querySelectorAll(".cell")).map(o=>{const c=o.querySelector("input");return'"'+(c?c.value:o.textContent||"").replaceAll('"','""')+'"'}).join(",")).join(`
`),t=new Blob([e],{type:"text/csv;charset=utf-8;"}),n=URL.createObjectURL(t),r=document.createElement("a");r.href=n,r.download="lunchschema.csv",r.click(),URL.revokeObjectURL(n)});
