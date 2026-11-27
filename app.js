(function () {
  "use strict";

  const { API_URL, HOME_URL } = window.APP_CONFIG || {};
  // 아이디는 @webtoon.com 회사 이메일만 허용한다
  const EMAIL_RE = /^[^\s@]+@webtoon\.com$/;
  const ROLES = ["Editor", "Viewer"];

  const $ = (sel) => document.querySelector(sel);

  // ---------- API ----------
  // Content-Type 을 text/plain 으로 보내면 CORS preflight 없이 Apps Script 로 POST 할 수 있다.
  async function callApi(action, payload) {
    if (!API_URL || API_URL.startsWith("PASTE_")) {
      throw new Error("서버 주소가 설정되지 않았습니다. config.js 의 API_URL 을 확인하세요.");
    }
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch (e) {
      throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (!res.ok) throw new Error("요청 처리 중 오류가 발생했습니다. (" + res.status + ")");
    return res.json();
  }

  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.classList.toggle("is-loading", loading);
  }

  function showFormError(el, msg) {
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  // ---------- 모달 ----------
  let lastFocus = null;

  function openModal(modal) {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    const first = modal.querySelector("input, select, [data-close].btn");
    if (first) first.focus();
  }

  function closeModal(modal) {
    modal.hidden = true;
    if (!document.querySelector(".modal:not([hidden])")) {
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    }
  }

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.querySelectorAll("[data-close]").forEach((el) =>
      el.addEventListener("click", () => {
        if (modal.id === "signup-modal") resetSignup();
        closeModal(modal);
      })
    );
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll(".modal:not([hidden])")].pop();
    if (!open) return;
    if (open.id === "signup-modal") resetSignup();
    closeModal(open);
  });

  // ---------- 로그인 ----------
  const loginForm = $("#login-form");
  const loginError = $("#login-error");
  const loginBtn = $("#login-submit");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(loginError, "");

    const id = loginForm.elements.id.value.trim().toLowerCase();
    const password = loginForm.elements.password.value;

    if (!id || !password) {
      showFormError(loginError, "아이디와 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(loginBtn, true);
    try {
      const data = await callApi("login", { id, password });
      if (!data.ok) {
        showFormError(loginError, data.message || "로그인에 실패했습니다.");
        return;
      }
      sessionStorage.setItem("spm_user", JSON.stringify(data.user));
      window.location.href = HOME_URL || "home.html";
    } catch (err) {
      showFormError(loginError, err.message);
    } finally {
      setLoading(loginBtn, false);
    }
  });

  // ---------- 회원가입 ----------
  const signupModal = $("#signup-modal");
  const doneModal = $("#done-modal");
  const signupForm = $("#signup-form");
  const signupError = $("#signup-error");
  const signupBtn = $("#signup-submit");

  $("#open-signup").addEventListener("click", () => openModal(signupModal));

  function setFieldError(name, msg) {
    const input = signupForm.elements[name];
    const err = signupForm.querySelector(`.field__error[data-for="${name}"]`);
    input.classList.toggle("is-invalid", !!msg);
    err.textContent = msg || "";
  }

  function validateSignup(v) {
    const errors = {};
    if (!v.name) errors.name = "이름을 입력해 주세요.";
    else if (v.name.length > 16) errors.name = "이름은 16자 이내로 입력해 주세요.";

    if (!v.id) errors.id = "회사 이메일 주소를 입력해 주세요.";
    else if (!EMAIL_RE.test(v.id)) errors.id = "@webtoon.com 이메일 주소만 사용할 수 있습니다.";

    if (!v.password) errors.password = "비밀번호를 입력해 주세요.";
    else if (
      v.password.length < 8 ||
      !/[A-Za-z]/.test(v.password) ||
      !/[0-9]/.test(v.password) ||
      !/[^A-Za-z0-9]/.test(v.password)
    ) errors.password = "영문, 숫자, 기호를 모두 포함해 8자 이상 입력해 주세요.";

    if (!ROLES.includes(v.role)) errors.role = "권한을 선택해 주세요.";
    return errors;
  }

  function readSignup() {
    return {
      name: signupForm.elements.name.value.trim(),
      id: signupForm.elements.id.value.trim().toLowerCase(),
      password: signupForm.elements.password.value,
      role: signupForm.elements.role.value,
    };
  }

  function resetSignup() {
    signupForm.reset();
    ["name", "id", "password", "role"].forEach((n) => setFieldError(n, ""));
    showFormError(signupError, "");
  }

  // 입력 중에는 해당 필드 에러만 지운다
  ["name", "id", "password", "role"].forEach((n) => {
    const evt = n === "role" ? "change" : "input";
    signupForm.elements[n].addEventListener(evt, () => setFieldError(n, ""));
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(signupError, "");

    const values = readSignup();
    const errors = validateSignup(values);
    ["name", "id", "password", "role"].forEach((n) => setFieldError(n, errors[n]));
    const firstInvalid = ["name", "id", "password", "role"].find((n) => errors[n]);
    if (firstInvalid) {
      signupForm.elements[firstInvalid].focus();
      return;
    }

    setLoading(signupBtn, true);
    try {
      const data = await callApi("signup", values);
      if (!data.ok) {
        if (data.field) setFieldError(data.field, data.message);
        else showFormError(signupError, data.message || "신청에 실패했습니다.");
        return;
      }
      resetSignup();
      signupModal.hidden = true;
      openModal(doneModal);
    } catch (err) {
      showFormError(signupError, err.message);
    } finally {
      setLoading(signupBtn, false);
    }
  });
})();
