# Dompet A&A — versi PWA

Upgrade dari `dompet-50jt.html` yang sudah ada. Nama tampilan dan monogram
diganti jadi **Dompet A&A**, tapi kunci penyimpanan sengaja TIDAK ikut berubah. Seluruh fitur, rumus, tampilan,
dan data lama dipertahankan. Yang ditambahkan: PWA (bisa di-install, jalan
luring) dan sistem notifikasi keuangan.

## Isi paket

| Berkas | Wajib? | Fungsi |
|---|---|---|
| `index.html` | ya | Aplikasinya. Sudah lengkap sendiri — ikon dan manifest tertanam di dalamnya. |
| `sw.js` | untuk mode luring | Service Worker: menyimpan cangkang aplikasi supaya bisa dibuka tanpa internet. |
| `icon-192.png` `icon-512.png` `icon-maskable-512.png` | opsional | Dipakai Service Worker sebagai ikon notifikasi. |

## Cara memasang

Taruh keempat berkas di **satu folder yang sama**, lalu sajikan lewat
`https://` atau `localhost`. Contoh paling cepat:

```bash
cd folder-dompet
python3 -m http.server 8080
# buka http://localhost:8080/index.html
```

Untuk dipakai sehari-hari di HP, host di mana saja yang HTTPS (GitHub Pages,
Netlify, Cloudflare Pages, Nginx sendiri). Setelah dibuka, masuk
**Pengaturan → Aplikasi → Install aplikasi**.

Kalau `index.html` diganti nama atau dipindah ke sub-folder, manifest tetap
benar — alamatnya dibangun saat berjalan dari alamat halaman.

### Dibuka langsung lewat `file://`

Aplikasinya jalan penuh (semua data di localStorage), tapi Service Worker
tidak bisa didaftarkan — itu batasan browser, bukan bug. Pengaturan akan
menampilkan status `Perlu https` apa adanya.

## Data

- Kunci `dompet50jt:data` tidak berubah sama sekali, termasuk setelah ganti nama aplikasi. Transaksi, budget,
  target, recurring, salary, savings, dan settings lama terbaca apa adanya.
- Versi skema naik ke 3. `Store.migrate()` menggabung per-field, jadi berkas
  cadangan lama (tanpa blok notifikasi) tetap bisa diimpor. Tidak ada reset.
- Riwayat notifikasi disimpan **terpisah** di `dompet50jt:notif`, maksimal 60
  pesan. Berkas ekspor keuangan isinya persis seperti dulu.
- Service Worker tidak pernah menyentuh localStorage. Memperbarui versi tidak
  menghapus data.

## Pembaruan versi

Service Worker sengaja **tidak** memakai `skipWaiting()` otomatis. Versi baru
menunggu sampai ditekan **Pengaturan → Aplikasi → Muat ulang**, supaya tab yang
sedang dipakai tidak berganti versi di tengah pengisian form.

Kalau file diubah, naikkan `VERSION` di baris pertama `sw.js`.

## Batas notifikasi (apa adanya)

JavaScript browser biasa **tidak bisa menjamin** notifikasi terjadwal saat
aplikasi benar-benar tertutup. Yang dipakai di sini:

1. **Pasti jalan** — pemeriksaan saat aplikasi dibuka, kembali aktif
   (`visibilitychange`, `focus`), setiap ada perubahan data, dan tiap 10 menit
   selama aplikasi terbuka.
2. **Kalau browser mendukung** — Periodic Background Sync (umumnya hanya
   Chrome Android pada PWA terpasang) untuk pengingat harian saat tertutup.
   Service Worker hanya membaca satu catatan kecil dari IndexedDB: sakelar,
   jam pengingat, dan *tanggal* pengeluaran terakhir. Tidak ada nominal,
   kategori, atau catatan yang ikut.
3. **Belum ada** — push notification via server. Arsitekturnya sudah siap
   (`notificationclick` sudah ditangani di `sw.js`), tinggal menambah
   `pushsubscription` + backend kalau nanti dibutuhkan. Tidak ada implementasi
   palsu yang pura-pura ini sudah jalan.

Status sebenarnya selalu ditampilkan di Pengaturan → Aplikasi.

## Aturan notifikasi

Semua angka diambil dari fungsi yang sudah dipakai layar lain
(`statsFor`, `budgetStats`, `Calc`, `Goal`). Tidak ada data contoh.

| Aturan | Pemicu | Anti-spam |
|---|---|---|
| Pengingat transaksi | Lewat jam yang dipilih dan hari ini belum ada pengeluaran tercatat | 1× per hari |
| Pengingat menabung | Setelah tanggal 8, pertumbuhan saldo bulan ini < kebutuhan proporsional hari berjalan | 1× per pekan, berhenti kalau target tercapai |
| Peringatan budget | Total dan per-kategori di 70% / 90% | 1× per ambang per bulan, maksimal 2 kategori |
| Budget terlewati | Di atas 100% | 1× per bulan, prioritas CRITICAL |
| Pengeluaran tidak biasa | Total hari ini > 2,5× median harian 45 hari terakhir, minimal 10 hari berdata | 1× per hari |
| Ringkasan mingguan | Senin–Minggu pekan lalu, kalau ada transaksinya | 1× per minggu ISO |
| Review bulanan | 7 hari pertama bulan baru, kalau bulan lalu ada datanya | 1× per bulan |
| Progres target | Menyentuh 25 / 50 / 75 / 90% | sekali seumur target; kalau beberapa terlewat sekaligus hanya yang tertinggi dikirim |
| Target berisiko / on track | Dari `Goal.status()` | mengikuti pilihan Tidak / Mingguan / Bulanan |
| Target tercapai | `Calc.gap() === 0` | sekali; setelah ini pengingat menabung dan peringatan risiko berhenti |

Maksimal 3 pesan per pemeriksaan, diurutkan
CRITICAL → WARNING → SUCCESS → INFO. Mengganti nominal target akan mereset
milestone-nya.

## Hasil pengujian

147 assertion lewat jsdom, semuanya lolos: migrasi data v2 → v3, keenam layar
render, transaksi lama tetap muncul, tambah transaksi lewat sheet, edit budget,
pencarian, dark mode, ekspor/impor, reset, manifest, badge, pusat notifikasi,
tiap aturan notifikasi, dan anti-spam (10× pemeriksaan berturut-turut tidak
menghasilkan satu pun pesan ganda).
