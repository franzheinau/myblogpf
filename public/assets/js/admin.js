(function () {
  const $ = (id) => document.getElementById(id);
  const gate = $('gate');
  const panel = $('panel');
  const toastEl = $('toast');

  let posts = [];
  let site = null;
  let current = null; // tulisan yang sedang dibuka di editor
  let imagekitConfig = { ready: false };

  /* ---------------- pemberitahuan ---------------- */

  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.dataset.show = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.dataset.show = 'false'), 2800);
  }

  /* ---------------- masuk & keluar ---------------- */

  async function boot() {
    try {
      await api.get('/api/auth/me');
      showPanel();
    } catch {
      gate.hidden = false;
      $('username').focus();
    }
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('loginError');
    err.hidden = true;
    try {
      await api.send('POST', '/api/auth/login', {
        username: $('username').value,
        password: $('password').value
      });
      gate.hidden = true;
      showPanel();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });

  $('logout').addEventListener('click', async () => {
    await api.send('POST', '/api/auth/logout');
    location.reload();
  });

  async function showPanel() {
    panel.hidden = false;
    imagekitConfig = await api.get('/api/imagekit/config').catch(() => ({ ready: false }));
    if (!imagekitConfig.ready) {
      $('coverHint').textContent = 'Kunci ImageKit belum diisi di file .env, jadi upload belum bisa dipakai.';
    }
    await Promise.all([loadPosts(), loadSite()]);
  }

  /* ---------------- tab ---------------- */

  function openTab(name) {
    document.querySelectorAll('[role="tab"]').forEach((b) =>
      b.setAttribute('aria-selected', String(b.dataset.tab === name))
    );
    document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
    window.scrollTo({ top: 0 });
  }

  document.querySelectorAll('[role="tab"]').forEach((b) =>
    b.addEventListener('click', () => openTab(b.dataset.tab))
  );

  /* ---------------- daftar tulisan ---------------- */

  async function loadPosts() {
    posts = await api.get('/api/posts?all=1');
    const rows = $('postRows');
    rows.innerHTML = posts.length
      ? posts
          .map(
            (p) => `<div class="row" data-id="${esc(p.id)}">
              <div>
                <h3 class="row__title">${esc(p.title)}</h3>
                <p class="row__meta">${shortDate(p.date)} · /blog/${esc(p.slug)}</p>
              </div>
              <div class="row__actions">
                <span class="pill" data-status="${esc(p.status)}">${p.status === 'published' ? 'Terbit' : 'Draf'}</span>
                <button data-act="edit">Ubah</button>
                <button data-act="view">Buka</button>
                <button data-act="delete">Hapus</button>
              </div>
            </div>`
          )
          .join('')
      : `<div class="empty"><h3>Belum ada tulisan</h3><p>Mulai dari tombol “Tulis baru” di atas.</p></div>`;
  }

  $('postRows').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.row').dataset.id;
    const post = posts.find((p) => p.id === id);

    if (btn.dataset.act === 'edit') {
      const full = await api.get(`/api/posts/${encodeURIComponent(post.slug)}`);
      openEditor(full);
    } else if (btn.dataset.act === 'view') {
      window.open(`/blog/${post.slug}`, '_blank');
    } else if (btn.dataset.act === 'delete') {
      if (!confirm(`Hapus “${post.title}”? Tindakan ini tidak bisa dibatalkan.`)) return;
      await api.send('DELETE', `/api/posts/${id}`);
      toast('Tulisan dihapus');
      loadPosts();
    }
  });

  /* ---------------- editor ---------------- */

  const slugify = (text) =>
    String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);

  function openEditor(post) {
    current = post || null;
    $('editorTitle').textContent = post ? 'Ubah tulisan' : 'Tulisan baru';
    $('title').value = post?.title || '';
    $('excerpt').value = post?.excerpt || '';
    $('content').value = post?.content || '';
    $('slug').value = post?.slug || '';
    $('tags').value = (post?.tags || []).join(', ');
    $('status').value = post?.status || 'draft';
    $('date').value = (post?.date || new Date().toISOString()).slice(0, 10);
    setCover(post?.cover || '');
    updateStatusPill();
    updateSlugPreview();
    $('deletePost').hidden = !post;
    openTab('editor');
    $('title').focus();
  }

  function updateStatusPill() {
    const pill = $('editorStatus');
    const value = $('status').value;
    pill.dataset.status = value;
    pill.textContent = value === 'published' ? 'Terbit' : 'Draf';
  }

  function updateSlugPreview() {
    const value = slugify($('slug').value || $('title').value);
    $('slugPreview').textContent = value ? `/blog/${value}` : '/blog/…';
  }

  $('status').addEventListener('change', updateStatusPill);
  $('title').addEventListener('input', updateSlugPreview);
  $('slug').addEventListener('input', updateSlugPreview);
  $('newPost').addEventListener('click', () => openEditor(null));

  let coverUrl = '';
  function setCover(url) {
    coverUrl = url || '';
    const box = $('coverThumb');
    box.hidden = !coverUrl;
    if (coverUrl) box.querySelector('img').src = thumb(coverUrl, 600);
  }

  $('save').addEventListener('click', async () => {
    const payload = {
      title: $('title').value.trim(),
      excerpt: $('excerpt').value.trim(),
      content: $('content').value,
      slug: $('slug').value.trim() || slugify($('title').value),
      tags: $('tags').value.split(',').map((t) => t.trim()).filter(Boolean),
      status: $('status').value,
      date: new Date($('date').value || Date.now()).toISOString(),
      cover: coverUrl
    };

    if (!payload.title) return toast('Judul belum diisi');

    try {
      const saved = current
        ? await api.send('PUT', `/api/posts/${current.id}`, payload)
        : await api.send('POST', '/api/posts', payload);
      current = saved;
      $('slug').value = saved.slug;
      $('editorTitle').textContent = 'Ubah tulisan';
      $('deletePost').hidden = false;
      updateSlugPreview();
      toast(saved.status === 'published' ? 'Tulisan diterbitkan' : 'Draf disimpan');
      loadPosts();
    } catch (err) {
      toast(err.message);
    }
  });

  $('preview').addEventListener('click', () => {
    if (!current) return toast('Simpan dulu supaya bisa dipratinjau');
    window.open(`/blog/${current.slug}`, '_blank');
  });

  $('deletePost').addEventListener('click', async () => {
    if (!current) return;
    if (!confirm(`Hapus “${current.title}”?`)) return;
    await api.send('DELETE', `/api/posts/${current.id}`);
    toast('Tulisan dihapus');
    current = null;
    await loadPosts();
    openTab('posts');
  });

  /* ---------------- alat bantu Markdown ---------------- */

  const patterns = {
    h2: (s) => `\n## ${s || 'Judul bagian'}\n`,
    bold: (s) => `**${s || 'teks tebal'}**`,
    italic: (s) => `*${s || 'teks miring'}*`,
    link: (s) => `[${s || 'teks tautan'}](https://)`,
    quote: (s) => `\n> ${s || 'kutipan'}\n`,
    list: (s) => `\n- ${s || 'butir pertama'}\n- butir kedua\n`,
    code: (s) => `\n\`\`\`\n${s || 'kode'}\n\`\`\`\n`
  };

  document.querySelectorAll('[data-md]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const ta = $('content');
      const { selectionStart: a, selectionEnd: b, value } = ta;
      const inserted = patterns[btn.dataset.md](value.slice(a, b));
      ta.value = value.slice(0, a) + inserted + value.slice(b);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = a + inserted.length;
    })
  );

  /* ---------------- upload ke ImageKit ---------------- */

  async function uploadToImageKit(file, onProgress) {
    if (!imagekitConfig.ready) throw new Error('Kunci ImageKit belum diisi di file .env.');
    if (!file.type.startsWith('image/')) throw new Error('Berkas ini bukan gambar.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 20 MB.');

    const auth = await api.get('/api/imagekit/auth');

    const form = new FormData();
    form.append('file', file);
    form.append('fileName', file.name.replace(/\s+/g, '-'));
    form.append('publicKey', imagekitConfig.publicKey);
    form.append('signature', auth.signature);
    form.append('expire', auth.expire);
    form.append('token', auth.token);
    form.append('folder', imagekitConfig.folder || '/blog');
    form.append('useUniqueFileName', 'true');

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://upload.imagekit.io/api/v1/files/upload');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* jawaban tak terbaca */ }
        if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data);
        else reject(new Error(data.message || 'Gambar gagal diunggah ke ImageKit.'));
      };
      xhr.onerror = () => reject(new Error('Koneksi ke ImageKit terputus.'));
      xhr.send(form);
    });
  }

  // Menyambungkan satu area unggah dengan progres dan pratinjau
  function wireUpload({ zone, input, bar, onDone }) {
    const progress = bar.querySelector('span');

    async function handle(file) {
      if (!file) return;
      bar.hidden = false;
      progress.style.width = '0%';
      try {
        const result = await uploadToImageKit(file, (p) => (progress.style.width = `${p}%`));
        onDone(result.url);
        toast('Gambar terunggah');
      } catch (err) {
        toast(err.message);
      } finally {
        setTimeout(() => { bar.hidden = true; progress.style.width = '0%'; }, 600);
        input.value = '';
      }
    }

    input.addEventListener('change', () => handle(input.files[0]));
    ['dragenter', 'dragover'].forEach((evt) =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.dataset.drag = 'true'; })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.dataset.drag = 'false'; })
    );
    zone.addEventListener('drop', (e) => handle(e.dataTransfer.files[0]));
  }

  wireUpload({
    zone: $('coverZone'),
    input: $('coverInput'),
    bar: $('coverBar'),
    onDone: (url) => setCover(url)
  });

  // Sisipkan gambar ke dalam isi tulisan
  $('insertImage').addEventListener('click', () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.onchange = async () => {
      const file = picker.files[0];
      if (!file) return;
      toast('Mengunggah gambar…');
      try {
        const result = await uploadToImageKit(file);
        const ta = $('content');
        const at = ta.selectionStart;
        const snippet = `\n![${file.name.replace(/\.[^.]+$/, '')}](${result.url})\n`;
        ta.value = ta.value.slice(0, at) + snippet + ta.value.slice(at);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = at + snippet.length;
        toast('Gambar disisipkan');
      } catch (err) {
        toast(err.message);
      }
    };
    picker.click();
  });

  /* ---------------- profil, proyek, riwayat ---------------- */

  let avatarUrl = '';
  let heroCoverUrl = '';

  async function loadSite() {
    site = await api.get('/api/site');
    $('s_name').value = site.name || '';
    $('s_role').value = site.role || '';
    $('s_tagline').value = site.tagline || '';
    $('s_about').value = site.about || '';
    $('s_location').value = site.location || '';
    $('s_available').value = site.available || '';
    $('s_email').value = site.email || '';
    $('s_skills').value = (site.skills || []).join(', ');
    setAvatar(site.avatar || '');
    setHeroCover(site.heroCover || '');
    renderSocials();
    renderProjects();
    renderExperience();
  }

  function setHeroCover(url) {
    heroCoverUrl = url || '';
    const box = $('heroCoverThumb');
    box.hidden = !heroCoverUrl;
    if (heroCoverUrl) box.querySelector('img').src = thumb(heroCoverUrl, 800);
  }

  wireUpload({
    zone: $('heroCoverZone'),
    input: $('heroCoverInput'),
    bar: $('heroCoverBar'),
    onDone: (url) => setHeroCover(url)
  });

  $('removeHeroCover').addEventListener('click', () => setHeroCover(''));

  function setAvatar(url) {
    avatarUrl = url || '';
    const box = $('avatarThumb');
    box.hidden = !avatarUrl;
    if (avatarUrl) box.querySelector('img').src = thumb(avatarUrl, 600);
  }

  wireUpload({
    zone: $('avatarZone'),
    input: $('avatarInput'),
    bar: $('avatarBar'),
    onDone: (url) => setAvatar(url)
  });

  function renderSocials() {
    $('socialList').innerHTML = (site.socials || [])
      .map(
        (s, i) => `<fieldset data-i="${i}">
          <legend>Tautan ${i + 1}</legend>
          <div class="field"><label>Nama</label><input data-social="label" value="${esc(s.label || '')}"></div>
          <div class="field"><label>Alamat</label><input data-social="url" value="${esc(s.url || '')}"></div>
          <button class="btn btn--ghost" data-remove="social">Hapus</button>
        </fieldset>`
      )
      .join('');
  }

  function renderProjects() {
    $('projectList').innerHTML = (site.projects || [])
      .map(
        (p, i) => `<fieldset data-i="${i}">
          <legend>Proyek ${i + 1}</legend>
          <div class="grid-2">
            <div class="field"><label>Judul</label><input data-project="title" value="${esc(p.title || '')}"></div>
            <div class="field"><label>Tahun</label><input data-project="year" value="${esc(p.year || '')}"></div>
          </div>
          <div class="field"><label>Ringkasan</label><textarea data-project="summary" rows="2">${esc(p.summary || '')}</textarea></div>
          <div class="grid-2">
            <div class="field"><label>Label</label><input data-project="tags" value="${esc((p.tags || []).join(', '))}"></div>
            <div class="field"><label>Tautan</label><input data-project="url" value="${esc(p.url || '')}"></div>
          </div>
          <div class="field">
            <label>Gambar</label>
            <input data-project="image" value="${esc(p.image || '')}" placeholder="Alamat gambar ImageKit">
            <p class="field__hint"><button class="btn btn--ghost" data-upload="project" type="button">Unggah gambar</button></p>
          </div>
          ${p.image ? `<div class="thumb"><img src="${esc(thumb(p.image, 600))}" alt=""></div>` : ''}
          <div class="actions"><button class="btn btn--ghost" data-remove="project">Hapus proyek</button></div>
        </fieldset>`
      )
      .join('');
  }

  function renderExperience() {
    $('experienceList').innerHTML = (site.experience || [])
      .map(
        (e, i) => `<fieldset data-i="${i}">
          <legend>Riwayat ${i + 1}</legend>
          <div class="grid-2">
            <div class="field"><label>Periode</label><input data-exp="period" value="${esc(e.period || '')}"></div>
            <div class="field"><label>Peran</label><input data-exp="title" value="${esc(e.title || '')}"></div>
            <div class="field"><label>Tempat</label><input data-exp="org" value="${esc(e.org || '')}"></div>
          </div>
          <div class="field"><label>Catatan</label><input data-exp="note" value="${esc(e.note || '')}"></div>
          <div class="actions"><button class="btn btn--ghost" data-remove="exp">Hapus riwayat</button></div>
        </fieldset>`
      )
      .join('');
  }

  function collectSite() {
    const socials = [...$('socialList').querySelectorAll('fieldset')].map((f) => ({
      label: f.querySelector('[data-social="label"]').value.trim(),
      url: f.querySelector('[data-social="url"]').value.trim()
    }));

    const projects = [...$('projectList').querySelectorAll('fieldset')].map((f) => ({
      title: f.querySelector('[data-project="title"]').value.trim(),
      year: f.querySelector('[data-project="year"]').value.trim(),
      summary: f.querySelector('[data-project="summary"]').value.trim(),
      tags: f.querySelector('[data-project="tags"]').value.split(',').map((t) => t.trim()).filter(Boolean),
      url: f.querySelector('[data-project="url"]').value.trim(),
      image: f.querySelector('[data-project="image"]').value.trim()
    }));

    const experience = [...$('experienceList').querySelectorAll('fieldset')].map((f) => ({
      period: f.querySelector('[data-exp="period"]').value.trim(),
      title: f.querySelector('[data-exp="title"]').value.trim(),
      org: f.querySelector('[data-exp="org"]').value.trim(),
      note: f.querySelector('[data-exp="note"]').value.trim()
    }));

    return {
      ...site,
      name: $('s_name').value.trim(),
      role: $('s_role').value.trim(),
      tagline: $('s_tagline').value.trim(),
      about: $('s_about').value,
      location: $('s_location').value.trim(),
      available: $('s_available').value.trim(),
      email: $('s_email').value.trim(),
      skills: $('s_skills').value.split(',').map((s) => s.trim()).filter(Boolean),
      avatar: avatarUrl,
      heroCover: heroCoverUrl,
      socials,
      projects,
      experience
    };
  }

  $('addSocial').addEventListener('click', () => {
    site = collectSite();
    site.socials.push({ label: '', url: '' });
    renderSocials();
  });

  $('addProject').addEventListener('click', () => {
    site = collectSite();
    site.projects.push({ title: '', year: '', summary: '', tags: [], url: '', image: '' });
    renderProjects();
  });

  $('addExperience').addEventListener('click', () => {
    site = collectSite();
    site.experience.push({ period: '', title: '', org: '', note: '' });
    renderExperience();
  });

  document.querySelector('[data-panel="profile"]').addEventListener('click', async (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      const i = Number(remove.closest('fieldset').dataset.i);
      site = collectSite();
      if (remove.dataset.remove === 'social') { site.socials.splice(i, 1); renderSocials(); }
      if (remove.dataset.remove === 'project') { site.projects.splice(i, 1); renderProjects(); }
      if (remove.dataset.remove === 'exp') { site.experience.splice(i, 1); renderExperience(); }
      return;
    }

    const upload = e.target.closest('[data-upload="project"]');
    if (upload) {
      const field = upload.closest('fieldset').querySelector('[data-project="image"]');
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/*';
      picker.onchange = async () => {
        if (!picker.files[0]) return;
        toast('Mengunggah gambar…');
        try {
          const result = await uploadToImageKit(picker.files[0]);
          field.value = result.url;
          toast('Gambar terunggah, jangan lupa simpan');
        } catch (err) {
          toast(err.message);
        }
      };
      picker.click();
    }
  });

  $('saveSite').addEventListener('click', async () => {
    try {
      site = await api.send('PUT', '/api/site', collectSite());
      renderProjects();
      toast('Profil tersimpan');
    } catch (err) {
      toast(err.message);
    }
  });

  boot();
})();