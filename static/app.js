/* ============================================================
   油耗记录工具 - 前端逻辑
   ============================================================ */

const API = "/api";
let records = [];
let deleteTargetId = null;
let vehicles = [];
let currentVehicleId = null;

// 分页状态
let currentPage = 1;
let pageSize = 20;
let totalPages = 1;
let totalRecords = 0;

// 记录最后两次修改的字段，用于智能计算
let lastEdited = [];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("fDate").value = todayStr();
    const saved = localStorage.getItem("fuel_page_size");
    if (saved) {
        pageSize = parseInt(saved) || 20;
        document.getElementById("pageSizeSelect").value = pageSize;
    }
    await loadVehicles();
});

function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Vehicle management
// ---------------------------------------------------------------------------
async function loadVehicles() {
    try {
        const res = await fetch(`${API}/vehicles`);
        vehicles = await res.json();
        renderVehicleSelect();
        if (vehicles.length > 0) {
            const savedId = localStorage.getItem("fuel_vehicle_id");
            const match = vehicles.find(v => v.id == savedId);
            currentVehicleId = match ? match.id : vehicles[0].id;
            document.getElementById("vehicleSelect").value = currentVehicleId;
            localStorage.setItem("fuel_vehicle_id", currentVehicleId);
            await loadData();
        } else {
            currentVehicleId = null;
        }
    } catch (e) {
        console.error("加载车辆失败", e);
    }
}

function renderVehicleSelect() {
    const sel = document.getElementById("vehicleSelect");
    sel.innerHTML = vehicles.map(v => {
        const label = v.plate_number ? `${v.name} (${v.plate_number})` : v.name;
        return `<option value="${v.id}">${label}</option>`;
    }).join("");
}

function onVehicleChange() {
    currentVehicleId = parseInt(document.getElementById("vehicleSelect").value);
    localStorage.setItem("fuel_vehicle_id", currentVehicleId);
    currentPage = 1;
    loadData();
}

function getVehicleParam() {
    return `vehicle_id=${currentVehicleId}`;
}

// ---------------------------------------------------------------------------
// Vehicle modal
// ---------------------------------------------------------------------------
function openVehicleModal() {
    renderVehicleList();
    resetVehicleForm();
    document.getElementById("vehicleOverlay").classList.add("active");
}

function closeVehicleModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById("vehicleOverlay").classList.remove("active");
    loadVehicles();
}

function renderVehicleList() {
    const div = document.getElementById("vehicleList");
    if (vehicles.length === 0) {
        div.innerHTML = '<p class="text-muted" style="text-align:center; padding:12px;">还没有车辆，请先添加</p>';
        return;
    }
    div.innerHTML = `<div class="vehicle-items">${vehicles.map(v => `
        <div class="vehicle-item">
            <div class="vehicle-info">
                <strong>${v.name}</strong>
                ${v.plate_number ? `<span class="text-muted">${v.plate_number}</span>` : ''}
            </div>
            <div class="vehicle-item-actions">
                <button class="btn btn-secondary btn-icon" onclick="editVehicle(${v.id})" title="编辑">✏️</button>
                <button class="btn btn-secondary btn-icon" onclick="deleteVehicle(${v.id})" title="删除">🗑️</button>
            </div>
        </div>
    `).join("")}</div>`;
}

function resetVehicleForm() {
    document.getElementById("vEditId").value = "";
    document.getElementById("vName").value = "";
    document.getElementById("vPlate").value = "";
    document.getElementById("vehicleFormTitle").textContent = "添加车辆";
}

function editVehicle(id) {
    const v = vehicles.find(x => x.id === id);
    if (!v) return;
    document.getElementById("vEditId").value = id;
    document.getElementById("vName").value = v.name;
    document.getElementById("vPlate").value = v.plate_number || "";
    document.getElementById("vehicleFormTitle").textContent = "编辑车辆";
}

