/**
 * 入口文件 - UI 交互逻辑
 */

import '../css/style.css';
import { magnetToTorrentBatch, torrentToMagnetBatch } from './converter.js';

// --- 主题切换 ---
const THEME_KEY = 'theme';
const MODES = ['system', 'light', 'dark'];
const MODE_LABELS = { system: '跟随系统', light: '浅色', dark: '暗色' };

const themeToggle = document.getElementById('theme-toggle');
const sunIcon = themeToggle.querySelector('.theme-icon-sun');
const moonIcon = themeToggle.querySelector('.theme-icon-moon');
const systemIcon = themeToggle.querySelector('.theme-icon-system');
const mqDark = window.matchMedia('(prefers-color-scheme:dark)');

function applyTheme(mode) {
  const theme = mode === 'system'
    ? (mqDark.matches ? 'dark' : 'light')
    : mode;
  document.documentElement.setAttribute('data-theme', theme);

  sunIcon.classList.toggle('hidden', mode !== 'light');
  moonIcon.classList.toggle('hidden', mode !== 'dark');
  systemIcon.classList.toggle('hidden', mode !== 'system');
  themeToggle.title = MODE_LABELS[mode];
}

function getMode() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

function setMode(mode) {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}

themeToggle.addEventListener('click', () => {
  const current = getMode();
  const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
  setMode(next);
});

mqDark.addEventListener('change', () => {
  if (getMode() === 'system') applyTheme('system');
});

// 初始化按钮状态
applyTheme(getMode());

// --- Tab 切换 ---
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-panel');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;

    tabs.forEach(t => t.classList.remove('tab-active'));
    tab.classList.add('tab-active');

    tabContents.forEach(c => c.classList.add('hidden'));
    document.getElementById(target).classList.remove('hidden');
  });
});

// --- 磁力转种子 ---
const magnetInput = document.getElementById('magnet-input');
const magnetConvertBtn = document.getElementById('magnet-convert-btn');
const magnetError = document.getElementById('magnet-error');
const magnetResults = document.getElementById('magnet-results');
const magnetResultsList = document.getElementById('magnet-results-list');
const magnetDownloadAllBtn = document.getElementById('magnet-download-all-btn');
const magnetSelectAll = document.getElementById('magnet-select-all');
const magnetCount = document.getElementById('magnet-count');

magnetConvertBtn.addEventListener('click', () => {
  hideError(magnetError);
  magnetResultsList.innerHTML = '';
  magnetDownloadAllBtn.classList.add('hidden');
  magnetCount.classList.add('hidden');
  magnetSelectAll.checked = false;
  magnetSelectAll.indeterminate = false;

  const text = magnetInput.value.trim();
  if (!text) {
    showError(magnetError, '请输入磁力链接');
    return;
  }

  const results = magnetToTorrentBatch(text);

  if (results.every(r => !r.success)) {
    showError(magnetError, '所有输入均无效，请检查磁力链接格式');
    return;
  }

  magnetResults.classList.remove('hidden');

  const successResults = [];
  for (const result of results) {
    if (result.success) {
      successResults.push(result);
      const item = createMagnetResultItem(result);
      magnetResultsList.appendChild(item);
      requestAnimationFrame(() => item.classList.add('animate-fade-in-up'));
    } else {
      const item = createErrorItem(result.input, result.error);
      magnetResultsList.appendChild(item);
    }
  }

  if (successResults.length > 1) {
    magnetDownloadAllBtn.classList.remove('hidden');
    magnetDownloadAllBtn.disabled = false;
    magnetSelectAll.checked = true;
    updateResultCount(magnetCount, successResults.length, successResults.length);

    magnetSelectAll.onchange = () => {
      const checkboxes = magnetResultsList.querySelectorAll('.result-checkbox');
      checkboxes.forEach(cb => { cb.checked = magnetSelectAll.checked; });
      const count = getCheckedCount(magnetResultsList);
      updateResultCount(magnetCount, count, successResults.length);
      magnetDownloadAllBtn.disabled = count === 0;
    };

    magnetResultsList.addEventListener('change', (e) => {
      if (!e.target.classList.contains('result-checkbox')) return;
      updateSelectAllState(magnetSelectAll, magnetResultsList);
      const count = getCheckedCount(magnetResultsList);
      updateResultCount(magnetCount, count, successResults.length);
      magnetDownloadAllBtn.disabled = count === 0;
    });

    magnetDownloadAllBtn.onclick = () => {
      const checkedItems = magnetResultsList.querySelectorAll('.result-checkbox:checked');
      checkedItems.forEach(cb => {
        const item = cb.closest('.result-item');
        downloadBlob(item._blob, item._fileName);
      });
      flashBtn(magnetDownloadAllBtn, '下载选中', '已下载');
    };
  }
});

