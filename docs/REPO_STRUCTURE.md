# REPO STRUCTURE - Bếp Sỉ F&B

Cấu trúc repo sẽ bám theo hướng frontend Vercel, backend VPS, DB Heroku Postgres.

```txt
F-B-Order/
├── apps/
│   ├── frontend/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── products/
│   │   │   ├── cart/
│   │   │   ├── checkout/
│   │   │   ├── orders/
│   │   │   ├── recipes/
│   │   │   ├── notifications/
│   │   │   ├── account/
│   │   │   └── admin/
│   │   ├── components/
│   │   │   ├── customer/
│   │   │   ├── admin/
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── clerk.ts
│   │   │   ├── onesignal.ts
│   │   │   └── pwa.ts
│   │   ├── public/
│   │   │   ├── manifest.webmanifest
│   │   │   ├── service-worker.js
│   │   │   ├── pwa-register.js
│   │   │   ├── pwa-install-button.js
│   │   │   ├── pwa-update-toast.js
│   │   │   ├── open-external-browser.js
│   │   │   ├── app-version.json
│   │   │   └── icons/
│   │   ├── types/
│   │   ├── package.json
│   │   └── .env.example
│   │
│   └── backend/
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── customers/
│       │   │   ├── products/
│       │   │   ├── categories/
│       │   │   ├── pricing/
│       │   │   ├── cart/
│       │   │   ├── orders/
│       │   │   ├── recipes/
│       │   │   ├── promotions/
│       │   │   ├── policies/
│       │   │   ├── notifications/
│       │   │   └── admin/
│       │   ├── common/
│       │   ├── db/
│       │   └── main.ts
│       ├── Dockerfile
│       ├── package.json
│       └── .env.example
│
├── db/
│   ├── migrations/
│   ├── seeds/
│   └── schema.sql
│
├── packages/
│   └── shared/
│       ├── types/
│       └── constants/
│
├── docs/
│   ├── FEATURES.md
│   ├── EXECUTION_PLAN.md
│   └── REPO_STRUCTURE.md
│
├── docker-compose.yml
├── README.md
└── .gitignore
```

## Ghi chú triển khai

- `apps/frontend`: chỉ chứa UI, PWA, gọi API.
- `apps/backend`: chứa business logic, xác thực Clerk token, xử lý giá, đơn, thông báo.
- `db`: chứa migration và seed data.
- `packages/shared`: chứa type dùng chung giữa frontend/backend.
- `docs`: chỉ giữ tài liệu ngắn để bám việc.

## Env frontend

```env
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_ONESIGNAL_APP_ID=
NEXT_PUBLIC_APP_NAME="Bếp Sỉ F&B"
```

## Env backend

```env
PORT=4000
DATABASE_URL=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
ONESIGNAL_APP_ID=
ONESIGNAL_REST_API_KEY=
FRONTEND_URL=
```

## Rule bảo mật

- Secret chỉ nằm ở backend hoặc dashboard deploy.
- Không đưa `CLERK_SECRET_KEY`, `ONESIGNAL_REST_API_KEY`, `DATABASE_URL` vào frontend.
- Frontend chỉ được dùng biến `NEXT_PUBLIC_*`.
