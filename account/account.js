(() => {
  'use strict';

  const SUPABASE_URL = 'https://rvffsavdvetdmhnwgivz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu';
  const authClient = window.supabase;
  const client = authClient?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const byId = (id) => document.getElementById(id);
  const authPanel = byId('auth-panel');
  const dashboard = byId('dashboard');
  const authStatus = byId('auth-status');
  const dashboardStatus = byId('dashboard-status');
  const profilePhotoInput = byId('profile-photo-file');
  const profilePhotoUploadButton = byId('profile-photo-upload');
  const profilePhotoStatus = byId('profile-photo-status');
  const AVATAR_BUCKET = 'profile-images';
  const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
  const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const registerForm = byId('register-form');
  const loginForm = byId('login-form');
  let currentUser = null;
  let profile = null;
  let publishedArticles = null;
  let photoPreviewUrl = '';

  function setStatus(node, message, kind = '') {
    if (!node) return;
    node.textContent = message;
    node.dataset.error = String(kind === 'error');
    node.dataset.success = String(kind === 'success');
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function profileValues(values) {
    return {
      full_name: String(values.full_name || '').trim(),
      phone: String(values.phone || '').trim() || null,
      division: String(values.division || '').trim() || null,
      district: String(values.district || '').trim() || null,
      upazila: String(values.upazila || '').trim() || null,
      address_line: String(values.address_line || '').trim() || null,
      newsletter_opt_in: values.newsletter_opt_in === 'on'
    };
  }

  function safeProfilePhotoUrl(value) {
    try {
      const url = new URL(value);
      if (url.origin !== SUPABASE_URL ||
          !url.pathname.startsWith(`/storage/v1/object/public/${AVATAR_BUCKET}/`)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function setProfilePhoto(url, name) {
    const initial = name?.trim().slice(0, 1).toLocaleUpperCase() || 'প';
    const safeUrl = safeProfilePhotoUrl(url);
    const imageTargets = [
      [byId('user-avatar-image'), byId('user-initial')],
      [byId('profile-photo-preview'), byId('profile-photo-fallback')]
    ];
    imageTargets.forEach(([image, fallback]) => {
      fallback.textContent = initial;
      if (!safeUrl) {
        image.hidden = true;
        image.removeAttribute('src');
        fallback.hidden = false;
        return;
      }
      image.onerror = () => {
        image.hidden = true;
        fallback.hidden = false;
      };
      image.src = safeUrl;
      image.hidden = false;
      fallback.hidden = true;
    });
  }

  function validateProfilePhoto(file) {
    if (!AVATAR_TYPES.has(file.type)) {
      throw new Error('JPG, PNG বা WebP ছবি বেছে নিন।');
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new Error('প্রোফাইল ছবির আকার সর্বোচ্চ ২ MB হতে পারে।');
    }
  }

  function showAuthMode(mode) {
    const registering = mode === 'register';
    registerForm.hidden = !registering;
    loginForm.hidden = registering;
    byId('auth-heading').textContent = registering ? 'আপনার অ্যাকাউন্ট তৈরি করুন' : 'আপনার অ্যাকাউন্টে লগইন করুন';
    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      const active = button.dataset.authMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    setStatus(authStatus, '');
  }

  function setActivePanel(name) {
    document.querySelectorAll('[data-view]').forEach((panel) => {
      panel.hidden = panel.dataset.view !== name;
    });
    document.querySelectorAll('.account-menu-item').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.panel === name);
    });

    if (name === 'saved') void loadSavedArticles();
    if (name === 'submissions') void loadSubmissions();
    if (name === 'staff') void loadStaffApplications();
  }

  function roleName(role) {
    return ({ reporter: 'প্রতিনিধি', editor: 'সম্পাদক', admin: 'প্রশাসক' })[role] || 'পাঠক';
  }

  function setProfileForm(data) {
    const form = byId('profile-form');
    ['full_name', 'phone', 'division', 'district', 'upazila', 'address_line'].forEach((name) => {
      form.elements.namedItem(name).value = data[name] || '';
    });
    form.elements.namedItem('newsletter_opt_in').checked = Boolean(data.newsletter_opt_in);
    byId('profile-email').value = currentUser.email || '';
  }

  async function loadProfile(user) {
    const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('আপনার প্রোফাইল তৈরি হয়নি। কিছুক্ষণ পরে আবার লগইন করুন।');

    const metadata = user.user_metadata || {};
    const fromMetadata = {
      full_name: metadata.full_name,
      phone: metadata.phone,
      division: metadata.division,
      district: metadata.district,
      upazila: metadata.upazila,
      address_line: metadata.address_line,
      newsletter_opt_in: metadata.newsletter_opt_in
    };
    const missingProfile = ['phone', 'division', 'district', 'upazila', 'address_line']
      .some((key) => !data[key] && fromMetadata[key]) ||
      (!data.newsletter_opt_in && fromMetadata.newsletter_opt_in);
    if (missingProfile) {
      const patch = {};
      Object.entries(fromMetadata).forEach(([key, value]) => {
        if ((key === 'newsletter_opt_in' && data[key] === false) ||
            (key !== 'newsletter_opt_in' && !data[key] && value)) {
          patch[key] = value;
        }
      });
      if (Object.keys(patch).length) {
        const { data: updated, error: updateError } = await client
          .from('profiles').update(patch).eq('id', user.id).select('*').single();
        if (updateError) throw updateError;
        profile = updated;
      } else {
        profile = data;
      }
    } else {
      profile = data;
    }

    setProfileForm(profile);
    const name = profile.full_name || user.email || 'পাঠক';
    byId('user-name').textContent = name;
    byId('welcome-name').textContent = name.split(/\s+/)[0];
    byId('user-email').textContent = user.email || '';
    setProfilePhoto(metadata.avatar_url, name);
    byId('user-role').textContent = roleName(profile.role);
    byId('email-verification-status').textContent = user.email_confirmed_at
      ? 'আপনার ইমেইল যাচাই করা হয়েছে।'
      : 'ইমেইল যাচাই সম্পন্ন হলে অ্যাকাউন্ট আরও সুরক্ষিত থাকবে।';
    const staffForm = byId('staff-form');
    staffForm.elements.namedItem('full_name').value = profile.full_name || '';
    staffForm.elements.namedItem('phone').value = profile.phone || '';
    staffForm.elements.namedItem('district').value = profile.district || '';
  }

  async function showDashboard(user) {
    currentUser = user;
    authPanel.hidden = true;
    dashboard.hidden = false;
    setStatus(dashboardStatus, 'আপনার অ্যাকাউন্ট লোড হচ্ছে…');
    try {
      await loadProfile(user);
      setActivePanel('overview');
      setStatus(dashboardStatus, '');
    } catch (error) {
      console.error('Unable to load reader profile:', error);
      setStatus(dashboardStatus, error.message || 'অ্যাকাউন্টের তথ্য লোড করা যায়নি।', 'error');
    }
  }

  function showSignedOut(mode = 'login') {
    currentUser = null;
    profile = null;
    dashboard.hidden = true;
    authPanel.hidden = false;
    showAuthMode(mode);
  }

  function friendlyError(error) {
    const message = error?.message || '';
    if (/invalid login credentials/i.test(message)) return 'ইমেইল বা পাসওয়ার্ড সঠিক নয়।';
    if (/email not confirmed/i.test(message)) return 'ইমেইল যাচাই করে তারপর লগইন করুন।';
    if (/already registered/i.test(message)) return 'এই ইমেইলে অ্যাকাউন্ট আছে। লগইন করুন।';
    return message || 'অনুরোধটি সম্পন্ন হয়নি। আবার চেষ্টা করুন।';
  }

  async function withButton(button, busyText, task, statusNode) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    try {
      await task();
    } catch (error) {
      console.error('Account request failed:', error);
      setStatus(statusNode || (authPanel.hidden ? dashboardStatus : authStatus), friendlyError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function loadPublishedArticles() {
    if (publishedArticles) return publishedArticles;
    const response = await fetch('/articles.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('সংবাদের তালিকা লোড করা যায়নি।');
    const data = await response.json();
    if (!Array.isArray(data.articles)) throw new Error('সংবাদের তালিকার গঠন সঠিক নয়।');
    publishedArticles = data.articles.filter((item) => item.status !== 'draft');
    return publishedArticles;
  }

  function emptyState(message) {
    const node = document.createElement('p');
    node.className = 'empty-state';
    node.textContent = message;
    return node;
  }

  function makeArticleRow(article, saved) {
    const row = document.createElement('article');
    row.className = 'article-row';
    const info = document.createElement('div');
    const title = document.createElement('h3');
    const link = document.createElement('a');
    link.href = article.path;
    link.textContent = article.title;
    title.append(link);
    const summary = document.createElement('p');
    summary.textContent = article.summary || 'প্রতিবেদনটি পড়ুন';
    info.append(title, summary);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small-action';
    button.textContent = saved ? 'তালিকা থেকে সরান' : 'সংরক্ষণ করুন';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const request = saved
        ? client.from('saved_articles').delete().eq('user_id', currentUser.id).eq('article_id', article.id)
        : client.from('saved_articles').insert({ user_id: currentUser.id, article_id: article.id });
      const { error } = await request;
      if (error) {
        console.error('Unable to update saved article:', error);
        setStatus(dashboardStatus, 'খবরটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।', 'error');
      } else {
        setStatus(dashboardStatus, saved ? 'সংরক্ষিত খবরের তালিকা থেকে সরানো হয়েছে।' : 'খবরটি সংরক্ষিত হয়েছে।', 'success');
        await loadSavedArticles();
      }
      button.disabled = false;
    });
    row.append(info, button);
    return row;
  }

  async function loadSavedArticles() {
    const list = byId('saved-article-list');
    list.replaceChildren(emptyState('খবরের তালিকা লোড হচ্ছে…'));
    try {
      const [articles, savedResult] = await Promise.all([
        loadPublishedArticles(),
        client.from('saved_articles').select('article_id').eq('user_id', currentUser.id)
      ]);
      if (savedResult.error) throw savedResult.error;
      const savedIds = new Set(savedResult.data.map((item) => item.article_id));
      list.replaceChildren();
      if (!articles.length) {
        list.append(emptyState('এখন কোনো খবর পাওয়া যায়নি।'));
        return;
      }
      articles.forEach((article) => list.append(makeArticleRow(article, savedIds.has(article.id))));
    } catch (error) {
      console.error('Unable to load saved articles:', error);
      list.replaceChildren(emptyState('সংরক্ষিত খবর লোড করা যায়নি। আবার চেষ্টা করুন।'));
    }
  }

  function statusLabel(status) {
    return ({ pending: 'পর্যালোচনাধীন', approved: 'অনুমোদিত', rejected: 'গৃহীত হয়নি' })[status] || 'অজানা';
  }

  function reviewRow(item) {
    const row = document.createElement('article');
    row.className = 'review-row';
    const info = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = item.title || item.desired_role || 'আবেদন';
    const note = document.createElement('p');
    const date = item.created_at ? new Date(item.created_at).toLocaleDateString('bn-BD') : '';
    note.textContent = item.review_note ? `${date} · ${item.review_note}` : date;
    info.append(title, note);
    const status = document.createElement('span');
    status.className = 'status-pill';
    status.dataset.status = item.status;
    status.textContent = statusLabel(item.status);
    row.append(info, status);
    return row;
  }

  async function loadSubmissions() {
    const list = byId('submission-list');
    list.replaceChildren(emptyState('আপনার প্রতিবেদনগুলো লোড হচ্ছে…'));
    const { data, error } = await client.from('article_submissions')
      .select('id,title,status,review_note,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Unable to load article submissions:', error);
      list.replaceChildren(emptyState('প্রতিবেদনের তালিকা লোড করা যায়নি।'));
      return;
    }
    list.replaceChildren();
    if (!data.length) list.append(emptyState('এখনো কোনো প্রতিবেদন পাঠাননি।'));
    else data.forEach((item) => list.append(reviewRow(item)));
  }

  async function loadStaffApplications() {
    const list = byId('staff-application-list');
    list.replaceChildren(emptyState('আপনার আবেদনগুলো লোড হচ্ছে…'));
    const { data, error } = await client.from('staff_applications')
      .select('id,desired_role,status,review_note,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Unable to load staff applications:', error);
      list.replaceChildren(emptyState('আবেদনের তালিকা লোড করা যায়নি।'));
      return;
    }
    list.replaceChildren();
    if (!data.length) list.append(emptyState('এখনো কোনো আবেদন পাঠাননি।'));
    else data.forEach((item) => list.append(reviewRow(item)));
  }

  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.addEventListener('click', () => showAuthMode(button.dataset.authMode));
  });

  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(registerForm);
    if (values.password !== values.password_confirm) {
      setStatus(authStatus, 'দুইবার লেখা পাসওয়ার্ড এক নয়।', 'error');
      return;
    }
    const button = registerForm.querySelector('[type="submit"]');
    void withButton(button, 'অ্যাকাউন্ট তৈরি হচ্ছে…', async () => {
      const profile = profileValues(values);
      const { data, error } = await client.auth.signUp({
        email: String(values.email).trim(),
        password: values.password,
        options: {
          data: profile,
          emailRedirectTo: `${window.location.origin}/account/`
        }
      });
      if (error) throw error;
      if (data.session && data.user) {
        const { error: profileError } = await client.from('profiles').update(profile).eq('id', data.user.id);
        if (profileError) throw profileError;
        setStatus(authStatus, 'নিবন্ধন সফল হয়েছে। আপনার অ্যাকাউন্ট খুলছে…', 'success');
        await showDashboard(data.user);
      } else {
        registerForm.reset();
        setStatus(authStatus, 'নিবন্ধন হয়েছে। আপনার ইমেইলে পাঠানো যাচাই-লিংকে ক্লিক করে অ্যাকাউন্ট চালু করুন।', 'success');
      }
    });
  });

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = formValues(loginForm);
    const button = loginForm.querySelector('[type="submit"]');
    void withButton(button, 'লগইন হচ্ছে…', async () => {
      const { data, error } = await client.auth.signInWithPassword({
        email: String(values.email).trim(),
        password: values.password
      });
      if (error) throw error;
      await showDashboard(data.user);
    });
  });

  byId('reset-password-button').addEventListener('click', async () => {
    const email = loginForm.elements.namedItem('email').value.trim();
    if (!email) {
      setStatus(authStatus, 'পাসওয়ার্ড রিসেটের লিংক পেতে আগে ইমেইল লিখুন।', 'error');
      return;
    }
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account/`
    });
    if (error) {
      console.error('Password reset request failed:', error);
      setStatus(authStatus, friendlyError(error), 'error');
      return;
    }
    setStatus(authStatus, 'পাসওয়ার্ড পরিবর্তনের লিংক আপনার ইমেইলে পাঠানো হয়েছে।', 'success');
  });

  document.querySelectorAll('.account-menu-item, [data-open-panel]').forEach((button) => {
    button.addEventListener('click', () => setActivePanel(button.dataset.panel || button.dataset.openPanel));
  });

  byId('profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    void withButton(button, 'সংরক্ষণ হচ্ছে…', async () => {
      const values = profileValues(formValues(form));
      const { data, error } = await client.from('profiles').update(values)
        .eq('id', currentUser.id).select('*').single();
      if (error) throw error;
      profile = data;
      const { error: metadataError } = await client.auth.updateUser({ data: values });
      if (metadataError) throw metadataError;
      await loadProfile(currentUser);
      setStatus(dashboardStatus, 'আপনার তথ্য সংরক্ষণ হয়েছে।', 'success');
    });
  });

  profilePhotoInput.addEventListener('change', () => {
    const file = profilePhotoInput.files?.[0];
    profilePhotoUploadButton.disabled = !file;
    setStatus(profilePhotoStatus, '');
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = '';
    if (!file) {
      setProfilePhoto(currentUser?.user_metadata?.avatar_url, profile?.full_name);
      return;
    }
    try {
      validateProfilePhoto(file);
      photoPreviewUrl = URL.createObjectURL(file);
      const preview = byId('profile-photo-preview');
      preview.src = photoPreviewUrl;
      preview.hidden = false;
      byId('profile-photo-fallback').hidden = true;
    } catch (error) {
      profilePhotoInput.value = '';
      profilePhotoUploadButton.disabled = true;
      setProfilePhoto(currentUser?.user_metadata?.avatar_url, profile?.full_name);
      setStatus(profilePhotoStatus, error.message, 'error');
    }
  });

  profilePhotoUploadButton.addEventListener('click', () => {
    const file = profilePhotoInput.files?.[0];
    void withButton(profilePhotoUploadButton, 'ছবি সংরক্ষণ হচ্ছে…', async () => {
      if (!file) throw new Error('আগে একটি প্রোফাইল ছবি বেছে নিন।');
      validateProfilePhoto(file);
      const objectPath = `${currentUser.id}/avatar`;
      const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(objectPath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: true
      });
      if (uploadError) throw uploadError;
      const { data: publicData } = client.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
      const photoUrl = `${publicData.publicUrl}?v=${Date.now()}`;
      const { data, error: metadataError } = await client.auth.updateUser({
        data: { avatar_url: photoUrl }
      });
      if (metadataError) throw metadataError;
      currentUser = data.user;
      setProfilePhoto(photoUrl, profile?.full_name);
      profilePhotoInput.value = '';
      profilePhotoUploadButton.disabled = true;
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      photoPreviewUrl = '';
      setStatus(profilePhotoStatus, 'প্রোফাইল ছবি সংরক্ষণ হয়েছে।', 'success');
    }, profilePhotoStatus).finally(() => {
      profilePhotoUploadButton.disabled = !profilePhotoInput.files?.[0];
    });
  });

  byId('security-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    if (values.new_password !== values.confirm_password) {
      setStatus(dashboardStatus, 'নতুন পাসওয়ার্ড দুই ঘরে একইভাবে লিখুন।', 'error');
      return;
    }
    if (values.new_password.length < 8) {
      setStatus(dashboardStatus, 'নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।', 'error');
      return;
    }
    const button = event.currentTarget.querySelector('[type="submit"]');
    void withButton(button, 'পাসওয়ার্ড বদলানো হচ্ছে…', async () => {
      const { error: verifyError } = await client.auth.signInWithPassword({
        email: currentUser.email,
        password: values.current_password
      });
      if (verifyError) throw new Error('বর্তমান পাসওয়ার্ড সঠিক নয়।');
      const { error } = await client.auth.updateUser({ password: values.new_password });
      if (error) throw error;
      form.reset();
      setStatus(dashboardStatus, 'পাসওয়ার্ড নিরাপদে পরিবর্তন হয়েছে।', 'success');
    });
  });

  byId('submission-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    const button = form.querySelector('[type="submit"]');
    void withButton(button, 'প্রতিবেদন পাঠানো হচ্ছে…', async () => {
      const imageUrl = String(values.image_url || '').trim();
      if (imageUrl && !imageUrl.startsWith('https://')) {
        throw new Error('ছবির লিংকটি https:// দিয়ে শুরু হতে হবে।');
      }
      const { error } = await client.from('article_submissions').insert({
        user_id: currentUser.id,
        title: String(values.title).trim(),
        summary: String(values.summary || '').trim(),
        body: String(values.body).trim(),
        category: values.category,
        image_url: imageUrl || null,
        source_note: String(values.source_note || '').trim()
      });
      if (error) throw error;
      form.reset();
      setStatus(dashboardStatus, 'প্রতিবেদনটি পর্যালোচনার জন্য জমা হয়েছে।', 'success');
      await loadSubmissions();
    });
  });

  byId('staff-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    const button = form.querySelector('[type="submit"]');
    void withButton(button, 'আবেদন পাঠানো হচ্ছে…', async () => {
      const portfolioUrl = String(values.portfolio_url || '').trim();
      if (portfolioUrl && !portfolioUrl.startsWith('https://')) {
        throw new Error('পোর্টফোলিওর লিংকটি https:// দিয়ে শুরু হতে হবে।');
      }
      const { error } = await client.from('staff_applications').insert({
        user_id: currentUser.id,
        full_name: String(values.full_name).trim(),
        phone: String(values.phone).trim(),
        district: String(values.district || '').trim(),
        desired_role: values.desired_role,
        experience: String(values.experience || '').trim(),
        portfolio_url: portfolioUrl || null,
        statement: String(values.statement).trim()
      });
      if (error) throw error;
      form.reset();
      setStatus(dashboardStatus, 'আপনার আবেদনটি সম্পাদকীয় দলের কাছে পাঠানো হয়েছে।', 'success');
      await loadStaffApplications();
    });
  });

  byId('logout-button').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('Unable to sign out:', error);
      setStatus(dashboardStatus, friendlyError(error), 'error');
      return;
    }
    showSignedOut('login');
  });

  if (!client) {
    setStatus(authStatus, 'অ্যাকাউন্ট সেবা এখন লোড করা যাচ্ছে না। পরে আবার চেষ্টা করুন।', 'error');
    return;
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) void showDashboard(session.user);
    else if (!dashboard.hidden) showSignedOut('login');
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    if (data.session?.user) void showDashboard(data.session.user);
    else showSignedOut(
      new URLSearchParams(window.location.search).get('view') === 'login' ||
      /^\/login\/?$/.test(window.location.pathname) ? 'login' : 'register'
    );
  }).catch((error) => {
    console.error('Unable to restore account session:', error);
    showSignedOut('register');
    setStatus(authStatus, friendlyError(error), 'error');
  });
})();
