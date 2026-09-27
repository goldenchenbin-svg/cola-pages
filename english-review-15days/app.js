'use strict';

(() => {
  const data = window.STUDY_DATA;
  const STORAGE_KEY = 'english-review-course-v1';
  const OFFSETS = [1, 3, 7];
  const DAY_RANGES = [
    { words: [1, 16], phrases: [1, 13] },
    { words: [17, 31], phrases: [14, 26] },
    { words: [32, 47], phrases: [27, 39] },
    { words: [48, 62], phrases: [40, 52] },
    { words: [63, 78], phrases: [53, 65] },
    { words: [79, 93], phrases: [66, 78] },
    { words: [94, 109], phrases: [79, 91] },
    { words: [110, 124], phrases: [92, 104] },
    { words: [125, 140], phrases: [105, 117] },
    { words: [141, 155], phrases: [118, 130] }
  ];
  const LESSONS = [
    { day: 1, title: '常用前缀', subtitle: '从词根线索理解常见前缀', kind: 'affix' },
    { day: 2, title: '常用后缀', subtitle: '按词性归纳名词、动词、形容词与副词后缀', kind: 'affix' },
    ...DAY_RANGES.map((range, index) => ({
      day: index + 3,
      title: '重点词语 + 核心短语',
      subtitle: `词汇 ${range.words[0]}–${range.words[1]} · 短语 ${range.phrases[0]}–${range.phrases[1]}`,
      kind: 'vocabulary'
    })),
    { day: 13, title: '万能句子', subtitle: '段首句、中间段句与结尾句', kind: 'sentences' },
    { day: 14, title: '写作模板', subtitle: '书信、口头通知、议论文、图表与图画作文', kind: 'templates' },
    { day: 15, title: '综合测试', subtitle: '翻卡回顾全部课程内容，查漏补缺', kind: 'test' }
  ];

  const emptyState = {
    selectedDay: 1,
    completedLessons: {},
    newDone: {},
    reviewDone: {},
    retries: {},
    stats: {}
  };
  let state = loadState();
  let selectedDay = clampDay(Number(state.selectedDay) || 1);
  let searchTerm = '';
  let activeSession = null;
  let isFlipped = false;
  let storageAvailable = true;

  const elements = {
    daySelect: document.querySelector('#day-select'),
    dayGrid: document.querySelector('#day-grid'),
    prevDay: document.querySelector('#prev-day'),
    nextDay: document.querySelector('#next-day'),
    search: document.querySelector('#search-input'),
    clearSearch: document.querySelector('#clear-search'),
    lessonContent: document.querySelector('#lesson-content'),
    overallCount: document.querySelector('#overall-count'),
    overallBar: document.querySelector('#overall-bar'),
    overallCaption: document.querySelector('#overall-caption'),
    footerToday: document.querySelector('#footer-today'),
    storageNote: document.querySelector('.storage-note')
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return structuredClone(emptyState);
      return {
        ...structuredClone(emptyState),
        ...saved,
        completedLessons: saved.completedLessons || {},
        newDone: saved.newDone || {},
        reviewDone: saved.reviewDone || {},
        retries: saved.retries || {},
        stats: saved.stats || {}
      };
    } catch (_error) {
      return structuredClone(emptyState);
    }
  }

  function saveState() {
    state.selectedDay = selectedDay;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
      elements.storageNote.classList.remove('storage-unavailable');
      elements.storageNote.textContent = '进度仅保存在本设备';
    } catch (_error) {
      storageAvailable = false;
      elements.storageNote.classList.add('storage-unavailable');
      elements.storageNote.textContent = '瀏覽器未允許本地保存';
    }
  }

  function clampDay(day) {
    return Math.min(15, Math.max(1, day));
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function tomorrowKey() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return localDateKey(tomorrow);
  }

  function createCard({ id, sourceDay, type, front, meaning = '', phonetic = '', details = [], raw = '' }) {
    return {
      id,
      sourceDay,
      type,
      front: String(front || '').trim(),
      meaning: String(meaning || '').trim(),
      phonetic: String(phonetic || '').trim(),
      details: details.map(line => String(line).trim()).filter(Boolean),
      raw,
      searchText: [front, meaning, phonetic, ...details, raw].join(' ').toLocaleLowerCase()
    };
  }

  function phraseTermAndMeaning(item) {
    const title = item.title || '';
    const boundary = title.search(/[\u3400-\u9fff]/);
    if (boundary < 0) return { term: item.term || title, meaning: item.meaning || '' };
    return {
      term: title.slice(0, boundary).trim(),
      meaning: title.slice(boundary).trim()
    };
  }

  function buildCards() {
    const byDay = Array.from({ length: 16 }, () => []);

    data.affixes.prefixes.forEach((raw, index) => {
      const boundary = raw.search(/[：:]/);
      const front = boundary >= 0 ? raw.slice(0, boundary).trim() : raw.trim();
      const meaning = boundary >= 0 ? raw.slice(boundary + 1).trim() : '';
      byDay[1].push(createCard({ id: `prefix-${index + 1}`, sourceDay: 1, type: '前缀', front, meaning, raw }));
    });

    let suffixIndex = 0;
    data.affixes.suffixGroups.forEach(group => {
      group.items.forEach(raw => {
        suffixIndex += 1;
        const split = raw.trim().match(/^(.+?)\s{2,}(.+)$/);
        byDay[2].push(createCard({
          id: `suffix-${suffixIndex}`,
          sourceDay: 2,
          type: group.title,
          front: split ? split[1].trim() : raw.trim(),
          meaning: split ? split[2].trim() : '',
          raw
        }));
      });
    });

    const wordCards = data.vocabulary.map(item => createCard({
      id: `word-${item.number}`,
      sourceDay: 0,
      type: '重点词语',
      front: item.term,
      meaning: item.meaning,
      phonetic: item.phonetic,
      details: item.details,
      raw: item.title
    }));
    const phraseCards = data.phrases.map(item => {
      const parsed = phraseTermAndMeaning(item);
      return createCard({
        id: `phrase-${item.number}`,
        sourceDay: 0,
        type: '核心短语',
        front: parsed.term,
        meaning: parsed.meaning,
        details: item.details,
        raw: item.title
      });
    });

    DAY_RANGES.forEach((range, index) => {
      const day = index + 3;
      const [wordStart, wordEnd] = range.words;
      const [phraseStart, phraseEnd] = range.phrases;
      byDay[day].push(...wordCards.slice(wordStart - 1, wordEnd));
      byDay[day].push(...phraseCards.slice(phraseStart - 1, phraseEnd));
    });

    let sentenceIndex = 0;
    data.universalSentences.forEach(group => {
      group.items.forEach(item => {
        sentenceIndex += 1;
        byDay[13].push(createCard({
          id: `sentence-${sentenceIndex}`,
          sourceDay: 13,
          type: group.title,
          front: item.title,
          details: item.lines,
          raw: [item.title, ...item.lines].join(' ')
        }));
      });
    });

    let templateIndex = 0;
    data.writingTemplates.forEach(group => {
      group.items.forEach(item => {
        templateIndex += 1;
        const visibleTitle = item.title === group.title ? '模板正文' : item.title;
        byDay[14].push(createCard({
          id: `template-${templateIndex}`,
          sourceDay: 14,
          type: group.title,
          front: `${group.title} · ${visibleTitle}`,
          details: item.lines,
          raw: [group.title, item.title, ...item.lines].join(' ')
        }));
      });
    });

    byDay[15] = byDay.slice(1, 15).flat();
    return byDay;
  }

  const cardsByDay = buildCards();
  const allCourseCards = cardsByDay.slice(1, 15).flat();
  const cardById = new Map(allCourseCards.map(card => [card.id, card]));

  function newDoneKey(day, card) {
    return `${day}:${card.id}`;
  }

  function isNewDone(day, card) {
    return Boolean(state.newDone[newDoneKey(day, card)]);
  }

  function reviewKey(sourceDay, reviewDay, card) {
    return `${sourceDay}:${reviewDay}:${card.id}`;
  }

  function getReviewCards(day) {
    const result = [];
    for (let sourceDay = 1; sourceDay < day; sourceDay += 1) {
      if (!OFFSETS.includes(day - sourceDay)) continue;
      cardsByDay[sourceDay].forEach(card => {
        const key = reviewKey(sourceDay, day, card);
        if (!state.reviewDone[key]) result.push({ ...card, reviewKey: key, sessionLabel: `D${sourceDay} · 第 ${day - sourceDay} 天复习` });
      });
    }
    const today = localDateKey();
    Object.entries(state.retries).forEach(([cardId, dueDate]) => {
      if (dueDate > today || result.some(card => card.id === cardId)) return;
      const card = cardById.get(cardId);
      if (card) result.push({ ...card, isRetry: true, sessionLabel: '错题次日再练' });
    });
    return result;
  }

  function matchesSearch(card) {
    return !searchTerm || card.searchText.includes(searchTerm);
  }

  function filtered(cards) {
    return cards.filter(matchesSearch);
  }

  function getLessonStatus(day) {
    return Boolean(state.completedLessons[day]);
  }

  function buildDayNavigation() {
    elements.daySelect.innerHTML = LESSONS.map(lesson =>
      `<option value="${lesson.day}">D${lesson.day} · ${escapeHTML(lesson.title)}</option>`
    ).join('');
    elements.dayGrid.innerHTML = LESSONS.map(lesson => {
      const selected = lesson.day === selectedDay;
      const completed = getLessonStatus(lesson.day);
      return `<button type="button" class="day-dot${selected ? ' is-current' : ''}${completed ? ' is-complete' : ''}" data-day="${lesson.day}" aria-label="D${lesson.day} ${escapeHTML(lesson.title)}${completed ? '，已完成' : ''}" aria-current="${selected ? 'page' : 'false'}"><span>${lesson.day}</span>${completed ? '<i aria-hidden="true">✓</i>' : ''}</button>`;
    }).join('');
    elements.daySelect.value = String(selectedDay);
  }

  function updateOverallProgress() {
    const completed = LESSONS.filter(lesson => getLessonStatus(lesson.day)).length;
    const percent = Math.round((completed / LESSONS.length) * 100);
    elements.overallCount.textContent = `${completed} / 15 天`;
    elements.overallBar.style.width = `${percent}%`;
    elements.overallCaption.textContent = completed === 15
      ? '15 天课程已全部完成，随时可以回来复习。'
      : completed
        ? `已完成 ${completed} 天，继续按节奏复习。`
        : '完成每天的新课卡片即可记录课程进度。';
  }

  function getForecast(day) {
    if (day === 15) return '今天是全量综合回顾';
    const scheduled = OFFSETS.map(offset => day + offset).filter(reviewDay => reviewDay <= 15);
    return scheduled.length ? `本课安排复习：${scheduled.map(reviewDay => `D${reviewDay}`).join(' / ')}` : '本课复习将在 15 天课程结束后继续';
  }

  function renderDetails(card) {
    const meaning = card.meaning ? `<p class="answer-meaning">${escapeHTML(card.meaning)}</p>` : '';
    const details = card.details.length
      ? `<ul class="answer-details">${card.details.map(line => `<li>${escapeHTML(line)}</li>`).join('')}</ul>`
      : '';
    return `<div class="answer-content">${meaning}${details || (!meaning ? '<p class="answer-meaning">查看原文并回忆它的含义。</p>' : '')}</div>`;
  }

  function speakEnglish(text) {
    if (typeof window.speechSynthesis === 'undefined' || typeof window.SpeechSynthesisUtterance !== 'function') return false;
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.86;
    const voices = synthesis.getVoices();
    const voice = voices.find(item => item.lang.toLowerCase() === 'en-us') || voices.find(item => item.lang.toLowerCase().startsWith('en-'));
    if (voice) utterance.voice = voice;
    synthesis.speak(utterance);
    return true;
  }

  function sessionMarkup(kind, cards, day) {
    if (!activeSession || activeSession.kind !== kind || activeSession.day !== day) return '';
    const visibleCards = filtered(activeSession.cards);
    if (!visibleCards.length) {
      return `<div class="session-box"><p class="empty-state">${searchTerm ? '没有匹配的卡片，请换个关键词。' : '本部分暂时没有待复习卡片。'}</p></div>`;
    }
    activeSession.index = Math.min(activeSession.index, visibleCards.length - 1);
    const card = visibleCards[activeSession.index];
    const index = activeSession.index;
    const flipped = isFlipped;
    const progress = Math.round(((index + (flipped ? 0.5 : 0)) / visibleCards.length) * 100);
    const stats = state.stats[card.id] || { known: 0, again: 0 };
    const canPronounce = ['重点词语', '核心短语'].includes(card.type);
    const speechAvailable = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
    return `
      <div class="session-box" data-session="${kind}">
        <div class="deck-toolbar"><span>${escapeHTML(card.sessionLabel || card.type)}</span><span>${index + 1} / ${visibleCards.length}</span></div>
        <div class="deck-progress"><span style="width:${progress}%"></span></div>
        <article class="flashcard${flipped ? ' is-flipped' : ''}">
          <div class="flashcard-top"><span class="card-kind">${escapeHTML(card.type)}</span><div class="flashcard-top-actions"><span class="card-counter">${index + 1} / ${visibleCards.length}</span>${canPronounce ? `<button class="speak-button" type="button" data-speak="${escapeHTML(card.front)}" aria-label="朗读 ${escapeHTML(card.front)}" title="使用设备英语语音朗读" ${speechAvailable ? '' : 'disabled'}><span aria-hidden="true">🔊</span><span>听读</span></button>` : ''}</div></div>
          <button class="flashcard-face" id="flip-card" type="button" aria-expanded="${flipped}">
            ${flipped ? `<span class="face-label">答案与原文</span>${renderDetails(card)}<span class="flip-hint">点此收起答案</span>` : `<span class="face-label">先回忆，再翻卡</span><strong class="card-front">${escapeHTML(card.front)}</strong>${card.phonetic ? `<span class="card-phonetic" lang="en">${escapeHTML(card.phonetic)}<small>美式 IPA</small></span>` : ''}<span class="flip-hint">轻触查看答案</span>`}
          </button>
          <div class="card-actions${flipped ? ' actions-visible' : ''}">
            <button type="button" class="answer-button again-button" data-answer="again" ${flipped ? '' : 'disabled'}><span>再练</span><small>加入次日错题</small></button>
            <button type="button" class="answer-button know-button" data-answer="known" ${flipped ? '' : 'disabled'}><span>会了</span><small>继续下一张</small></button>
          </div>
          <div class="card-memory">已记住 ${stats.known || 0} 次 · 再练 ${stats.again || 0} 次</div>
        </article>
        <div class="deck-nav"><button type="button" id="previous-card" ${index === 0 ? 'disabled' : ''}>‹ 上一张</button><button type="button" id="skip-card">跳过</button><button type="button" id="next-card">下一张 ›</button></div>
        <p class="deck-instruction">忘记时选“再练”，这张卡会在次日重新出现。</p>
      </div>`;
  }

  function renderSection({ kind, title, eyebrow, description, cards, doneCount, day }) {
    const count = cards.length;
    const filteredCards = filtered(cards);
    const progressText = kind === 'new' ? `${doneCount} / ${count} 已自测` : `${count} 张待复习`;
    const started = activeSession && activeSession.kind === kind && activeSession.day === day;
    const finished = kind === 'new' ? getLessonStatus(day) : count === 0;
    const buttonText = started ? '继续这一组' : finished && kind === 'new' ? '重新自测' : kind === 'review' && !count ? '已完成' : kind === 'review' ? '开始复习' : '开始新课';
    const disabled = kind === 'review' && !count;
    return `
      <section class="learning-section ${kind}-section" aria-label="${escapeHTML(title)}">
        <div class="section-heading">
          <div><span class="eyebrow">${escapeHTML(eyebrow)}</span><h3>${escapeHTML(title)} <span class="count-pill">${count}</span></h3><p>${escapeHTML(description)}</p></div>
          <div class="section-progress"><strong>${progressText}</strong><button class="primary-button section-start" type="button" data-start="${kind}" ${disabled ? 'disabled' : ''}>${buttonText}</button></div>
        </div>
        ${searchTerm && count > 0 && !filteredCards.length ? '<p class="empty-state">当前搜索没有匹配内容。</p>' : ''}
        ${started ? sessionMarkup(kind, cards, day) : ''}
        ${kind === 'new' && !started && finished ? '<p class="done-note">✓ 本课新内容已完成，仍可重新自测。</p>' : ''}
        ${kind === 'review' && !count ? '<p class="empty-state compact-empty">目前没有到期复习。你可以先完成新课，间隔复习会按课程日出现。</p>' : ''}
      </section>`;
  }

  function renderLesson() {
    const lesson = LESSONS[selectedDay - 1];
    const newCards = cardsByDay[selectedDay];
    const allReviews = getReviewCards(selectedDay);
    const reviewCards = filtered(allReviews);
    const doneCount = newCards.filter(card => isNewDone(selectedDay, card)).length;
    const courseComplete = getLessonStatus(selectedDay);
    const lessonCardCount = newCards.length;
    const info = selectedDay === 15
      ? 'D15 将所有前 14 天的学习卡片重新混合，适合闭卷回忆与查漏补缺。'
      : '先主动回忆，再翻看释义、搭配或例句；学习状态会保存在当前浏览器。';
    const searchCount = searchTerm ? `<span class="search-result-count">筛选后：${filtered(newCards).length} 张新课 · ${reviewCards.length} 张复习</span>` : '';
    const completePill = courseComplete ? '<span class="status-pill is-done">✓ 已完成</span>' : '<span class="status-pill">进行中</span>';
    const manualComplete = selectedDay !== 15 && !courseComplete && doneCount === lessonCardCount
      ? '<p class="done-note">新课卡片已全部自测，课程已自动标记完成。</p>' : '';

    elements.lessonContent.innerHTML = `
      <div class="lesson-heading">
        <div class="lesson-kicker"><span class="day-label">DAY ${String(selectedDay).padStart(2, '0')}</span>${completePill}</div>
        <h2 id="lesson-title">${escapeHTML(lesson.title)}</h2>
        <p class="lesson-subtitle">${escapeHTML(lesson.subtitle)}</p>
        <p class="lesson-info">${escapeHTML(info)}</p>
        <div class="lesson-meta"><span>${lessonCardCount} 张学习卡</span><span>${escapeHTML(getForecast(selectedDay))}</span>${searchCount}</div>
      </div>
      ${renderSection({ kind: 'review', title: '到期复习', eyebrow: 'REVIEW FIRST', description: '来自之前课程的间隔复习与已到期错题。', cards: reviewCards, doneCount: 0, day: selectedDay })}
      ${renderSection({ kind: 'new', title: selectedDay === 15 ? '全量综合回顾' : '今日新课', eyebrow: selectedDay === 15 ? 'FINAL RECALL' : 'NEW CONTENT', description: selectedDay === 15 ? '完成全部卡片，检查 15 天课程的记忆盲点。' : '翻卡自测后选择“会了”或“再练”，两种操作都会记录本课进度。', cards: newCards, doneCount, day: selectedDay })}
      ${manualComplete}
      <div class="lesson-footnote"><span class="footnote-icon" aria-hidden="true">i</span><p>复习日按课程日计算（课后第 1、3、7 天）；错题按本地日期在次日加入再练。选择未来课程不会改变历史进度。</p></div>`;
  }

  function render() {
    buildDayNavigation();
    updateOverallProgress();
    renderLesson();
    elements.prevDay.disabled = selectedDay <= 1;
    elements.nextDay.disabled = selectedDay >= 15;
    elements.clearSearch.hidden = !searchTerm;
    elements.search.value = searchTerm;
    elements.footerToday.textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  }

  function setDay(day) {
    selectedDay = clampDay(day);
    activeSession = null;
    isFlipped = false;
    saveState();
    render();
  }

  function startSession(kind) {
    const currentCards = kind === 'review' ? getReviewCards(selectedDay) : cardsByDay[selectedDay];
    if (!currentCards.length) return;
    activeSession = { kind, day: selectedDay, cards: currentCards, index: 0 };
    isFlipped = false;
    render();
    document.querySelector('.session-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function finishLessonIfDone(day) {
    const cards = cardsByDay[day];
    if (cards.length && cards.every(card => isNewDone(day, card))) state.completedLessons[day] = true;
  }

  function answerCurrent(answer) {
    if (!activeSession) return;
    const visibleCards = filtered(activeSession.cards);
    const card = visibleCards[activeSession.index];
    if (!card || !isFlipped) return;
    const stats = state.stats[card.id] || { known: 0, again: 0 };
    if (answer === 'known') {
      stats.known += 1;
      delete state.retries[card.id];
    } else {
      stats.again += 1;
      state.retries[card.id] = tomorrowKey();
    }
    stats.lastAction = answer;
    stats.lastSeen = localDateKey();
    state.stats[card.id] = stats;

    if (activeSession.kind === 'new') {
      state.newDone[newDoneKey(activeSession.day, card)] = true;
      finishLessonIfDone(activeSession.day);
    } else if (card.reviewKey) {
      state.reviewDone[card.reviewKey] = true;
    }

    activeSession.index += 1;
    isFlipped = false;
    saveState();
    render();
  }

  function moveCard(amount) {
    if (!activeSession) return;
    const visibleCards = filtered(activeSession.cards);
    if (!visibleCards.length) return;
    activeSession.index = Math.min(visibleCards.length - 1, Math.max(0, activeSession.index + amount));
    isFlipped = false;
    render();
  }

  function skipCard() {
    moveCard(1);
  }

  function bindEvents() {
    elements.daySelect.addEventListener('change', event => setDay(Number(event.target.value)));
    elements.dayGrid.addEventListener('click', event => {
      const button = event.target.closest('[data-day]');
      if (button) setDay(Number(button.dataset.day));
    });
    elements.prevDay.addEventListener('click', () => setDay(selectedDay - 1));
    elements.nextDay.addEventListener('click', () => setDay(selectedDay + 1));
    elements.search.addEventListener('input', event => {
      searchTerm = event.target.value.trim().toLocaleLowerCase();
      render();
    });
    elements.clearSearch.addEventListener('click', () => {
      searchTerm = '';
      render();
      elements.search.focus();
    });
    elements.lessonContent.addEventListener('click', event => {
      const pronunciationButton = event.target.closest('[data-speak]');
      if (pronunciationButton) {
        event.stopPropagation();
        speakEnglish(pronunciationButton.dataset.speak);
        return;
      }
      const startButton = event.target.closest('[data-start]');
      if (startButton) {
        startSession(startButton.dataset.start);
        return;
      }
      const answerButton = event.target.closest('[data-answer]');
      if (answerButton) {
        answerCurrent(answerButton.dataset.answer);
        return;
      }
      if (event.target.closest('#flip-card')) {
        isFlipped = !isFlipped;
        render();
        return;
      }
      if (event.target.closest('#previous-card')) {
        moveCard(-1);
        return;
      }
      if (event.target.closest('#next-card') || event.target.closest('#skip-card')) skipCard();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && activeSession) {
        activeSession = null;
        isFlipped = false;
        render();
      }
    });
  }

  function initialize() {
    if (!data) {
      elements.lessonContent.innerHTML = '<p class="fatal-error">课程数据未能加载。请确认 index.html、data.js、app.js 和 styles.css 位于同一文件夹。</p>';
      return;
    }
    if (typeof structuredClone !== 'function') {
      window.structuredClone = value => JSON.parse(JSON.stringify(value));
    }
    buildDayNavigation();
    bindEvents();
    saveState();
    render();
  }

  initialize();
})();
