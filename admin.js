let TOKEN = localStorage.getItem("delta_admin_token") || "";
let DATA = null;

async function api(url, options={}) {
  const r = await fetch(url,{headers:{"Content-Type":"application/json",...(TOKEN?{"Authorization":"Bearer "+TOKEN}:{}),...(options.headers||{})},...options});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
async function login(){
  try{
    const data=await api("/api/admin/login",{method:"POST",body:JSON.stringify({username:loginUser.value,password:loginPass.value})});
    TOKEN=data.token;localStorage.setItem("delta_admin_token",TOKEN);openApp();
  }catch(e){loginMsg.className="err";loginMsg.textContent=e.message}
}
async function openApp(){
  try{await api("/api/admin/me");loginView.classList.add("hidden");appView.classList.remove("hidden");await refresh();}
  catch{localStorage.removeItem("delta_admin_token");TOKEN="";}
}
async function logout(){try{await api("/api/admin/logout",{method:"POST"})}catch{}localStorage.removeItem("delta_admin_token");location.reload()}
async function refresh(){
  DATA=await api("/api/admin/data");renderProducts();renderPlans();syncProducts();await renderStock();await renderOrders();
}
function showTab(name){["keys","products","orders"].forEach(x=>document.querySelector("#tab-"+x).classList.toggle("hidden",x!==name));document.body.classList.remove("menu-open")}
function syncProducts(){
  const opts=DATA.products.filter(p=>p.active).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  keyProduct.innerHTML=opts;planProduct.innerHTML=opts;syncPlans();
}
function syncPlans(){
  const p=DATA.products.find(x=>x.id===keyProduct.value)||DATA.products.find(x=>x.active);
  if(!p)return;keyProduct.value=p.id;keyProductName.value=p.name;
  keyPlan.innerHTML=DATA.plans.filter(x=>x.active&&x.productId===p.id).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
}
function renderProducts(){
  productList.innerHTML=DATA.products.map(p=>`<div class="list-row"><strong>${esc(p.name)}</strong><span>${esc(p.description)}</span><button onclick="disableProduct('${p.id}')">${p.active?"Disable":"Disabled"}</button></div>`).join("");
}
function renderPlans(){
  planList.innerHTML=DATA.plans.map(p=>{const prod=DATA.products.find(x=>x.id===p.productId);return `<div class="list-row"><strong>${esc(prod?.name||"")}</strong><span>${esc(p.name)} · ${Number(p.price).toLocaleString("en-IN")}</span><button onclick="togglePlan('${p.id}',${!p.active})">${p.active?"Disable":"Enable"}</button></div>`}).join("");
}
async function renderStock(){
  const d=await api("/api/admin/stock");
  stockTable.innerHTML=`<div class="stock-grid">${d.stock.map(x=>`<div class="stock-row"><strong>${esc(x.productName)}</strong><span>${esc(x.name)}</span><b>${x.available} available</b><small>${x.sold} sold</small></div>`).join("")}</div>`;
}
async function renderOrders(){
  const d=await api("/api/admin/orders");
  ordersTable.innerHTML=d.orders.length?d.orders.map(o=>`<div class="order-row"><strong>${esc(o.id)}</strong><span>${esc(o.productName)} · ${esc(o.planName)}</span><span>${o.status}${o.utr?` · UTR ${esc(o.utr)}`:""}</span>${o.status==="payment_submitted"?`<button onclick="approveOrder('${o.id}')">Approve & Deliver</button>`:""}<small>${new Date(o.createdAt).toLocaleString()}</small></div>`).join(""):"<p class='muted'>No orders yet.</p>";
}
async function uploadKeys(){
  try{
    const data=await api("/api/admin/keys",{method:"POST",body:JSON.stringify({productId:keyProduct.value,planId:keyPlan.value,keys:keyText.value})});
    keyMsg.className="msg";keyMsg.textContent=`Added ${data.added} key(s). ${data.skippedDuplicates} duplicate(s) skipped.`;
    keyText.value="";await refresh();
  }catch(e){keyMsg.className="msg err";keyMsg.textContent=e.message}
}
async function addProduct(){
  try{await api("/api/admin/products",{method:"POST",body:JSON.stringify({name:newProductName.value,description:newProductDesc.value})});newProductName.value="";newProductDesc.value="";await refresh()}
  catch(e){alert(e.message)}
}
async function addPlan(){
  try{await api("/api/admin/plans",{method:"POST",body:JSON.stringify({productId:planProduct.value,name:newPlanName.value,price:newPlanPrice.value})});newPlanName.value="";newPlanPrice.value="";await refresh()}
  catch(e){alert(e.message)}
}
async function disableProduct(id){try{await api("/api/admin/products/"+id,{method:"DELETE"});await refresh()}catch(e){alert(e.message)}}
async function togglePlan(id,active){try{await api("/api/admin/plans/"+id,{method:"PUT",body:JSON.stringify({active})});await refresh()}catch(e){alert(e.message)}}
if(TOKEN)openApp();

async function approveOrder(id){try{await api("/api/admin/orders/"+id+"/approve",{method:"POST"});await refresh()}catch(e){alert(e.message)}}
