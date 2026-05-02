const vscode = acquireVsCodeApi();

function htmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.getElementById('json-table').addEventListener('dblclick', (e) => {
  const td = e.target.closest('td');
  if (!td) return;
  if (td.querySelector('.cell-complex')) return;

  const inner = td.querySelector('.cell-inner');
  const original = (inner ? inner.textContent : td.textContent) ?? '';

  const textarea = document.createElement('textarea');
  textarea.value = original;
  td.innerHTML = '';
  td.appendChild(textarea);
  textarea.style.height = Math.max(textarea.scrollHeight, 24) + 'px';
  textarea.focus();
  textarea.select();

  let cancelled = false;

  const commit = () => {
    if (cancelled) return;
    const value = textarea.value;
    td.innerHTML = `<div class="cell-inner"></div>`;
    td.querySelector('.cell-inner').textContent = value;
    vscode.postMessage({
      type: 'edit',
      row: Number(td.closest('tr').dataset.row), col: td.dataset.col,
      value
    });
  };

  textarea.addEventListener('blur', commit);
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
  textarea.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); textarea.blur(); }
    if (ev.key === 'Escape') {
      cancelled = true;
      td.innerHTML = `<div class="cell-inner"></div>`;
      td.querySelector('.cell-inner').textContent = original;
    }
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
});


// диалог для добавления столбца
const dialog = document.getElementById('add-col-dialog');
const colNameInput = document.getElementById('col-name');
const colTypeSelect = document.getElementById('col-type');

document.getElementById('add-column').addEventListener('click', () => {
  colNameInput.value = '';
  dialog.showModal();
});

dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'default') return;
  const name = colNameInput.value.trim();
  if (!name) return;
  vscode.postMessage({
    type: 'addColumn',
    name,
    dataType: colTypeSelect.value
  });
});

document.getElementById('btn-cancel-add-col').addEventListener('click', () => {
  dialog.close();
});

document.getElementById('add-row').addEventListener('click', () => {
  if (document.querySelectorAll('#json-table thead th').length === 0) {
    showError('Add at least one column first');
    return;
  }
  vscode.postMessage({ type: 'addRow' });
});

const deleteDialog = document.getElementById('delete-col-dialog');
let colToDelete = '';

document.getElementById('json-table').addEventListener('click', (e) => {
  const renameBtn = e.target.closest('.rename-column');
  if (renameBtn) {
    startRenameColumn(renameBtn);
    return;
  }
  const btn = e.target.closest('.delete-column');
  if (!btn) return;
  colToDelete = btn.dataset.col;
  deleteDialog.showModal();
});

function startRenameColumn(renameBtn) {
  const th = renameBtn.closest('th');
  const oldName = renameBtn.dataset.col;
  const nameSpan = th.querySelector('.col-name');

  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldName;
  input.className = 'col-rename-input';
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  const commit = () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    const span = document.createElement('span');
    span.className = 'col-name';
    input.replaceWith(span);
    if (!newName || newName === oldName) {
      span.textContent = oldName;
      return;
    }
    span.textContent = newName;
    renameBtn.dataset.col = newName;
    th.querySelector('.delete-column').dataset.col = newName;
    th.querySelectorAll('td').forEach(td => { if (td.dataset.col === oldName) td.dataset.col = newName; });
    vscode.postMessage({ type: 'renameColumn', oldName, newName });
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') {
      committed = true;
      const span = document.createElement('span');
      span.className = 'col-name';
      span.textContent = oldName;
      input.replaceWith(span);
    }
  });
}

deleteDialog.addEventListener('close', () => {
  if (deleteDialog.returnValue !== 'default') return;
  vscode.postMessage({ type: 'deleteColumn', name: colToDelete });
});

document.getElementById('btn-cancel-delete-col').addEventListener('click', () => {
  deleteDialog.close();
});

// --- выделение строк ---
let selectedRows = new Set();

document.querySelector('#json-table tbody').addEventListener('click', (e) => {
  const pencil = e.target.closest('.cell-pencil');
  if (pencil) { subOpen(pencil.closest('td')); return; }

  const tr = e.target.closest('tr');
  if (!tr) return;

  const idx = Number(tr.dataset.row);

  if (e.ctrlKey || e.metaKey) {
    // Ctrl+клик — переключить одну строку
    if (selectedRows.has(idx)) {
      selectedRows.delete(idx);
      tr.classList.remove('selected');
    } else {
      selectedRows.add(idx);
      tr.classList.add('selected');
    }
  } else if (e.shiftKey && selectedRows.size > 0) {
    // Shift+клик — выделить диапазон от последней до текущей
    const last = Math.max(...selectedRows);
    const from = Math.min(last, idx);
    const to = Math.max(last, idx);
    document.querySelectorAll('#json-table tbody tr').forEach(row => {
      const i = Number(row.dataset.row);
      if (i >= from && i <= to) {
        selectedRows.add(i);
        row.classList.add('selected');
      }
    });
  } else {
    // Обычный клик — выделить только эту строку
    clearSelection();
    selectedRows.add(idx);
    tr.classList.add('selected');
  }
});

