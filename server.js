const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SESSION_FILE = path.join(DATA_DIR, "sessions.json");

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const seed = {
      settings: {
        storeName: process.env.STORE_NAME || "DELTA.KEYS",
        currency: process.env.CURRENCY || "INR"
      },
      products: [
        {
          id: "prod_delta",
          name: "DELTA SERVER",
          slug: "delta-server",
          description: "Premium access key with instant delivery.",
          active: true
        },
        {
          id: "prod_vip",
          name: "DELTA VIP",
          slug: "delta-vip",
          description: "VIP access for customers who want extended validity.",
          active: true
        }
      ],
      plans: [
        { id: "plan_7d", productId: "prod_delta", name: "7 DAYS", price: 200, active: true },
        { id: "plan_30d", productId: "prod_delta", name: "30 DAYS", price: 600, active: true },
        { id: "plan_90d", productId: "prod_delta", name: "90 DAYS", price: 899, active: true },
        { id: "plan_vip30", productId: "prod_vip", name: "VIP 30 DAYS", price: 699, active: true }
      ],
      keys: [],
      orders: []
    };
    writeJson(STORE_FILE, seed);
  }
  if (!fs.existsSync(SESSION_FILE)) writeJson(SESSION_FILE, {});
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}
function writeJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
function store() { return readJson(STORE_FILE); }
function saveStore(data) { writeJson(STORE_FILE, data); }
function sessions() { return readJson(SESSION_FILE) || {}; }
function saveSessions(data) { writeJson(SESSION_FILE, data); }
function id(prefix) {
  return prefix + "_" + crypto.randomBytes(6).toString("hex");
}
function now() { return new Date().toISOString(); }

function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const s = sessions()[token];
  if (!s || s.expiresAt < Date.now()) {
    return res.status(401).json({ error: "Admin authentication required." });
  }
  next();
}

ensureData();

/* Public store */
app.get("/api/store", (req, res) => {
  const db = store();
  const products = db.products.filter(p => p.active).map(p => ({
    ...p,
    plans: db.plans.filter(x => x.productId === p.id && x.active).map(x => ({
      ...x,
      stock: db.keys.filter(k => k.productId === p.id && k.planId === x.id && k.status === "available").length
    }))
  }));
  res.json({ settings: db.settings, products });
});

/* Orders */
app.post("/api/orders", (req, res) => {
  const { planId, quantity = 1, email = "" } = req.body || {};
  const qty = Math.max(1, Math.min(10, Number(quantity) || 1));
  const db = store();
  const plan = db.plans.find(p => p.id === planId && p.active);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const product = db.products.find(p => p.id === plan.productId && p.active);
  const available = db.keys.filter(k => k.productId === product.id && k.planId === plan.id && k.status === "available").length;
  if (available < qty) return res.status(409).json({ error: `Only ${available} key(s) are currently available.` });

  const order = {
    id: id("ord"),
    email: String(email).trim().slice(0, 160),
    productId: product.id,
    planId: plan.id,
    quantity: qty,
    amount: plan.price * qty,
    currency: db.settings.currency,
    status: "pending_payment",
    utr: "",
    keys: [],
    createdAt: now(),
    paidAt: null
  };
  db.orders.unshift(order);
  saveStore(db);
  res.status(201).json({ order: { ...order, productName: product.name, planName: plan.name } });
});

app.post("/api/orders/:orderId/submit-payment", (req, res) => {
  const db = store();
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.status === "paid") return res.json({ order });
  const utr = String(req.body?.utr || "").trim().slice(0, 80);
  if (!utr) return res.status(400).json({ error: "Enter your UTR / transaction reference." });
  order.utr = utr;
  order.status = "payment_submitted";
  order.paymentSubmittedAt = now();
  saveStore(db);
  res.json({ order });
});

app.post("/api/admin/orders/:orderId/approve", adminAuth, (req, res) => {
  const db = store();
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.status === "paid") return res.json({ order });
  if (!["payment_submitted", "pending_payment"].includes(order.status)) {
    return res.status(409).json({ error: "Order cannot be approved in its current state." });
  }
  const available = db.keys.filter(k => k.productId === order.productId && k.planId === order.planId && k.status === "available");
  if (available.length < order.quantity) return res.status(409).json({ error: "Not enough keys in inventory." });
  const selected = available.slice(0, order.quantity);
  selected.forEach(k => { k.status = "sold"; k.orderId = order.id; k.soldAt = now(); });
  order.keys = selected.map(k => k.value);
  order.status = "paid";
  order.paidAt = now();
  saveStore(db);
  res.json({ order });
});

app.get("/api/orders/:orderId", (req, res) => {
  const db = store();
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const product = db.products.find(p => p.id === order.productId);
  const plan = db.plans.find(p => p.id === order.planId);
  res.json({
    order: {
      ...order,
      productName: product?.name || "Unknown",
      planName: plan?.name || "Unknown"
    }
  });
});

