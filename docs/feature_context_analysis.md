# Analisis Fitur dan Konteks Proyek Urban Issue AI

## 1. Konteks Produk

Urban Issue AI adalah sistem pelaporan isu kota berbasis AI dengan dua kebutuhan utama:

1. `Citizen experience`: warga dapat melapor cepat dengan bukti foto + lokasi.
2. `Operations control`: tim operator dapat memprioritaskan, mengelola workflow, dan memantau SLA.

Dengan kata lain, produk ini bukan sekadar form pelaporan, tetapi platform `incident intake + triage + workflow + operational analytics`.

---

## 2. Kondisi Fitur Saat Ini (Current State)

### 2.1 Intake dan Klasifikasi

- Submit laporan dengan upload gambar, geolocation picker, dan konteks lokasi.
- Klasifikasi issue + severity dari CV service (dengan fallback heuristik).
- Scoring urgency dan priority label (`LOW/MEDIUM/HIGH`).
- Validasi upload file (tipe, ekstensi, size limit).

### 2.2 Auth dan Role

- Login/Register dengan JWT.
- Role dasar: `citizen`, `operator`, `admin`.
- Endpoint penting sudah diproteksi role.

### 2.3 Workflow Operasional

- Status lifecycle: `NEW -> IN_REVIEW -> IN_PROGRESS -> RESOLVED/REJECTED`.
- Assignment operator.
- Audit log status/assignment.
- SLA board untuk high-priority open tickets.

### 2.4 Dashboard & Observability Produk

- KPI dan chart prioritas.
- Trend incoming vs resolved 14 hari.
- Advanced metrics:
  - MTTR,
  - high-priority SLA breach,
  - aging backlog 7d+,
  - resolution rate 14d,
  - top issue types.
- Export analytics CSV.
- Search + pagination data report.

### 2.5 Notifikasi

- In-app notifications untuk assignment/status update/workflow.
- Notification center dengan filter, unread toggle, mark read/all read, pagination.
- Sidebar unread badge dengan polling berkala.

---

## 3. Penilaian Kematangan Fitur

### Kuat

- End-to-end flow sudah solid dari report submit hingga workflow operator.
- Fokus operasional sudah terasa (SLA, audit, analytics, assignment).
- Arsitektur web modern (FastAPI + Next.js) dan cukup extensible.

### Masih Risiko

1. `Model governance`: belum ada evaluasi model berkelanjutan (drift, dataset quality, threshold policy).
2. `Migration strategy`: masih bergantung lightweight migration startup, belum Alembic penuh.
3. `Realtime experience`: polling dipakai di beberapa area; belum event-driven (WebSocket/SSE).
4. `Notification delivery`: baru in-app, belum ke channel eksternal (email/WA/Telegram).
5. `Operational permission granularity`: role masih coarse-grained, belum per-feature permission matrix.

---

## 4. Gap Analisis dan Rekomendasi Perbaikan

## 4.1 Prioritas Tinggi (Sprint Berikutnya)

1. `Database migration formal (Alembic)`
- Kenapa: mencegah risiko schema drift di production.
- Output: migration scripts versioned, rollback strategy, deployment-safe schema changes.

2. `Report detail deep action hardening`
- Tambah validasi business rule lebih ketat di detail action (misal wajib note saat reject/resolved).
- Tambah visual status transition hints untuk operator.

3. `SLA policy configurability`
- Saat ini SLA high-coded.
- Buat configurable by env/DB per severity/priority.

4. `Notification UX maturity`
- Grouping by report dan by date.
- Mark as read otomatis saat detail report dibuka.

## 4.2 Prioritas Menengah

1. `External notification channel`
- Email atau WhatsApp untuk status kritikal.
- Template bilingual (ID/EN) untuk user-facing message.

2. `Advanced filtering & saved views`
- Simpan filter favorit operator.
- Preset view: `breached`, `unassigned`, `stale >7d`, `high unresolved`.

3. `SLA breach root-cause analytics`
- Breakdown breach by issue_type, assignee, wilayah.

## 4.3 Prioritas Strategis

1. `Model Ops (MLOps-lite)`
- Confidence calibration.
- Human override feedback loop.
- Label correction pipeline untuk retraining.

2. `Geo intelligence`
- Heatmap cluster berdasarkan area.
- Prioritization multiplier berbasis area criticality real (bukan hanya manual context).

3. `Performance & reliability`
- Caching query heavy metrics.
- Background jobs untuk perhitungan agregat.
- Structured logs + tracing.

---

## 5. Saran KPI Produk/Operasional

KPI yang sebaiknya dipantau mingguan:

1. `Median time to first operator action`
2. `MTTR by priority`
3. `% high-priority breached`
4. `Resolution rate 7d/14d`
5. `Assignment latency`
6. `False positive/negative AI` (via manual audit sample)

---

## 6. Rekomendasi Urutan Implementasi (Pragmatis)

1. Alembic migration + schema governance.
2. Harden workflow policy (mandatory reason, role constraints, endpoint consistency).
3. Notification UX polish + auto-read logic.
4. External notification integration.
5. MLOps baseline dan quality loop.

Urutan ini menjaga keseimbangan antara `stabilitas sistem`, `nilai operasional`, dan `kesiapan scale`.
