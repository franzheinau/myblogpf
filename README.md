# Website Portofolio + Blog

Situs portofolio dengan blog yang bisa kamu isi sendiri lewat panel admin. Gambar disimpan di ImageKit.io, data (tulisan dan profil) disimpan di **Neon Postgres** — jadi aman dipakai di hosting apa pun, termasuk yang penyimpanan berkasnya sementara seperti Vercel.

## Isi paket

```
server.js              Backend Express: login admin, API tulisan, token ImageKit
db.js                  Koneksi ke Neon Postgres + semua query baca/tulis data
scripts/
  migrate-to-neon.js   Pemindah data lama dari data/*.json (kalau kamu punya) ke Neon
public/
  index.html           Halaman portofolio
  blog.html            Daftar tulisan + pencarian + filter topik
  post.html            Halaman baca satu tulisan
  admin.html           Panel admin (login, editor, kelola profil)
  404.html
  assets/css/main.css  Seluruh tampilan
  assets/js/*.js       Logika tiap halaman
.env.example           Contoh pengaturan
```

## 1. Menyiapkan Neon

1. Daftar di [neon.tech](https://neon.tech) (ada paket gratis).
2. Buat project baru. Neon otomatis membuatkan satu database bernama `neondb`.
3. Di dashboard project, buka **Connection string** dan salin yang bertipe **Pooled connection** — bentuknya seperti:
   ```
   postgresql://user:password@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. Tempel ke `.env` sebagai `DATABASE_URL`.

Kamu tidak perlu membuat tabel manual — server otomatis membuatkan tabel `posts` dan `site` saat pertama kali menyala (`CREATE TABLE IF NOT EXISTS`).

## 2. Cara menjalankan

1. Pastikan Node.js 18 ke atas sudah terpasang.
2. Pasang dependensi:
   ```bash
   npm install
   ```
3. Salin pengaturan lalu isi:
   ```bash
   cp .env.example .env
   ```
   Isi `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET`, dan `DATABASE_URL` dari Neon.
4. **Kalau kamu sudah punya tulisan** dari versi sebelumnya (folder `data/site.json` dan `data/posts.json`), taruh dulu di folder `data/` lalu jalankan:
   ```bash
   node scripts/migrate-to-neon.js
   ```
   Skrip ini memindahkan semuanya ke Neon dan aman dijalankan berkali-kali — tulisan yang alamatnya (`slug`) sudah ada di database akan dilewati, bukan digandakan.
5. Jalankan servernya:
   ```bash
   npm start
   ```
   Situs: <http://localhost:3000> · Panel admin: <http://localhost:3000/admin>

## Menyiapkan ImageKit.io

1. Daftar di imagekit.io, lalu buka **Developer options → API Keys**.
2. Salin *Public key*, *Private key*, dan *URL endpoint* ke `.env`.
3. Nyalakan ulang server.

Kunci privat tidak pernah dikirim ke browser. Saat kamu mengunggah gambar, browser meminta token sekali pakai ke `/api/imagekit/auth` (hanya bisa diakses admin yang sudah masuk), lalu mengirim berkasnya langsung ke ImageKit.

## Memakai panel admin

- **Tulisan** — daftar semua tulisan, termasuk draf. Bisa diubah, dibuka, atau dihapus.
- **Editor** — judul, ringkasan, isi (Markdown), topik, tanggal, slug, dan gambar sampul. Tombol *Sisipkan gambar* mengunggah ke ImageKit lalu menaruh gambarnya di posisi kursor.
- **Profil & proyek** — nama, kalimat pembuka, tentang, keahlian, foto, tautan sosial, daftar proyek, dan riwayat.

## Menaruh di hosting

Karena datanya sekarang di Neon (bukan berkas lokal), situs ini cocok untuk **hosting mana pun** — termasuk yang tanpa penyimpanan permanen seperti Vercel, Netlify, atau Railway.

### Deploy ke Vercel

1. Push proyek ke GitHub, lalu impor ke Vercel.
2. Di pengaturan project Vercel, tambahkan environment variables yang sama seperti `.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET`, `DATABASE_URL`, dan variabel ImageKit.
3. `server.js` sudah diekspor sebagai `module.exports = app` supaya bisa dijalankan sebagai fungsi serverless. Tambahkan berkas `vercel.json` sederhana ini di akar proyek kalau Vercel belum otomatis mendeteksinya:
   ```json
   {
     "version": 2,
     "builds": [{ "src": "server.js", "use": "@vercel/node" }],
     "routes": [{ "src": "/(.*)", "dest": "server.js" }]
   }
   ```
4. Deploy. Setiap kali fungsi serverless "dingin" (cold start), server otomatis memastikan skema tabel Neon sudah ada sebelum melayani permintaan.

### VPS / Railway / Render

Cukup atur environment variables yang sama, lalu `npm install && npm start`.

## Keamanan

- Password dibandingkan dengan cara yang tahan terhadap timing attack, dan login dibatasi 5 percobaan per menit per IP.
- Sesi disimpan sebagai cookie `httpOnly`, berlaku 7 hari.
- Isi tulisan dibersihkan dengan DOMPurify sebelum ditampilkan.
- Koneksi ke Neon selalu lewat SSL.
- Jangan pernah menaruh berkas `.env` ke repositori publik.
