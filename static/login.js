/* ============================================================
   登录/注册页 - 前端逻辑
   ============================================================ */

const API = "/api";

// 如果已登录，直接跳转主页
document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("fuel_token");
    if (token) {
        // 验证 token 是否有效
        fetch(`${API}/auth/me`, {
            headers: { "Authorization": `Bearer ${token}` },
        }).then(res => {
            if (res.ok) window.location.href = "/";
        });
    }
});

function switchTab(tab) {
    document.getElementById("tabLogin").classList.toggle("active", tab === "login");
    document.getElementById("tabRegister").classList.toggle("active", tab === "register");
    document.getElementById("loginForm").style.display = tab === "login" ? "" : "none";
    document.getElementById("registerForm").style.display = tab === "register" ? "" : "none";
    // 清除错误
    document.getElementById("loginError").classList.remove("show");
    document.getElementById("registerError").classList.remove("show");
}

function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add("show");
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById("loginBtn");
    btn.disabled = true;
    btn.textContent = "登录中...";
    document.getElementById("loginError").classList.remove("show");

    try {
        const res = await fetch(`${API}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: document.getElementById("loginUsername").value.trim(),
                password: document.getElementById("loginPassword").value,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "登录失败");
        localStorage.setItem("fuel_token", data.token);
        localStorage.setItem("fuel_username", data.username);
        window.location.href = "/";
    } catch (err) {
        showError("loginError", err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "登 录";
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const pwd = document.getElementById("regPassword").value;
    const pwd2 = document.getElementById("regPassword2").value;
    if (pwd !== pwd2) {
        showError("registerError", "两次输入的密码不一致");
        return;
    }

    const btn = document.getElementById("regBtn");
    btn.disabled = true;
    btn.textContent = "注册中...";
    document.getElementById("registerError").classList.remove("show");

    try {
        const res = await fetch(`${API}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: document.getElementById("regUsername").value.trim(),
                password: pwd,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "注册失败");
        localStorage.setItem("fuel_token", data.token);
        localStorage.setItem("fuel_username", data.username);
        window.location.href = "/";
    } catch (err) {
        showError("registerError", err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "注 册";
    }
}
