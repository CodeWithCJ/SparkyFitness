<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <a href="README_fr.md">Français</a> ·
  <a href="README_de.md">Deutsch</a> ·
  <a href="README_es.md">Español</a> ·
  <a href="README_it.md">Italiano</a> ·
  <a href="README_ru.md">Русский</a> ·
  <a href="README_pt-BR.md">Português (Brasil)</a> ·
  <a href="README_nl.md">Nederlands</a> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <b>Bahasa Indonesia</b>
</p>

# SparkyFitness

Alternatif self-hosted yang mengutamakan privasi untuk MyFitnessPal, Flo, Hevy, Shotsy, dan lainnya. Lacak nutrisi, olahraga, metrik tubuh, dan data kesehatan sambil tetap memegang kendali penuh atas data Anda.
<img width="5120" height="2880" alt="gambar" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness adalah platform pelacakan kebugaran self-hosted yang terdiri dari:

- Server backend (API + penyimpanan data)
- Frontend berbasis web
- Aplikasi seluler native untuk iOS dan Android

Platform ini menyimpan dan mengelola data kesehatan di infrastruktur yang Anda kendalikan, tanpa bergantung pada layanan pihak ketiga.

## Fitur Utama

- Pelacakan nutrisi, olahraga, hidrasi, tidur, puasa, suasana hati, dan ukuran tubuh
- Penetapan target dan check-in harian
- Grafik interaktif dan laporan jangka panjang
- Beberapa profil pengguna dan akses keluarga
- Tema terang dan gelap
- OIDC, TOTP, Passkey, MFA, dll.

## Perbandingan SparkyFitness

**SparkyFitness bersifat source-available, bukan open source** — [lisensinya](../../LICENSE) bersifat non-komersial dan memerlukan izin untuk penggunaan komersial.

Sebagian besar aplikasi hanya melakukan satu hal. Satu aplikasi nutrisi yang bagus berharga $40–$100 per tahun; untuk mencakup semua yang dicakup SparkyFitness, Anda butuh tiga atau empat langganan per orang, dan tetap tidak ada satu laporan pun yang menyatukan semuanya. SparkyFitness melakukannya dalam satu aplikasi, gratis, untuk seluruh anggota rumah tangga.

