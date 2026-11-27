// Image 화면: Feature / BYK / Gen Prompt 탭별 프롬프트 버전과 실험 관리 (프로토타입)
//
// 데이터는 메모리에만 있다. 새로고침하면 샘플 데이터로 돌아간다.
// 실제 구현에서는 아래 state 구조를 API 로 읽고 쓰면 된다 (HANDOFF.md 참고).
(function () {
  "use strict";

  const TABS = [
    { key: "feature", label: "Feature" },
    { key: "byk", label: "BYK" },
    { key: "gen-prompt", label: "Gen Prompt" },
  ];
  const LETTERS = "ABCDEFGHIJ".split(""); // 한 버전당 실험 최대 10개 (A~J)
  const MAX_IMAGES = 10;
  const TITLE_MAX = 100;
  const EXP_PURPOSE_MAX = 500;
  const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;
  const IMAGE_TYPES = ["image/png", "image/jpeg"];

  const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- 샘플 데이터 ----------
  function sampleImage(hue, text) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="hsl(${hue},70%,78%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},70%,62%)"/>` +
      `</linearGradient></defs><rect width="480" height="480" fill="url(#g)"/>` +
      `<text x="50%" y="52%" text-anchor="middle" font-family="sans-serif" font-size="44" font-weight="700" fill="rgba(255,255,255,.9)">${text}</text></svg>`;
    return { name: `${text}.png`, url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) };
  }

  function sampleExperiment(tabLabel, vNo, letter, hue, imageCount) {
    const id = `V${vNo}-${letter}`;
    return {
      letter,
      title: `[샘플] ${tabLabel} ${id} 실험`,
      purpose: `[샘플] ${id}에서 확인하려는 개선 목적을 적습니다.`,
      format: `[샘플] ${id} 프롬프트 형식\n\n- 역할:\n- 입력:\n- 출력 형식:`,
      example: `[샘플] ${id} 프롬프트 예시 전문이 여기에 들어갑니다.`,
      images: Array.from({ length: imageCount }, (_, i) => sampleImage(hue + i * 18, `${id} #${i + 1}`)),
    };
  }

  function seed(tabLabel, hue) {
    return [
      {
        no: 1,
        createdAt: "2026-10-02",
        updatedAt: "2026-10-15",
        purpose: `[샘플] ${tabLabel} 첫 버전입니다.`,
        format: `[샘플] ${tabLabel} V1 프롬프트 형식\n\n- 역할:\n- 입력:\n- 출력 형식:`,
        example: `[샘플] ${tabLabel} V1 프롬프트 예시 전문이 여기에 들어갑니다.`,
        experiments: [sampleExperiment(tabLabel, 1, "A", hue, 3), sampleExperiment(tabLabel, 1, "B", hue + 60, 2)],
        finalLetter: "A",
      },
      {
        no: 2,
        createdAt: "2026-11-03",
        updatedAt: "2026-11-24",
        purpose: `[샘플] V1-A 결과를 바탕으로 출력 형식을 다듬은 버전입니다.`,
        format: `[샘플] ${tabLabel} V2 프롬프트 형식\n\n- 역할:\n- 입력:\n- 제약 조건:\n- 출력 형식:`,
        example: `[샘플] ${tabLabel} V2 프롬프트 예시 전문이 여기에 들어갑니다.`,
        experiments: [
          sampleExperiment(tabLabel, 2, "A", hue + 20, 4),
          sampleExperiment(tabLabel, 2, "B", hue + 90, 2),
          sampleExperiment(tabLabel, 2, "C", hue + 160, 1),
        ],
        finalLetter: "B",
      },
    ];
  }

  // tabKey → { versions: [...], selected: 버전 index | null(최신) }
  const state = Object.fromEntries(TABS.map((t, i) => [t.key, { versions: seed(t.label, 140 + i * 70), selected: null }]));

  // ---------- 화면 ----------
  let ctx = null; // { container, tab, canEdit, openModal, imgError }

  const tabState = () => state[ctx.tab];
  const currentIndex = () => tabState().selected ?? tabState().versions.length - 1;
  const currentVersion = () => tabState().versions[currentIndex()];
  const findExp = (letter) => currentVersion().experiments.find((e) => e.letter === letter);

  function mount(container, options) {
    const first = !ctx || ctx.container !== container;
    ctx = { imgError: null, ...ctx, ...options, container };
    if (first) bind(container);
    render();
  }

  function field({ label, key, value, exp, rows = 3, max, single }) {
    const attrs = [
      `data-field="${key}"`,
      exp ? `data-exp="${exp}"` : "",
      max ? `maxlength="${max}"` : "",
      ctx.canEdit ? "" : "readonly",
    ].join(" ");
    const counter = max && ctx.canEdit ? `<span class="counter">${String(value).length}/${max}</span>` : "";
    const control = single
      ? `<input class="input" type="text" ${attrs} value="${esc(value)}" />`
      : `<textarea class="input textarea" rows="${rows}" ${attrs}>${esc(value)}</textarea>`;
    return `<label class="vfield"><span class="vfield__label">${label}${counter}</span>${control}</label>`;
  }

  function experimentCard(v, e) {
    const isFinal = v.finalLetter === e.letter;
    const id = `V${v.no}-${e.letter}`;
    const thumbs = e.images
      .map(
        (img, i) => `
        <figure class="thumb">
          <button type="button" class="thumb__view" data-action="view-img" data-exp="${e.letter}" data-index="${i}" aria-label="${esc(img.name)} 크게 보기">
            <img src="${esc(img.url)}" alt="${esc(img.name)}" />
          </button>
          ${ctx.canEdit ? `<button type="button" class="thumb__remove" data-action="remove-img" data-exp="${e.letter}" data-index="${i}" aria-label="이미지 삭제">×</button>` : ""}
        </figure>`
      )
      .join("");
    const addTile =
      ctx.canEdit && e.images.length < MAX_IMAGES
        ? `<label class="thumb thumb--add">
             <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple hidden data-action="add-img" data-exp="${e.letter}" />
             <span class="thumb__plus">+</span><span>이미지 추가</span>
           </label>`
        : "";
    const imgError = ctx.imgError && ctx.imgError.letter === e.letter ? ctx.imgError.message : "";

    return `
      <article class="exp${isFinal ? " is-final" : ""}" data-exp-card="${e.letter}">
        <header class="exp__head">
          <span class="exp__id">${id}</span>
          ${isFinal ? `<span class="badge-final">★ 최종 선택</span>` : ""}
          <div class="exp__actions">
            ${
              ctx.canEdit
                ? `<button type="button" class="btn btn--xs ${isFinal ? "btn--outline" : "btn--soft"}" data-action="toggle-final" data-exp="${e.letter}">${isFinal ? "선택 해제" : "최종 선택"}</button>
                   <button type="button" class="icon-btn icon-btn--sm" data-action="delete-exp" data-exp="${e.letter}" aria-label="${id} 삭제" title="삭제">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                   </button>`
                : ""
            }
          </div>
        </header>
        ${field({ label: "제목", key: "title", value: e.title, exp: e.letter, max: TITLE_MAX, single: true })}
        ${field({ label: "개선 목적", key: "purpose", value: e.purpose, exp: e.letter, rows: 2, max: EXP_PURPOSE_MAX })}
        ${field({ label: "프롬프트 형식", key: "format", value: e.format, exp: e.letter, rows: 5 })}
        ${field({ label: "프롬프트 예시", key: "example", value: e.example, exp: e.letter, rows: 5 })}
        <div class="vfield">
          <span class="vfield__label">생성 이미지<span class="counter">${e.images.length}/${MAX_IMAGES}</span></span>
          ${thumbs || addTile ? `<div class="img-grid">${thumbs}${addTile}</div>` : `<p class="muted-sm">등록된 이미지가 없습니다.</p>`}
          <p class="field__error">${esc(imgError)}</p>
          ${ctx.canEdit ? `<p class="muted-sm">png, jpg, jpeg · 최대 ${MAX_IMAGES}장</p>` : ""}
        </div>
      </article>`;
  }

  function render() {
    const { versions } = tabState();
    const idx = currentIndex();
    const v = versions[idx];
    const latest = versions.length - 1;
    const n = v.experiments.length;

    const options = versions
      .map((ver, i) => `<option value="${i}" ${i === idx ? "selected" : ""}>V${ver.no}${i === latest ? " (현재)" : ""}</option>`)
      .reverse()
      .join("");

    ctx.container.innerHTML = `
      <div class="tabs" role="tablist">
        ${TABS.map(
          (t) => `<a class="tab${t.key === ctx.tab ? " is-active" : ""}" role="tab" href="#/image/${t.key}" aria-selected="${t.key === ctx.tab}">${t.label}</a>`
        ).join("")}
      </div>

      <section class="panel">
        <div class="version-head">
          <div class="version-meta">
            <div class="select-wrap version-select">
              <select class="input select" data-action="select-version" aria-label="버전 선택">${options}</select>
              <svg class="select-wrap__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </div>
            <dl class="version-dates">
              <div><dt>버전 생성일</dt><dd>${v.createdAt}</dd></div>
              <div><dt>최종 수정일</dt><dd data-updated>${v.updatedAt}</dd></div>
            </dl>
          </div>
          ${ctx.canEdit ? `<button type="button" class="btn btn--primary btn--sm" data-action="new-version">+ New Version</button>` : ""}
        </div>
        ${field({ label: "개선 목적", key: "purpose", value: v.purpose, rows: 2 })}
        ${field({ label: "프롬프트 형식", key: "format", value: v.format, rows: 8 })}
        ${field({ label: "프롬프트 예시", key: "example", value: v.example, rows: 8 })}
      </section>

      <section class="exp-section">
        <div class="exp-section__head">
          <h2>실험 과정 <span class="counter">${n}/${LETTERS.length}</span></h2>
          ${
            ctx.canEdit
              ? `<button type="button" class="btn btn--outline btn--sm" data-action="add-exp" ${n >= LETTERS.length ? "disabled" : ""}>+ 실험 추가</button>`
              : ""
          }
        </div>
        ${n === 0 ? `<div class="empty-state">아직 실험이 없습니다.</div>` : ""}
        <div class="exp-list">${v.experiments.map((e) => experimentCard(v, e)).join("")}</div>
      </section>`;

    ctx.imgError = null;
    ctx.container.querySelectorAll("textarea").forEach(autoGrow);
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }

  // 수정이 생기면 해당 버전의 최종 수정일을 오늘로 바꾼다
  function touch() {
    const v = currentVersion();
    v.updatedAt = today();
    const el = ctx.container.querySelector("[data-updated]");
    if (el) el.textContent = v.updatedAt;
  }

  // ---------- 동작 ----------
  function bind(container) {
    container.addEventListener("input", (e) => {
      const el = e.target;
      const key = el.dataset.field;
      if (!key || !ctx.canEdit) return;
      const target = el.dataset.exp ? findExp(el.dataset.exp) : currentVersion();
      target[key] = el.value;
      touch();
      const counter = el.closest(".vfield").querySelector(".counter");
      if (counter && el.maxLength > 0) counter.textContent = `${el.value.length}/${el.maxLength}`;
      if (el.tagName === "TEXTAREA") autoGrow(el);
    });

    container.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.action === "select-version") {
        const i = Number(el.value);
        tabState().selected = i === tabState().versions.length - 1 ? null : i;
        render();
      } else if (el.dataset.action === "add-img") {
        addImages(el.dataset.exp, [...el.files]);
      }
    });

    container.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el || el.tagName === "SELECT" || el.tagName === "INPUT") return;
      const v = currentVersion();
      const letter = el.dataset.exp;

      switch (el.dataset.action) {
        case "new-version": {
          const versions = tabState().versions;
          versions.push({
            no: Math.max(...versions.map((x) => x.no)) + 1,
            createdAt: today(),
            updatedAt: today(),
            purpose: "",
            format: v.format,
            example: v.example,
            experiments: [],
            finalLetter: null,
          });
          tabState().selected = null;
          render();
          ctx.container.querySelector('[data-field="purpose"]:not([data-exp])').focus();
          break;
        }
        case "add-exp": {
          const used = new Set(v.experiments.map((x) => x.letter));
          const next = LETTERS.find((l) => !used.has(l));
          if (!next) return;
          v.experiments.push({ letter: next, title: "", purpose: "", format: v.format, example: v.example, images: [] });
          v.experiments.sort((a, b) => a.letter.localeCompare(b.letter));
          touch();
          render();
          const card = ctx.container.querySelector(`[data-exp-card="${next}"]`);
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.querySelector('[data-field="title"]').focus({ preventScroll: true });
          break;
        }
        case "toggle-final":
          v.finalLetter = v.finalLetter === letter ? null : letter;
          touch();
          render();
          break;
        case "delete-exp": {
          if (!window.confirm(`V${v.no}-${letter} 실험을 삭제할까요?`)) return;
          const exp = findExp(letter);
          exp.images.forEach(revoke);
          v.experiments = v.experiments.filter((x) => x !== exp);
          if (v.finalLetter === letter) v.finalLetter = null;
          touch();
          render();
          break;
        }
        case "remove-img": {
          const exp = findExp(letter);
          const [removed] = exp.images.splice(Number(el.dataset.index), 1);
          revoke(removed);
          touch();
          render();
          break;
        }
        case "view-img": {
          const img = findExp(letter).images[Number(el.dataset.index)];
          document.getElementById("image-modal-img").src = img.url;
          document.getElementById("image-modal-img").alt = img.name;
          document.getElementById("image-modal-name").textContent = img.name;
          ctx.openModal(document.getElementById("image-modal"));
          break;
        }
      }
    });
  }

  function addImages(letter, files) {
    const exp = findExp(letter);
    const valid = files.filter((f) => IMAGE_EXT_RE.test(f.name) && IMAGE_TYPES.includes(f.type));
    const room = MAX_IMAGES - exp.images.length;
    const accepted = valid.slice(0, room);
    const messages = [];
    if (valid.length < files.length) messages.push("png, jpg, jpeg 파일만 올릴 수 있습니다.");
    if (valid.length > room) messages.push(`이미지는 최대 ${MAX_IMAGES}장까지입니다. ${valid.length - room}장은 제외했습니다.`);

    accepted.forEach((f) => exp.images.push({ name: f.name, url: URL.createObjectURL(f) }));
    if (accepted.length) touch();
    ctx.imgError = messages.length ? { letter, message: messages.join(" ") } : null;
    render();
  }

  function revoke(img) {
    if (img && img.url.startsWith("blob:")) URL.revokeObjectURL(img.url);
  }

  window.ImagePage = { TABS, mount };
})();