async function saveVehicle() {
    const editId = document.getElementById("vEditId").value;
    const name = document.getElementById("vName").value.trim();
    if (!name) { alert("请输入车辆名称"); return; }
    const plate = document.getElementById("vPlate").value.trim();
    const payload = { name, plate_number: plate };

    try {
        const url = editId ? `${API}/vehicles/${editId}` : `${API}/vehicles`;
        const method = editId ? "PUT" : "POST";
        const res = await fetch(url, {
            method, headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
        // Refresh
        const r = await fetch(`${API}/vehicles`);
        vehicles = await r.json();
        renderVehicleList();
        renderVehicleSelect();
        resetVehicleForm();
    } catch (e) {
        alert("保存失败: " + e.message);
    }
}

async function deleteVehicle(id) {
    if (!confirm("确定要删除这辆车吗？")) return;
    try {
        const res = await fetch(`${API}/vehicles/${id}`, { method: "DELETE" });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
        const r = await fetch(`${API}/vehicles`);
        vehicles = await r.json();
        renderVehicleList();
        renderVehicleSelect();
    } catch (e) {
        alert("删除失败: " + e.message);
    }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------
async function loadData() {
    if (!currentVehicleId) return;
    await Promise.all([loadRecords(), loadStats()]);
}

async function loadRecords() {
    try {
        const res = await fetch(`${API}/records?${getVehicleParam()}&page=${currentPage}&page_size=${pageSize}`);
        const data = await res.json();
        records = data.items;
        totalRecords = data.total;
        totalPages = data.total_pages;
        currentPage = data.page;
        renderTable();
        renderPagination();
    } catch (e) {
        console.error("加载记录失败", e);
    }
}

async function loadStats() {
    try {
        const res = await fetch(`${API}/stats?${getVehicleParam()}`);
        const s = await res.json();
        document.getElementById("statMileage").textContent = s.total_mileage > 0 ? formatNum(s.total_mileage) + " km" : "-- km";
        document.getElementById("statCost").textContent = s.total_cost > 0 ? formatNum(s.total_cost) + " 元" : "-- 元";
        document.getElementById("statVolume").textContent = s.total_volume > 0 ? formatNum(s.total_volume) + " L" : "-- L";
        document.getElementById("statConsumption").textContent = s.avg_consumption ? s.avg_consumption + " L/100km" : "-- L/100km";
        document.getElementById("statDaily").textContent = s.daily_mileage ? s.daily_mileage + " km/天" : "-- km/天";
    } catch (e) {
        console.error("加载统计失败", e);
    }
}

// ---------------------------------------------------------------------------
// Render table
// ---------------------------------------------------------------------------
function renderTable() {
    const tbody = document.getElementById("recordsBody");
    const empty = document.getElementById("emptyState");
    if (records.length === 0 && totalRecords === 0) { tbody.innerHTML = ""; empty.style.display = "block"; return; }
    empty.style.display = "none";
    tbody.innerHTML = records.map(r => `
        <tr>
            <td>${r.date}</td>
            <td>${formatNum(r.mileage)}</td>
            <td>${r.volume != null ? r.volume : '<span class="text-muted">-</span>'}</td>
            <td>${r.unit_price != null ? r.unit_price : '<span class="text-muted">-</span>'}</td>
            <td>${r.total_price != null ? r.total_price : '<span class="text-muted">-</span>'}</td>
            <td>${r.distance != null ? '<span class="highlight">' + formatNum(r.distance) + '</span>' : '<span class="text-muted">-</span>'}</td>
            <td>${r.fuel_consumption != null ? '<span class="highlight">' + r.fuel_consumption + '</span>' : '<span class="text-muted">-</span>'}</td>
            <td>${r.cost_per_km != null ? '<span class="highlight">' + r.cost_per_km + '</span>' : '<span class="text-muted">-</span>'}</td>
            <td>
                <div class="td-actions">
                    <button class="btn btn-secondary btn-icon" onclick="openEditModal(${r.id})" title="编辑">✏️</button>
                    <button class="btn btn-secondary btn-icon" onclick="openDeleteModal(${r.id})" title="删除">🗑️</button>
                </div>
            </td>
        </tr>
    `).join("");
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
function renderPagination() {
    const pag = document.getElementById("pagination");
    if (totalRecords === 0) { pag.style.display = "none"; return; }
    pag.style.display = "flex";
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalRecords);
    document.getElementById("pageInfo").textContent = `第 ${start}-${end} 条，共 ${totalRecords} 条`;
    document.getElementById("btnFirst").disabled = currentPage <= 1;
    document.getElementById("btnPrev").disabled = currentPage <= 1;
    document.getElementById("btnNext").disabled = currentPage >= totalPages;
    document.getElementById("btnLast").disabled = currentPage >= totalPages;
    const nums = document.getElementById("pageNumbers");
    nums.innerHTML = "";
    for (const p of getPageRange(currentPage, totalPages, 5)) {
        if (p === "...") {
            const span = document.createElement("span");
            span.className = "btn-page"; span.style.border = "none"; span.style.cursor = "default"; span.textContent = "...";
            nums.appendChild(span);
        } else {
            const btn = document.createElement("button");
            btn.className = "btn btn-page" + (p === currentPage ? " active" : "");
            btn.textContent = p; btn.onclick = () => goToPage(p);
            nums.appendChild(btn);
        }
    }
}

function getPageRange(current, total, maxVisible) {
    if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = []; const half = Math.floor(maxVisible / 2);
    let start = Math.max(2, current - half); let end = Math.min(total - 1, current + half);
    if (current - half < 2) end = Math.min(total - 1, maxVisible - 1);
    if (current + half > total - 1) start = Math.max(2, total - maxVisible + 2);
    pages.push(1); if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push("..."); if (total > 1) pages.push(total);
    return pages;
}

function goToPage(page) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    currentPage = page; loadRecords();
}

function onPageSizeChange() {
    pageSize = parseInt(document.getElementById("pageSizeSelect").value);
    localStorage.setItem("fuel_page_size", pageSize);
    currentPage = 1; loadRecords();
}

// ---------------------------------------------------------------------------
// Smart calculation
// ---------------------------------------------------------------------------
function onFuelInput(field) {
    if (lastEdited.length === 0 || lastEdited[lastEdited.length - 1] !== field) {
        lastEdited.push(field); if (lastEdited.length > 2) lastEdited.shift();
    }
    const v = parseFloat(document.getElementById("fVolume").value) || 0;
    const u = parseFloat(document.getElementById("fUnitPrice").value) || 0;
    const t = parseFloat(document.getElementById("fTotalPrice").value) || 0;
    document.getElementById("fVolume").classList.remove("auto-calculated");
    document.getElementById("fUnitPrice").classList.remove("auto-calculated");
    document.getElementById("fTotalPrice").classList.remove("auto-calculated");
    if (lastEdited.length < 2) return;
    const edited = new Set(lastEdited);
    if (edited.has("volume") && edited.has("unit_price") && v > 0 && u > 0) {
        document.getElementById("fTotalPrice").value = (v * u).toFixed(2);
        document.getElementById("fTotalPrice").classList.add("auto-calculated");
    } else if (edited.has("volume") && edited.has("total_price") && v > 0 && t > 0) {
        document.getElementById("fUnitPrice").value = (t / v).toFixed(2);
        document.getElementById("fUnitPrice").classList.add("auto-calculated");
    } else if (edited.has("unit_price") && edited.has("total_price") && u > 0 && t > 0) {
        document.getElementById("fVolume").value = (t / u).toFixed(2);
        document.getElementById("fVolume").classList.add("auto-calculated");
    }
}

// ---------------------------------------------------------------------------
// Record modal
// ---------------------------------------------------------------------------
function openAddModal() {
    if (!currentVehicleId) { alert("请先添加一辆车"); return; }
    document.getElementById("editId").value = "";
    document.getElementById("modalTitle").textContent = "添加加油记录";
    document.getElementById("recordForm").reset();
    document.getElementById("fDate").value = todayStr();
    lastEdited = [];
    ["fVolume", "fUnitPrice", "fTotalPrice"].forEach(id => document.getElementById(id).classList.remove("auto-calculated"));
    document.getElementById("modalOverlay").classList.add("active");
}

function openEditModal(id) {
    const rec = records.find(r => r.id === id); if (!rec) return;
    document.getElementById("editId").value = id;
    document.getElementById("modalTitle").textContent = "编辑加油记录";
    document.getElementById("fDate").value = rec.date;
    document.getElementById("fMileage").value = rec.mileage;
    document.getElementById("fVolume").value = rec.volume ?? "";
    document.getElementById("fUnitPrice").value = rec.unit_price ?? "";
    document.getElementById("fTotalPrice").value = rec.total_price ?? "";
    document.getElementById("fNote").value = rec.note ?? "";
    lastEdited = [];
    ["fVolume", "fUnitPrice", "fTotalPrice"].forEach(id => document.getElementById(id).classList.remove("auto-calculated"));
    document.getElementById("modalOverlay").classList.add("active");
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById("modalOverlay").classList.remove("active");
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
function openDeleteModal(id) { deleteTargetId = id; document.getElementById("deleteOverlay").classList.add("active"); }
function closeDeleteModal(e) { if (e && e.target !== e.currentTarget) return; document.getElementById("deleteOverlay").classList.remove("active"); deleteTargetId = null; }
async function confirmDelete() {
    if (!deleteTargetId) return;
    try { await fetch(`${API}/records/${deleteTargetId}`, { method: "DELETE" }); closeDeleteModal(); await loadData(); }
    catch (e) { alert("删除失败: " + e.message); }
}

// ---------------------------------------------------------------------------
// Form submit
// ---------------------------------------------------------------------------
async function handleSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById("editId").value;
    const payload = {
        vehicle_id: currentVehicleId,
        date: document.getElementById("fDate").value,
        mileage: parseFloat(document.getElementById("fMileage").value),
        volume: parseFloat(document.getElementById("fVolume").value) || null,
        unit_price: parseFloat(document.getElementById("fUnitPrice").value) || null,
        total_price: parseFloat(document.getElementById("fTotalPrice").value) || null,
        note: document.getElementById("fNote").value || "",
    };
    try {
        const url = editId ? `${API}/records/${editId}` : `${API}/records`;
        const method = editId ? "PUT" : "POST";
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "保存失败"); }
        closeModal();
        if (!editId) currentPage = 1;
        await loadData();
    } catch (e) { alert("保存失败: " + e.message); }
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------
function exportCSV() {
    if (!currentVehicleId) return;
    window.open(`${API}/export/csv?${getVehicleParam()}`, "_blank");
}

function openImportModal() {
    if (!currentVehicleId) { alert("请先添加一辆车"); return; }
    clearFile();
    document.getElementById("importResult").style.display = "none";
    document.getElementById("importResult").innerHTML = "";
    document.getElementById("importOverlay").classList.add("active");
}
function closeImportModal(e) { if (e && e.target !== e.currentTarget) return; document.getElementById("importOverlay").classList.remove("active"); }

function onFileSelected() {
    const input = document.getElementById("importFile");
    if (input.files.length > 0) {
        document.getElementById("filePrompt").style.display = "none";
        document.getElementById("fileSelected").style.display = "flex";
        document.getElementById("fileName").textContent = input.files[0].name;
        document.getElementById("importBtn").disabled = false;
    }
}
function clearFile() {
    document.getElementById("importFile").value = "";
    document.getElementById("filePrompt").style.display = "flex";
    document.getElementById("fileSelected").style.display = "none";
    document.getElementById("importBtn").disabled = true;
}

document.addEventListener("DOMContentLoaded", () => {
    const area = document.getElementById("fileUploadArea"); if (!area) return;
    area.addEventListener("dragover", (e) => { e.preventDefault(); area.classList.add("dragover"); });
    area.addEventListener("dragleave", () => { area.classList.remove("dragover"); });
    area.addEventListener("drop", (e) => {
        e.preventDefault(); area.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.match(/\.xlsx?$/i)) {
            document.getElementById("importFile").files = files; onFileSelected();
        }
    });
});