function clearSelection() {
  selectedRows.clear();
  document.querySelectorAll('#json-table tbody tr.selected')
    .forEach(tr => tr.classList.remove('selected'));
}

// --- контекстное меню ---
const ctxMenu = document.getElementById('ctx-menu');

document.querySelector('#json-table tbody').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const tr = e.target.closest('tr');

  const hasRow = tr && tr.dataset.row !== undefined;

  if (hasRow) {
    const idx = Number(tr.dataset.row);
    if (!selectedRows.has(idx)) {
      clearSelection();
      selectedRows.add(idx);
      tr.classList.add('selected');
    }
  }

  ctxMenu.querySelectorAll('button:not([data-action="paste"]), hr').forEach(el => {
    el.style.display = hasRow ? '' : 'none';
  });

  ctxMenu.style.left = e.clientX + 'px';
  ctxMenu.style.top = e.clientY + 'px';
  ctxMenu.hidden = false;
});

document.addEventListener('click', () => { ctxMenu.hidden = true; });
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('#ctx-menu')) ctxMenu.hidden = true;
});

ctxMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  const rows = [...selectedRows].sort((a, b) => a - b);

  if (action === 'delete') {
    vscode.postMessage({ type: 'deleteRows', rows });
  } else if (action === 'duplicate-after') {
    vscode.postMessage({ type: 'duplicateRows', rows, mode: 'after' });
  } else if (action === 'duplicate-end') {
    vscode.postMessage({ type: 'duplicateRows', rows, mode: 'end' });
  } else if (action === 'copy-array') {
    vscode.postMessage({ type: 'getRows', rows, format: 'array' });
  } else if (action === 'copy-objects') {
    vscode.postMessage({ type: 'getRows', rows, format: 'objects' });
  } else if (action === 'paste') {
    vscode.postMessage({ type: 'pasteRows', after: Math.max(...selectedRows) });
  } else if (action === 'cut') {
    vscode.postMessage({ type: 'cutRows', rows });
  }


  ctxMenu.hidden = true;
});

function renderCell(val) {
  if (val !== null && val !== undefined && typeof val === 'object') {
    const json = htmlEsc(JSON.stringify(val, null, 2));
    const type = Array.isArray(val) ? 'array' : 'object';
    return `<div class="cell-complex" data-type="${type}"><div class="cell-inner">${json}</div><button class="cell-pencil" title="Edit">✏</button></div>`;
  }
  return `<div class="cell-inner">${htmlEsc(String(val ?? ''))}</div>`;
}

function renderTable(data, columns) {
  const thead = document.querySelector('#json-table thead tr');
  const tbody = document.querySelector('#json-table tbody');

  thead.innerHTML = columns.map(c =>
    `<th><span class="col-name" title="${htmlEsc(c)}">${htmlEsc(c)}</span><button class="rename-column" data-col="${c}" title="Rename">✎</button><button class="delete-column" data-col="${c}">✕</button></th>`
  ).join('');

  if (data.length > 0) {
    tbody.innerHTML = data.map((row, i) =>
      `<tr data-row="${i}">` +
      columns.map(c => `<td data-col="${c}">${renderCell(row[c])}</td>`).join('') +
      `</tr>`
    ).join('');
  } else {
    tbody.innerHTML = `<tr class="empty-placeholder"><td colspan="${columns.length || 1}"></td></tr>`;
  }

  clearSelection();
  const q = document.getElementById('search-input').value.trim();
  if (q) applySearch(q);
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'copyToClipboard') {
    navigator.clipboard.writeText(msg.text);
  } else if (msg.type === 'renderTable') {
    renderTable(msg.data, msg.columns);
  } else if (msg.type === 'renderError') {
    const thead = document.querySelector('#json-table thead tr');
    const tbody = document.querySelector('#json-table tbody');
    thead.innerHTML = '';
    tbody.innerHTML = `<tr><td style="color:var(--danger);text-align:center;padding:20px">${htmlEsc(msg.message)}</td></tr>`;
  }
});

// --- клавиатурные сокращения ---

