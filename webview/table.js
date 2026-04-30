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
