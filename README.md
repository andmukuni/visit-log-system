# Visit Log System

Secure, mobile-responsive visitor and vehicle management for reception desks and security gates. Replaces manual registers with searchable visit history, role-based access control, live occupancy, and management reports.

## Stack

- **Frontend:** React, Vite, Tailwind CSS, React Router
- **Backend:** Express, MySQL (PostgreSQL supported for remote demo seeding)
- **Auth:** Token-based sessions with RBAC across platform, organisation, site, and station scopes

## Quick start

```bash
cp .env.example .env
npm install
npm run server:dev   # terminal 1 — API on http://localhost:4000
npm run dev          # terminal 2 — UI on http://localhost:5173
```

Default admin login: `admin@template.dev` / `admin123`

Seed demo data (optional):

```bash
npm run seed:demo
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production frontend build |
| `npm run server:dev` | API with hot reload |
| `npm run start` | Production API + static assets |
| `npm test` | Run test suite |
| `npm run seed:demo` | Seed local demo organisation and users |

## Docker

```bash
docker compose up --build
```

## Documentation

- [Implementation status](./docs/IMPLEMENTATION_STATUS.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Scope of work](./scoopofwork/Visitor%20Log%20System%20Short%20Scope.md)

## License

Private — all rights reserved.
