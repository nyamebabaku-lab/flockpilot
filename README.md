# FlockPilot

Poultry farm management: flocks, laying, growth, feed, vaccinations, inventory, workers, sales, payments, payroll and owner withdrawals. Works on any phone or computer browser, and daily records work without signal.

## Run it

```bash
npm run build
```

```bash
npm start
```

Open http://localhost:3000. Use `npm run dev` while changing code; offline mode only runs in the built version.

## Demo sign-in

The password for all demo accounts is `farm1234`. These are for local review only: replace them before going online.

| Role | Phone |
|---|---|
| Owner | 0240000001 |
| Manager | 0240000002 |
| Worker | 0240000003 |

## Payments

With no key set, payments use the built-in simulator and no real money moves. A payout account number ending in 99 simulates a failed transfer.

To use Paystack test mode, put your `sk_test_...` key in `.env` as `PAYSTACK_SECRET_KEY` and restart. Before going online, set the webhook URL in Paystack to `https://your-domain/api/webhooks/payments`,. The simulator refuses to run when `APP_URL` starts with https, so a public server takes no payments until a Paystack key is set.

## Online (Vercel and Neon)

This PC uses SQLite. Online, Vercel runs `npm run vercel-build`, which switches the schema to PostgreSQL, updates the database tables and creates the owner account on an empty database. Demo data is never added online.

Set these in the Vercel project:

| Variable | Value |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Added for you by the Neon integration |
| `SESSION_SECRET`, `SIMULATOR_SECRET` | Two different long random values |
| `OWNER_NAME`, `OWNER_PHONE`, `OWNER_PASSWORD` | The owner's sign-in; the password needs 10 or more characters |
| `PAYSTACK_SECRET_KEY` | Optional. Without it the live site takes no payments |

`APP_URL` is filled in from Vercel's address. Set it yourself only for a custom domain.

## Tests

```bash
npm test
```

With the server running, this attacks it directly as each role:

```bash
npm run test:roles
```

## Before real use

- Replace the demo accounts and data.
- Have an accountant confirm the SSNIT and PAYE rates in Settings.
- Have your vet confirm the vaccination schedule on the Health page.