function createMagnetResultItem(result) {
  const item = document.createElement('div');
  item.className = 'flex items-center gap-2.5 px-4 h-12 border-b border-base-300 last:border-b-0 opacity-0 transition-colors hover:bg-base-200';
  item.classList.add('result-item');
  item._blob = result.blob;
  item._fileName = result.name;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox checkbox-primary checkbox-sm shrink-0 result-checkbox';
  checkbox.checked = true;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'flex-1 min-w-0 text-sm font-medium truncate';
  nameSpan.textContent = result.name;
  nameSpan.title = result.name;

  const hashSpan = document.createElement('span');
  hashSpan.className = 'text-[0.625rem] text-base-content/40 font-mono shrink-0 tracking-wide';
  hashSpan.textContent = result.infoHash.substring(0, 8) + '...';

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-sm btn-primary shrink-0';
  downloadBtn.textContent = '下载';
  downloadBtn.addEventListener('click', () => {
    downloadBlob(result.blob, result.name);
    flashResultItem(item);
  });

  item.appendChild(checkbox);
  item.appendChild(nameSpan);
  item.appendChild(hashSpan);
  item.appendChild(downloadBtn);
  return item;
}

// --- 种子转磁力 ---
const dropZone = document.getElementById('drop-zone');
const dropZoneText = dropZone.querySelector('.drop-zone-text');
const torrentFileInput = document.getElementById('torrent-file-input');
const torrentError = document.getElementById('torrent-error');
const torrentResults = document.getElementById('torrent-results');
const torrentResultsList = document.getElementById('torrent-results-list');
const torrentCopyAllBtn = document.getElementById('torrent-copy-all-btn');
const torrentSelectAll = document.getElementById('torrent-select-all');
const torrentCount = document.getElementById('torrent-count');

// 触屏设备检测 — 动态调整上传区域提示文案
if ('ontouchstart' in window) {
  dropZoneText.innerHTML = '点击选择 .torrent 文件';
}

// 点击上传
dropZone.addEventListener('click', () => {
  torrentFileInput.click();
});

torrentFileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleTorrentFiles(e.target.files);
  }
});

// 拖拽上传
dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-primary', 'bg-primary/5', 'border-solid');
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-primary', 'bg-primary/5', 'border-solid');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('border-primary', 'bg-primary/5', 'border-solid');
  }
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-primary', 'bg-primary/5', 'border-solid');

  const files = Array.from(e.dataTransfer.files).filter(f =>
    f.name.endsWith('.torrent') || f.type === 'application/x-bittorrent'
  );

  if (files.length === 0) {
    showError(torrentError, '请拖入 .torrent 文件');
    return;
  }

  handleTorrentFiles(files);
});

async function handleTorrentFiles(files) {
  hideError(torrentError);
  torrentResultsList.innerHTML = '';
  torrentCopyAllBtn.classList.add('hidden');
  torrentCount.classList.add('hidden');
  torrentSelectAll.checked = false;
  torrentSelectAll.indeterminate = false;

  const results = await torrentToMagnetBatch(files);

  if (results.every(r => !r.success)) {
    showError(torrentError, '所有文件均无效，请检查文件格式');
    return;
  }

  torrentResults.classList.remove('hidden');

  const successResults = [];
  for (const result of results) {
    if (result.success) {
      successResults.push(result);
      const item = createTorrentResultItem(result);
      torrentResultsList.appendChild(item);
      requestAnimationFrame(() => item.classList.add('animate-fade-in-up'));
    } else {
      const item = createErrorItem(result.fileName, result.error);
      torrentResultsList.appendChild(item);
    }
  }

  if (successResults.length > 1) {
    torrentCopyAllBtn.classList.remove('hidden');
    torrentCopyAllBtn.disabled = false;
    torrentSelectAll.checked = true;
    updateResultCount(torrentCount, successResults.length, successResults.length);

    torrentSelectAll.onchange = () => {
      const checkboxes = torrentResultsList.querySelectorAll('.result-checkbox');
      checkboxes.forEach(cb => { cb.checked = torrentSelectAll.checked; });
      const count = getCheckedCount(torrentResultsList);
      updateResultCount(torrentCount, count, successResults.length);
      torrentCopyAllBtn.disabled = count === 0;
    };

    torrentResultsList.addEventListener('change', (e) => {
      if (!e.target.classList.contains('result-checkbox')) return;
      updateSelectAllState(torrentSelectAll, torrentResultsList);
      const count = getCheckedCount(torrentResultsList);
      updateResultCount(torrentCount, count, successResults.length);
      torrentCopyAllBtn.disabled = count === 0;
    });

    torrentCopyAllBtn.onclick = () => {
      const checkedItems = torrentResultsList.querySelectorAll('.result-checkbox:checked');
      const uris = Array.from(checkedItems).map(cb => cb.closest('.result-item')._magnetUri).join('\n');
      copyToClipboard(uris, torrentCopyAllBtn, '复制选中', '已复制');
    };
  }
}

