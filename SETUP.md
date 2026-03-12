# SETUP

Panduan setup dari nol sampai deployment untuk stack:
- Frontend: Vercel (Next.js)
- Backend: Railway (FastAPI)
- Database: Railway PostgreSQL

## 1. Prasyarat

- Node.js 18+
- Python 3.10+
- Git

## 2. Clone dan Install Dependency

```bash
git clone <repo-url>
cd urban-issue-ai
```

### 2.1 Backend

```bash
cd backend
python -m venv venv
```

Aktifkan virtual environment:
- Windows:
```bash
venv\Scripts\activate
```
- macOS/Linux:
```bash
source venv/bin/activate
```

Install dependency:
```bash
pip install -r requirements.txt
```

### 2.2 Frontend

```bash
cd ../frontend
npm install
```

## 3. Setup Environment Variable

### 3.1 Backend (`backend/.env`)

```env
DATABASE_URL=sqlite:///./civic_reports.db
MODEL_PATH=../ai/cv_model/weights/model.pt
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=5
BACKEND_CORS_ORIGINS=http://localhost:3000
```

Catatan:
- Untuk local dev boleh pakai SQLite.
- Untuk production, gunakan PostgreSQL Railway.

### 3.2 Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 4. Menjalankan Local Development

### 4.1 Jalankan Backend

Dari folder `backend/`:
```bash
uvicorn app.main:app --reload --port 8000
```

API docs tersedia di:
- `http://localhost:8000/docs`

### 4.2 Jalankan Frontend

Dari folder `frontend/`:
```bash
npm run dev
```

Akses di:
- `http://localhost:3000`

## 5. Database Production (Railway PostgreSQL)

Gunakan Railway Managed Postgres.

Langkah ringkas:
1. Buat project di Railway.
2. Tambahkan service PostgreSQL.
3. Ambil `DATABASE_URL` dari Railway.
4. Set `DATABASE_URL` ke service backend FastAPI.

Contoh format:
```env
DATABASE_URL=postgresql+psycopg2://<user>:<pass>@<host>:<port>/<db>
```

## 6. Deployment Backend ke Railway

1. Buat service baru untuk backend dari repo ini.
2. Set root directory ke `backend/`.
3. Set start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

4. Set environment variables:
- `DATABASE_URL`
- `MODEL_PATH`
- `UPLOAD_DIR`

5. (Opsional tapi disarankan) Atur CORS backend agar hanya mengizinkan domain frontend Vercel.
   - Gunakan `BACKEND_CORS_ORIGINS=https://<frontend-vercel-domain>`

## 7. Deployment Frontend ke Vercel

1. Import repo ke Vercel.
2. Set root directory ke `frontend/`.
3. Tambahkan env variable:

```env
NEXT_PUBLIC_API_URL=https://<backend-railway-domain>
```

4. Deploy.

## 8. Smoke Test Setelah Deploy

- Buka frontend Vercel.
- Submit report baru dengan foto + lokasi.
- Pastikan data tampil di dashboard.
- Pastikan data tersimpan di PostgreSQL Railway.

## 9. Troubleshooting Cepat

- `CORS error`:
  - cek konfigurasi `allow_origins` di FastAPI.
- `API error 500`:
  - cek log Railway backend.
- `DB connection error`:
  - cek `DATABASE_URL` dan credential PostgreSQL.
- Map tidak muncul:
  - pastikan koneksi internet dan tile OpenStreetMap bisa diakses.