/* Admin */
app.post("/api/admin/login", (req, res) => {
  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASSWORD || "change-this-password";
  if (req.body?.username !== user || req.body?.password !== pass) {
    return res.status(401).json({ error: "Invalid admin credentials." });
  }
  const token = crypto.randomBytes(32).toString("hex");
  const ss = sessions();
  ss[token] = { createdAt: Date.now(), expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
  saveSessions(ss);
  res.json({ token, expiresAt: ss[token].expiresAt });
});

app.post("/api/admin/logout", adminAuth, (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const ss = sessions();
  delete ss[token];
  saveSessions(ss);
  res.json({ ok: true });
});

app.get("/api/admin/me", adminAuth, (req, res) => res.json({ ok: true }));

app.get("/api/admin/data", adminAuth, (req, res) => {
  const db = store();
  res.json({
    settings: db.settings,
    products: db.products,
    plans: db.plans,
    stock: db.keys.map(k => ({ ...k, value: undefined })),
    orders: db.orders
  });
});

app.post("/api/admin/products", adminAuth, (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Product name is required." });
  const db = store();
  const p = { id: id("prod"), name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), description: String(req.body?.description || ""), active: true };
  db.products.push(p); saveStore(db); res.status(201).json({ product: p });
});

app.put("/api/admin/products/:id", adminAuth, (req, res) => {
  const db = store();
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  if (req.body?.name !== undefined) p.name = String(req.body.name).trim().slice(0, 80);
  if (req.body?.description !== undefined) p.description = String(req.body.description).slice(0, 300);
  if (req.body?.active !== undefined) p.active = Boolean(req.body.active);
  saveStore(db); res.json({ product: p });
});

app.delete("/api/admin/products/:id", adminAuth, (req, res) => {
  const db = store();
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  p.active = false;
  db.plans.filter(x => x.productId === p.id).forEach(x => x.active = false);
  saveStore(db); res.json({ ok: true });
});

app.post("/api/admin/plans", adminAuth, (req, res) => {
  const productId = String(req.body?.productId || "");
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const price = Number(req.body?.price);
  const db = store();
  if (!db.products.some(p => p.id === productId)) return res.status(400).json({ error: "Product not found." });
  if (!name || !Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Valid plan name and price are required." });
  const plan = { id: id("plan"), productId, name, price, active: true };
  db.plans.push(plan); saveStore(db); res.status(201).json({ plan });
});

app.put("/api/admin/plans/:id", adminAuth, (req, res) => {
  const db = store();
  const p = db.plans.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Plan not found." });
  if (req.body?.name !== undefined) p.name = String(req.body.name).trim().slice(0, 80);
  if (req.body?.price !== undefined) p.price = Math.max(0, Number(req.body.price) || 0);
  if (req.body?.active !== undefined) p.active = Boolean(req.body.active);
  saveStore(db); res.json({ plan: p });
});

app.post("/api/admin/keys", adminAuth, (req, res) => {
  const productId = String(req.body?.productId || "");
  const planId = String(req.body?.planId || "");
  const raw = String(req.body?.keys || "");
  const values = [...new Set(raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
  const db = store();
  const plan = db.plans.find(p => p.id === planId && p.productId === productId);
  if (!plan) return res.status(400).json({ error: "Product/plan combination is invalid." });
  if (!values.length) return res.status(400).json({ error: "Paste at least one key." });

  const existing = new Set(db.keys.map(k => k.value));
  const unique = values.filter(v => !existing.has(v));
  unique.forEach(value => db.keys.push({
    id: id("key"), productId, planId, value, status: "available", orderId: null, createdAt: now()
  }));
  saveStore(db);
  res.status(201).json({ added: unique.length, skippedDuplicates: values.length - unique.length });
});

app.get("/api/admin/stock", adminAuth, (req, res) => {
  const db = store();
  const stock = db.plans.map(plan => {
    const product = db.products.find(p => p.id === plan.productId);
    const available = db.keys.filter(k => k.planId === plan.id && k.status === "available").length;
    const sold = db.keys.filter(k => k.planId === plan.id && k.status === "sold").length;
    return { ...plan, productName: product?.name || "Unknown", available, sold };
  });
  res.json({ stock });
});

app.get("/api/admin/orders", adminAuth, (req, res) => {
  const db = store();
  res.json({
    orders: db.orders.map(o => ({
      ...o,
      productName: db.products.find(p => p.id === o.productId)?.name || "Unknown",
      planName: db.plans.find(p => p.id === o.planId)?.name || "Unknown"
    }))
  });
});

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.listen(PORT, () => console.log(`DELTA.KEYS running on http://localhost:${PORT}`));
