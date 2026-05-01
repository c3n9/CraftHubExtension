const vscode = acquireVsCodeApi();

document.getElementById('json-table').addEventListener('dblclick', (e) => {
  const td = e.target.closest('td');
  if (!td) return;

  const original = td.textContent;
  const input = document.createElement('input');
  input.value = original;
  input.style.width = '100%';
  td.textContent = '';
  td.appendChild(input);
  input.focus();

  const commit = () => {
    const value = input.value;
    td.textContent = value;
    vscode.postMessage({
      type: 'edit',
      row: Number(td.closest('tr').dataset.row), col: td.dataset.col,
      value
    });
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') input.blur();
    if (ev.key === 'Escape') { td.textContent = original; }
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
  vscode.postMessage({ type: 'addRow' });
});

const deleteDialog = document.getElementById('delete-col-dialog');
let colToDelete = '';

document.getElementById('json-table').addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-column');
  if (!btn) return;
  colToDelete = btn.dataset.col;
  deleteDialog.showModal();
});

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

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'copyToClipboard') {
    navigator.clipboard.writeText(msg.text);
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
function search() {
  var input, filter, table, tr, td, i, txtValue;
  input = document.getElementById("searchInput");
  filter = input.value.toUpperCase();
  table = document.getElementById("json-table");
  tr = table.getElementsByTagName("tr");
  // Перебирайте все строки таблицы и скрывайте тех, кто не соответствует поисковому запросу
  for (i = 0; i < tr.length; i++) {
    td = tr[i].getElementsByTagName("td")[0];
    if (td) {
      txtValue = td.textContent || td.innerText;
      if (txtValue.toUpperCase().indexOf(filter) > -1) {
        tr[i].style.display = "";
      } else {
        tr[i].style.display = "none";
      }
    }
  }
}


function clearHighlights() {
  document.querySelectorAll('#json-table td').forEach(td => {
    td.textContent = td.textContent;
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

  document.querySelectorAll('#json-table td').forEach(td => {
    if (!regex.test(td.textContent)) return;
    td.innerHTML = td.textContent.replace(regex, '<mark>$1</mark>');
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
