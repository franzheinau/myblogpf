/**
 * Pindahkan data lama dari data/site.json dan data/posts.json (kalau ada)
 * ke tabel di Neon Postgres. Aman dijalankan berkali-kali — tulisan yang
 * slug-nya sudah ada di database akan dilewati, bukan digandakan.
 *
 * Cara pakai:
 *   node scripts/migrate-to-neon.js
 *
 * Pastikan DATABASE_URL di .env sudah menunjuk ke database Neon-mu
 * sebelum menjalankan ini.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');

const SITE_FILE = path.join(__dirname, '..', 'data', 'site.json');
const POSTS_FILE = path.join(__dirname, '..', 'data', 'posts.json');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL belum diisi di .env. Isi dulu sebelum menjalankan migrasi ini.');
    process.exit(1);
  }

  await db.ensureSchema();
  console.log('Skema tabel siap.\n');

  // Profil situs
  if (fs.existsSync(SITE_FILE)) {
    const site = JSON.parse(fs.readFileSync(SITE_FILE, 'utf8'));
    await db.saveSite({ ...db.DEFAULT_SITE, ...site });
    console.log(`Profil situs "${site.name || '(tanpa nama)'}" berhasil dipindahkan.`);
  } else {
    console.log('Tidak ada data/site.json — dilewati.');
  }

  // Tulisan blog
  if (fs.existsSync(POSTS_FILE)) {
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    let masuk = 0;
    let lewat = 0;

    for (const post of posts) {
      const sudahAda = await db.getPostBySlug(post.slug);
      if (sudahAda) {
        lewat += 1;
        continue;
      }
      await db.insertPost({
        id: post.id || crypto.randomUUID(),
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt || '',
        content: post.content || '',
        cover: post.cover || '',
        tags: Array.isArray(post.tags) ? post.tags : [],
        status: post.status === 'published' ? 'published' : 'draft',
        date: post.date || new Date().toISOString()
      });
      masuk += 1;
      console.log(`  ✓ "${post.title}"`);
    }

    console.log(`\n${masuk} tulisan dipindahkan, ${lewat} dilewati karena slug-nya sudah ada di database.`);
  } else {
    console.log('Tidak ada data/posts.json — dilewati.');
  }

  console.log('\nSelesai. Kamu bisa cek hasilnya lewat panel admin.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nMigrasi gagal:', err.message);
  process.exit(1);
});