document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (selectedRows.size === 0) return;

  const rows = [...selectedRows].sort((a, b) => a - b);

  if (e.code === 'KeyC') {
    e.preventDefault();
    vscode.postMessage({ type: 'getRows', rows, format: 'objects' });
  } else if (e.code === 'KeyX') {
    e.preventDefault();
    vscode.postMessage({ type: 'cutRows', rows });
  } else if (e.code === 'KeyD') {
    e.preventDefault();
    vscode.postMessage({ type: 'duplicateRows', rows, mode: 'after' });
  } else if (e.code === 'KeyV') {
    e.preventDefault();
    vscode.postMessage({ type: 'pasteRows', after: Math.max(...selectedRows) });
  }
});


// search

function clearHighlights() {
  document.querySelectorAll('#json-table td .cell-inner').forEach(inner => {
    inner.textContent = inner.textContent;
  });
}

let matches = [];
let currentMatch = -1;

function applySearch(query) {
  clearHighlights();
  matches = [];
  currentMatch = -1;
  if (!query) { document.getElementById('search-count').textContent = ''; return; }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');

  document.querySelectorAll('#json-table td .cell-inner').forEach(inner => {
    if (!regex.test(inner.textContent)) return;
    inner.innerHTML = inner.textContent.replace(regex, '<mark>$1</mark>');
  });

  matches = [...document.querySelectorAll('#json-table td mark')];
  if (matches.length > 0) { currentMatch = 0; scrollToMatch(); }
  updateCount();
}

function scrollToMatch() {
  matches.forEach((m, i) => m.classList.toggle('current', i === currentMatch));
  matches[currentMatch]?.scrollIntoView({ block: 'nearest' });
}

function updateCount() {
  const el = document.getElementById('search-count');
  el.textContent = matches.length > 0 ? `${currentMatch + 1} / ${matches.length}` : 'No results';
}

document.getElementById('search-input').addEventListener('input', e => {
  applySearch(e.target.value.trim());
});

document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || matches.length === 0) return;
  currentMatch = e.shiftKey
    ? (currentMatch - 1 + matches.length) % matches.length
    : (currentMatch + 1) % matches.length;
  scrollToMatch();
  updateCount();
});



const errorToast = document.getElementById('error-toast');
let toastTimer;

function showError(msg) {
  clearTimeout(toastTimer);
  errorToast.textContent = msg;
  errorToast.classList.add('visible');
  toastTimer = setTimeout(() => errorToast.classList.remove('visible'), 3000);
}



let subTd = null;
let subType = '';
let subData = [];
let subCols = [];
let subStack = []; // { td, type, data, cols, nestedRow, nestedCol }

const subDialog = document.getElementById('sub-editor-dialog');
const subTitleEl = document.getElementById('sub-editor-title');
const subAddRowBtn = document.getElementById('sub-btn-add-row');
const subAddColBtn = document.getElementById('sub-btn-add-col');
const subTheadRow = document.getElementById('sub-thead-row');
const subTbody = document.getElementById('sub-tbody');
const subEmpty = document.getElementById('sub-empty');
const subAddColDialog = document.getElementById('sub-add-col-dialog');
const subColNameInput = document.getElementById('sub-col-name');
const subColTypeSelect = document.getElementById('sub-col-type');

const SUB_DEFAULTS = { string: '', number: 0, bool: false, object: {}, array: [] };

function updateBackBtn() {
  document.getElementById('sub-btn-back').style.display = subStack.length > 0 ? '' : 'none';
}

function subParseTd(td) {
  const complex = td.querySelector('.cell-complex');
  if (!complex) return null;
  const type = complex.dataset.type;
  let parsed;
  try { parsed = JSON.parse(td.querySelector('.cell-inner').textContent.trim()); }
  catch { parsed = type === 'array' ? [] : {}; }
  return { type, parsed };
}

