/**
 * 入口文件 - UI 交互逻辑
 */

import { magnetToTorrentBatch, torrentToMagnetBatch } from './converter.js';
import { generateMagnetUri } from './magnet.js';
import { createPager } from './pager.js';

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
  themeToggle.setAttribute('aria-label', `切换主题，当前：${MODE_LABELS[mode]}`);
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
const tabs = document.querySelectorAll('[role="tab"]');
const tabContents = document.querySelectorAll('.tab-panel');

function activateTab(tab, focus = false) {
  const target = tab.dataset.tab;

  tabs.forEach(t => {
    t.classList.remove('btn-primary');
    t.classList.add('btn-ghost');
    t.setAttribute('aria-selected', 'false');
    t.tabIndex = -1;
  });
  tab.classList.remove('btn-ghost');
  tab.classList.add('btn-primary');
  tab.setAttribute('aria-selected', 'true');
  tab.tabIndex = 0;
  if (focus) tab.focus();

  tabContents.forEach(c => c.classList.add('hidden', 'opacity-0'));
  const targetPanel = document.getElementById(target);
  targetPanel.classList.remove('hidden');
  requestAnimationFrame(() => targetPanel.classList.remove('opacity-0'));
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => activateTab(tab));
});

// 方向键导航（WAI-ARIA Tabs 模式）
document.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const tabArr = Array.from(tabs);
  const idx = tabArr.indexOf(document.activeElement);
  if (idx === -1) return;
  e.preventDefault();
  const next = tabArr[(idx + (e.key === 'ArrowRight' ? 1 : tabArr.length - 1)) % tabArr.length];
  activateTab(next, true);
});

// --- 磁力转种子 ---
const magnetInput = document.getElementById('magnet-input');

// 输入框随内容自动增高（max-height 由 CSS 限制，超出后内部滚动）
function autoGrowTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
magnetInput.addEventListener('input', () => autoGrowTextarea(magnetInput));

// 粘贴时按 magnet:? 自动分行，避免多条磁链粘连（无需手动回车）
magnetInput.addEventListener('paste', (e) => {
  e.preventDefault();
  const raw = (e.clipboardData || window.clipboardData).getData('text');
  if (!raw) return;
  // 在每个 magnet:? 前断行（开头除外），并压缩已有的空白/换行
  const normalized = raw
    .replace(/\s*\n\s*/g, '\n')
    .replace(/magnet:\?/gi, (m, offset, str) =>
      (offset === 0 || str[offset - 1] === '\n') ? m : '\n' + m)
    .replace(/^\n+/, '');

  const el = magnetInput;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);

  let insert = normalized;
  if (before && !before.endsWith('\n')) insert = '\n' + insert;
  if (after && !insert.endsWith('\n')) insert += '\n';

  el.value = before + insert + after;
  const caret = (before + insert).length;
  el.selectionStart = el.selectionEnd = caret;
  autoGrowTextarea(el);
});
const magnetConvertBtn = document.getElementById('magnet-convert-btn');
const magnetError = document.getElementById('magnet-error');
const magnetResults = document.getElementById('magnet-results');
const magnetResultsList = document.getElementById('magnet-results-list');
const magnetDownloadAllBtn = document.getElementById('magnet-download-all-btn');
const magnetSelectAll = document.getElementById('magnet-select-all');
const magnetCount = document.getElementById('magnet-count');

function setBtnLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.textContent = loading ? text : btn.dataset.normalText;
}

// --- 数据驱动的选择状态（跨分页保持） ---
// entries: { success, selected, ... } 选中态存在数据层，翻页不丢失

function getSelectable(entries) {
  return entries.filter(e => e.success);
}

function getSelected(entries) {
  return entries.filter(e => e.success && e.selected);
}

