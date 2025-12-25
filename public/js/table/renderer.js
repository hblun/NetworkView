/**
 * Table Rendering Module
 *
 * Handles virtualized table rendering for large datasets with pagination support.
 * Provides functions for table layout, row measurement, and display.
 */

import { state } from "../state/manager.js";
import { clearElement, formatCount, toNumber } from "../utils/dom.js";
import { quoteIdentifier } from "../utils/sql.js";
import { buildCombinedWhere } from "../filters/builder.js";

/**
 * Get columns to display in the table based on available data
 * @returns {Array<{key: string, label: string, align?: string, mono?: boolean}>}
 */
export const getTableColumns = () => {
  const available = new Set(state.columns || []);
  const cols = [];
  if (available.has("serviceName")) cols.push({ key: "serviceName", label: "Service" });
  if (available.has("mode")) cols.push({ key: "mode", label: "Mode" });
  if (available.has("operatorName")) cols.push({ key: "operatorName", label: "Operator" });
  if (available.has("direction")) cols.push({ key: "direction", label: "Dir" });
  if (available.has("busesPerHour")) cols.push({ key: "busesPerHour", label: "BPH", align: "right" });
  if (available.has("serviceId")) cols.push({ key: "serviceId", label: "Service ID", mono: true });
  return cols;
};

/**
 * Render table header
 * @param {HTMLElement} tableHead - thead element
 */
export const renderTableHead = (tableHead) => {
  if (!tableHead) return;

  clearElement(tableHead);
  const cols = getTableColumns();

  cols.forEach((col) => {
    const th = document.createElement("th");
    th.className =
      "px-4 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border" +
      (col.align === "right" ? " text-right" : "");
    th.textContent = col.label;
    tableHead.appendChild(th);
  });
};

/**
 * Get total number of rows in the table
 * @returns {number}
 */
export const getTableTotalRows = () => {
  if (state.conn && state.tablePaging.enabled) {
    const selection = state.lastQuery?.count ?? null;
    if (selection === null || selection === undefined) {
      return state.tablePaging.rows.length;
    }
    return Math.min(toNumber(selection), state.tablePaging.browseMax);
  }
  return (state.tableRows || []).length;
};

/**
 * Get the range of loaded rows (for pagination)
 * @returns {{start: number, end: number}}
 */
export const getTableLoadedRange = () => {
  if (state.conn && state.tablePaging.enabled) {
    const start = state.tablePaging.offset;
    const end = start + (state.tablePaging.rows?.length || 0);
    return { start, end };
  }
  return { start: 0, end: (state.tableRows || []).length };
};

/**
 * Update table metadata text
 * @param {HTMLElement} tableMeta - Element to update
 * @param {number} rowsShown - Number of rows currently shown
 */
export const updateTableMeta = (tableMeta, rowsShown) => {
  if (!tableMeta) return;

  const selection = state.lastQuery?.count ?? null;
  const total = selection !== null && selection !== undefined ? toNumber(selection) : null;
  const browseTotal = getTableTotalRows();
  const range = getTableLoadedRange();

  if (state.conn && state.tablePaging.enabled) {
    const showingFrom = Math.min(browseTotal, range.start + 1);
    const showingTo = Math.min(browseTotal, range.end);
    const capNote = total !== null && total > browseTotal ? ` (selection ${formatCount(total)}; cap ${formatCount(browseTotal)})` : "";
    if (state.tablePaging.loading && rowsShown === 0) {
      tableMeta.textContent = "Loading rows...";
      return;
    }
    tableMeta.textContent = `Rows ${formatCount(showingFrom)}–${formatCount(showingTo)} of ${formatCount(
      browseTotal
    )}${capNote}.`;
    return;
  }

  if (!rowsShown) {
    tableMeta.textContent = "No rows.";
    return;
  }
  if (total !== null && total !== undefined && total > rowsShown) {
    tableMeta.textContent = `Showing ${formatCount(rowsShown)} of ${formatCount(total)}.`;
  } else {
    tableMeta.textContent = `${formatCount(rowsShown)} rows.`;
  }
};

/**
 * Measure actual row height from rendered DOM
 * @param {HTMLElement} tableBody - tbody element
 * @param {Function} renderCallback - Function to call if row height changed
 */
