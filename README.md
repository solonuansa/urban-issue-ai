# Urban Issue AI

Aplikasi pelaporan masalah kota berbasis AI untuk membantu warga melaporkan isu (contoh: jalan rusak, sampah) dan membantu tim operasional memprioritaskan penanganan.

## Deskripsi Singkat

Project ini menggabungkan:
- `Frontend Next.js` untuk form pelaporan dan dashboard monitoring.
- `Backend FastAPI` untuk menerima laporan, melakukan klasifikasi AI, menghitung urgency score, dan menyimpan data laporan.
- `Model PyTorch` untuk klasifikasi issue type dan severity (pipeline sederhana untuk MVP).

## Fitur Utama

- Submit laporan dengan foto, lokasi peta, dan tipe jalan.
- Geolocation picker dengan:
  - pencarian alamat,
  - GPS,
  - pin lokasi manual di peta.
- Klasifikasi AI otomatis:
  - `issue_type`,
  - `severity`,
  - `confidence`.
- Perhitungan urgency score dan priority label (`LOW`, `MEDIUM`, `HIGH`).
- Dashboard operasional:
  - ringkasan KPI,
  - distribusi prioritas,
  - filter laporan,
  - tabel laporan.
- State UX yang lebih lengkap (loading/error/empty states) untuk alur submit dan dashboard.

## Tech Stack

### Frontend
- Next.js 15 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Recharts
- Leaflet + React Leaflet

### Backend
- FastAPI
- SQLAlchemy
- Uvicorn
- Python Multipart

### AI / ML
- PyTorch
- Torchvision

### Database & Deployment
- PostgreSQL (Railway Managed Postgres) untuk production
- Railway untuk deploy backend FastAPI
- Vercel untuk deploy frontend Next.js

## Struktur Folder

```text
urban-issue-ai/
|-- frontend/
|-- backend/
|-- ai/
|-- archive/
|   `-- notebooks/
|-- docs/
|-- README.md
`-- SETUP.md
```

## Dokumentasi Tambahan

- Setup end-to-end dan deployment: [`SETUP.md`](./SETUP.md)
- Rencana implementasi: [`docs/development_plan.md`](./docs/development_plan.md)
- Style guide mini UI: [`docs/style_guide_mini.md`](./docs/style_guide_mini.md)
- Notebook training model: [`archive/README.md`](./archive/README.md)

## Demo Accounts (Local)

Saat backend berjalan, sistem otomatis membuat akun demo (jika belum ada):
- `admin.demo@urban-issue.ai` / `Demo12345!`
- `operator.demo@urban-issue.ai` / `Demo12345!`
- `citizen.demo@urban-issue.ai` / `Demo12345!`
