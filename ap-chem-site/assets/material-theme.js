// Material 3 Theme Module for AP Chemistry
(function () {
  'use strict';

  const STORAGE_KEY_MODE = 'apchem.themeMode';
  const STORAGE_KEY_ACCENT = 'apchem.accent';
  const STORAGE_KEY_LEGACY = 'apchem.theme';

  const PALETTES = {
    blue: {
      id: 'blue',
      label: '岩蓝',
      chips: ['#eef2f6', '#3b5f82', '#141a22'],
      surface: { light: '#f3f6f9', dark: '#11151a' }
    },
    green: {
      id: 'green',
      label: '鼠尾草',
      chips: ['#f2f5f1', '#41644a', '#141a15'],
      surface: { light: '#f4f6f2', dark: '#111612' }
    },
    purple: {
      id: 'purple',
      label: '雾紫',
      chips: ['#f6f3f8', '#63537a', '#17141b'],
      surface: { light: '#f7f4f9', dark: '#141217' }
    },
    orange: {
      id: 'orange',
      label: '砂岩',
      chips: ['#f8f5f0', '#7a5433', '#1b1612'],
      surface: { light: '#f9f6f2', dark: '#161310' }
    },
    rose: {
      id: 'rose',
      label: '玫瑰灰',
      chips: ['#f7f4f4', '#784d59', '#1a1416'],
      surface: { light: '#f8f5f5', dark: '#151214' }
    },
    gray: {
      id: 'gray',
      label: '石墨',
      chips: ['#f5f5f6', '#52565c', '#141416'],
      surface: { light: '#f5f5f6', dark: '#131315' }
    }
  };

  const ACCENTS = Object.values(PALETTES);

  const MODES = [
    { id: 'light', label: '浅色' },
    { id: 'dark', label: '深色' },
    { id: 'system', label: '跟随系统' }
  ];

  function safeGet(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (_) {}
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getEffectiveMode(mode) {
    if (mode === 'system') {
      return mediaQuery.matches ? 'dark' : 'light';
    }
    return mode === 'dark' ? 'dark' : 'light';
  }

  function getInitialMode() {
    const rawMode = safeGet(STORAGE_KEY_MODE, null);
    if (rawMode === 'light' || rawMode === 'dark' || rawMode === 'system') {
      return rawMode;
    }
    const legacy = safeGet(STORAGE_KEY_LEGACY, null);
    return legacy === 'dark' ? 'dark' : 'light';
  }

  function getInitialAccent() {
    const rawAccent = safeGet(STORAGE_KEY_ACCENT, null);
    return PALETTES[rawAccent] ? rawAccent : 'blue';
  }

  let currentMode = getInitialMode();
  let currentAccent = getInitialAccent();

  function updateThemeColor(effective, accent) {
    const color = PALETTES[accent]?.surface[effective] || (effective === 'dark' ? '#11151a' : '#f3f6f9');
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', color);
  }

  function applyTheme(mode, accent, save) {
    currentMode = mode;
    currentAccent = accent;
    const effective = getEffectiveMode(mode);
    const root = document.documentElement;

    root.setAttribute('data-theme', effective);
    root.setAttribute('data-theme-effective', effective);
    root.setAttribute('data-theme-mode', mode);
    root.setAttribute('data-theme-accent', accent);
    root.style.colorScheme = effective;

    if (document.head) {
      updateThemeColor(effective, accent);
    }

    if (save) {
      safeSet(STORAGE_KEY_MODE, mode);
      safeSet(STORAGE_KEY_ACCENT, accent);
      safeSet(STORAGE_KEY_LEGACY, effective);
    }
  }

  mediaQuery.addEventListener('change', () => {
    if (currentMode === 'system') {
      applyTheme('system', currentAccent, false);
      safeSet(STORAGE_KEY_LEGACY, getEffectiveMode('system'));
    }
  });

  // Apply synchronously in <head>
  applyTheme(currentMode, currentAccent, false);

  function createDialog() {
    if (document.getElementById('appearance-dialog')) return;

    const dialog = document.createElement('dialog');
    dialog.id = 'appearance-dialog';
    dialog.setAttribute('aria-labelledby', 'appearance-title');

    const modeOptionsHtml = MODES.map(m => {
      const checkedAttr = m.id === currentMode ? ' checked' : '';
      return (
        '<label class="appearance-mode-label">' +
          '<input type="radio" name="apchem-theme-mode" value="' + m.id + '"' + checkedAttr + '>' +
          '<span>' + m.label + '</span>' +
        '</label>'
      );
    }).join('');

    const accentOptionsHtml = ACCENTS.map(a => {
      const checkedAttr = a.id === currentAccent ? ' checked' : '';
      const chipSpans = a.chips.map(c => '<span class="appearance-chip" style="background-color: ' + c + ';"></span>').join('');
      return (
        '<label class="appearance-accent-item" data-accent="' + a.id + '" title="' + a.label + '">' +
          '<input type="radio" name="apchem-theme-accent" value="' + a.id + '" class="appearance-accent-radio"' + checkedAttr + ' aria-label="' + a.label + '">' +
          '<div class="appearance-preview-card">' +
            '<div class="appearance-chips">' + chipSpans + '</div>' +
            '<span class="appearance-accent-text">' + a.label + '</span>' +
          '</div>' +
        '</label>'
      );
    }).join('');

    dialog.innerHTML =
      '<div class="appearance-head">' +
        '<h2 class="appearance-title" id="appearance-title">配色</h2>' +
        '<button type="button" class="appearance-close" id="close-appearance" aria-label="关闭">' +
          '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line>' +
            '<line x1="6" y1="6" x2="18" y2="18"></line>' +
          '</svg>' +
        '</button>' +
      '</div>' +
      '<fieldset class="appearance-section">' +
        '<legend class="appearance-section-title">主题</legend>' +
        '<div class="appearance-mode-group" role="radiogroup" aria-label="主题模式">' +
          modeOptionsHtml +
        '</div>' +
      '</fieldset>' +
      '<fieldset class="appearance-section">' +
        '<legend class="appearance-section-title">色系</legend>' +
        '<div class="appearance-accent-grid" role="radiogroup" aria-label="色系">' +
          accentOptionsHtml +
        '</div>' +
      '</fieldset>' +
      '<div class="appearance-more">' +
        '<button type="button" class="appearance-more-btn" id="appearance-more-settings">更多设置</button>' +
      '</div>';

    document.body.appendChild(dialog);
    localizeAppearance();

    dialog.querySelector('#close-appearance').onclick = () => dialog.close();

    const moreBtn = dialog.querySelector('#appearance-more-settings');
    if (moreBtn) {
      moreBtn.onclick = () => {
        dialog.close();
        const btnSettings = document.getElementById('btnSettings');
        if (btnSettings) btnSettings.click();
      };
    }

    dialog.addEventListener('click', e => {
      const rect = dialog.getBoundingClientRect();
      if (e.target === dialog && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) {
        dialog.close();
      }
    });

    dialog.querySelectorAll('input[name="apchem-theme-mode"]').forEach(input => {
      input.addEventListener('change', e => {
        if (e.target.checked) applyTheme(e.target.value, currentAccent, true);
      });
    });

    dialog.querySelectorAll('input[name="apchem-theme-accent"]').forEach(input => {
      input.addEventListener('change', e => {
        if (e.target.checked) applyTheme(currentMode, e.target.value, true);
      });
    });
  }

  function localizeAppearance(){
    const dialog=document.getElementById('appearance-dialog');if(!dialog)return;
    const english=window.AP_LEARNING?.language==='en';
    dialog.querySelector('.appearance-title').textContent=english?'Appearance':'外观';
    const legends=dialog.querySelectorAll('legend');legends[0].textContent=english?'Theme':'主题';legends[1].textContent=english?'Palette':'配色';
    const modes={light:'Light',dark:'Dark',system:'System'};
    dialog.querySelectorAll('.appearance-mode-label').forEach(label=>{const id=label.querySelector('input').value;label.querySelector('span').textContent=english?modes[id]:MODES.find(m=>m.id===id).label;});
    const names={blue:'Slate blue',green:'Sage',purple:'Mauve',orange:'Sandstone',rose:'Dusty rose',gray:'Graphite'};
    dialog.querySelectorAll('.appearance-accent-item').forEach(label=>{const name=english?names[label.dataset.accent]:PALETTES[label.dataset.accent].label;label.title=name;label.querySelector('.appearance-accent-text').textContent=name;label.querySelector('input').setAttribute('aria-label',name);});
    dialog.querySelector('#appearance-more-settings').textContent=english?'More settings':'更多设置';
    dialog.querySelector('#close-appearance').setAttribute('aria-label',english?'Close':'关闭');
  }
  document.addEventListener('apchem:language',localizeAppearance);

  function openAppearanceDialog() {
    let dialog = document.getElementById('appearance-dialog');
    if (!dialog) {
      createDialog();
      dialog = document.getElementById('appearance-dialog');
    }
    if (dialog && typeof dialog.showModal === 'function') {
      const modeRadio = dialog.querySelector('input[name="apchem-theme-mode"][value="' + currentMode + '"]');
      if (modeRadio) modeRadio.checked = true;
      const accentRadio = dialog.querySelector('input[name="apchem-theme-accent"][value="' + currentAccent + '"]');
      if (accentRadio) accentRadio.checked = true;
      dialog.showModal();
    }
  }

  function initUI() {
    createDialog();
    const appBtn = document.getElementById('appearance');
    if (appBtn) {
      appBtn.onclick = openAppearanceDialog;
    }
    updateThemeColor(getEffectiveMode(currentMode), currentAccent);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})();
