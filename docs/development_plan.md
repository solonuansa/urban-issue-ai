# Development Plan - AI Civic Issue Reporting MVP (Vercel + Railway)

Dokumen ini adalah rencana implementasi praktis untuk stack berikut:
- Frontend: Next.js di Vercel
- Backend API + AI inference: FastAPI di Railway
- Database: PostgreSQL (Railway Managed Postgres)
- File image report: disarankan object storage (Cloudinary/S3-compatible). Untuk tahap awal masih bisa local `uploads/`.

## 1. Arsitektur yang Direkomendasikan

```
User Browser
  -> Vercel (Next.js frontend)
  -> Railway (FastAPI backend)
  -> Railway PostgreSQL (data report)
```

Catatan penting:
- Jangan gunakan SQLite untuk production karena tidak ideal untuk multi-instance.
- Gunakan `DATABASE_URL` Railway Postgres di backend.
- Simpan model `.pt` di backend image/container atau object storage terpisah.

## 2. Struktur Project

```
urban-issue-ai/
|-- frontend/                  # Next.js app (deploy ke Vercel)
|-- backend/                   # FastAPI app (deploy ke Railway)
|-- ai/                        # Kode/model AI
|-- archive/                   # Notebook training model
|   `-- notebooks/
`-- docs/
```

## 3. Environment Variables

### 3.1 Backend (`backend/.env` untuk local)

```env
DATABASE_URL=postgresql+psycopg2://postgres:password@localhost:5432/urban_issue_ai
MODEL_PATH=ai/cv_model/weights/model.pt
UPLOAD_DIR=uploads
```

Untuk Railway production:
- Gunakan `DATABASE_URL` dari service PostgreSQL Railway.
- Jika Railway memberikan URL `postgres://...`, normalisasi ke `postgresql://...` bila diperlukan.

### 3.2 Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Untuk Vercel production:
```env
NEXT_PUBLIC_API_URL=https://<nama-backend-railway>.up.railway.app
```

## 4. Rencana Implementasi 7 Hari

### Day 1 - Setup Dasar
1. Setup venv backend dan install `backend/requirements.txt`.
2. Setup frontend dependency.
3. Pastikan backend jalan di `localhost:8000` dan frontend di `localhost:3000`.

### Day 2 - Backend Core + Postgres
1. Konfigurasi SQLAlchemy menggunakan `DATABASE_URL` dari env.
2. Pastikan koneksi SQLite hanya untuk local fallback.
3. Uji endpoint:
   - `POST /api/reports/submit`
   - `GET /api/reports/`
   - `GET /api/reports/{id}`

### Day 3 - Integrasi Model CV
1. Gunakan model PyTorch sederhana dulu (`torchvision.models.resnet18`).
2. Bungkus inference di `backend/app/services/cv_service.py`.
3. Pastikan output minimal:
   - `issue_type`
   - `severity`
   - `confidence`

### Day 4 - Scoring & Response
1. Finalkan perhitungan urgency score.
2. Tambahkan repeat-report detection berbasis radius.
3. Simpan `urgency_score` + `priority_label` ke Postgres.

### Day 5 - Frontend End-to-End
1. Hubungkan `frontend/services/api.ts` ke backend Railway (via env).
2. Uji submit report dari UI.
3. Tampilkan hasil klasifikasi + badge + map.

### Day 6 - Dashboard
1. Ambil list report dari API.
2. Filter prioritas.
3. Chart distribusi HIGH/MEDIUM/LOW.

### Day 7 - Deploy
1. Deploy backend ke Railway.
2. Attach PostgreSQL Railway ke backend service.
3. Set env var backend (`DATABASE_URL`, `MODEL_PATH`, dll).
4. Deploy frontend ke Vercel.
5. Set env var frontend `NEXT_PUBLIC_API_URL` ke URL backend Railway.
6. Smoke test dari Vercel ke Railway.

## 5. Checklist Deploy Railway (Backend)

1. Root service: `backend/`
2. Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

3. Variables minimum:
- `DATABASE_URL`
- `MODEL_PATH`
- `UPLOAD_DIR`

4. Health check endpoint:
- `GET /`

## 6. Checklist Deploy Vercel (Frontend)

1. Project root: `frontend/`
2. Framework preset: Next.js
3. Environment variable:
- `NEXT_PUBLIC_API_URL`

## 7. Keputusan Database

Database yang dipakai: **PostgreSQL (Railway Managed Postgres)**.

Alasan:
- Stabil untuk production dan multi-instance.
- Cocok untuk query dashboard/filtering.
- Mudah diintegrasikan dengan SQLAlchemy.
- Lebih aman dibanding SQLite untuk deployment cloud.

## 8. Catatan Penyimpanan Gambar

Untuk production, disarankan pindah dari local `uploads/` ke object storage agar file tidak hilang saat container restart/redeploy.

Opsi yang umum:
- Cloudinary (paling cepat)
- AWS S3 / Cloudflare R2 (lebih fleksibel)

## 9. Testing Minimum Sebelum Go-Live

- Submit report sukses dari frontend Vercel ke backend Railway.
- Data report tersimpan di PostgreSQL.
- Dashboard menampilkan data terbaru.
- Error handling API terlihat jelas di frontend.
- CORS backend hanya mengizinkan domain Vercel production.
