# DELTA.KEYS

A complete starter for a digital key store with:

- Responsive customer storefront
- Product + plan browsing
- Cart and checkout flow
- Order lookup
- Automatic inventory reservation/delivery after a successful demo payment
- Admin login
- Product creation/editing
- Plan creation/editing
- Bulk key upload, one key per line
- Inventory counts
- Orders and delivered keys
- JSON-file persistence (simple deployment-friendly starter)

## Run locally

1. Install Node.js 18+.
2. Copy `.env.example` to `.env`.
3. Change `ADMIN_PASSWORD` and `SESSION_SECRET`.
4. Run:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Admin: `http://localhost:3000/admin.html`

## Demo payment

The checkout currently uses a **demo payment confirmation** endpoint so the complete store can be tested without a payment provider.

For production, replace the demo confirmation with your payment gateway's server-side verification/webhook. Do not trust a client-side "paid" flag.

## Data

The app creates these files automatically in `data/`:

- `store.json`
- `sessions.json`

For production, move persistence to PostgreSQL/MySQL/Redis and use a proper session store.

## API overview

Public:
- `GET /api/store`
- `POST /api/orders`
- `POST /api/orders/:id/demo-pay`
- `GET /api/orders/:id`

Admin:
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `POST /api/admin/plans`
- `PUT /api/admin/plans/:id`
- `POST /api/admin/keys`
- `GET /api/admin/stock`
- `GET /api/admin/orders`

## Production checklist

- Use HTTPS.
- Set a strong admin password and session secret.
- Put the app behind a reverse proxy.
- Add rate limiting, CSRF protection, and audit logging.
- Replace JSON persistence with a real database.
- Integrate a payment provider and verify webhooks server-side.
- Add email/Discord delivery if desired.
- Only sell keys you are authorized to distribute.
