# Nomina · Renace

App de **nómina + asistencia live Hikvision** para Renace Tech.

Une las funciones de:

- `asist_live` — terminales biométricos Hikvision DS-K1T321EFWX (ISAPI + HTTP Push)
- `wk_hr_payroll` (Nómina RENACE) — contratos, reglas salariales, payslips y lotes

## Stack

| Servicio | Rol |
|----------|-----|
| `web` | Dashboard Vite + React |
| `api` | API Node/Express + Prisma + Postgres |
| `hikvision` | Receptor HTTP Push de marcajes |
| `db` | PostgreSQL 16 |

## Dominio

`https://nomina.renace.tech` — Swarm Leader + Traefik (`RenaceNet`)

## Desarrollo local

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d db
cd api && npm i && npx prisma migrate dev && npm run dev
cd ../listener && npm i && npm run dev
cd ../web && npm i && npm run dev
```

## Despliegue (protocolo Renace)

En el Swarm Leader (`45.9.191.18`):

```bash
cd /opt/nomina && ./deploy.sh
```

## Hikvision Push URL

Configurar en el terminal (HTTP Listening):

```
https://nomina.renace.tech/hikvision/event?device_id=<ID>
```

## Repo

https://github.com/ExpertosTI/nomina
