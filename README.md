# KartuRT Monitoring

Dasbor publik dan proyek Vercel terpisah untuk melihat keterjangkauan HTTP Production dan UAT KartuRT.

- GitHub Actions menjalankan GET tanpa kredensial ke kedua homepage pada menit 13 dan 43 setiap jam. Respons diukur hingga header, tanpa membaca halaman atau mengikuti redirect.
- UP berarti HTTP 2xx. DOWN berarti kegagalan koneksi, timeout 10 detik, atau respons HTTP gagal. UNKNOWN mencakup Vercel Authentication, HTTP 401/403, redirect, pembatasan HTTP 429, dan data yang berumur lebih dari 75 menit.
- Uptime adalah persentase sampel UP dari seluruh sampel UP dan DOWN selama tujuh hari. UNKNOWN, keterlambatan, dan celah pemeriksaan dikeluarkan dari perhitungan. Gangguan dimulai pada sampel DOWN pertama dan dianggap pulih pada sampel UP berikutnya.
- Dasbor membaca riwayat publik dari cabang `status-data` dan memuat ulang data setiap menit. Tidak ada database, token untuk pengunjung, maupun akses ke jalur privat, database, login, atau data warga. Jadwal GitHub Actions dapat terlambat. Pantau tab Actions bila pemeriksaan otomatis berhenti.

## Menjalankan di komputer lokal

Gunakan Node.js 24. Jalankan `npm ci`, lalu `npm run dev`. Hasil pemeriksaan dapat diuji dengan `npm test`, build dengan `npm run build`, dan satu pemeriksaan homepage dengan `npm run monitor`. Pemeriksaan lokal menyimpan hasil di `.status/` dan tidak menerbitkan data. Dasbor lokal membaca feed publik yang sama dengan dasbor Vercel.

Untuk memicu pemeriksaan yang menerbitkan riwayat, pilih **Actions → Periksa ketersediaan HTTP → Run workflow** pada repo ini. Cabang `status-data` menyimpan riwayat aktif tujuh hari dalam `status.json`. Commit lama cabang tersebut hanya berisi hasil HTTP publik.

## Notifikasi gangguan dan pemulihan

Opsi notifikasi Issue GitHub dinonaktifkan secara bawaan. Untuk mengaktifkannya, nyalakan **Issues** pada repo monitoring, lalu buat repository variable `ENABLE_INCIDENT_ISSUES` bernilai `true` di **Settings → Secrets and variables → Actions → Variables**. Akun yang ingin menerima notifikasi perlu memilih **Watch → Custom → Issues** di repo ini dan mengatur pengiriman di preferensi GitHub. Issue dan waktunya terlihat publik. UNKNOWN tidak membuat atau menutup Issue. Tidak dibutuhkan token tambahan, alamat penerima, atau pengaturan aplikasi KartuRT.

## Google Search Console

Jika verifikasi pencarian dibutuhkan, tambahkan properti URL-prefix untuk alamat dasbor ini. Gunakan metode tag HTML dan pasang meta tag verifikasi yang diberikan Search Console di `index.html`, lalu deploy. Kirim `sitemap.xml` dari properti tersebut setelah verifikasi.