function subInitState(td, type, parsed) {
  subTd = td;
  subType = type;
  if (type === 'array') {
    const arr = Array.isArray(parsed) ? parsed : [];
    subData = arr.map(item =>
      (item !== null && typeof item === 'object' && !Array.isArray(item))
        ? { ...item } : { value: String(item) }
    );
  } else {
    const obj = (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    subData = [{ ...obj }];
  }
  subCols = [...new Set(subData.flatMap(r => Object.keys(r)))];
  subTitleEl.textContent = type === 'array' ? 'Edit Array' : 'Edit Object';
  subAddRowBtn.style.display = type === 'array' ? '' : 'none';
}

function subOpen(td) {
  const info = subParseTd(td);
  if (!info) return;
  subStack = [];
  subInitState(td, info.type, info.parsed);
  subRender();
  subDialog.showModal();
}

function subDive(td) {
  const info = subParseTd(td);
  if (!info) return;
  subStack.push({
    td: subTd, type: subType, data: subData, cols: [...subCols],
    nestedRow: Number(td.closest('tr').dataset.row),
    nestedCol: td.dataset.col
  });
  subInitState(td, info.type, info.parsed);
  subRender();
}

function subRender() {
  const hasCols = subCols.length > 0;
  subEmpty.hidden = hasCols;
  document.getElementById('sub-table').style.display = hasCols ? '' : 'none';

  const showDel = subType === 'array';

  subTheadRow.innerHTML = subCols.map(c =>
    `<th><span class="col-name" title="${htmlEsc(c)}">${htmlEsc(c)}</span><button class="rename-column sub-rename-col" data-col="${c}" title="Rename">✎</button><button class="delete-column sub-del-col" data-col="${c}">✕</button></th>`
  ).join('') + (showDel && subData.length > 0 ? '<th class="th-del"></th>' : '');

  subTbody.innerHTML = subData.map((row, i) =>
    `<tr data-row="${i}">` +
    subCols.map(c => `<td data-col="${c}">${renderCell(row[c])}</td>`).join('') +
    (showDel ? `<td class="td-del"><button class="row-del-btn" data-row="${i}" title="Delete row">✕</button></td>` : '') +
    `</tr>`
  ).join('');

  updateBackBtn();
}

subTbody.addEventListener('click', (e) => {
  const pencil = e.target.closest('.cell-pencil');
  if (pencil) { subDive(pencil.closest('td')); return; }

  const btn = e.target.closest('.row-del-btn');
  if (!btn) return;
  subData.splice(Number(btn.dataset.row), 1);
  subRender();
});


subTheadRow.addEventListener('click', (e) => {
  const renameBtn = e.target.closest('.sub-rename-col');
  if (renameBtn) { startRenameSubColumn(renameBtn); return; }

  const btn = e.target.closest('.sub-del-col');
  if (!btn) return;
  const col = btn.dataset.col;
  subCols = subCols.filter(c => c !== col);
  subData.forEach(row => delete row[col]);
  subRender();
});

function startRenameSubColumn(renameBtn) {
  const th = renameBtn.closest('th');
  const oldName = renameBtn.dataset.col;
  const nameSpan = th.querySelector('.col-name');

  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldName;
  input.className = 'col-rename-input';
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  const commit = () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    const span = document.createElement('span');
    span.className = 'col-name';
    input.replaceWith(span);
    if (!newName || newName === oldName) { span.textContent = oldName; span.title = oldName; return; }
    span.textContent = newName;
    span.title = newName;
    renameBtn.dataset.col = newName;
    th.querySelector('.sub-del-col').dataset.col = newName;
    const idx = subCols.indexOf(oldName);
    if (idx !== -1) subCols[idx] = newName;
    subData.forEach(row => {
      if (Object.prototype.hasOwnProperty.call(row, oldName)) {
        const entries = Object.entries(row);
        const ei = entries.findIndex(([k]) => k === oldName);
        entries[ei] = [newName, entries[ei][1]];
        const rebuilt = {};
        for (const [k, v] of entries) rebuilt[k] = v;
        for (const k of Object.keys(row)) delete row[k];
        Object.assign(row, rebuilt);
      }
    });
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') {
      committed = true;
      const span = document.createElement('span');
      span.className = 'col-name';
      span.textContent = oldName;
      span.title = oldName;
      input.replaceWith(span);
    }
  });
}

document.getElementById('sub-table').addEventListener('dblclick', (e) => {
  const td = e.target.closest('#sub-tbody td:not(.td-del)');
  if (!td || td.querySelector('.cell-complex')) return;

  const inner = td.querySelector('.cell-inner');
  const original = inner ? inner.textContent : '';
  const rowIdx = Number(td.closest('tr').dataset.row);
  const col = td.dataset.col;

  const textarea = document.createElement('textarea');
  textarea.value = original;
  td.innerHTML = '';
  td.appendChild(textarea);
  textarea.style.height = Math.max(textarea.scrollHeight, 24) + 'px';
  textarea.focus();

  let cancelled = false;

  const commit = () => {
    if (cancelled) return;
    const value = textarea.value;
    subData[rowIdx][col] = value;
    td.innerHTML = `<div class="cell-inner"></div>`;
    td.querySelector('.cell-inner').textContent = value;
  };

  textarea.addEventListener('blur', commit);
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
  textarea.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); textarea.blur(); }
    if (ev.key === 'Escape') {
      cancelled = true;
      td.innerHTML = `<div class="cell-inner"></div>`;
      td.querySelector('.cell-inner').textContent = original;
    }
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
});

