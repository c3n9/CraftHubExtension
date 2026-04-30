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
      row: Number(td.dataset.row),
      col: td.dataset.col,
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