function createTorrentResultItem(result) {
  const item = document.createElement('div');
  item.className = 'flex items-start gap-2.5 px-4 py-2.5 border-b border-base-300 last:border-b-0 opacity-0 transition-colors hover:bg-base-200';
  item.classList.add('result-item');
  item._magnetUri = result.magnetUri;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox checkbox-primary checkbox-sm mt-0.5 shrink-0 result-checkbox';
  checkbox.checked = true;

  const content = document.createElement('div');
  content.className = 'flex-1 min-w-0 flex flex-col gap-1';

  const header = document.createElement('div');
  header.className = 'flex items-baseline gap-2';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'text-sm font-medium truncate';
  nameSpan.textContent = result.fileName.replace(/\.torrent$/i, '');
  nameSpan.title = result.fileName.replace(/\.torrent$/i, '');

  const hashSpan = document.createElement('span');
  hashSpan.className = 'text-[0.625rem] text-base-content/40 font-mono shrink-0 tracking-wide';
  hashSpan.textContent = result.infoHash;

  header.appendChild(nameSpan);
  header.appendChild(hashSpan);

  const magnetRow = document.createElement('div');
  magnetRow.className = 'flex gap-1.5 items-stretch';

  const textarea = document.createElement('textarea');
  textarea.className = 'textarea textarea-bordered flex-1 min-w-0 text-[0.6875rem] font-mono leading-relaxed bg-base-200 break-all resize-none h-10 py-1';
  textarea.value = result.magnetUri;
  textarea.readOnly = true;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-sm btn-outline btn-primary shrink-0';
  copyBtn.textContent = '复制';
  copyBtn.addEventListener('click', () => {
    copyToClipboard(result.magnetUri, copyBtn);
    flashResultItem(item);
  });

  magnetRow.appendChild(textarea);
  magnetRow.appendChild(copyBtn);
  content.appendChild(header);
  content.appendChild(magnetRow);
  item.appendChild(checkbox);
  item.appendChild(content);
  return item;
}

// --- 通用工具 ---

function createErrorItem(name, error) {
  const item = document.createElement('div');
  item.className = 'px-4 py-3 opacity-100';
  item.classList.add('result-item');
  item.innerHTML = `
    <div class="text-sm font-medium text-error">${escapeHtml(name)}</div>
    <div class="text-sm text-error/70 mt-0.5">${escapeHtml(error)}</div>
  `;
  return item;
}

function showError(el, msg) {
  el.querySelector('span').textContent = msg;
  el.classList.remove('hidden');
}

function hideError(el) {
  el.classList.add('hidden');
  el.querySelector('span').textContent = '';
}

async function copyToClipboard(text, btn, normalText = '复制链接', doneText = '已复制') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    flashBtn(btn, normalText, doneText);
  } catch {
    btn.textContent = '请手动复制';
    setTimeout(() => { btn.textContent = normalText; }, 2000);
  }
}

function flashBtn(btn, normalText, doneText) {
  btn.textContent = doneText;
  const isOutline = btn.classList.contains('btn-outline');
  if (isOutline) {
    btn.classList.remove('btn-outline', 'btn-primary');
    btn.classList.add('btn-success');
  }
  setTimeout(() => {
    btn.textContent = normalText;
    if (isOutline) {
      btn.classList.remove('btn-success');
      btn.classList.add('btn-outline', 'btn-primary');
    }
  }, 2000);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function flashResultItem(item) {
  item.classList.add('bg-success/10');
  setTimeout(() => item.classList.remove('bg-success/10'), 800);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getCheckedCount(listEl) {
  return listEl.querySelectorAll('.result-checkbox:checked').length;
}

function updateSelectAllState(selectAllEl, listEl) {
  const total = listEl.querySelectorAll('.result-checkbox').length;
  const checked = getCheckedCount(listEl);
  selectAllEl.checked = checked === total;
  selectAllEl.indeterminate = checked > 0 && checked < total;
}

function updateResultCount(el, selected, total) {
  el.textContent = `${selected}/${total}`;
  el.classList.remove('hidden');
}
