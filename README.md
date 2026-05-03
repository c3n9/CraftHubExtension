<p align="center">
    <img width="1140" height="809" alt="VsCodeScreen" src="https://github.com/user-attachments/assets/8a648e4d-d9d6-48fb-bd2d-23ba6273b24c" />
</p>
**CraftHub is a Visual Studio Code extension that lets you edit JSON arrays as an interactive table — no more manually hunting through brackets and commas. Switch between the table view and the raw JSON editor with a single click.**

## Features

### 1. Table View for JSON Files
- Open any `.json` file containing an array of objects and CraftHub automatically renders it as a structured table.
- Every change made in the table is instantly written back to the file, keeping the JSON in sync at all times.

### 2. Toggle Between Editor Modes
- Use the button in the editor toolbar to switch between the CraftHub table view and the built-in VS Code JSON text editor at any time.
- Useful when you need to make bulk edits or inspect the raw structure.

### 3. Column Management
- **Add columns** — choose a name and a data type (string, number, bool, object, array). The new field is added to every row with a sensible default value.
- **Rename columns** — click the ✎ button in any column header and type the new name. The key is renamed across all rows while preserving the original field order.
- **Delete columns** — click the ✕ button in a column header to remove the field from every row.

### 4. Row Management
- **Add rows** — append a new empty row to the table.
- **Delete rows** — remove one or several selected rows at once.
- **Duplicate rows** — copy selected rows and insert them right after, or send them to the end of the table.
- **Cut / Copy / Paste rows** — cut or copy selected rows to an internal clipboard, then paste them anywhere in the table. Copy as a JSON array or as individual objects.

### 5. Inline Cell Editing
- Double-click any cell to open an inline text editor.
- Press **Enter** to confirm or **Escape** to cancel without saving.

### 6. Nested Object and Array Editing
- Cells containing a JSON object or array show a compact preview and an **✏ Edit** button.
- Clicking the button opens a dedicated sub-editor dialog where you can manage the nested structure as its own table:
  - **Arrays** — add, delete, duplicate, and cut rows; add, rename, and delete columns; right-click rows for a context menu.
  - **Objects** — add, rename, and delete fields; edit the single row of values.
- Nesting is **unlimited** — drill into objects inside arrays inside objects as deep as needed. Use the **← Back** button to navigate up without losing unsaved changes.

### 7. Row Selection
- Click a row to select it; **Ctrl / ⌘ + click** to toggle individual rows; **Shift + click** to select a range.
- Right-click any selected row to open the **context menu** with all row actions and keyboard shortcuts.

### 8. Search
- Type in the search box to highlight all matching cells across the table.
- Press **Enter** / **Shift + Enter** to jump forward and backward between matches.
- A match counter shows the current position (e.g. `3 / 12`).

**Start editing JSON files the easy way — with CraftHub.**
