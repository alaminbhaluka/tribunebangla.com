(() => {
  'use strict';

  const SUPABASE_URL = 'https://rvffsavdvetdmhnwgivz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu';
  const authCallbackType = new URLSearchParams(window.location.hash.slice(1)).get('type');
  const client = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const byId = (id) => document.getElementById(id);
  const loginPanel = byId('login-panel');
  const editorPanel = byId('editor-panel');
  const loginForm = byId('login-form');
  const loginStatus = byId('login-status');
  const editorStatus = byId('editor-status');
  const submissionsList = byId('submissions-list');
  const applicationsList = byId('applications-list');
  const articlesList = byId('articles-list');
  const settingsPanel = byId('settings-panel');
  const managedArticles = byId('managed-articles');
  const articleForm = byId('article-form');
  const profileSettingsForm = byId('profile-settings-form');
  const articleImageInput = byId('article-image-file');
  const articleImagePreview = byId('article-image-preview');
  const articleImageStatus = byId('article-image-status');
  const passwordForm = byId('password-form');
  let activeUserId = '';
  let activeTab = 'submissions';
  let activeEditorRole = '';

  function setStatus(node, message, kind = '') {
    node.textContent = message;
    node.dataset.error = String(kind === 'error');
    node.dataset.success = String(kind === 'success');
  }

  function friendlyError(error) {
    const message = error?.message || '';
    if (/invalid login credentials/i.test(message)) return 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।';
    if (/email not confirmed/i.test(message)) return 'ইমেইল আমন্ত্রণ গ্রহণ করে যাচাই সম্পন্ন করুন।';
    if (/bucket not found/i.test(message)) return 'ছবি সংরক্ষণের স্টোরেজ এখনো সেটআপ হয়নি। আপাতত ছবির HTTPS লিংক ব্যবহার করুন।';
    if (/row-level security|not authorized|unauthorized/i.test(message)) return 'ছবি আপলোডের অনুমতি নেই। স্টোরেজের সম্পাদকীয় নীতি যাচাই করুন।';
    return message || 'অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';
  }

  function emptyState(message) {
    const node = document.createElement('p');
    node.className = 'empty-state';
    node.textContent = message;
    return node;
  }

  function textNode(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value || '';
    return node;
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function statusText(value) {
    return ({ pending: 'পর্যালোচনাধীন', approved: 'অনুমোদিত', rejected: 'গৃহীত হয়নি', draft: 'খসড়া', published: 'প্রকাশিত' })[value] || 'অজানা';
  }

  function makeReviewActions(table, record) {
    const actions = document.createElement('form');
    actions.className = 'record-actions';

    const statusLabel = document.createElement('label');
    statusLabel.append(document.createTextNode('সিদ্ধান্ত'));
    const select = document.createElement('select');
    select.name = 'status';
    [
      ['pending', 'পর্যালোচনাধীন'],
      ['approved', 'অনুমোদিত'],
      ['rejected', 'গৃহীত হয়নি']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = record.status === value;
      select.append(option);
    });
    statusLabel.append(select);

    const noteLabel = document.createElement('label');
    noteLabel.append(document.createTextNode('সম্পাদকের নোট'));
    const note = document.createElement('input');
    note.name = 'review_note';
    note.type = 'text';
    note.maxLength = 1000;
    note.value = record.review_note || '';
    note.placeholder = 'প্রয়োজনে কারণ বা নির্দেশনা লিখুন';
    noteLabel.append(note);

    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'primary-button';
    save.textContent = 'সিদ্ধান্ত সংরক্ষণ';
    actions.append(statusLabel, noteLabel, save);
    if (table === 'article_submissions') {
      const publish = document.createElement('button');
      publish.type = 'button';
      publish.className = 'publish-button';
      publish.textContent = 'সাইটে প্রকাশ করুন';
      publish.addEventListener('click', () => {
        void publishSubmission(record.id, note.value, publish);
      });
      actions.append(publish);
    }
    actions.addEventListener('submit', (event) => {
      event.preventDefault();
      void updateReview(table, record.id, select.value, note.value, save);
    });
    return actions;
  }

  async function publishSubmission(id, reviewNote, button) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'প্রকাশ হচ্ছে…';
    try {
      const { data, error } = await client.rpc('publish_submission', {
        p_submission_id: id,
        p_review_note: reviewNote.trim()
      });
      if (error) throw error;
      await loadCurrentTab();
      if (activeTab !== 'articles') await loadManagedArticles();
      setStatus(editorStatus, `নিউজটি সাইটে প্রকাশিত হয়েছে (সংবাদ নম্বর ${data})।`, 'success');
    } catch (error) {
      console.error('Unable to publish reader submission:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  async function updateReview(table, id, status, reviewNote, button) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'সংরক্ষণ হচ্ছে…';
    try {
      const { error } = await client.from(table)
        .update({ status, review_note: reviewNote.trim() })
        .eq('id', id);
      if (error) throw error;
      setStatus(editorStatus, 'পর্যালোচনার সিদ্ধান্ত সংরক্ষণ হয়েছে।', 'success');
      await loadCurrentTab();
    } catch (error) {
      console.error(`Unable to review ${table} record:`, error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  async function loadSubmitterProfiles(records) {
    const ids = [...new Set(records.map((record) => record.user_id).filter(Boolean))];
    if (!ids.length) return new Map();
    const { data, error } = await client.from('profiles')
      .select('id,full_name,phone,district')
      .in('id', ids);
    if (error) throw error;
    return new Map(data.map((profile) => [profile.id, profile]));
  }

  function renderSubmission(record, profile) {
    const card = document.createElement('article');
    card.className = 'record-card';
    const content = document.createElement('div');
    content.className = 'record-content';
    const meta = document.createElement('div');
    meta.className = 'record-meta';
    meta.append(
      textNode('span', 'pill', statusText(record.status)),
      textNode('span', '', record.category || 'বিভাগহীন'),
      textNode('span', '', new Date(record.created_at).toLocaleString('bn-BD')),
      textNode('span', '', profile?.full_name || 'নাম পাওয়া যায়নি'),
      textNode('span', '', [profile?.phone, profile?.district].filter(Boolean).join(' · '))
    );
    const title = textNode('h2', '', record.title || 'শিরোনামহীন প্রতিবেদন');
    const summary = textNode('p', '', record.summary || '');
    content.append(meta, title);
    if (record.summary) content.append(summary);

    const details = document.createElement('details');
    const summaryLabel = document.createElement('summary');
    summaryLabel.textContent = 'পূর্ণ প্রতিবেদন ও তথ্যসূত্র দেখুন';
    details.append(summaryLabel, textNode('p', 'record-body', record.body));
    const imageUrl = safeHttpsUrl(record.image_url);
    if (imageUrl) {
      const image = document.createElement('a');
      image.href = imageUrl;
      image.target = '_blank';
      image.rel = 'noopener noreferrer';
      image.textContent = 'সংযুক্ত ছবি খুলুন';
      details.append(image);
    }
    if (record.source_note) details.append(textNode('p', '', `তথ্যসূত্র / নোট: ${record.source_note}`));
    content.append(details, makeReviewActions('article_submissions', record));
    card.append(content);
    return card;
  }

  function renderApplication(record, profile) {
    const card = document.createElement('article');
    card.className = 'record-card';
    const content = document.createElement('div');
    content.className = 'record-content';
    const meta = document.createElement('div');
    meta.className = 'record-meta';
    meta.append(
      textNode('span', 'pill', statusText(record.status)),
      textNode('span', '', record.desired_role || 'পদ উল্লেখ নেই'),
      textNode('span', '', new Date(record.created_at).toLocaleString('bn-BD')),
      textNode('span', '', record.full_name || profile?.full_name || 'নাম উল্লেখ নেই'),
      textNode('span', '', [record.phone || profile?.phone, record.district || profile?.district].filter(Boolean).join(' · '))
    );
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'অভিজ্ঞতা ও আবেদনপত্র দেখুন';
    details.append(summary);
    if (record.experience) details.append(textNode('p', '', `অভিজ্ঞতা: ${record.experience}`));
    if (record.statement) details.append(textNode('p', 'record-body', record.statement));
    const portfolioUrl = safeHttpsUrl(record.portfolio_url);
    if (portfolioUrl) {
      const link = document.createElement('a');
      link.href = portfolioUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'পোর্টফোলিও খুলুন';
      details.append(link);
    }
    content.append(meta, textNode('h2', '', record.full_name || 'প্রতিনিধি আবেদন'), details,
      makeReviewActions('staff_applications', record));
    card.append(content);
    return card;
  }

  function renderNewsArticle(record) {
    const card = document.createElement('article');
    card.className = 'record-card';
    const content = document.createElement('div');
    content.className = 'record-content';
    const meta = document.createElement('div');
    meta.className = 'record-meta';
    meta.append(
      textNode('span', 'pill', statusText(record.status)),
      textNode('span', '', record.category || 'বিভাগহীন'),
      textNode('span', '', new Date(record.created_at).toLocaleString('bn-BD')),
      textNode('span', '', `সংবাদ নম্বর ${record.id}`)
    );
    content.append(meta, textNode('h2', '', record.title));
    if (record.summary) content.append(textNode('p', '', record.summary));
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'পূর্ণ প্রতিবেদন দেখুন';
    details.append(summary, textNode('p', 'record-body', record.body));
    content.append(details);
    const actions = document.createElement('div');
    actions.className = 'record-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'primary-button';
    edit.textContent = 'সম্পাদনা করুন';
    edit.addEventListener('click', () => editNewsArticle(record));
    actions.append(edit);
    if (record.status === 'published') {
      const link = document.createElement('a');
      link.href = `/post/${record.id}/`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'secondary-button';
      link.textContent = 'সাইটে দেখুন';
      actions.append(link);
    }
    content.append(actions);
    card.append(content);
    return card;
  }

  async function loadManagedArticles() {
    managedArticles.replaceChildren(emptyState('নিউজের তালিকা লোড হচ্ছে…'));
    const { data, error } = await client.from('news_articles')
      .select('id,title,summary,body,category,image_url,status,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    managedArticles.replaceChildren();
    if (!data.length) {
      managedArticles.append(emptyState('এখনো কোনো নিউজ তৈরি বা প্রকাশ করা হয়নি।'));
      return;
    }
    data.forEach((record) => managedArticles.append(renderNewsArticle(record)));
  }

  function startNewArticle() {
    articleForm.reset();
    articleImagePreview.hidden = true;
    articleImagePreview.removeAttribute('src');
    articleImageStatus.textContent = '';
    articleImageStatus.dataset.error = 'false';
    articleForm.elements.namedItem('id').value = '';
    articleForm.elements.namedItem('status').value = 'draft';
    byId('article-form-heading').textContent = 'নতুন নিউজ লিখুন';
    articleForm.hidden = false;
    articleForm.elements.namedItem('title').focus();
  }

  function editNewsArticle(record) {
    articleForm.elements.namedItem('id').value = String(record.id);
    articleForm.elements.namedItem('title').value = record.title || '';
    articleForm.elements.namedItem('category').value = record.category || 'জাতীয়';
    articleForm.elements.namedItem('summary').value = record.summary || '';
    articleForm.elements.namedItem('image_url').value = record.image_url || '';
    articleForm.elements.namedItem('body').value = record.body || '';
    articleForm.elements.namedItem('status').value = record.status || 'draft';
    articleImagePreview.src = safeHttpsUrl(record.image_url) || '';
    articleImagePreview.hidden = !articleImagePreview.src;
    articleImageStatus.textContent = record.image_url ? 'বর্তমান ছবিটি রাখা হবে। নতুন ছবি দিলে এটি বদলে যাবে।' : '';
    byId('article-form-heading').textContent = `সংবাদ নম্বর ${record.id} সম্পাদনা`;
    articleForm.hidden = false;
    articleForm.elements.namedItem('title').focus();
  }

  async function loadRecords(table, list, renderer, emptyMessage) {
    list.replaceChildren(emptyState('তথ্য লোড হচ্ছে…'));
    const { data, error } = await client.from(table).select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    if (!data.length) {
      list.replaceChildren(emptyState(emptyMessage));
      return;
    }
    const profiles = await loadSubmitterProfiles(data);
    list.replaceChildren(...data.map((record) => renderer(record, profiles.get(record.user_id))));
  }

  async function loadCurrentTab() {
    setStatus(editorStatus, '');
    try {
      if (activeTab === 'articles') {
        await loadManagedArticles();
        return;
      }
      if (activeTab === 'settings') return;

      const applications = activeTab === 'applications';
      await loadRecords(
        applications ? 'staff_applications' : 'article_submissions',
        applications ? applicationsList : submissionsList,
        applications ? renderApplication : renderSubmission,
        applications ? 'এখনো কোনো প্রতিনিধি আবেদন জমা পড়েনি।' : 'এখনো কোনো সংবাদ জমা পড়েনি।'
      );
    } catch (error) {
      console.error('Unable to load editorial records:', error);
      setStatus(editorStatus, 'তথ্য লোড করা যায়নি। অনুমতি বা সংযোগ যাচাই করে আবার চেষ্টা করুন।', 'error');
      const list = activeTab === 'applications' ? applicationsList :
        activeTab === 'articles' ? managedArticles : submissionsList;
      list.replaceChildren(emptyState('তালিকা লোড করা যায়নি।'));
    }
  }

  articleImageInput.addEventListener('change', () => {
    const file = articleImageInput.files[0];
    articleImageStatus.textContent = '';
    articleImageStatus.dataset.error = 'false';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      articleImageInput.value = '';
      setStatus(articleImageStatus, 'JPG, PNG অথবা WebP ছবি বেছে নিন।', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      articleImageInput.value = '';
      setStatus(articleImageStatus, 'ছবির আকার ৮ MB-এর মধ্যে হতে হবে।', 'error');
      return;
    }
    articleForm.elements.namedItem('image_url').value = '';
    articleImagePreview.src = URL.createObjectURL(file);
    articleImagePreview.hidden = false;
    articleImageStatus.textContent = `${file.name} · আপলোডের জন্য প্রস্তুত`;
  });

  profileSettingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(new FormData(profileSettingsForm).get('full_name') || '').trim();
    const button = profileSettingsForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { error } = await client.from('profiles')
        .update({ full_name: name })
        .eq('id', activeUserId);
      if (error) throw error;
      byId('editor-identity').textContent = `${name} · ${activeEditorRole === 'admin' ? 'প্রধান সম্পাদক' : 'সম্পাদক'}`;
      setStatus(editorStatus, 'সম্পাদকের নাম সংরক্ষণ হয়েছে।', 'success');
    } catch (error) {
      console.error('Unable to update editor profile:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
    }
  });

  byId('settings-password-button').addEventListener('click', () => {
    passwordForm.hidden = false;
    passwordForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    passwordForm.elements.namedItem('password').focus();
  });

  articleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(articleForm).entries());
    const imageInput = String(values.image_url || '').trim();
    let imageUrl = imageInput ? safeHttpsUrl(imageInput) : null;
    if (imageInput && !imageUrl) {
      setStatus(editorStatus, 'ছবির লিংকটি HTTPS ঠিকানা হতে হবে।', 'error');
      return;
    }
    const file = articleImageInput.files[0];
    if (file && (file.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setStatus(articleImageStatus, 'JPG, PNG অথবা WebP ছবি ৮ MB-এর মধ্যে বেছে নিন।', 'error');
      return;
    }
    const button = articleForm.querySelector('[type="submit"]');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = file ? 'ছবি আপলোড হচ্ছে…' : 'সংরক্ষণ হচ্ছে…';
    try {
      if (file) {
        const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type];
        const path = `${activeUserId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage.from('news-images').upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false
        });
        if (uploadError) throw uploadError;
        imageUrl = client.storage.from('news-images').getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        title: String(values.title).trim(),
        summary: String(values.summary || '').trim(),
        body: String(values.body).trim(),
        category: String(values.category),
        image_url: imageUrl,
        status: String(values.status),
        updated_at: new Date().toISOString()
      };
      const id = String(values.id || '').trim();
      button.textContent = 'সংরক্ষণ হচ্ছে…';
      const request = id
        ? client.from('news_articles').update(payload).eq('id', id)
        : client.from('news_articles').insert({ ...payload, created_by: activeUserId });
      const { error } = await request;
      if (error) throw error;
      articleForm.hidden = true;
      await loadManagedArticles();
      setStatus(editorStatus, payload.status === 'published' ? 'নিউজ সংরক্ষণ করে সাইটে প্রকাশ করা হয়েছে।' : 'নিউজের খসড়া সংরক্ষণ করা হয়েছে।', 'success');
    } catch (error) {
      console.error('Unable to save editorial article:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });

  byId('new-article-button').addEventListener('click', startNewArticle);
  byId('cancel-article-button').addEventListener('click', () => {
    articleForm.reset();
    articleForm.hidden = true;
    articleImagePreview.hidden = true;
    articleImageStatus.textContent = '';
  });

  async function showEditor(user) {
    if (activeUserId === user.id) return;
    activeUserId = user.id;
    loginPanel.hidden = true;
    editorPanel.hidden = false;
    setStatus(editorStatus, 'সম্পাদকীয় প্রবেশাধিকার যাচাই হচ্ছে…');
    try {
      const { data, error } = await client.from('profiles')
        .select('role,full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data || !['admin', 'editor'].includes(data.role)) {
        await client.auth.signOut();
        activeUserId = '';
        editorPanel.hidden = true;
        loginPanel.hidden = false;
        throw new Error('এই অ্যাকাউন্টে সম্পাদকীয় প্রবেশাধিকার নেই।');
      }
      activeEditorRole = data.role;
      profileSettingsForm.elements.namedItem('full_name').value = data.full_name || '';
      byId('editor-identity').textContent = `${data.full_name || user.email} · ${data.role === 'admin' ? 'প্রধান সম্পাদক' : 'সম্পাদক'}`;
      setStatus(editorStatus, '');
      await loadCurrentTab();
      if (['invite', 'recovery'].includes(authCallbackType)) passwordForm.hidden = false;
    } catch (error) {
      console.error('Unable to verify editorial access:', error);
      setStatus(loginStatus, friendlyError(error), 'error');
    }
  }

  function showLogin() {
    activeUserId = '';
    editorPanel.hidden = true;
    loginPanel.hidden = false;
    passwordForm.hidden = true;
  }

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('is-active', tab === button));
      submissionsList.hidden = activeTab !== 'submissions';
      applicationsList.hidden = activeTab !== 'applications';
      articlesList.hidden = activeTab !== 'articles';
      settingsPanel.hidden = activeTab !== 'settings';
      void loadCurrentTab();
    });
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = byId('login-button');
    button.disabled = true;
    setStatus(loginStatus, 'লগইন হচ্ছে…');
    try {
      const values = Object.fromEntries(new FormData(loginForm).entries());
      const { data, error } = await client.auth.signInWithPassword({
        email: String(values.email).trim(),
        password: String(values.password)
      });
      if (error) throw error;
      await showEditor(data.user);
    } catch (error) {
      console.error('Editorial sign-in failed:', error);
      setStatus(loginStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
    }
  });

  byId('reset-button').addEventListener('click', async () => {
    const email = loginForm.elements.namedItem('email').value.trim();
    if (!email) {
      setStatus(loginStatus, 'রিসেট লিংক পেতে আগে ইমেইল লিখুন।', 'error');
      return;
    }
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/editor/`
      });
      if (error) throw error;
      setStatus(loginStatus, 'পাসওয়ার্ড সেট/পরিবর্তনের লিংক ইমেইলে পাঠানো হয়েছে।', 'success');
    } catch (error) {
      console.error('Editorial password reset failed:', error);
      setStatus(loginStatus, friendlyError(error), 'error');
    }
  });

  byId('password-button').addEventListener('click', () => {
    passwordForm.hidden = !passwordForm.hidden;
    if (!passwordForm.hidden) passwordForm.elements.namedItem('password').focus();
  });

  byId('cancel-password-button').addEventListener('click', () => {
    passwordForm.reset();
    passwordForm.hidden = true;
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(passwordForm).entries());
    if (values.password !== values.password_confirm) {
      setStatus(editorStatus, 'দুই ঘরে একই পাসওয়ার্ড লিখুন।', 'error');
      return;
    }
    if (String(values.password).length < 8) {
      setStatus(editorStatus, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।', 'error');
      return;
    }
    const button = passwordForm.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'সংরক্ষণ হচ্ছে…';
    try {
      const { error } = await client.auth.updateUser({ password: String(values.password) });
      if (error) throw error;
      passwordForm.reset();
      passwordForm.hidden = true;
      setStatus(editorStatus, 'নতুন পাসওয়ার্ড নিরাপদে সংরক্ষণ হয়েছে।', 'success');
    } catch (error) {
      console.error('Unable to set editorial password:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'পাসওয়ার্ড সংরক্ষণ করুন';
    }
  });

  byId('logout-button').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('Editorial sign-out failed:', error);
      setStatus(editorStatus, friendlyError(error), 'error');
      return;
    }
    showLogin();
  });

  if (!client) {
    setStatus(loginStatus, 'লগইন সেবা এখন লোড করা যাচ্ছে না। পরে আবার চেষ্টা করুন।', 'error');
    return;
  }

  client.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      if (event === 'PASSWORD_RECOVERY') passwordForm.hidden = false;
      void showEditor(session.user);
    }
    else showLogin();
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    if (data.session?.user) void showEditor(data.session.user);
    else showLogin();
  }).catch((error) => {
    console.error('Unable to restore editorial session:', error);
    showLogin();
    setStatus(loginStatus, friendlyError(error), 'error');
  });
})();
