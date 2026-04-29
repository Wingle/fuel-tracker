/* ============================================================
   统计汇总页 - 前端逻辑
   ============================================================ */

const API = "/api";
let currentMode = "yearly";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    loadStats();
    loadSummary();
});

// ---------------------------------------------------------------------------
// Global stats (top cards)
// ---------------------------------------------------------------------------
async function loadStats() {
    try {
        const res = await fetch(`${API}/stats`);
        const s = await res.json();
        document.getElementById("statMileage").textContent =
            s.total_mileage > 0 ? formatNum(s.total_mileage) + " km" : "-- km";
        document.getElementById("statCost").textContent =
            s.total_cost > 0 ? formatNum(s.total_cost) + " 元" : "-- 元";
        document.getElementById("statVolume").textContent =
            s.total_volume > 0 ? formatNum(s.total_volume) + " L" : "-- L";
        document.getElementById("statConsumption").textContent =
            s.avg_consumption ? s.avg_consumption + " L/100km" : "-- L/100km";
        document.getElementById("statDaily").textContent =
            s.daily_mileage ? s.daily_mileage + " km/天" : "-- km/天";
    } catch (e) {
        console.error("加载统计失败", e);
    }
}

// ---------------------------------------------------------------------------
// Summary table
// ---------------------------------------------------------------------------
async function loadSummary() {
    try {
        const res = await fetch(`${API}/stats/summary?mode=${currentMode}`);
        const data = await res.json();
        renderSummary(data);
    } catch (e) {
        console.error("加载汇总失败", e);
    }
}

function renderSummary(data) {
    const tbody = document.getElementById("summaryBody");
    const empty = document.getElementById("summaryEmpty");

    document.getElementById("colPeriod").textContent =
        data.mode === "yearly" ? "年度" : "月份";

    if (!data.items || data.items.length === 0) {
        tbody.innerHTML = "";
        empty.style.display = "block";
        return;
    }
    empty.style.display = "none";

    tbody.innerHTML = data.items.map(item => {
        const label = data.mode === "yearly" ? item.period + " 年" : item.period;
        return `
        <tr>
            <td><strong>${label}</strong></td>
            <td>${item.record_count}</td>
            <td>${formatNum(item.mileage)}</td>
            <td>${formatNum(item.volume)}</td>
            <td>${formatNum(item.cost)}</td>
            <td>${item.avg_consumption != null ? '<span class="highlight">' + item.avg_consumption + '</span>' : '<span class="text-muted">-</span>'}</td>
            <td>${item.daily_mileage != null ? '<span class="highlight">' + item.daily_mileage + '</span>' : '<span class="text-muted">-</span>'}</td>
        </tr>`;
    }).join("");
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
function switchMode(mode) {
    currentMode = mode;
    document.getElementById("tabYearly").classList.toggle("active", mode === "yearly");
    document.getElementById("tabMonthly").classList.toggle("active", mode === "monthly");
    loadSummary();
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function formatNum(n) {
    if (n == null) return "-";
    return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}
