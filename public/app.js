let STORE = null;

async function api(url, options={}) {
  const r = await fetch(url, {headers: {"Content-Type":"application/json", ...(options.headers||{})}, ...options});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
function money(n, currency) {
  try { return new Intl.NumberFormat("en-IN",{style:"currency",currency:currency||"INR",maximumFractionDigits:0}).format(n); }
  catch { return `${currency||"INR"} ${n}`; }
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
async function loadStore(){
  STORE = await api("/api/store");
  const grid = document.querySelector("#productsGrid");
  document.querySelector("#storeStatus").textContent = `${STORE.products.length} products`;
  grid.innerHTML = STORE.products.map(p => `
    <article class="product-card">
      <div class="eyebrow">PRODUCT</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.description || "Digital access key with instant delivery.")}</p>
      ${p.plans.map(x => `
        <div class="plan">
          <div><div class="plan-name">${esc(x.name)}</div><div class="stock">${x.stock > 0 ? `${x.stock} available` : "Out of stock"}</div></div>
          <div class="price">${money(x.price, STORE.settings.currency)}</div>
          <button class="buy" ${x.stock<1?"disabled":""} onclick="openCheckout('${x.id}')">${x.stock<1?"Out of stock":"Buy now"}</button>
        </div>`).join("")}
    </article>`).join("");
}
function openCheckout(planId){
  const plan = STORE.products.flatMap(p=>p.plans.map(x=>({...x,product:p}))).find(x=>x.id===planId);
  if(!plan) return;
  document.querySelector("#modal").classList.remove("hidden");
  document.querySelector("#modalBody").innerHTML = `
    <div class="eyebrow">CHECKOUT</div><h2>${esc(plan.product.name)}</h2>
    <p class="muted">${esc(plan.name)} · ${money(plan.price,STORE.settings.currency)} each</p>
    <div class="field"><label>EMAIL (OPTIONAL)</label><input id="email" type="email" placeholder="you@example.com"></div>
    <div class="field"><label>QUANTITY</label><input id="qty" type="number" min="1" max="10" value="1"></div>
    <div class="summary"><strong>Total</strong><span style="float:right" id="total">${money(plan.price,STORE.settings.currency)}</span></div>
    <div class="notice">Demo checkout is enabled in this starter. Connect your payment provider before accepting real payments.</div>
    <button class="buy full" onclick="createOrder('${plan.id}')">Continue to payment</button>`;
  document.querySelector("#qty").addEventListener("input",()=> {
    let q=Math.max(1,Math.min(10,Number(document.querySelector("#qty").value)||1));
    document.querySelector("#qty").value=q;
    document.querySelector("#total").textContent=money(plan.price*q,STORE.settings.currency);
  });
}
function closeModal(){document.querySelector("#modal").classList.add("hidden")}
async function createOrder(planId){
  try{
    const qty=Math.max(1,Math.min(10,Number(document.querySelector("#qty").value)||1));
    const email=document.querySelector("#email").value;
    const data=await api("/api/orders",{method:"POST",body:JSON.stringify({planId,quantity:qty,email})});
    showPayment(data.order);
  }catch(e){alert(e.message)}
}
function upiLink(app, order){
  const pa = "8590887093@fam";
  const pn = "DELTA.KEYS";
  const params = new URLSearchParams({pa,pn,am:Number(order.amount).toFixed(2),cu:"INR",tn:`DELTA.KEYS ${order.id}`});
  if(app === "gpay") return `tez://upi/pay?${params.toString()}`;
  if(app === "phonepe") return `phonepe://pay?${params.toString()}`;
  return `upi://pay?${params.toString()}`;
}
function showPayment(order){
  document.querySelector("#modalBody").innerHTML=`
    <div class="eyebrow">ORDER ${esc(order.id)}</div><h2>Pay with UPI</h2>
    <p class="muted">${esc(order.productName)} · ${esc(order.planName)} · <strong>${money(order.amount,order.currency)}</strong></p>
    <div class="upi-actions">
      <a class="upi-btn gpay" href="${upiLink("gpay",order)}">🟢 Pay with Google Pay</a>
      <a class="upi-btn phonepe" href="${upiLink("phonepe",order)}">🔵 Pay with PhonePe</a>
    </div>
    <div class="qr-box">
      <div class="qr-title">OR SCAN UPI QR</div>
      <img src="/upi-qr.jpg" alt="UPI QR code">
      <div class="qr-note">Scan with Google Pay or PhonePe and pay <strong>${money(order.amount,order.currency)}</strong>.</div>
      <div class="upi-id">UPI ID: 8590887093@fam</div>
    </div>
    <div class="notice">After payment, enter the UTR / transaction reference below. Your key is released after the payment is verified.</div>
    <div class="field"><label>UTR / TRANSACTION ID</label><input id="utr" maxlength="80" placeholder="Enter payment reference"></div>
    <button class="buy full" onclick="submitPayment('${order.id}')">I HAVE PAID — SUBMIT UTR</button>`;
}
async function submitPayment(orderId){
  try{
    const utr=document.querySelector("#utr").value.trim();
    const data=await api(`/api/orders/${orderId}/submit-payment`,{method:"POST",body:JSON.stringify({utr})});
    document.querySelector("#modalBody").innerHTML=`
      <div class="eyebrow">PAYMENT SUBMITTED</div><h2>Verification pending</h2>
      <p class="muted">Order ${esc(data.order.id)}</p>
      <div class="notice">Your UTR has been submitted. Once the payment is verified, your key will be released. Keep your order ID for support.</div>
      <button class="btn full" onclick="closeModal()">Done</button>`;
  }catch(e){alert(e.message)}
}

loadStore().catch(e=>document.querySelector("#storeStatus").textContent=e.message);
