/**
 * 通用分页组件
 * - 数据顺序严格按传入数组，切片渲染，不重复不遗漏
 * - 翻页异步渲染（rAF 让帧），期间显示加载态
 * - 渲染异常时显示错误行，可点击重试
 */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.listEl - 结果列表容器
 * @param {HTMLElement} opts.pagerEl - 分页条容器
 * @param {(entry: any) => HTMLElement} opts.renderItem - 单条渲染函数
 * @param {number[]} [opts.pageSizes] - 可选每页条数
 * @param {number} [opts.defaultSize] - 默认每页条数
 * @param {() => void} [opts.onAfterRender] - 每页渲染完成后的回调（用于同步全选状态等）
 */
export function createPager({ listEl, pagerEl, renderItem, pageSizes = [10, 20, 50, 100], defaultSize = 20, onAfterRender }) {
  let data = [];
  let page = 1;
  let size = defaultSize;
  let renderToken = 0; // 防止旧渲染覆盖新渲染

  // --- 构建分页条 UI ---
  pagerEl.className = pagerEl.className.replace('hidden', '').trim();
  const bar = document.createElement('div');
  bar.className = 'flex items-center justify-between flex-wrap gap-2 px-4 py-2.5';

  const totalSpan = document.createElement('span');
  totalSpan.className = 'text-xs text-base-content/60';

  const right = document.createElement('div');
  right.className = 'flex items-center gap-2';

  const loadingSpan = document.createElement('span');
  loadingSpan.className = 'text-xs text-base-content/60 hidden items-center gap-1';
  loadingSpan.innerHTML = '<span class="loading loading-spinner loading-xs"></span>加载中…';

  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'select select-bordered select-xs';
  sizeSelect.setAttribute('aria-label', '每页条数');
  for (const s of pageSizes) {
    const opt = document.createElement('option');
    opt.value = String(s);
    opt.textContent = `${s} 条/页`;
    if (s === defaultSize) opt.selected = true;
    sizeSelect.appendChild(opt);
  }

  const prevBtn = document.createElement('button');
  prevBtn.className = 'btn btn-xs btn-ghost';
  prevBtn.textContent = '上一页';

  const pageSpan = document.createElement('span');
  pageSpan.className = 'text-xs text-base-content/60 min-w-12 text-center';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-xs btn-ghost';
  nextBtn.textContent = '下一页';

  right.append(loadingSpan, sizeSelect, prevBtn, pageSpan, nextBtn);
  bar.append(totalSpan, right);
  pagerEl.appendChild(bar);

  function pageCount() {
    return Math.max(1, Math.ceil(data.length / size));
  }

  function syncControls() {
    const pages = pageCount();
    totalSpan.textContent = `共 ${data.length} 条`;
    pageSpan.textContent = `${page} / ${pages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= pages;
    // 数据量不超过最小页档时不显示分页条
    pagerEl.classList.toggle('hidden', data.length <= pageSizes[0]);
  }

  function renderPage() {
    const token = ++renderToken;
    syncControls();
    if (data.length === 0) {
      listEl.innerHTML = '';
      onAfterRender?.();
      return;
    }

    const start = (page - 1) * size;
    const slice = data.slice(start, start + size); // 顺序切片，不重复不遗漏

    const doRender = () => {
      if (token !== renderToken) return; // 期间发生了新的渲染请求
      try {
        const frag = document.createDocumentFragment();
        for (const entry of slice) {
          frag.appendChild(renderItem(entry));
        }
        listEl.innerHTML = '';
        listEl.appendChild(frag);
        // 入场动画
        requestAnimationFrame(() => {
          listEl.querySelectorAll('.result-item.opacity-0').forEach(el => el.classList.add('animate-fade-in-up'));
        });
      } catch (e) {
        console.error('分页渲染失败', e);
        listEl.innerHTML = '';
        const errRow = document.createElement('div');
        errRow.className = 'px-4 py-3 flex items-center justify-between gap-2';
        const msg = document.createElement('span');
        msg.className = 'text-sm text-error';
        msg.textContent = `渲染失败：${e.message || '未知错误'}`;
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-xs btn-outline btn-error';
        retryBtn.textContent = '重试';
        retryBtn.addEventListener('click', () => renderPage());
        errRow.append(msg, retryBtn);
        listEl.appendChild(errRow);
      }
      onAfterRender?.();
    };

    // 小页同步渲染，操作即时反馈；大页让帧渲染避免阻塞
    if (slice.length <= 50) {
      doRender();
      return;
    }

    // 加载态延迟 150ms 才显示，快速渲染不出现闪烁的 spinner
    const spinnerTimer = setTimeout(() => {
      if (token === renderToken) {
        loadingSpan.classList.remove('hidden');
        loadingSpan.classList.add('inline-flex');
      }
    }, 150);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(spinnerTimer);
      doRender();
      if (token === renderToken) {
        loadingSpan.classList.add('hidden');
        loadingSpan.classList.remove('inline-flex');
      }
    }));
  }

  prevBtn.addEventListener('click', () => {
    if (page > 1) { page--; renderPage(); }
  });
  nextBtn.addEventListener('click', () => {
    if (page < pageCount()) { page++; renderPage(); }
  });
  sizeSelect.addEventListener('change', () => {
    size = Number(sizeSelect.value) || defaultSize;
    page = 1;
    renderPage();
  });

  return {
    /** 设置数据；默认回到第一页，keepPage 时尽量停留当前页 */
    setData(entries, { keepPage = false } = {}) {
      data = entries;
      page = keepPage ? Math.min(page, pageCount()) : 1;
      renderPage();
    },
    /** 数据内容变化后刷新当前页（不重置页码） */
    refresh() {
      renderPage();
    },
    getData() { return data; },
  };
}
