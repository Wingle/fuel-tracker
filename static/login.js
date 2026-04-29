/* ============================================================
   登录/注册页 - 前端逻辑
   ============================================================ */

const API = "/api";
let forgotUsername = ""; // 记住忘记密码流程中的用户名

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
    document.getElementById("forgotStep1").style.display = "none";
    document.getElementById("forgotStep2").style.display = "none";
    document.getElementById("authTabs").style.display = "";
    // 清除错误
    document.querySelectorAll(".auth-error, .auth-success").forEach(el => el.classList.remove("show"));
}

function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add("show");
}

function showSuccess(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add("show");
}

// ---------------------------------------------------------------------------
// 登录
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 注册
// ---------------------------------------------------------------------------
async function handleRegister(e) {
    e.preventDefault();
    const pwd = document.getElementById("regPassword").value;
    const pwd2 = document.getElementById("regPassword2").value;
    if (pwd !== pwd2) {
        showError("registerError", "两次输入的密码不一致");
        return;
    }
    const question = document.getElementById("regSecurityQuestion").value.trim();
    const answer = document.getElementById("regSecurityAnswer").value.trim();
    if (!question) {
        showError("registerError", "请输入安全提示问题");
        return;
    }
    if (!answer) {
        showError("registerError", "请输入安全提示问题的答案");
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
                security_question: question,
                security_answer: answer,
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

// ---------------------------------------------------------------------------
// 忘记密码
// ---------------------------------------------------------------------------
function showForgotPassword() {
    document.getElementById("authTabs").style.display = "none";
    document.getElementById("loginForm").style.display = "none";
    document.getElementById("registerForm").style.display = "none";
    document.getElementById("forgotStep1").style.display = "";
    document.getElementById("forgotStep2").style.display = "none";
    document.querySelectorAll(".auth-error, .auth-success").forEach(el => el.classList.remove("show"));
    document.getElementById("forgotUsername").value = "";
}

async function handleForgotStep1() {
    const username = document.getElementById("forgotUsername").value.trim();
    if (!username) {
        showError("forgotError1", "请输入用户名");
        return;
    }
    const btn = document.getElementById("forgotStep1Btn");
    btn.disabled = true;
    btn.textContent = "查询中...";
    document.getElementById("forgotError1").classList.remove("show");

    try {
        const res = await fetch(`${API}/auth/forgot-password/question`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "查询失败");

        forgotUsername = username;
        document.getElementById("forgotQuestionDisplay").textContent = data.security_question;
        document.getElementById("forgotAnswer").value = "";
        document.getElementById("forgotNewPassword").value = "";
        document.getElementById("forgotNewPassword2").value = "";
        document.getElementById("forgotStep1").style.display = "none";
        document.getElementById("forgotStep2").style.display = "";
        document.querySelectorAll(".auth-error, .auth-success").forEach(el => el.classList.remove("show"));
    } catch (err) {
        showError("forgotError1", err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "下一步";
    }
}

async function handleForgotStep2() {
    const answer = document.getElementById("forgotAnswer").value.trim();
    const newPwd = document.getElementById("forgotNewPassword").value;
    const newPwd2 = document.getElementById("forgotNewPassword2").value;
    document.getElementById("forgotError2").classList.remove("show");
    document.getElementById("forgotSuccess").classList.remove("show");

    if (!answer) {
        showError("forgotError2", "请输入答案");
        return;
    }
    if (newPwd.length < 6) {
        showError("forgotError2", "新密码长度至少 6 个字符");
        return;
    }
    if (newPwd !== newPwd2) {
        showError("forgotError2", "两次输入的新密码不一致");
        return;
    }

    const btn = document.getElementById("forgotStep2Btn");
    btn.disabled = true;
    btn.textContent = "重置中...";

    try {
        const res = await fetch(`${API}/auth/forgot-password/reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: forgotUsername,
                security_answer: answer,
                new_password: newPwd,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "重置失败");

        showSuccess("forgotSuccess", "密码重置成功！3 秒后返回登录...");
        btn.disabled = true;
        setTimeout(() => {
            switchTab("login");
        }, 3000);
    } catch (err) {
        showError("forgotError2", err.message);
        btn.disabled = false;
    } finally {
        btn.textContent = "重置密码";
    }
}