function syncSelectionHeader(entries, selectAllEl, countEl, actionBtn, removeBtn) {
  const selectable = getSelectable(entries);
  const checked = getSelected(entries).length;
  selectAllEl.checked = selectable.length > 0 && checked === selectable.length;
  selectAllEl.indeterminate = checked > 0 && checked < selectable.length;
  updateResultCount(countEl, checked, selectable.length);
  actionBtn.disabled = checked === 0;
  actionBtn.classList.toggle('hidden', selectable.length === 0);
  if (removeBtn) {
    removeBtn.disabled = checked === 0;
    removeBtn.classList.toggle('hidden', selectable.length === 0);
  }
}

// 同步当前可见行的选中样式与复选框（不做整页重渲染，避免点击闪烁）
function syncVisibleRows(listEl) {
  listEl.querySelectorAll('.result-item').forEach(item => {
    const entry = item._entry;
    if (!entry || !entry.success) return;
    item.classList.toggle('row-selected', entry.selected);
    const cb = item.querySelector('.result-checkbox');
    if (cb) cb.checked = entry.selected;
  });
}

// 全选 / 单选 / 行点选（Shift 范围选、Ctrl·Cmd 点选），委托给数据层，只注册一次
function wireSelection(getEntries, setEntries, listEl, selectAllEl, countEl, actionBtn, removeBtn, pager) {
  let anchorEntry = null; // Shift 范围选择的锚点

  selectAllEl.addEventListener('change', () => {
    getSelectable(getEntries()).forEach(e => { e.selected = selectAllEl.checked; });
    // 只更新可见行样式，不做整页重渲染，点击即时反馈
    syncVisibleRows(listEl);
    syncSelectionHeader(getEntries(), selectAllEl, countEl, actionBtn, removeBtn);
  });

  listEl.addEventListener('change', (e) => {
    if (!e.target.classList.contains('result-checkbox')) return;
    const entry = e.target.closest('.result-item')?._entry;
    if (!entry) return;
    entry.selected = e.target.checked;
    anchorEntry = entry;
    syncVisibleRows(listEl);
    syncSelectionHeader(getEntries(), selectAllEl, countEl, actionBtn, removeBtn);
  });

  // 行点击：空白处点击参与选择；按钮/链接/输入框等交互元素不触发
  listEl.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, textarea, select, label')) return;
    const entry = e.target.closest('.result-item')?._entry;
    if (!entry || !entry.success) return;

    const entries = getEntries();
    if (e.shiftKey && anchorEntry && entries.includes(anchorEntry)) {
      // Shift：锚点到当前项的范围选择（按数据数组计算，跨页有效）
      const from = entries.indexOf(anchorEntry);
      const to = entries.indexOf(entry);
      const [lo, hi] = from < to ? [from, to] : [to, from];
      for (let i = lo; i <= hi; i++) {
        if (entries[i].success) entries[i].selected = true;
      }
    } else {
      // 普通点击 / Ctrl·Cmd 点选：切换当前项
      entry.selected = !entry.selected;
      anchorEntry = entry;
    }

    syncVisibleRows(listEl);
    syncSelectionHeader(entries, selectAllEl, countEl, actionBtn, removeBtn);
  });

  // 移除选中：先即时更新头部状态，再从数据层删除并刷新（保持当前页）
  removeBtn.addEventListener('click', () => {
    const removed = getSelected(getEntries()).length;
    if (removed === 0) return;
    setEntries(getEntries().filter(e => !e.selected));
    anchorEntry = null;
    flashBtn(removeBtn, '移除选中', `已移除 ${removed} 项`);
    syncSelectionHeader(getEntries(), selectAllEl, countEl, actionBtn, removeBtn);
    pager.setData(getEntries(), { keepPage: true });
  });
}

