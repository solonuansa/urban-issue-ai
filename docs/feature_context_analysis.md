# Analisis Fitur dan Konteks Proyek Urban Issue AI (Update 14 Maret 2026)

## 1. Konteks Produk

Urban Issue AI saat ini berkembang menjadi platform `incident intake + operational command + citizen safety intelligence`.

Fokus produk terbagi jelas:
1. `Citizen`: lapor isu cepat dan dapat insight keamanan area/rute.
2. `Operator/Admin`: triage, assignment, workflow, SLA, dan kebijakan risiko area.

---

## 2. Kondisi Fitur Saat Ini (Current State)

### 2.1 Intake, AI, dan Workflow Operasional

- Submit laporan dengan upload gambar + geolocation picker.
- Klasifikasi AI (`issue_type`, `severity`) + perhitungan urgency/priority (`LOW/MEDIUM/HIGH`).
- Lifecycle operasional: `NEW -> IN_REVIEW -> IN_PROGRESS -> RESOLVED/REJECTED`.
- Assignment operator + audit log status/assignment.
- SLA board high-priority.

### 2.2 Dashboard Operator/Admin

- KPI inti: total report, status breakdown, priority distribution.
- Analytics lanjutan: MTTR, SLA breach high, aging backlog, resolution rate, top issue.
- Export CSV analytics.
- Hotspot map operasional:
  - mode visual (`heatmap/circles`),
  - ranking hotspot,
  - detail report per bucket hotspot.
- `Risk policy editor` untuk admin (DB override):
  - bobot risiko,
  - threshold score/count,
  - validasi policy rule.

### 2.3 Citizen Safety Intelligence (fitur baru)

- Halaman `Safety Map` untuk citizen.
- Endpoint publik-auth citizen:
  - `/api/reports/public/hotspots`
  - `/api/reports/public/nearby-risk`
  - `/api/reports/public/hotspots/trend`
- Kapabilitas safety:
  - peta area rawan (default fokus `pothole`),
  - indikator rute aman berbasis hotspot corridor,
  - nearby risk berdasarkan lokasi saat ini (geolocation),
  - proactive high-risk alert + CTA lapor bahaya,
  - saran rute alternatif (waypoint + deep link Google Maps),
  - trend harian open/high-priority issue,
  - simpan rute favorit (localStorage).

### 2.4 Auth, Role, dan UX Akses

- JWT auth + role (`citizen`, `operator`, `admin`).
- Sidebar sudah menyesuaikan role (menu non-authorized disembunyikan).
- Aksi auth dipusatkan di top-right (minimalis).
- Login page di-redesign 2 kolom + quick demo account buttons.

### 2.5 Demo & Bootstrap Data

- Demo account otomatis saat startup backend (configurable via env).
- Script seed demo report hotspot:
  - `backend/scripts/seed_demo_data.py`
  - idempotent (hapus demo lama, generate ulang cluster).

---

## 3. Penilaian Kematangan Fitur

### Kuat

1. End-to-end operasi sudah matang dari intake sampai workflow/SLA.
2. Geo-intelligence sudah nyata dipakai citizen dan operator.
3. Policy risiko area sudah configurable (tidak hardcoded).
4. Demoability project sangat baik (akun demo + seeded data).

### Risiko yang Masih Ada

1. `Migration governance`: masih lightweight migration, belum Alembic penuh.
2. `Route safety model`: alternatif rute masih heuristik waypoint, belum graph routing engine.
3. `Real-time`: polling masih dominan, belum event stream (SSE/WebSocket).
4. `Data quality governance`: belum ada feedback loop label correction terstruktur.
5. `Geospatial scale`: query geo masih sederhana, belum index/geo-engine untuk skala kota besar.

---

## 4. Gap dan Rekomendasi Phase Berikutnya

### 4.1 Prioritas Tinggi (Phase Selanjutnya)

1. `Alembic migration formal`
- Stabilitas schema production, rollback aman, traceability perubahan DB.

2. `Geo query hardening`
- Tambah index lokasi + optimasi query hotspot/nearby.
- Siapkan path ke PostGIS/geo-optimized storage jika volume naik.

3. `Safety route quality upgrade`
- Integrasi engine rute nyata (OSRM/GraphHopper/Google Directions) agar alternatif rute berbasis jaringan jalan, bukan waypoint heuristik.

4. `Citizen alert policy`
- Aturan alert yang lebih tegas: kapan warning muncul, cooldown, severity-based messaging.

### 4.2 Prioritas Menengah

1. `External notification channel`
- Email/WA/Telegram untuk alert kritikal.

2. `Saved views untuk operator`
- Preset dashboard (breached/unassigned/stale/high unresolved).

3. `Hotspot segmentation by administrative area`
- Mapping bucket ke kecamatan/kelurahan untuk komunikasi lintas instansi.

### 4.3 Prioritas Strategis

1. `MLOps-lite`
- Monitoring confidence drift + audit false positive/false negative.

2. `Predictive safety`
- Prediksi lonjakan issue berdasarkan historis + cuaca/event (opsional jangka menengah).

3. `Reliability & observability`
- Structured logging, tracing, dan alerting operasional backend.

---

## 5. KPI yang Relevan Saat Ini

### Operasional
1. `MTTR by priority`
2. `% high-priority breached`
3. `assignment latency`

### Citizen Safety
1. `% sesi citizen yang membuka Safety Map`
2. `jumlah high-risk alert triggered`
3. `% user yang klik rute alternatif`
4. `jumlah laporan citizen dari CTA safety alert`

---

## 6. Rekomendasi Urutan Implementasi Praktis

1. Alembic + schema governance.
2. Geo query/index optimization.
3. Integrasi routing engine nyata.
4. Alert policy + delivery channel eksternal.
5. MLOps baseline untuk kualitas model dan safety scoring.
