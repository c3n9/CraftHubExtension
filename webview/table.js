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

document.getElementById('btn-cancel').addEventListener('click', () => {
  dialog.close();
});

dialog.addEventListener('close', () => {
  if(dialog.returnValue !== 'default') return;
  const name = colNameInput.value.trim();
  if(!name) return;
  vscode.postMessage({
    type: 'addColumn',
    name,
    dataType: colTypeSelect.value
  });
});

document.getElementById('add-row').addEventListener('click', () => {
  vscode.postMessage({ type: 'addRow' });
});