// --- 磁力转种子 ---
const magnetRemoveBtn = document.getElementById('magnet-remove-btn');
const magnetPager = createPager({
  listEl: magnetResultsList,
  pagerEl: document.getElementById('magnet-pager'),
  renderItem: (entry) => entry.success
    ? createMagnetResultItem(entry)
    : createErrorItem(entry.input, entry.error),
  onAfterRender: () => syncSelectionHeader(magnetEntries, magnetSelectAll, magnetCount, magnetDownloadAllBtn, magnetRemoveBtn),
});

let magnetEntries = [];
wireSelection(() => magnetEntries, (v) => { magnetEntries = v; }, magnetResultsList, magnetSelectAll, magnetCount, magnetDownloadAllBtn, magnetRemoveBtn, magnetPager);

// 批量下载：单文件直接下载，多文件打包为单个 zip（避免浏览器拦截一次手势内的多次下载）
magnetDownloadAllBtn.addEventListener('click', async () => {
  const selected = getSelected(magnetEntries);
  if (selected.length === 0) return;

  magnetDownloadAllBtn.disabled = true;
  try {
    if (selected.length === 1) {
      downloadBlob(selected[0].blob, selected[0].name);
    } else {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const usedNames = new Set();
      selected.forEach(entry => {
        let name = entry.name;
        let i = 1;
        while (usedNames.has(name)) {
          name = entry.name.replace(/\.torrent$/i, '') + `_${i++}.torrent`;
        }
        usedNames.add(name);
        zip.file(name, entry.blob);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'magnet-torrents.zip');
    }
    flashBtn(magnetDownloadAllBtn, '下载选中', '已下载');
  } catch (e) {
    showError(magnetError, `打包下载失败：${e.message || '未知错误'}`);
  } finally {
    magnetDownloadAllBtn.disabled = false;
  }
});

magnetConvertBtn.dataset.normalText = magnetConvertBtn.textContent;

magnetConvertBtn.addEventListener('click', async () => {
  hideError(magnetError);
  magnetResultsList.innerHTML = '';
  magnetDownloadAllBtn.classList.add('hidden');
  magnetRemoveBtn.classList.add('hidden');
  magnetCount.classList.add('hidden');
  magnetSelectAll.checked = false;
  magnetSelectAll.indeterminate = false;

  const text = magnetInput.value.trim();
  if (!text) {
    showError(magnetError, '请输入磁力链接');
    return;
  }

  // 大批量同步解析会阻塞主线程，先让按钮进入加载态并交出一帧
  setBtnLoading(magnetConvertBtn, true, '转换中…');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let results;
  try {
    results = magnetToTorrentBatch(text);
  } finally {
    setBtnLoading(magnetConvertBtn, false);
  }

  if (results.every(r => !r.success)) {
    showError(magnetError, '所有输入均无效，请检查磁力链接格式');
    return;
  }

  magnetResults.classList.remove('hidden');
  magnetEntries = results.map(r => ({ ...r, selected: r.success }));
  magnetPager.setData(magnetEntries);
  syncSelectionHeader(magnetEntries, magnetSelectAll, magnetCount, magnetDownloadAllBtn, magnetRemoveBtn);
});

function createMagnetResultItem(entry) {
  const item = document.createElement('div');
  item.className = 'flex items-center gap-2.5 px-4 h-12 border-b border-base-300 last:border-b-0 opacity-0 transition-colors hover:bg-base-200 cursor-pointer select-none';
  item.classList.add('result-item');
  item._entry = entry;
  item.classList.toggle('row-selected', entry.selected);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox checkbox-primary checkbox-sm shrink-0 result-checkbox';
  checkbox.checked = entry.selected;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'flex-1 min-w-0 text-sm font-medium truncate';
  nameSpan.textContent = entry.name;
  nameSpan.title = entry.name;

  const hashSpan = document.createElement('span');
  hashSpan.className = 'hidden min-[480px]:inline text-[0.625rem] text-base-content/40 font-mono shrink-0 tracking-wide';
  hashSpan.textContent = entry.infoHash.substring(0, 8) + '...';
  hashSpan.title = entry.infoHash;

  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-sm btn-primary shrink-0';
  downloadBtn.textContent = '下载';
  downloadBtn.addEventListener('click', () => {
    downloadBlob(entry.blob, entry.name);
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
const includeTrackersToggle = document.getElementById('torrent-include-trackers');
const includeNameToggle = document.getElementById('torrent-include-name');
const torrentResultsHeader = document.getElementById('torrent-results-header');

// --- 种子转磁力分页 ---
const torrentRemoveBtn = document.getElementById('torrent-remove-btn');
const torrentPager = createPager({
  listEl: torrentResultsList,
  pagerEl: document.getElementById('torrent-pager'),
  renderItem: (entry) => entry.success
    ? createTorrentResultItem(entry)
    : createErrorItem(entry.fileName, entry.error),
  onAfterRender: () => syncSelectionHeader(torrentEntries, torrentSelectAll, torrentCount, torrentCopyAllBtn, torrentRemoveBtn),
});

let torrentEntries = [];
wireSelection(() => torrentEntries, (v) => { torrentEntries = v; }, torrentResultsList, torrentSelectAll, torrentCount, torrentCopyAllBtn, torrentRemoveBtn, torrentPager);

torrentCopyAllBtn.addEventListener('click', () => {
  const uris = getSelected(torrentEntries).map(e => e.magnetUri).join('\n');
  if (!uris) return;
  copyToClipboard(uris, torrentCopyAllBtn, '复制选中', '已复制');
});

// --- Tracker 包含开关偏好持久化 ---
const INCLUDE_TRACKERS_KEY = 'magnet-include-trackers';

function getIncludeTrackers() {
  return localStorage.getItem(INCLUDE_TRACKERS_KEY) === '1';
}

function setIncludeTrackers(value) {
  localStorage.setItem(INCLUDE_TRACKERS_KEY, value ? '1' : '0');
}

includeTrackersToggle.checked = getIncludeTrackers();

includeTrackersToggle.addEventListener('change', () => {
  setIncludeTrackers(includeTrackersToggle.checked);
  refreshAllTorrentResultItems();
});

// --- 名称(dn) 包含开关偏好持久化 ---
const INCLUDE_NAME_KEY = 'magnet-include-name';

function getIncludeName() {
  return localStorage.getItem(INCLUDE_NAME_KEY) === '1';
}

function setIncludeName(value) {
  localStorage.setItem(INCLUDE_NAME_KEY, value ? '1' : '0');
}

includeNameToggle.checked = getIncludeName();

includeNameToggle.addEventListener('change', () => {
  setIncludeName(includeNameToggle.checked);
  refreshAllTorrentResultItems();
});

function refreshAllTorrentResultItems() {
  // 按当前开关重新生成所有条目的磁链（数据层），再刷新当前页
  torrentEntries.forEach(entry => {
    if (!entry.success) return;
    entry.magnetUri = generateMagnetUri(
      { infoHash: entry.infoHash, name: entry.name, trackers: entry.trackers },
      { includeName: getIncludeName(), includeTrackers: getIncludeTrackers() }
    );
  });
  torrentPager.refresh();
}

// 触屏设备检测 — 动态调整上传区域提示文案
if ('ontouchstart' in window) {
  dropZoneText.innerHTML = '点击选择 .torrent 文件';
}

// 点击上传
dropZone.addEventListener('click', () => {
  torrentFileInput.click();
});

// 键盘操作（Enter / Space）
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    torrentFileInput.click();
  }
});

torrentFileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    const files = Array.from(e.target.files).filter(f =>
      f.name.endsWith('.torrent') || f.type === 'application/x-bittorrent'
    );
    if (files.length === 0) {
      showError(torrentError, '请选择 .torrent 文件');
      return;
    }
    handleTorrentFiles(files);
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
  torrentRemoveBtn.classList.add('hidden');
  torrentCount.classList.add('hidden');
  torrentSelectAll.checked = false;
  torrentSelectAll.indeterminate = false;

  // 加载态：禁用上传区并显示解析进度
  const prevText = dropZoneText.innerHTML;
  dropZone.classList.add('opacity-60', 'pointer-events-none');
  dropZone.setAttribute('aria-busy', 'true');
  dropZoneText.innerHTML = '<span class="loading loading-spinner loading-sm align-middle mr-2"></span>解析中…';

  let results;
  try {
    results = await torrentToMagnetBatch(files, { includeName: getIncludeName(), includeTrackers: getIncludeTrackers() });
  } finally {
    dropZone.classList.remove('opacity-60', 'pointer-events-none');
    dropZone.removeAttribute('aria-busy');
    dropZoneText.innerHTML = prevText;
  }

  // 总是显示结果区域，让用户看到具体错误
  torrentResults.classList.remove('hidden');

  torrentEntries = results.map(r => ({ ...r, selected: r.success }));
  torrentPager.setData(torrentEntries);

  if (getSelectable(torrentEntries).length === 0) {
    // 全部失败：隐藏无意义的批量操作头部，只保留错误列表
    torrentResultsHeader.classList.add('hidden');
    showError(torrentError, '所有文件均无效，请检查下方的错误详情');
    return;
  }

  torrentResultsHeader.classList.remove('hidden');
  syncSelectionHeader(torrentEntries, torrentSelectAll, torrentCount, torrentCopyAllBtn, torrentRemoveBtn);
}

