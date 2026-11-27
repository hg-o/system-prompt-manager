(function () {
  "use strict";

  // 아이디는 @webtoon.com 회사 이메일만 허용한다
  const EMAIL_RE = /^[^\s@]+@webtoon\.com$/;
  const ROLES = ["Editor", "Viewer"];

  const $ = (sel) => document.querySelector(sel);

  // 승인 대기·반려 안내창 문구
  const CONTACT = "문의 담당자 : 오하경 (hagyoung.o@webtoon.com)";
  const STATUS_MESSAGES = {
    pending: "승인 대기 중입니다.",
    rejected: "승인이 반려되었습니다.",
  };
  const SESSION_KEY = "spm_user"; // 로그인 유지용 localStorage 키

  // ---------- API (프로토타입 목업) ----------
  // 실제 서버 없이 응답을 흉내 낸다. 백엔드를 붙일 때 이 함수만 바꾸면 된다.
  //
  // 기대하는 응답 형식
  //   login  요청 { id, password }             → { ok: true, user: { id, name, role } }        activate = TRUE
  //                                              { ok: false, status: "pending" }             activate = 빈 칸 (승인 대기)
  //                                              { ok: false, status: "rejected" }            activate = FALSE (반려)
  //                                              { ok: false, message }                       그 밖의 실패 (비밀번호 불일치 등)
  //   signup 요청 { name, id, password, role } → { ok: true }
  //                                              { ok: false, field?, message }   (field 가 있으면 해당 입력칸 아래에 표시)
  //
  // 프로토타입 시연용: 아이디에 "pending" 이 들어가면 승인 대기, "rejected" 가 들어가면 반려 안내창이 뜬다.
  // "viewer" 가 들어가면 Viewer 권한(읽기 전용)으로 로그인된다. 그 밖에는 어떤 아이디·비밀번호로도 Editor 로 로그인된다.
  const MOCK_DELAY_MS = 600;

  function callApi(action, payload) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (action === "login") {
          const id = payload.id || "guest@webtoon.com";
          if (id.includes("pending")) return resolve({ ok: false, status: "pending" });
          if (id.includes("rejected")) return resolve({ ok: false, status: "rejected" });
          const role = id.includes("viewer") ? "Viewer" : "Editor";
          resolve({ ok: true, user: { id, name: id.split("@")[0], role } });
        } else {
          resolve({ ok: true });
        }
      }, MOCK_DELAY_MS);
    });
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

    // 프로토타입: 어떤 아이디·비밀번호(빈 값 포함)로도 로그인된다.

    setLoading(loginBtn, true);
    try {
      const data = await callApi("login", { id, password });
      if (!data.ok) {
        if (STATUS_MESSAGES[data.status]) showStatus(data.status);
        else showFormError(loginError, data.message || "로그인에 실패했습니다.");
        return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      showHome(data.user);
    } catch (err) {
      showFormError(loginError, err.message);
    } finally {
      setLoading(loginBtn, false);
    }
  });

  // ---------- 승인 대기 / 반려 안내 ----------
  const statusModal = $("#status-modal");

  function showStatus(status) {
    statusModal.querySelectorAll("[data-status]").forEach((el) => (el.hidden = el.dataset.status !== status));
    $("#status-message").textContent = STATUS_MESSAGES[status];
    $("#status-contact").textContent = CONTACT;
    openModal(statusModal);
  }

  // ---------- 로그인 후 화면 ----------
  // 로그인 정보는 localStorage 에 두어 새로고침하거나 창을 다시 열어도 유지한다. 로그아웃하면 지운다.
  const loginView = $("#login-view");
  const homeView = $("#home-view");
  let currentUser = null;

  function showHome(user) {
    currentUser = user;
    $("#user-name").textContent = user.name;
    $("#user-role").textContent = user.role;
    loginView.hidden = true;
    homeView.hidden = false;
    document.body.classList.add("is-app");
    route();
  }

  $("#logout").addEventListener("click", () => {
    currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    loginForm.reset();
    homeView.hidden = true;
    loginView.hidden = false;
    document.body.classList.remove("is-app");
    history.replaceState(null, "", location.pathname + location.search);
  });

  // ---------- 화면 이동 (해시 라우팅) ----------
  // #/home, #/llm, #/image/feature, #/image/byk, #/image/gen-prompt
  const SECTIONS = { home: "Home", llm: "LLM", image: "Image" };
  const SEP_ICON =
    '<svg class="breadcrumb__sep" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>';

  function route() {
    if (!currentUser) return;
    const [rawSection, rawTab] = location.hash.replace(/^#\/?/, "").split("/");
    const section = SECTIONS[rawSection] ? rawSection : "home";
    const tabs = window.ImagePage.TABS;
    const tab = tabs.find((t) => t.key === rawTab) ? rawTab : tabs[0].key;
    const navKey = section === "image" ? `image/${tab}` : section;

    document.querySelectorAll("[data-page]").forEach((p) => (p.hidden = p.dataset.page !== section));
    document.querySelectorAll("[data-nav]").forEach((el) => {
      const active = el.dataset.nav === navKey;
      el.classList.toggle("is-active", active);
      el.classList.toggle("is-open", el.dataset.nav === section && !active);
      if (active) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });

    const crumbs = ["System Prompt Manager", SECTIONS[section]];
    if (section === "image") crumbs.push(tabs.find((t) => t.key === tab).label);
    $("#breadcrumb").innerHTML = crumbs
      .map((c, i) => `<span class="${i === 0 ? "breadcrumb__root" : i === crumbs.length - 1 ? "breadcrumb__current" : "breadcrumb__mid"}">${c}</span>`)
      .join(SEP_ICON);

    if (section === "image") {
      window.ImagePage.mount($("#image-page"), { tab, user: currentUser, canEdit: currentUser.role === "Editor", openModal });
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", route);

  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (saved && saved.name) showHome(saved);
  } catch (e) {
    localStorage.removeItem(SESSION_KEY);
  }

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
    else if (v.name.length > 100) errors.name = "이름은 100자 이내로 입력해 주세요.";

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