subAddColBtn.addEventListener('click', () => {
  subColNameInput.value = '';
  subAddColDialog.showModal();
});

subAddColDialog.addEventListener('close', () => {
  if (subAddColDialog.returnValue !== 'default') return;
  const name = subColNameInput.value.trim();
  if (!name || subCols.includes(name)) return;
  const defVal = SUB_DEFAULTS[subColTypeSelect.value] ?? '';
  subCols.push(name);
  if (subData.length === 0) subData.push({});
  subData.forEach(row => { if (!(name in row)) row[name] = defVal; });
  subRender();
});

document.getElementById('btn-cancel-sub-col').addEventListener('click', () => {
  subAddColDialog.close();
});

subAddRowBtn.addEventListener('click', () => {
  if (subCols.length === 0) { showError('Add a column first'); return; }
  subData.push(Object.fromEntries(subCols.map(c => [c, ''])));
  subRender();
});

document.getElementById('sub-btn-back').addEventListener('click', () => {
  if (subStack.length === 0) return;
  const prev = subStack.pop();
  subTd = prev.td;
  subType = prev.type;
  subData = prev.data;
  subCols = prev.cols;
  subTitleEl.textContent = subType === 'array' ? 'Edit Array' : 'Edit Object';
  subAddRowBtn.style.display = subType === 'array' ? '' : 'none';
  subRender();
});

document.getElementById('sub-btn-save').addEventListener('click', () => {
  const active = document.querySelector('#sub-tbody textarea');
  if (active) active.blur();

  const result = subType === 'array' ? subData : (subData[0] ?? {});

  if (subStack.length > 0) {
    const frame = subStack[subStack.length - 1];
    frame.data[frame.nestedRow][frame.nestedCol] = result;
    const prev = subStack.pop();
    subTd = prev.td;
    subType = prev.type;
    subData = prev.data;
    subCols = prev.cols;
    subTitleEl.textContent = subType === 'array' ? 'Edit Array' : 'Edit Object';
    subAddRowBtn.style.display = subType === 'array' ? '' : 'none';
    subRender();
  } else {
    const json = JSON.stringify(result, null, 2);
    const complex = subTd.querySelector('.cell-complex');
    if (complex) complex.querySelector('.cell-inner').textContent = json;
    vscode.postMessage({
      type: 'edit',
      row: Number(subTd.closest('tr').dataset.row),
      col: subTd.dataset.col,
      value: json,
      valueType: 'json'
    });
    subDialog.close();
    subStack = [];
  }
});

document.getElementById('sub-btn-cancel').addEventListener('click', () => {
  subDialog.close();
  subStack = [];
});

// --- sub-table context menu (array only) ---
const subCtxMenu = document.getElementById('sub-ctx-menu');
let subCtxRow = -1;
let subClipboard = null;

subTbody.addEventListener('contextmenu', (e) => {
  if (subType !== 'array') return;
  const tr = e.target.closest('tr');
  if (!tr || tr.dataset.row === undefined) return;
  e.preventDefault();
  e.stopPropagation();
  subCtxRow = Number(tr.dataset.row);
  const showPaste = !!subClipboard;
  subCtxMenu.querySelector('[data-action="sub-paste"]').style.display = showPaste ? '' : 'none';
  document.getElementById('sub-ctx-paste-sep').style.display = showPaste ? '' : 'none';
  const rect = subDialog.getBoundingClientRect();
  subCtxMenu.style.left = Math.min(e.clientX, rect.right - 180) + 'px';
  subCtxMenu.style.top = e.clientY + 'px';
  subCtxMenu.hidden = false;
});

subCtxMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  subCtxMenu.hidden = true;
  const action = btn.dataset.action;
  if (action === 'sub-duplicate') {
    subData.splice(subCtxRow + 1, 0, { ...subData[subCtxRow] });
    subRender();
  } else if (action === 'sub-cut') {
    subClipboard = { ...subData[subCtxRow] };
    subData.splice(subCtxRow, 1);
    subRender();
  } else if (action === 'sub-paste') {
    if (!subClipboard) return;
    subData.splice(subCtxRow + 1, 0, { ...subClipboard });
    subRender();
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#sub-ctx-menu')) subCtxMenu.hidden = true;
});

vscode.postMessage({ type: 'ready' });