function createTorrentResultItem(entry) {
  const item = document.createElement('div');
  item.className = 'flex items-start gap-2.5 px-4 py-2.5 border-b border-base-300 last:border-b-0 opacity-0 transition-colors hover:bg-base-200 cursor-pointer select-none';
  item.classList.add('result-item');
  item._entry = entry;
  item.classList.toggle('row-selected', entry.selected);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'checkbox checkbox-primary checkbox-sm mt-0.5 shrink-0 result-checkbox';
  checkbox.checked = entry.selected;

  const content = document.createElement('div');
  content.className = 'flex-1 min-w-0 flex flex-col gap-1';

  const header = document.createElement('div');
  header.className = 'flex items-baseline gap-2';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'text-sm font-medium truncate min-w-0';
  nameSpan.textContent = entry.fileName.replace(/\.torrent$/i, '');
  nameSpan.title = entry.fileName.replace(/\.torrent$/i, '');

  const hashSpan = document.createElement('span');
  hashSpan.className = 'text-[0.625rem] text-base-content/40 font-mono shrink-0 tracking-wide';
  hashSpan.textContent = entry.infoHash.substring(0, 8) + '...';
  hashSpan.title = entry.infoHash;

  header.appendChild(nameSpan);
  header.appendChild(hashSpan);

  const magnetRow = document.createElement('div');
  magnetRow.className = 'flex gap-1.5 items-stretch';

  const textarea = document.createElement('textarea');
  textarea.className = 'textarea textarea-bordered flex-1 min-w-0 text-xs font-mono leading-relaxed bg-base-200 break-all resize-none h-11 py-1 focus:outline-none focus:ring-0';
  textarea.value = entry.magnetUri;
  textarea.readOnly = true;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-sm btn-outline btn-primary shrink-0';
  copyBtn.textContent = '复制';
  copyBtn.addEventListener('click', () => {
    copyToClipboard(entry.magnetUri, copyBtn);
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
  const originalClasses = btn.className;
  if (btn.classList.contains('btn-outline')) {
    btn.classList.remove('btn-outline', 'btn-primary', 'btn-error');
    btn.classList.add('btn-success');
  }
  setTimeout(() => {
    btn.textContent = normalText;
    btn.className = originalClasses;
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

function updateResultCount(el, selected, total) {
  el.textContent = `${selected}/${total}`;
  el.classList.remove('hidden');
}