async function doImport() {
    const input = document.getElementById("importFile"); if (!input.files.length) return;
    const btn = document.getElementById("importBtn");
    btn.disabled = true; btn.textContent = "导入中...";
    const formData = new FormData();
    formData.append("file", input.files[0]);
    formData.append("vehicle_id", currentVehicleId);
    const resultDiv = document.getElementById("importResult");
    try {
        const res = await fetch(`${API}/import/xlsx`, { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "导入失败");
        let html = "";
        if (data.imported > 0) {
            html += `<div class="import-result success">✅ 成功导入 <strong>${data.imported}</strong> 条记录`;
            if (data.skipped > 0) html += `，跳过 ${data.skipped} 条重复记录`;
            html += `</div>`;
        } else {
            html += `<div class="import-result success">没有新记录需要导入`;
            if (data.skipped > 0) html += `（${data.skipped} 条已存在）`;
            html += `</div>`;
        }
        if (data.errors && data.errors.length > 0) {
            html += `<div class="import-result error" style="margin-top: 8px;">⚠️ ${data.errors.length} 个错误:<div class="error-list">${data.errors.join("<br>")}</div></div>`;
        }
        resultDiv.innerHTML = html; resultDiv.style.display = "block";
        if (data.imported > 0) { currentPage = 1; await loadData(); }
    } catch (e) {
        resultDiv.innerHTML = `<div class="import-result error">❌ ${e.message}</div>`; resultDiv.style.display = "block";
    } finally { btn.disabled = false; btn.textContent = "开始导入"; }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function formatNum(n) {
    if (n == null) return "-";
    return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