<sub>Harga resmi di AS, 14 Agustus 2026. [Rincian biaya lengkap →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Self-hosted, data tetap milik Anda | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tanpa langganan, tanpa iklan | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Nutrisi, latihan kekuatan, tidur, puasa, siklus & obat dalam satu tempat\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Riwayat lengkap & laporan rentang tanggal kustom | ✅ gratis | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Sinkronisasi perangkat wearable & platform kesehatan | ✅ 8+ layanan | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Berbagi dengan keluarga dengan izin terperinci | ⭐ 7 izin | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Impor CSV & ekspor data gratis | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| Server MCP + gunakan LLM Anda sendiri | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ unggulan &nbsp;•&nbsp; ✅ didukung &nbsp;•&nbsp; 🟡 sebagian &nbsp;•&nbsp; 💰 hanya paket berbayar &nbsp;•&nbsp; ❌ tidak didukung

<sub>\* Tahapan tidur, HRV, dan gula darah diimpor dari jam tangan, ponsel, atau alat ukur Anda. SparkyFitness menyimpan, menganalisis, dan menampilkannya dalam grafik, bukan mengukurnya sendiri.</sub>

> **Tabel ini ditulis oleh proyek yang sedang dibandingkan, jadi bacalah dengan mempertimbangkan hal tersebut.** Diperiksa pada 14 Agustus 2026 berdasarkan dokumentasi resmi, repositori, dan halaman toko aplikasi; sebagian informasinya mungkin sudah usang. Jika ada sel yang salah atau tidak adil terhadap proyek lain, [buka issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — koreksi yang membuat SparkyFitness terlihat *lebih buruk* pun sama-sama kami sambut.

**[Lihat perbandingan lengkapnya →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 aplikasi dari kategori self-hosted, nutrisi, spesialis, dan ekosistem perangkat, beserta di mana masing-masing mengungguli kami.

## Integrasi Kesehatan & Perangkat

SparkyFitness dapat menyinkronkan data dari berbagai platform kesehatan dan kebugaran:

- **Apple Health** (iOS)
- **Google Health Connect** (Android)
- **Google Health API** 
- **Fitbit**
- **Garmin Connect**
- **Withings**
- **Polar Flow** 
- **Oura**
- **Hevy**
- **OpenFoodFacts**
- **USDA**
- **Fatsecret**
- **Nutritionix**
- **Mealie**
- **Tandoor**
- **Strava** (diuji sebagian)
- **COROS**
- **Norish**
- **Yazio** (menggunakan API tidak resmi)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Integrasi secara otomatis menyinkronkan data aktivitas seperti langkah, sesi latihan, dan tidur, beserta metrik kesehatan seperti berat badan dan ukuran tubuh, ke server SparkyFitness Anda.

## Fitur AI Opsional (Beta)

SparkyAI menyediakan antarmuka percakapan untuk mencatat data dan meninjau kemajuan.

- Catat makanan, olahraga, statistik tubuh, dan langkah melalui chat
- Unggah foto makanan untuk pencatatan makanan otomatis
- Menyimpan riwayat percakapan untuk pertanyaan lanjutan

Catatan: Fitur AI saat ini masih dalam tahap beta.

## Instalasi

Pilih salah satu dari dua cara untuk menjalankan SparkyFitness:

### 1. Self-Hosted

Jalankan server SparkyFitness dalam hitungan menit menggunakan Docker Compose:

```bash
# 1. Buat folder baru
mkdir sparkyfitness && cd sparkyfitness

# 2. Unduh docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Siapkan konfigurasi .env Anda (Pilih salah satu opsi):
# Opsi A (Disarankan): Buat .env kustom dengan kunci aman sekali klik di browser:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Opsi B: Templat minimal — 5 nilai, sisanya memakai nilai bawaan
# yang sudah diterapkan docker-compose. Cukup untuk sebagian besar instalasi self-hosted.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Opsi C: Referensi lengkap — setiap variabel yang didukung, dikomentari beserta
# nilai bawaannya. Mulai dari sini untuk SSO, SMTP, database eksternal, atau reverse proxy.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Ganti nilai placeholder (lewati jika Anda memakai Opsi A — generator
# sudah mengisinya). Server akan menolak berjalan selama nilai tersebut dibiarkan
# apa adanya, karena jika tidak database akan diinisialisasi dengan kata sandi yang sudah dipublikasikan.
#   SPARKY_FITNESS_DB_PASSWORD        kata sandi kuat apa pun
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 karakter hex)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 karakter)
#   SPARKY_FITNESS_FRONTEND_URL       URL tempat Anda akan membuka aplikasi

# 5. Jalankan aplikasi
docker compose pull && docker compose up -d

# Akses aplikasi di http://localhost:3004
```

_Catatan: Untuk opsi konfigurasi lengkap, reverse proxy, dan metode instalasi alternatif, kunjungi [Situs Dokumentasi](https://codewithcj.github.io/SparkyFitness/)._

### 2. Cloud (untuk pengguna non-teknis)

Jika Anda bukan pengguna teknis dan lebih memilih untuk tidak menjalankan SparkyFitness di server sendiri, Anda dapat menerapkan instance yang di-hosting di cloud menggunakan salah satu penyedia berikut.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Jalankan di PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Terapkan dengan Zenith">
</a>


> **Catatan:** Ini adalah layanan pihak ketiga yang independen. Kami menyarankan Anda menjelajahi fitur yang ditawarkan setiap penyedia untuk menentukan mana yang paling sesuai dengan kebutuhan Anda.
 

## 🎥 Video Tutorial

[![Tonton videonya](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Tutorial singkat 2 menit yang menunjukkan cara menginstal SparkyFitness (pelacak kebugaran self-hosted).

## Dokumentasi

Untuk panduan instalasi lengkap, opsi konfigurasi, dan dokumentasi pengembangan, silakan kunjungi [Situs Dokumentasi](https://codewithcj.github.io/SparkyFitness/) kami.

### Tautan Cepat

- **[Panduan Instalasi](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Deployment dan konfigurasi
- **[Generator .env Interaktif](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Pembuat konfigurasi `.env` di sisi klien
- **[Ikhtisar Fitur](https://codewithcj.github.io/SparkyFitness/features)** - Dokumentasi fitur lengkap
- **[Alur Kerja Pengembangan](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Panduan pengembang dan proses kontribusi
- **[Info Aplikasi iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** dan **[Info Aplikasi Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Butuh Bantuan?

- Kirim di issues/discussions Github.
- Untuk respons lebih cepat dan mendapatkan bantuan dari anggota komunitas lainnya, **[Gabung Discord kami](https://discord.gg/vcnMT5cPEA)**

## Riwayat Bintang

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Grafik Riwayat Bintang" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Terjemahan


**[Terjemahan Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Status terjemahan"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Status terjemahan" />
</a>

## Aktivitas repositori

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Gambar analitik Repobeats")

## Kontributor

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Kontributor SparkyFitness"/>
</a>

## ⚠️ Masalah yang Diketahui / Fitur Beta ⚠️

SparkyFitness sedang dalam pengembangan aktif.
Perubahan yang merusak kompatibilitas dapat terjadi antar rilis.

- Pembaruan kontainer otomatis tidak disarankan
- Selalu tinjau catatan rilis sebelum melakukan pembaruan

Fitur-fitur berikut saat ini masih dalam tahap beta dan mungkin belum diuji secara menyeluruh. Bersiaplah menghadapi kemungkinan bug atau fungsi yang belum lengkap:

- Chatbot AI
- Akses Keluarga & Teman
- Dokumentasi API

_Ini adalah terjemahan dari README berbahasa Inggris. Jika ada perbedaan, [versi bahasa Inggris](../../README.md) menjadi acuan._
