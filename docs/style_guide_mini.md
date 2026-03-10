# Mini Style Guide

Panduan ringkas agar UI tetap konsisten saat fitur baru ditambahkan.

## 1. Prinsip Dasar

- Gunakan hirarki visual jelas: `section title -> heading -> support text`.
- Prioritaskan keterbacaan, bukan dekorasi berlebihan.
- Setiap halaman wajib punya state:
  - loading,
  - error,
  - empty,
  - success (jika relevan).

## 2. Spacing System

Gunakan skala Tailwind berikut:
- `2` (8px): jarak elemen kecil (ikon + teks).
- `3` (12px): antar field rapat.
- `4` (16px): jarak default antar komponen.
- `5` (20px) / `6` (24px): antar section utama.
- `8` (32px): jarak antar blok halaman besar.

Aturan:
- Card internal padding: `p-5` atau `p-6`.
- Gap antar card utama dalam halaman: `space-y-6`.

## 3. Color Tokens

Didefinisikan di `frontend/app/globals.css`:
- `--bg`, `--bg-soft`
- `--card`
- `--text`, `--muted`
- `--line`
- `--primary`, `--primary-soft`
- `--accent`

Gunakan semantic color:
- Primary action: teal (`bg-teal-700`, hover `bg-teal-800`).
- Error: red (`border-red-200 bg-red-50 text-red-700`).
- Warning: amber (`border-amber-200 bg-amber-50 text-amber-700`).
- Success: emerald/teal soft.

## 4. Typography

- Base font: `Manrope`.
- Numeric/technical text: `JetBrains Mono`.
- Heading utama: `text-2xl` atau `text-3xl`, `font-semibold`.
- Body utama: `text-sm text-slate-600`.
- Helper/caption: `text-xs text-slate-500`.

## 5. Component Rules

### 5.1 Card
- Gunakan class `app-card` untuk wrapper section.
- Hindari membuat card style custom tiap komponen jika bisa pakai token + utility yang sama.

### 5.2 Input
- Gunakan class `app-input` untuk text input.
- Semua input harus punya state focus yang jelas.

### 5.3 Button
- Primary button:
  - `bg-teal-700 text-white`
  - hover: `bg-teal-800`
- Secondary button:
  - `border border-slate-300 bg-white text-slate-700`
- Disabled state wajib:
  - `disabled:opacity-50 disabled:cursor-not-allowed`

### 5.4 Feedback State
- Error message pakai panel merah.
- Warning/requirement pakai panel amber.
- Success result pakai panel hijau/teal lembut.

## 6. Data Display

- Tabel:
  - Header uppercase kecil (`text-xs uppercase tracking-wide`).
  - Baris hover ringan (`hover:bg-slate-50/70`).
- KPI card:
  - Label kecil + angka besar + catatan ringkas.
- Chart:
  - tampilkan hanya jika data tersedia.

## 7. Responsiveness

- Desktop: sidebar kiri.
- Mobile: bottom navigation.
- Hindari horizontal overflow kecuali tabel.
- Gunakan `max-w-*` container untuk menjaga line length tetap nyaman.

## 8. Checklist Sebelum Merge UI

- [ ] Semua halaman punya loading/error/empty state yang jelas.
- [ ] Spacing antar section konsisten (`space-y-6`).
- [ ] Tidak ada warna random di luar token semantik.
- [ ] Aksi utama selalu terlihat jelas di viewport mobile.
- [ ] Build frontend lolos tanpa type error.