export const measureRowHeight = (tableBody, renderCallback) => {
  const now = Date.now();
  if (now - (state.tableVirtual.lastMeasuredAt || 0) < 150) {
    return;
  }
  state.tableVirtual.lastMeasuredAt = now;

  if (!tableBody) return;
  const row = tableBody.querySelector("tr[data-row-index]");
  if (!row) return;
  const h = row.getBoundingClientRect().height;
  if (!h || !Number.isFinite(h)) return;
  const next = Math.max(24, Math.round(h));
  const prev = state.tableVirtual.rowHeight || 34;
  if (Math.abs(next - prev) >= 2) {
    state.tableVirtual.rowHeight = next;
    if (renderCallback) renderCallback();
  }
};

/**
 * Fetch a page of table data
 * @param {number} offset - Row offset
 * @param {number} pageSize - Number of rows to fetch
 * @param {string} queryKey - Current query key for staleness checking
 * @returns {Promise<void>}
 */
export const fetchTablePage = async (offset, pageSize, queryKey, filters = {}) => {
  const where = buildCombinedWhere(filters, state.map, Boolean(filters.bbox));
  const cols = getTableColumns().map((c) => c.key);
  const selectList = cols.length ? cols.map(quoteIdentifier).join(", ") : "*";
  const order = state.columns.includes("serviceName") ? quoteIdentifier("serviceName") : "1";
  const query = `
    SELECT ${selectList}
    FROM read_parquet('routes.parquet')
    ${where}
    ORDER BY ${order}
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;
  const result = await state.conn.query(query);
  const rows = result.toArray();

  // Ignore stale fetches
  if (state.tablePaging.queryKey !== queryKey) {
    return;
  }
  state.tablePaging.offset = offset;
  state.tablePaging.rows = rows;
};

/**
 * Get a table row at the specified index (handles pagination)
 * @param {number} index - Row index
 * @returns {Object|null} Row data or null
 */
export const getTableRowAtIndex = (index) => {
  if (state.conn && state.tablePaging.enabled) {
    const range = getTableLoadedRange();
    if (index < range.start || index >= range.end) {
      return null;
    }
    return state.tablePaging.rows[index - range.start] || null;
  }
  return state.tableRows[index] || null;
};

/**
 * Ensure the page containing the given index is loaded
 * @param {number} index - Row index
 * @param {Function} setStatus - Status update callback
 * @param {Function} updateEvidence - Evidence update callback
 * @param {Function} renderCallback - Render callback
 */
export const ensureTablePageFor = (index, setStatus, updateEvidence, renderCallback, filters = {}) => {
  if (!state.conn || !state.tablePaging.enabled) {
    return;
  }
  const selection = state.lastQuery?.count ?? null;
  const total = selection !== null && selection !== undefined ? toNumber(selection) : null;
  const browseTotal = getTableTotalRows();
  if (browseTotal === 0) {
    state.tablePaging.rows = [];
    return;
  }
  const cappedIndex = Math.max(0, Math.min(index, browseTotal - 1));
  const { start, end } = getTableLoadedRange();
  if (cappedIndex >= start && cappedIndex < end && state.tablePaging.rows.length) {
    return;
  }
  if (state.tablePaging.loading) {
    return;
  }

  const pageSize = state.tablePaging.pageSize;
  const nextOffset = Math.max(0, Math.floor(cappedIndex / pageSize) * pageSize);
  const queryKey = state.tablePaging.queryKey;
  state.tablePaging.loading = true;
  if (setStatus) {
    setStatus("Loading table rows...");
  }

  fetchTablePage(nextOffset, pageSize, queryKey, filters)
    .catch((error) => {
      setStatus(`Table load failed: ${error.message}`);
      state.tablePaging.rows = [];
    })
    .finally(() => {
      state.tablePaging.loading = false;
      if (renderCallback) renderCallback();
    });

  // If selection is capped for browsing, make sure we disclose it
  if (total !== null && total > browseTotal) {
    if (updateEvidence) updateEvidence();
  }
};

/**
 * Render virtualized table
 * @param {Object} elements - DOM elements {dataTableHead, dataTableBody, dataTableEmpty, dataTableScroll}
 * @param {Function} getSelectedServiceId - Function to get currently selected service ID
 * @param {Function} setStatus - Status update callback
 * @param {Function} updateEvidence - Evidence update callback
 */
export const renderTable = (elements, getSelectedServiceId, setStatus, updateEvidence, filters = {}) => {
  if (!elements.dataTableBody || !elements.dataTableEmpty) {
    return;
  }

  renderTableHead(elements.dataTableHead);

  const paging = state.conn && state.tablePaging.enabled;
  const rows = paging ? state.tablePaging.rows || [] : state.tableRows || [];
  const cols = getTableColumns();
  const totalRows = getTableTotalRows();
  elements.dataTableEmpty.style.display = totalRows ? "none" : "flex";

  const selectedServiceId = getSelectedServiceId();
  updateTableMeta(elements.tableMeta, Math.min(totalRows, paging ? rows.length : (state.tableRows || []).length));

  if (totalRows === 0) {
    clearElement(elements.dataTableBody);
    return;
  }

  const scroll = elements.dataTableScroll;
  const rowHeight = state.tableVirtual.rowHeight || 34;
  const overscan = state.tableVirtual.overscan || 8;
  const scrollTop = scroll ? scroll.scrollTop : 0;
  const viewport = scroll ? scroll.clientHeight : 400;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(totalRows, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  state.tableVirtual.start = start;
  state.tableVirtual.end = end;

  if (paging) {
    ensureTablePageFor(start, setStatus, updateEvidence, () => renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, filters), filters);
  }

  const topPad = start * rowHeight;
  const bottomPad = (totalRows - end) * rowHeight;

  const fragment = document.createDocumentFragment();

  const spacerTop = document.createElement("tr");
  spacerTop.dataset.spacer = "top";
  spacerTop.style.height = `${topPad}px`;
  spacerTop.innerHTML = `<td colspan="${cols.length}" style="padding:0;border:0"></td>`;
  fragment.appendChild(spacerTop);

  const loaded = paging ? getTableLoadedRange() : { start: 0, end: rows.length };
  for (let i = start; i < end; i += 1) {
    const localIndex = paging ? i - loaded.start : i;
    const row = rows[localIndex];
    const tr = document.createElement("tr");
    tr.dataset.rowIndex = String(i);
    const rowServiceId = row?.serviceId ?? null;
    const isSelected = row && selectedServiceId && rowServiceId && String(rowServiceId) === String(selectedServiceId);
    tr.className = isSelected
      ? "bg-blue-50/60 hover:bg-blue-50 transition-colors cursor-pointer"
      : "hover:bg-slate-50 transition-colors cursor-pointer";

    cols.forEach((col) => {
      const td = document.createElement("td");
      td.className =
        "px-4 py-2.5 text-text-secondary" +
        (col.align === "right" ? " text-right font-mono" : "") +
        (col.key === "serviceName" ? " font-medium text-text-main" : "") +
        (col.mono ? " font-mono" : "");
      const value = row ? row[col.key] : "";
      td.textContent = value === null || value === undefined ? "" : String(value);
      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  }

  const spacerBottom = document.createElement("tr");
  spacerBottom.dataset.spacer = "bottom";
  spacerBottom.style.height = `${bottomPad}px`;
  spacerBottom.innerHTML = `<td colspan="${cols.length}" style="padding:0;border:0"></td>`;
  fragment.appendChild(spacerBottom);

  clearElement(elements.dataTableBody);
  elements.dataTableBody.appendChild(fragment);
  window.requestAnimationFrame(() =>
    measureRowHeight(elements.dataTableBody, () => renderTable(elements, getSelectedServiceId, setStatus, updateEvidence, filters))
  );
};

/**
 * Query table data (non-paging mode)
 * @param {number} limit - Maximum rows to fetch
 * @param {number} offset - Row offset
 * @returns {Promise<Array>} Array of row objects
 */
export const queryTable = async (limit = 250, offset = 0, filters = {}) => {
  const where = buildCombinedWhere(filters, state.map, Boolean(filters.bbox));
  const cols = getTableColumns().map((c) => c.key);
  const selectList = cols.length ? cols.map(quoteIdentifier).join(", ") : "*";
  const query = `
    SELECT ${selectList}
    FROM read_parquet('routes.parquet')
    ${where}
    ORDER BY ${state.columns.includes("serviceName") ? quoteIdentifier("serviceName") : "1"}
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  const result = await state.conn.query(query);
  return result.toArray();
};
