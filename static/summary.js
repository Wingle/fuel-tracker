/* ============================================================
   统计汇总页 - 前端逻辑 (含认证)
   ============================================================ */

const API = "/api";
let currentMode = "yearly";
let vehicles = [];
let currentVehicleId = null;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function getToken() { return localStorage.getItem("fuel_token") || ""; }
function authHeaders(extra = {}) { return { "Authorization": `Bearer ${getToken()}`, ...extra }; }
async function apiFetch(url, opts = {}) {
    opts.headers = { ...authHeaders(), ...(opts.headers || {}) };
    const res = await fetch(url, opts);
    if (res.status === 401) {
        localStorage.removeItem("fuel_token");
        localStorage.removeItem("fuel_username");
        window.location.href = "/login.html";
        throw new Error("登录已过期");
    }
    return res;
}
function logout() {
    apiFetch(`${API}/auth/logout`, { method: "POST" }).catch(() => {});
    localStorage.removeItem("fuel_token");
    localStorage.removeItem("fuel_username");
    window.location.href = "/login.html";
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    if (!getToken()) { window.location.href = "/login.html"; return; }
    try {
        const res = await apiFetch(`${API}/auth/me`);
        if (!res.ok) return;
    } catch { return; }
    await loadVehicles();
});

// ---------------------------------------------------------------------------
// Vehicle
// ---------------------------------------------------------------------------
async function loadVehicles() {
    try {
        const res = await apiFetch(`${API}/vehicles`);
        vehicles = await res.json();
        const sel = document.getElementById("vehicleSelect");
        sel.innerHTML = vehicles.map(v => {
            const label = v.plate_number ? `${v.name} (${v.plate_number})` : v.name;
            return `<option value="${v.id}">${label}</option>`;
        }).join("");
        if (vehicles.length > 0) {
            const savedId = localStorage.getItem("fuel_vehicle_id");
            const match = vehicles.find(v => v.id == savedId);
            currentVehicleId = match ? match.id : vehicles[0].id;
            sel.value = currentVehicleId;
            await loadPageData();
        }
    } catch (e) { console.error("加载车辆失败", e); }
}

function onVehicleChange() {
    currentVehicleId = parseInt(document.getElementById("vehicleSelect").value);
    localStorage.setItem("fuel_vehicle_id", currentVehicleId);
    loadPageData();
}

function getVP() { return `vehicle_id=${currentVehicleId}`; }

async function loadPageData() {
    if (!currentVehicleId) return;
    await Promise.all([loadStats(), loadSummary()]);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
async function loadStats() {
    try {
        const res = await apiFetch(`${API}/stats?${getVP()}`);
        const s = await res.json();
        document.getElementById("statMileage").textContent = s.total_mileage > 0 ? formatNum(s.total_mileage) + " km" : "-- km";
        document.getElementById("statCost").textContent = s.total_cost > 0 ? formatNum(s.total_cost) + " 元" : "-- 元";
        document.getElementById("statVolume").textContent = s.total_volume > 0 ? formatNum(s.total_volume) + " L" : "-- L";
        document.getElementById("statConsumption").textContent = s.avg_consumption ? s.avg_consumption + " L/100km" : "-- L/100km";
        document.getElementById("statDaily").textContent = s.daily_mileage ? s.daily_mileage + " km/天" : "-- km/天";
    } catch (e) { console.error("加载统计失败", e); }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
async function loadSummary() {
    try {
        const res = await apiFetch(`${API}/stats/summary?${getVP()}&mode=${currentMode}`);
        const data = await res.json();
        renderSummary(data);
    } catch (e) { console.error("加载汇总失败", e); }
}

function renderSummary(data) {
    const tbody = document.getElementById("summaryBody");
    const empty = document.getElementById("summaryEmpty");
    document.getElementById("colPeriod").textContent = data.mode === "yearly" ? "年度" : "月份";
    if (!data.items || data.items.length === 0) { tbody.innerHTML = ""; empty.style.display = "block"; return; }
    empty.style.display = "none";
    tbody.innerHTML = data.items.map(item => {
        const label = data.mode === "yearly" ? item.period + " 年" : item.period;
        return `<tr><td><strong>${label}</strong></td><td>${item.record_count}</td>
            <td>${formatNum(item.mileage)}</td><td>${formatNum(item.volume)}</td><td>${formatNum(item.cost)}</td>
            <td>${item.avg_consumption != null ? '<span class="highlight">' + item.avg_consumption + '</span>' : '<span class="text-muted">-</span>'}</td>
            <td>${item.daily_mileage != null ? '<span class="highlight">' + item.daily_mileage + '</span>' : '<span class="text-muted">-</span>'}</td></tr>`;
    }).join("");
}

function switchMode(mode) {
    currentMode = mode;
    document.getElementById("tabYearly").classList.toggle("active", mode === "yearly");
    document.getElementById("tabMonthly").classList.toggle("active", mode === "monthly");
    loadSummary();
}

function formatNum(n) { if (n == null) return "-"; return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 1 }); }
