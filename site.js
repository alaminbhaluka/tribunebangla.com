(() => {
  'use strict';

  const main = document.querySelector('.PrimeItWorld_main');
  const SUPABASE_URL = 'https://rvffsavdvetdmhnwgivz.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K4ir8_k1DY9EOhoC-wUT8A_8r01CJxu';
  const homeMarkup = main?.innerHTML || '';
  const homeTitle = document.title;
  let routeRendered = false;
  const root = window.location.origin;
  const text = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const postPattern = /\/post\/(\d+)\/?$/;
  const categoryRoutes = {
    national: { title: 'জাতীয়', selector: '.national-section' },
    politics: { title: 'রাজনীতি', selector: '.politics-section' },
    international: { title: 'আন্তর্জাতিক' },
    economy: { title: 'অর্থনীতি', selector: '.economics-section' },
    country: { title: 'সারাদেশ', regions: ['ঢাকা', 'চট্টগ্রাম', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'সিলেট', 'রংপুর', 'ময়মনসিংহ'] },
    dhaka: { title: 'ঢাকা' },
    chattogram: { title: 'চট্টগ্রাম' },
    rajshahi: { title: 'রাজশাহী' },
    khulna: { title: 'খুলনা' },
    barishal: { title: 'বরিশাল' },
    sylhet: { title: 'সিলেট' },
    rangpur: { title: 'রংপুর' },
    mymensingh: { title: 'ময়মনসিংহ' },
    sports: { title: 'খেলাধুলা', selector: '.sports_section' },
    entertainment: { title: 'বিনোদন', selector: '.entertainment-section' },
    education: { title: 'শিক্ষা' },
    health: { title: 'স্বাস্থ্য' },
    islam: { title: 'ইসলাম', selector: '#islamic-hub' },
    'islam-religion': { title: 'ইসলামিক খবর', selector: '#islamic-hub .ih-news' }
  };

  function collectArticles() {
    const records = new Map();
    document.querySelectorAll('a[href*="/post/"]').forEach((link) => {
      const url = new URL(link.href, root);
      const match = url.pathname.match(postPattern);
      if (!match) return;

      const card = link.closest('.sixColNewsBox, .threeColNewsBox, .fourColNewsBox, .trd_news_item, .mainLeadNews, .leadSidebarNews, .midLeadNews') || link;
      const image = card.querySelector('img') || link.querySelector('img');
      const title = text(card.querySelector('h2, h3, h4')?.textContent) || text(image?.alt) || text(link.textContent);
      if (!title) return;

      const candidate = {
        id: match[1],
        path: `/post/${match[1]}/`,
        title,
        summary: text(card.querySelector('p')?.textContent),
        image: image?.dataset.src || image?.getAttribute('src') || ''
      };
      const previous = records.get(candidate.id);
      if (!previous || candidate.summary.length > previous.summary.length) records.set(candidate.id, candidate);
    });
    return [...records.values()];
  }

  let articles = collectArticles();

  async function loadArticleRecords() {
    try {
      const response = await fetch('/articles.json');
      if (!response.ok) throw new Error(`Article data returned ${response.status}`);
      const data = await response.json();
      const records = data?.articles;
      if (!Array.isArray(records) || records.some((record) =>
        !record || typeof record.id !== 'string' || typeof record.path !== 'string' ||
        typeof record.title !== 'string' || typeof record.summary !== 'string' ||
        typeof record.image !== 'string' ||
        (record.body !== undefined && typeof record.body !== 'string') ||
        (record.status !== undefined && !['draft', 'published'].includes(record.status))
      )) {
        throw new Error('Article data has an invalid format');
      }
      articles = records;
      try {
        const databaseResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/news_articles?select=id,title,summary,body,image_url,category,status&status=eq.published&order=created_at.desc`,
          {
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            },
            cache: 'no-store'
          }
        );
        if (!databaseResponse.ok) throw new Error(`Published news returned ${databaseResponse.status}`);
        const databaseRecords = await databaseResponse.json();
        if (!Array.isArray(databaseRecords)) throw new Error('Published news has an invalid format');
        const published = databaseRecords.map((record) => ({
          id: String(record.id),
          path: `/post/${record.id}/`,
          title: record.title,
          summary: record.summary || '',
          body: record.body || '',
          image: record.image_url || '',
          category: record.category || '',
          status: record.status
        }));
        articles = [...published, ...records];
      } catch (error) {
        console.error('Unable to load published database news; keeping static articles:', error);
      }
      if (/^\/post\/\d+\/?$/.test(window.location.pathname) || window.location.pathname === '/search') {
        renderRoute();
      } else {
        renderLatestArticles();
      }
    } catch (error) {
      console.error('Unable to load structured article data; using homepage snapshot:', error);
    }
  }

  function loadDeferredImages(scope = document) {
    scope.querySelectorAll('img').forEach((image) => {
      const inlineFallback = image.getAttribute('onerror') || '';
      const useBrandFallback = () => {
        const fallback = '/Logo.jpg';
        if (!image.src.endsWith(fallback)) {
          image.classList.add('site-image-fallback');
          image.src = fallback;
        }
      };
      if (!image.closest('.header_logo, .footer-logo') && !inlineFallback.includes('i.ytimg.com')) {
        image.addEventListener('error', useBrandFallback, { once: true });
        if (image.complete && image.naturalWidth === 0) useBrandFallback();
      }

      const source = image.dataset.src;
      if (!source) return;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = source;
    });
  }

  function createRoutePage(title) {
    if (!main) return null;
    routeRendered = true;
    main.classList.remove('home');
    main.replaceChildren();
    document.title = `${title} | ট্রিবিউন বাংলা`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = window.location.href;
    const page = document.createElement('section');
    page.className = 'site-route-page';
    const heading = document.createElement('h1');
    heading.textContent = title;
    page.append(heading);
    main.append(page);
    return page;
  }

  function addHomeLink(container) {
    const link = document.createElement('a');
    link.className = 'site-home-link';
    link.href = '/';
    link.textContent = 'মূল পাতায় ফিরে যান';
    container.append(link);
  }

  function createCard(record) {
    const card = document.createElement('article');
    card.className = 'site-result-card';
    if (record.image) {
      const image = document.createElement('img');
      image.src = record.image;
      image.alt = record.title;
      image.loading = 'lazy';
      card.append(image);
    }
    const content = document.createElement('div');
    const heading = document.createElement('h2');
    const link = document.createElement('a');
    link.href = record.path;
    link.textContent = record.title;
    heading.append(link);
    content.append(heading);
    if (record.summary) {
      const summary = document.createElement('p');
      summary.textContent = record.summary;
      content.append(summary);
    }
    card.append(content);
    return card;
  }

  function isPublished(record) {
    return record.status !== 'draft';
  }

  function renderLatestArticles() {
    if (!main || !['/', '/index.html'].includes(window.location.pathname)) return;
    main.querySelector('.site-cms-latest')?.remove();
    const existingIds = new Set([...main.querySelectorAll('a[href*="/post/"]')].map((link) => {
      const match = new URL(link.href, root).pathname.match(postPattern);
      return match ? match[1] : '';
    }));
    const latest = articles.filter((record) => isPublished(record) && !existingIds.has(record.id)).slice(0, 6);
    if (!latest.length) return;

    const section = document.createElement('section');
    section.className = 'site-cms-latest';
    const heading = document.createElement('h2');
    heading.textContent = 'সর্বশেষ প্রকাশিত সংবাদ';
    section.append(heading);
    const list = document.createElement('div');
    list.className = 'site-results-list';
    latest.forEach((record) => list.append(createCard(record)));
    section.append(list);
    main.prepend(section);
  }

  function renderSearch(query) {
    const page = createRoutePage(`অনুসন্ধান: ${query}`);
    if (!page) return;
    const needle = text(query).toLocaleLowerCase();
    const results = needle
      ? articles.filter((record) => isPublished(record) &&
        `${record.title} ${record.summary} ${record.body || ''}`.toLocaleLowerCase().includes(needle))
      : [];
    const status = document.createElement('p');
    status.className = 'site-route-status';
    status.textContent = !needle
      ? 'খোঁজার জন্য উপরের ঘরে একটি শব্দ লিখুন।'
      : results.length ? `${results.length}টি সংবাদ পাওয়া গেছে` : 'কোনো সংবাদ মেলেনি। অন্য শব্দ দিয়ে চেষ্টা করুন।';
    page.append(status);
    const list = document.createElement('div');
    list.className = 'site-results-list';
    results.forEach((record) => list.append(createCard(record)));
    page.append(list);
    addHomeLink(page);
  }

  function renderArticle(id) {
    const record = articles.find((item) => item.id === id && isPublished(item));
    const page = createRoutePage(record ? record.title : 'সংবাদটি পাওয়া যায়নি');
    if (!page) return;
    if (!record) {
      const message = document.createElement('p');
      message.className = 'site-route-note';
      message.textContent = 'এই হোমপেজের সংরক্ষিত তথ্যে প্রতিবেদনটি নেই।';
      page.append(message);
      addHomeLink(page);
      return;
    }

    if (record.image) {
      const image = document.createElement('img');
      image.className = 'site-article-image';
      image.src = record.image;
      image.alt = record.title;
      image.loading = 'eager';
      page.append(image);
    }
    if (record.summary && !record.body) {
      const summary = document.createElement('p');
      summary.className = 'site-article-summary';
      summary.textContent = record.summary;
      page.append(summary);
    }
    if (record.body) {
      const body = document.createElement('div');
      body.className = 'site-article-body';
      record.body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean).forEach((paragraph) => {
        const node = document.createElement('p');
        node.textContent = paragraph;
        body.append(node);
      });
      page.append(body);
    } else {
      const note = document.createElement('p');
      note.className = 'site-route-note';
      note.textContent = 'এটি হোমপেজে থাকা সংক্ষিপ্ত তথ্য। পূর্ণ প্রতিবেদন ও পুরোনো সংবাদ-আর্কাইভের জন্য মূল CMS/নিবন্ধের তথ্য প্রয়োজন।';
      page.append(note);
    }
    const related = articles.filter((item) => isPublished(item) && item.id !== id).slice(0, 4);
    if (related.length) {
      const heading = document.createElement('h2');
      heading.textContent = 'আরও সংবাদ';
      page.append(heading);
      const list = document.createElement('div');
      list.className = 'site-results-list';
      related.forEach((item) => list.append(createCard(item)));
      page.append(list);
    }
    addHomeLink(page);
    document.title = `${record.title} | ট্রিবিউন বাংলা`;
  }

  function categoryContent(slug) {
    const config = categoryRoutes[slug];
    if (!config || !main) return null;
    if (config.selector) {
      const selected = document.querySelector(config.selector);
      if (selected) return [selected.cloneNode(true)];
    }

    if (config.regions) {
      return [...main.querySelectorAll('.sub_section')].filter((section) => {
        const heading = section.querySelector('.sub_sec_title');
        return heading && config.regions.includes(text(heading.textContent));
      }).map((section) => section.cloneNode(true));
    }

    const heading = [...main.querySelectorAll('h2, h3, h4')].find((item) => text(item.textContent) === config.title);
    if (!heading) return [];
    const column = heading.closest('.sub_section');
    const section = heading.closest('section');
    const content = column || section;
    return content ? [content.cloneNode(true)] : [];
  }

  function renderCategory(slug) {
    const config = categoryRoutes[slug];
    const title = config ? config.title : 'বিভাগ';
    const content = categoryContent(slug) || [];
    const page = createRoutePage(title);
    if (!page) return;
    if (!content.length) {
      const message = document.createElement('p');
      message.className = 'site-route-note';
      message.textContent = 'এই বিভাগের আলাদা আর্কাইভ এই হোমপেজের সংরক্ষিত তথ্যে নেই।';
      page.append(message);
    } else {
      content.forEach((item) => page.append(item));
    }
    const categoryArticles = articles.filter((record) =>
      isPublished(record) && record.category === title
    );
    if (categoryArticles.length) {
      const heading = document.createElement('h2');
      heading.textContent = 'সাম্প্রতিক সংবাদ';
      page.append(heading);
      const list = document.createElement('div');
      list.className = 'site-results-list';
      categoryArticles.forEach((record) => list.append(createCard(record)));
      page.append(list);
    }
    addHomeLink(page);
  }

  function renderRoute() {
    if (!main) return;
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/index.html') {
      if (routeRendered) {
        main.innerHTML = homeMarkup;
        main.classList.add('home');
        routeRendered = false;
        document.title = homeTitle;
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) canonical.href = `${root}/`;
        loadDeferredImages(main);
        setupTabs();
        setupPageControls();
        setupPhotoSlider();
        setupIslamicHub();
      }
      renderLatestArticles();
      return;
    }
    const articleMatch = path.match(/^\/post\/(\d+)$/);
    if (articleMatch) {
      renderArticle(articleMatch[1]);
      return;
    }
    if (path === '/search') {
      renderSearch(new URLSearchParams(window.location.search).get('q') || '');
      return;
    }
    const slug = path.slice(1);
    if (categoryRoutes[slug]) {
      renderCategory(slug);
      return;
    }
  }

  function setupSearch() {
    const form = document.querySelector('.srch_form');
    const input = form?.querySelector('input[name="q"]');
    const search = document.querySelector('.sb-search');
    const icon = document.querySelector('.sb-icon-search');
    if (!form || !input) return;

    icon?.addEventListener('click', () => {
      search?.classList.add('sb-search-open');
      input.focus();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = text(input.value);
      if (!query) return;
      window.history.pushState({}, '', `/search/?q=${encodeURIComponent(query)}`);
      renderSearch(query);
      main?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function setupAccountLinks() {
    const footer = document.querySelector('#menu-footer-menu');
    footer?.querySelectorAll('a').forEach((link) => {
      const label = text(link.textContent);
      if (label === 'নিবন্ধন') link.href = '/register';
      if (label === 'লগইন') link.href = '/login';
    });

    const navigation = document.querySelector('.desktop_navbar_nav');
    if (!navigation || navigation.querySelector('.account-nav-link')) return;
    const item = document.createElement('li');
    item.className = 'menu-item account-nav-link';
    const link = document.createElement('a');
    link.href = '/account';
    link.textContent = '👤 আমার অ্যাকাউন্ট';
    item.append(link);
    navigation.append(item);
  }

  function setupTabs() {
    const tabs = [...document.querySelectorAll('#recentPopular-tab [role="tab"]')];
    tabs.forEach((tab, index) => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
      const activate = () => {
        tabs.forEach((item) => {
          const active = item === tab;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', String(active));
          item.tabIndex = active ? 0 : -1;
          const pane = document.getElementById(item.getAttribute('aria-controls'));
          if (pane) {
            pane.classList.toggle('active', active);
            pane.classList.toggle('show', active);
          }
        });
      };
      tab.addEventListener('click', activate);
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        next.click();
      });
    });
  }

  function setupPageControls() {
    const closeAd = document.querySelector('#closeAd');
    closeAd?.setAttribute('role', 'button');
    closeAd?.setAttribute('tabindex', '0');
    const hideAd = () => {
      const wrapper = document.querySelector('.bottom_ad_wrap');
      if (wrapper) wrapper.hidden = true;
    };
    closeAd?.addEventListener('click', hideAd);
    closeAd?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        hideAd();
      }
    });

    const top = document.querySelector('.pitw_scrollTop');
    if (top) {
      top.setAttribute('role', 'button');
      top.setAttribute('tabindex', '0');
      top.setAttribute('aria-label', 'উপরে যান');
      const goTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
      top.addEventListener('click', goTop);
      top.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          goTop();
        }
      });
      const update = () => top.classList.toggle('is-visible', window.scrollY > 500);
      window.addEventListener('scroll', update, { passive: true });
      update();
    }
  }

  function setupPhotoSlider() {
    const slider = document.querySelector('#photo_slider');
    if (!slider || slider.children.length < 2) return;
    const controls = document.createElement('div');
    controls.className = 'site-slider-controls';
    [['আগের ছবি', -1], ['পরের ছবি', 1]].forEach(([label, direction]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => slider.scrollBy({ left: direction * slider.clientWidth, behavior: 'smooth' }));
      controls.append(button);
    });
    slider.after(controls);
  }

  function setupIslamicHub() {
    const hub = document.querySelector('#islamic-hub');
    if (!hub) return;
    const citySelect = hub.querySelector('.ih-city');
    const timesList = hub.querySelector('.ih-times');
    const nextPrayer = hub.querySelector('.ih-next');
    const dateNode = hub.querySelector('.ih-date');
    const message = hub.querySelector('.ih-amsg');
    const reciterSelect = hub.querySelector('.ih-reciter');
    const surahSelect = hub.querySelector('.ih-surah');
    const audio = hub.querySelector('audio');
    const repeatButton = hub.querySelector('.ih-rep');
    if (!citySelect || !timesList || !nextPrayer || !message || !reciterSelect || !surahSelect || !audio) return;
    nextPrayer.setAttribute('role', 'status');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');

    const cities = [
      ['ঢাকা', 'Dhaka'], ['চট্টগ্রাম', 'Chittagong'], ['সিলেট', 'Sylhet'], ['খুলনা', 'Khulna'],
      ['রাজশাহী', 'Rajshahi'], ['বরিশাল', 'Barisal'], ['রংপুর', 'Rangpur'], ['ময়মনসিংহ', 'Mymensingh']
    ];
    cities.forEach(([label, value]) => citySelect.add(new Option(label, value)));
    reciterSelect.add(new Option('মিশারি আল-আফাসি', 'ar.alafasy'));

    const prayerNames = { Fajr: 'ফজর', Dhuhr: 'যোহর', Asr: 'আসর', Maghrib: 'মাগরিব', Isha: 'ইশা' };
    const banglaDigits = (value) => String(value).replace(/\d/g, (digit) => '০১২৩৪৫৬৭৮৯'[Number(digit)]);
    let timings = null;
    let ayahAudio = [];
    let ayahIndex = 0;
    let repeat = false;

    function showNextPrayer() {
      if (!timings) return;
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      const current = Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60 +
        Number(parts.find((part) => part.type === 'minute')?.value || 0);
      const ordered = Object.keys(prayerNames).map((key) => {
        const [hour, minute] = timings[key].split(':').map(Number);
        return { key, minutes: hour * 60 + minute };
      });
      const next = ordered.find((item) => item.minutes > current) || ordered[0];
      nextPrayer.textContent = `পরবর্তী ওয়াক্ত: ${prayerNames[next.key]} — ${banglaDigits(timings[next.key])}`;
    }

    async function loadPrayerTimes() {
      nextPrayer.textContent = 'নামাজের সময় লোড হচ্ছে…';
      try {
        const response = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(citySelect.value)}&country=Bangladesh&method=1`);
        if (!response.ok) throw new Error(`Prayer-time API returned ${response.status}`);
        const result = await response.json();
        if (result.code !== 200 || !result.data?.timings) throw new Error('Prayer-time API returned no timings');
        timings = result.data.timings;
        timesList.replaceChildren();
        ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].forEach((key) => {
          const item = document.createElement('li');
          item.textContent = `${prayerNames[key] || 'সূর্যোদয়'}: ${banglaDigits(timings[key])}`;
          if (key === 'Sunrise') item.textContent = `সূর্যোদয়: ${banglaDigits(timings[key])}`;
          timesList.append(item);
        });
        if (dateNode && result.data.date?.hijri) {
          const hijri = result.data.date.hijri;
          dateNode.textContent = `${banglaDigits(hijri.day)} ${hijri.month.en} ${banglaDigits(hijri.year)} হিজরি`;
        }
        showNextPrayer();
      } catch (error) {
        console.error('Unable to load prayer times:', error);
        timings = null;
        nextPrayer.textContent = 'নামাজের সময়সূচি এখন পাওয়া যাচ্ছে না।';
        timesList.replaceChildren();
      }
    }

    async function loadSurahs() {
      message.textContent = 'কুরআনের সূরা তালিকা লোড হচ্ছে…';
      try {
        const response = await fetch('https://api.alquran.cloud/v1/surah');
        if (!response.ok) throw new Error(`Quran API returned ${response.status}`);
        const result = await response.json();
        if (result.code !== 200 || !Array.isArray(result.data)) throw new Error('Quran API returned no surahs');
        result.data.forEach((surah) => surahSelect.add(new Option(`${surah.number}. ${surah.name} (${surah.englishName})`, surah.number)));
        surahSelect.value = '1';
        await loadSurahAudio();
      } catch (error) {
        console.error('Unable to load Quran surahs:', error);
        message.textContent = 'সূরা তালিকা এখন লোড করা যাচ্ছে না।';
      }
    }

    async function loadSurahAudio() {
      if (!surahSelect.value) return;
      message.textContent = 'তিলাওয়াত প্রস্তুত হচ্ছে…';
      try {
        const response = await fetch(`https://api.alquran.cloud/v1/surah/${encodeURIComponent(surahSelect.value)}/${encodeURIComponent(reciterSelect.value)}`);
        if (!response.ok) throw new Error(`Quran audio API returned ${response.status}`);
        const result = await response.json();
        ayahAudio = result.data?.ayahs?.map((ayah) => ayah.audio).filter(Boolean) || [];
        if (!ayahAudio.length) throw new Error('Quran audio API returned no audio');
        ayahIndex = 0;
        audio.pause();
        audio.src = ayahAudio[0];
        audio.load();
        message.textContent = 'তিলাওয়াত প্রস্তুত। চালাতে প্লে চাপুন।';
      } catch (error) {
        console.error('Unable to load Quran audio:', error);
        message.textContent = 'এই সূরার তিলাওয়াত এখন পাওয়া যাচ্ছে না।';
      }
    }

    citySelect.addEventListener('change', loadPrayerTimes);
    surahSelect.addEventListener('change', loadSurahAudio);
    reciterSelect.addEventListener('change', loadSurahAudio);
    hub.querySelector('.ih-prev')?.addEventListener('click', () => {
      if (surahSelect.selectedIndex > 0) {
        surahSelect.selectedIndex -= 1;
        loadSurahAudio();
      }
    });
    hub.querySelector('.ih-nextb')?.addEventListener('click', () => {
      if (surahSelect.selectedIndex < surahSelect.options.length - 1) {
        surahSelect.selectedIndex += 1;
        loadSurahAudio();
      }
    });
    repeatButton?.addEventListener('click', () => {
      repeat = !repeat;
      repeatButton.setAttribute('aria-pressed', String(repeat));
    });
    audio.addEventListener('ended', () => {
      if (ayahIndex + 1 < ayahAudio.length) {
        ayahIndex += 1;
        audio.src = ayahAudio[ayahIndex];
        audio.play().catch((error) => console.error('Unable to continue Quran recitation:', error));
      } else if (repeat && ayahAudio.length) {
        ayahIndex = 0;
        audio.src = ayahAudio[0];
        audio.play().catch((error) => console.error('Unable to repeat Quran recitation:', error));
      }
    });
    audio.addEventListener('error', () => {
      message.textContent = 'অডিও চালানো যাচ্ছে না। পরে আবার চেষ্টা করুন।';
    });

    loadPrayerTimes();
    loadSurahs();
    window.setInterval(showNextPrayer, 60000);
  }

  setupAccountLinks();
  setupSearch();
  renderRoute();
  setupTabs();
  setupPageControls();
  setupPhotoSlider();
  loadDeferredImages();
  setupIslamicHub();
  loadArticleRecords();
  window.addEventListener('popstate', renderRoute);
})();
