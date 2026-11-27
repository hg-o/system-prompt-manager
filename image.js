// Image 화면: Feature / BYK / Gen Prompt 탭별 프롬프트 버전과 실험 관리 (프로토타입)
//
// 데이터는 메모리에만 있다. 새로고침하면 샘플 데이터로 돌아간다.
// 실제 구현에서는 아래 state 구조를 API 로 읽고 쓰면 된다 (HANDOFF.md 참고).
//
// 버전 상태 흐름: 실험전(draft) → 실험중(testing) → 실험완료(done) → 최종(final)
//   실험전   실험안(A~J) 추가·삭제
//   실험중   실험안 투표(이유 필수, 한 사람이 여러 실험안에 투표 가능), 최종 선택(★)
//   실험완료 ★ 실험안을 Final 로 복제해 다듬고 '최종 확정'
//   최종     모두 읽기 전용. '새 버전으로 사본 생성'만 가능
(function () {
  "use strict";

  const TABS = [
    { key: "feature", label: "Feature" },
    { key: "byk", label: "BYK" },
    { key: "gen-prompt", label: "Gen Prompt" },
  ];
  const LETTERS = "ABCDEFGHIJ".split(""); // 한 버전당 실험 최대 10개 (A~J)
  const FINAL = "Final"; // 실험완료 때 만드는 최종본의 이름 (Vn-Final)
  const MAX_IMAGES = 10;
  const TITLE_MAX = 100;
  const EXP_PURPOSE_MAX = 500;
  const VOTE_REASON_MAX = 500;
  const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;
  const IMAGE_TYPES = ["image/png", "image/jpeg"];

  const STATUSES = [
    { key: "draft", label: "실험전" },
    { key: "testing", label: "실험중" },
    { key: "done", label: "실험완료" },
    { key: "final", label: "최종" },
  ];
  const statusLabel = (key) => STATUSES.find((s) => s.key === key).label;

  const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- 복제 ----------
  // 이미지 url 은 원본과 같이 쓴다 (프로토타입이라 blob 을 따로 해제하지 않는다)
  function copyExp(e, letter = e.letter) {
    return {
      letter,
      title: e.title,
      purpose: e.purpose,
      format: e.format,
      example: e.example,
      images: e.images.map((img) => ({ ...img })),
      votes: [],
    };
  }
  const makeFinal = (e) => ({ ...copyExp(e, FINAL), source: e.letter });

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

  const VOTERS = [
    { id: "minji.kim@webtoon.com", name: "minji.kim" },
    { id: "jun.park@webtoon.com", name: "jun.park" },
    { id: "sora.lee@webtoon.com", name: "sora.lee" },
  ];
  const sampleVote = (i, reason, at) => ({ userId: VOTERS[i].id, name: VOTERS[i].name, reason: `[샘플] ${reason}`, at });

  function sampleExperiment(tabLabel, vNo, letter, hue, imageCount, votes = []) {
    const id = `V${vNo}-${letter}`;
    return {
      letter,
      title: `[샘플] ${tabLabel} ${id} 실험`,
      purpose: `[샘플] ${id}에서 확인하려는 개선 목적을 적습니다.`,
      format: `[샘플] ${id} 프롬프트 형식\n\n- 역할:\n- 입력:\n- 출력 형식:`,
      example: `[샘플] ${id} 프롬프트 예시 전문이 여기에 들어갑니다.`,
      images: Array.from({ length: imageCount }, (_, i) => sampleImage(hue + i * 18, `${id} #${i + 1}`)),
      votes,
    };
  }

  function seed(tabLabel, hue) {
    const v1a = sampleExperiment(tabLabel, 1, "A", hue, 3, [
      sampleVote(0, "캐릭터 표정이 가장 자연스럽습니다.", "2026-10-09"),
      sampleVote(1, "배경 묘사가 프롬프트 의도에 가장 가깝습니다.", "2026-10-10"),
    ]);
    const v1b = sampleExperiment(tabLabel, 1, "B", hue + 60, 2, [sampleVote(2, "색감은 B가 더 좋았습니다.", "2026-10-10")]);
    const v1final = makeFinal(v1a);
    v1final.title = `[샘플] ${tabLabel} V1 최종본`;
    v1final.purpose = "[샘플] V1-A를 바탕으로 문구를 다듬은 최종본입니다.";

    return [
      {
        no: 1,
        title: `[샘플] ${tabLabel} 기본 프롬프트`,
        status: "final",
        createdAt: "2026-10-02",
        updatedAt: "2026-10-15",
        confirmedAt: "2026-10-15",
        purpose: `[샘플] ${tabLabel} 첫 버전입니다.`,
        format: `[샘플] ${tabLabel} V1 프롬프트 형식\n\n- 역할:\n- 입력:\n- 출력 형식:`,
        example: `[샘플] ${tabLabel} V1 프롬프트 예시 전문이 여기에 들어갑니다.`,
        experiments: [v1a, v1b],
        finalLetter: "A",
        final: v1final,
      },
      {
        no: 2,
        title: `[샘플] ${tabLabel} 출력 형식 개선`,
        status: "testing",
        createdAt: "2026-11-03",
        updatedAt: "2026-11-24",
        confirmedAt: null,
        purpose: `[샘플] V1 최종본을 바탕으로 출력 형식을 다듬은 버전입니다.`,
        format: `[샘플] ${tabLabel} V2 프롬프트 형식\n\n- 역할:\n- 입력:\n- 제약 조건:\n- 출력 형식:`,
        example: `[샘플] ${tabLabel} V2 프롬프트 예시 전문이 여기에 들어갑니다.`,
        experiments: [
          sampleExperiment(tabLabel, 2, "A", hue + 20, 4, [sampleVote(0, "구도가 안정적입니다.", "2026-11-20")]),
          sampleExperiment(tabLabel, 2, "B", hue + 90, 2, [
            sampleVote(1, "선이 가장 깔끔합니다.", "2026-11-21"),
            sampleVote(2, "요청한 출력 형식을 가장 잘 지킵니다.", "2026-11-22"),
          ]),
          sampleExperiment(tabLabel, 2, "C", hue + 160, 1),
        ],
        finalLetter: "B",
        final: null,
      },
    ];
  }

  // tabKey → { versions: [...], selected: 버전 index | null(최신), exp: 보고 있는 실험 letter | null(전체) }
  const state = Object.fromEntries(TABS.map((t, i) => [t.key, { versions: seed(t.label, 140 + i * 70), selected: null, exp: null }]));

  // ---------- 화면 ----------
  // { container, tab, canEdit, user, openModal, imgError, statusError, voteDraft }
  let ctx = null;

  const tabState = () => state[ctx.tab];
  const currentIndex = () => tabState().selected ?? tabState().versions.length - 1;
  const currentVersion = () => tabState().versions[currentIndex()];
  const findExp = (letter) =>
    letter === FINAL ? currentVersion().final : currentVersion().experiments.find((e) => e.letter === letter);
  const expOptionLabel = (v, e) =>
    `V${v.no}-${e.letter}${v.finalLetter === e.letter ? " ★" : ""}${e.title ? ` · ${e.title}` : ""}`;

  // 상태별 권한 (Viewer 는 투표만 가능)
  const status = () => currentVersion().status;
  const can = {
    editVersion: () => ctx.canEdit && status() !== "final",
    editExp: () => ctx.canEdit && (status() === "draft" || status() === "testing"),
    editFinal: () => ctx.canEdit && status() === "done",
    addExp: () => ctx.canEdit && status() === "draft",
    pickFinal: () => ctx.canEdit && status() === "testing",
    vote: () => !!ctx.user && status() === "testing",
  };
  const canEditCard = (e) => (e.letter === FINAL ? can.editFinal() : can.editExp());

  const CHEVRON =
    '<svg class="select-wrap__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>';

  function mount(container, options) {
    const first = !ctx || ctx.container !== container;
    if (ctx && ctx.tab !== options.tab) ctx.voteDraft = null;
    ctx = { imgError: null, statusError: null, voteDraft: null, ...ctx, ...options, container };
    if (first) bind(container);
    render();
  }

  function field({ label, key, value, exp, rows = 3, max, single, editable }) {
    const attrs = [
      `data-field="${key}"`,
      exp ? `data-exp="${exp}"` : "",
      max ? `maxlength="${max}"` : "",
      editable ? "" : "readonly",
    ].join(" ");
    const counter = max && editable ? `<span class="counter">${String(value).length}/${max}</span>` : "";
    const control = single
      ? `<input class="input" type="text" ${attrs} value="${esc(value)}" />`
      : `<textarea class="input textarea" rows="${rows}" ${attrs}>${esc(value)}</textarea>`;
    return `<label class="vfield"><span class="vfield__label">${label}${counter}</span>${control}</label>`;
  }

  function statusHint(v) {
    const id = `V${v.no}`;
    switch (v.status) {
      case "draft":
        return "실험안(A~J)을 만들고 내용을 채웁니다. 실험안은 이 상태에서만 추가·삭제할 수 있습니다.";
      case "testing":
        return "실험안마다 투표하고 이유를 남깁니다. 여러 실험안에 투표할 수 있습니다. 결과를 보고 하나를 최종 선택한 뒤 실험완료로 넘깁니다.";
      case "done":
        return `${id}-${v.final.source}을(를) 복제한 ${id}-Final을 다듬은 뒤 '최종 확정'을 누릅니다. 실험안 A~J는 고칠 수 없습니다.`;
      default:
        return `최종 확정된 버전이라 고칠 수 없습니다. 고치려면 '새 버전으로 사본 생성'을 눌러 새 버전에서 고쳐 주세요.`;
    }
  }

  function statusRow(v) {
    const locked = !ctx.canEdit || v.status === "final";
    const steps = STATUSES.map((s, i) => {
      const active = s.key === v.status;
      // '최종'은 직접 고를 수 없고, 실험완료에서 '최종 확정'을 눌러야 된다
      const disabled = locked || s.key === "final";
      const title = s.key === "final" && v.status !== "final" ? ` title="실험완료 상태에서 '최종 확정'을 누르면 최종이 됩니다."` : "";
      return `<button type="button" class="status-step status-step--${s.key}${active ? " is-active" : ""}" role="radio" aria-checked="${active}"
        data-action="set-status" data-status="${s.key}" ${disabled ? "disabled" : ""}${title}><span class="status-step__no">${i + 1}</span>${s.label}</button>`;
    }).join("");
    return `
      <div class="status-row">
        <span class="status-row__label">상태</span>
        <div class="status-steps" role="radiogroup" aria-label="V${v.no} 상태">${steps}</div>
      </div>
      <p class="status-hint">${esc(statusHint(v))}</p>
      ${ctx.statusError ? `<p class="field__error status-error">${esc(ctx.statusError)}</p>` : ""}`;
  }

  function voteSection(e) {
    const votes = e.votes || [];
    const canVote = can.vote();
    if (!votes.length && !canVote) return "";
    const mine = ctx.user && votes.find((x) => x.userId === ctx.user.id);
    const drafting = canVote && ctx.voteDraft && ctx.voteDraft.letter === e.letter;

    let control = "";
    if (canVote && mine) control = `<button type="button" class="btn btn--outline btn--xs" data-action="unvote" data-exp="${e.letter}">투표 취소</button>`;
    else if (canVote && !drafting) control = `<button type="button" class="btn btn--soft btn--xs" data-action="vote-open" data-exp="${e.letter}">투표하기</button>`;

    const composer = drafting
      ? `<div class="vote-form">
           <textarea class="input textarea" rows="2" maxlength="${VOTE_REASON_MAX}" data-vote-reason data-exp="${e.letter}"
             placeholder="투표 이유를 적어 주세요. (${VOTE_REASON_MAX}자 이내)">${esc(ctx.voteDraft.text)}</textarea>
           <p class="field__error">${esc(ctx.voteDraft.error || "")}</p>
           <div class="vote-form__actions">
             <button type="button" class="btn btn--outline btn--xs" data-action="vote-cancel">취소</button>
             <button type="button" class="btn btn--primary btn--xs" data-action="vote-submit" data-exp="${e.letter}">투표 등록</button>
           </div>
         </div>`
      : "";
    const list = votes
      .map(
        (x) => `<li class="vote-item${ctx.user && x.userId === ctx.user.id ? " is-mine" : ""}">
          <div class="vote-item__meta"><b>${esc(x.name)}</b>${ctx.user && x.userId === ctx.user.id ? `<span class="vote-item__me">나</span>` : ""}<span>${x.at}</span></div>
          <p>${esc(x.reason)}</p></li>`
      )
      .join("");

    return `
      <div class="vote">
        <div class="vote__head">
          <span class="vote__count">투표 <b>${votes.length}</b></span>
          ${mine ? `<span class="vote__mine">투표함</span>` : ""}
          <div class="vote__actions">${control}</div>
        </div>
        ${composer}
        ${list ? `<ul class="vote__list">${list}</ul>` : ""}
      </div>`;
  }

  function experimentCard(v, e) {
    const isFinalCopy = e.letter === FINAL;
    const editable = canEditCard(e);
    const isPicked = !isFinalCopy && v.finalLetter === e.letter;
    const id = `V${v.no}-${e.letter}`;
    const thumbs = e.images
      .map(
        (img, i) => `
        <figure class="thumb">
          <button type="button" class="thumb__view" data-action="view-img" data-exp="${e.letter}" data-index="${i}" aria-label="${esc(img.name)} 크게 보기">
            <img src="${esc(img.url)}" alt="${esc(img.name)}" />
          </button>
          ${editable ? `<button type="button" class="thumb__remove" data-action="remove-img" data-exp="${e.letter}" data-index="${i}" aria-label="이미지 삭제">×</button>` : ""}
        </figure>`
      )
      .join("");
    const addTile =
      editable && e.images.length < MAX_IMAGES
        ? `<label class="thumb thumb--add">
             <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" multiple hidden data-action="add-img" data-exp="${e.letter}" />
             <span class="thumb__plus">+</span><span>이미지 추가</span>
           </label>`
        : "";
    const imgError = ctx.imgError && ctx.imgError.letter === e.letter ? ctx.imgError.message : "";

    const badges = isFinalCopy
      ? `<span class="badge-source">V${v.no}-${e.source} 복제본</span>
         ${v.status === "final" ? `<span class="badge-final">✔ 최종 확정</span>` : ""}`
      : isPicked
        ? `<span class="badge-final">★ 최종 선택</span>`
        : "";

    const actions = [];
    if (!isFinalCopy && can.pickFinal())
      actions.push(
        `<button type="button" class="btn btn--xs ${isPicked ? "btn--outline" : "btn--soft"}" data-action="toggle-final" data-exp="${e.letter}">${isPicked ? "선택 해제" : "최종 선택"}</button>`
      );
    if (!isFinalCopy && can.addExp())
      actions.push(
        `<button type="button" class="icon-btn icon-btn--sm" data-action="delete-exp" data-exp="${e.letter}" aria-label="${id} 삭제" title="삭제">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
         </button>`
      );
    if (isFinalCopy && can.editFinal())
      actions.push(`<button type="button" class="btn btn--primary btn--xs" data-action="confirm-final">최종 확정</button>`);

    const cls = ["exp", isFinalCopy ? "exp--final-copy" : "", isPicked ? "is-final" : "", editable ? "" : "is-locked"].filter(Boolean).join(" ");

    return `
      <article class="${cls}" data-exp-card="${e.letter}">
        <header class="exp__head">
          <span class="exp__id">${id}</span>
          ${badges}
          <div class="exp__actions">${actions.join("")}</div>
        </header>
        ${field({ label: "제목", key: "title", value: e.title, exp: e.letter, max: TITLE_MAX, single: true, editable })}
        ${field({ label: "개선 목적", key: "purpose", value: e.purpose, exp: e.letter, rows: 2, max: EXP_PURPOSE_MAX, editable })}
        ${field({ label: "프롬프트 형식", key: "format", value: e.format, exp: e.letter, rows: 5, editable })}
        ${field({ label: "프롬프트 예시", key: "example", value: e.example, exp: e.letter, rows: 5, editable })}
        <div class="vfield">
          <span class="vfield__label">생성 이미지<span class="counter">${e.images.length}/${MAX_IMAGES}</span></span>
          ${thumbs || addTile ? `<div class="img-grid">${thumbs}${addTile}</div>` : `<p class="muted-sm">등록된 이미지가 없습니다.</p>`}
          <p class="field__error">${esc(imgError)}</p>
          ${editable ? `<p class="muted-sm">png, jpg, jpeg · 최대 ${MAX_IMAGES}장</p>` : ""}
        </div>
        ${isFinalCopy ? "" : voteSection(e)}
      </article>`;
  }

  function voteSummary(v) {
    if (v.status === "draft") return "";
    const ranked = v.experiments.filter((e) => e.votes.length).sort((a, b) => b.votes.length - a.votes.length);
    const top = ranked.length ? ranked[0].votes.length : 0;
    const chips = ranked
      .map((e) => `<span class="vote-chip${e.votes.length === top ? " is-top" : ""}">V${v.no}-${e.letter} <b>${e.votes.length}</b>표</span>`)
      .join("");
    return `<div class="vote-summary"><span class="vote-summary__label">투표 현황</span>${chips || `<span class="muted-sm">아직 투표가 없습니다.</span>`}</div>`;
  }

  function render() {
    const { versions } = tabState();
    const idx = currentIndex();
    const v = versions[idx];
    const latest = versions.length - 1;
    const n = v.experiments.length;

    const options = versions
      .map(
        (ver, i) =>
          `<option value="${i}" ${i === idx ? "selected" : ""}>V${ver.no} · ${statusLabel(ver.status)}${i === latest ? " (현재)" : ""}</option>`
      )
      .reverse()
      .join("");

    // 실험 드롭다운: 선택한 버전의 실험만 나온다. 실험완료·최종이면 Final 도 나온다. "전체 실험"이면 모든 카드를 보여준다.
    const showFinal = (v.status === "done" || v.status === "final") && v.final;
    const cards = [...(showFinal ? [v.final] : []), ...v.experiments];
    const filter = cards.some((e) => e.letter === tabState().exp) ? tabState().exp : null;
    const shown = filter ? cards.filter((e) => e.letter === filter) : cards;
    const expOptions =
      `<option value="">${cards.length ? `전체 실험 (${cards.length})` : "실험 없음"}</option>` +
      cards
        .map((e) => `<option value="${e.letter}" ${e.letter === filter ? "selected" : ""}>${esc(expOptionLabel(v, e))}</option>`)
        .join("");

    let headAction = "";
    if (ctx.canEdit && v.status === "final")
      headAction = `<button type="button" class="btn btn--primary btn--sm" data-action="copy-version">새 버전으로 사본 생성</button>`;
    else if (ctx.canEdit) headAction = `<button type="button" class="btn btn--primary btn--sm" data-action="new-version">+ New Version</button>`;

    const editVersion = can.editVersion();
    const emptyText = v.status === "draft" && ctx.canEdit ? "아직 실험이 없습니다. '+ 실험 추가'로 실험안을 만들어 주세요." : "실험이 없습니다.";

    ctx.container.innerHTML = `
      <div class="tabs" role="tablist">
        ${TABS.map(
          (t) => `<a class="tab${t.key === ctx.tab ? " is-active" : ""}" role="tab" href="#/image/${t.key}" aria-selected="${t.key === ctx.tab}">${t.label}</a>`
        ).join("")}
      </div>

      <section class="panel${v.status === "final" ? " is-final-version" : ""}">
        <div class="version-head">
          <div class="version-meta">
            <div class="select-wrap version-select">
              <select class="input select" data-action="select-version" aria-label="버전 선택">${options}</select>
              ${CHEVRON}
            </div>
            <span class="status-pill status-pill--${v.status}">${statusLabel(v.status)}</span>
            <div class="select-wrap exp-select">
              <select class="input select" data-action="select-exp" aria-label="V${v.no} 실험 선택" ${cards.length ? "" : "disabled"}>${expOptions}</select>
              ${CHEVRON}
            </div>
            <dl class="version-dates">
              <div><dt>버전 생성일</dt><dd>${v.createdAt}</dd></div>
              <div><dt>최종 수정일</dt><dd data-updated>${v.updatedAt}</dd></div>
              ${v.confirmedAt ? `<div><dt>최종 확정일</dt><dd>${v.confirmedAt}</dd></div>` : ""}
            </dl>
          </div>
          ${headAction}
        </div>
        ${statusRow(v)}
        ${field({ label: "제목", key: "title", value: v.title, max: TITLE_MAX, single: true, editable: editVersion })}
        ${field({ label: "개선 목적", key: "purpose", value: v.purpose, rows: 2, editable: editVersion })}
        ${field({ label: "프롬프트 형식", key: "format", value: v.format, rows: 8, editable: editVersion })}
        ${field({ label: "프롬프트 예시", key: "example", value: v.example, rows: 8, editable: editVersion })}
      </section>

      <section class="exp-section">
        <div class="exp-section__head">
          <h2>실험 과정 <span class="counter">${n}/${LETTERS.length}</span></h2>
          <div class="exp-section__actions">
            ${filter ? `<button type="button" class="btn btn--soft btn--sm" data-action="show-all-exp">전체 실험 보기</button>` : ""}
            ${
              can.addExp()
                ? `<button type="button" class="btn btn--outline btn--sm" data-action="add-exp" ${n >= LETTERS.length ? "disabled" : ""}>+ 실험 추가</button>`
                : ""
            }
          </div>
        </div>
        ${voteSummary(v)}
        ${cards.length === 0 ? `<div class="empty-state">${emptyText}</div>` : ""}
        <div class="exp-list">${shown.map((e) => experimentCard(v, e)).join("")}</div>
      </section>`;

    ctx.imgError = null;
    ctx.statusError = null;
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

  function addVersion(fields) {
    const versions = tabState().versions;
    versions.push({
      no: Math.max(...versions.map((x) => x.no)) + 1,
      status: "draft",
      createdAt: today(),
      updatedAt: today(),
      confirmedAt: null,
      finalLetter: null,
      final: null,
      ...fields,
    });
    tabState().selected = null;
    tabState().exp = null;
    ctx.voteDraft = null;
    render();
    window.scrollTo(0, 0);
    ctx.container.querySelector('[data-field="title"]:not([data-exp])').focus({ preventScroll: true });
  }

  function setStatus(v, next) {
    if (!ctx.canEdit || v.status === "final" || next === "final" || next === v.status) return;
    if (next === "testing" && !v.experiments.length) {
      ctx.statusError = "실험안이 없습니다. 실험전 상태에서 실험안을 먼저 만들어 주세요.";
      return render();
    }
    if (next === "done") {
      const picked = v.experiments.find((x) => x.letter === v.finalLetter);
      if (!picked) {
        ctx.statusError = "최종 선택된 실험안이 없습니다. 실험중 상태에서 실험안 하나를 '최종 선택'해 주세요.";
        return render();
      }
      if (!v.final) v.final = makeFinal(picked);
      else if (v.final.source !== picked.letter) {
        const ok = window.confirm(
          `지금 V${v.no}-Final은 V${v.no}-${v.final.source}을(를) 복제한 것입니다.\n지우고 최종 선택된 V${v.no}-${picked.letter}(으)로 다시 만들까요?`
        );
        if (!ok) return;
        v.final = makeFinal(picked);
      }
    }
    v.status = next;
    tabState().exp = null;
    ctx.voteDraft = null;
    touch();
    render();
  }

  // ---------- 동작 ----------
  function bind(container) {
    container.addEventListener("input", (e) => {
      const el = e.target;
      if (el.hasAttribute("data-vote-reason")) {
        if (ctx.voteDraft) ctx.voteDraft.text = el.value;
        return autoGrow(el);
      }
      const key = el.dataset.field;
      if (!key || el.readOnly) return;
      const target = el.dataset.exp ? findExp(el.dataset.exp) : currentVersion();
      target[key] = el.value;
      touch();
      const counter = el.closest(".vfield").querySelector(".counter");
      if (counter && el.maxLength > 0) counter.textContent = `${el.value.length}/${el.maxLength}`;
      if (el.tagName === "TEXTAREA") autoGrow(el);
      // 실험 제목을 고치면 실험 드롭다운 항목 이름도 바꾼다
      if (el.dataset.exp && key === "title") {
        const opt = ctx.container.querySelector(`[data-action="select-exp"] option[value="${el.dataset.exp}"]`);
        if (opt) opt.textContent = expOptionLabel(currentVersion(), target);
      }
    });

    container.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.action === "select-version") {
        const i = Number(el.value);
        tabState().selected = i === tabState().versions.length - 1 ? null : i;
        tabState().exp = null;
        ctx.voteDraft = null;
        render();
      } else if (el.dataset.action === "select-exp") {
        tabState().exp = el.value || null;
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
        case "new-version":
          if (!ctx.canEdit) return;
          addVersion({ title: "", purpose: "", format: v.format, example: v.example, experiments: [] });
          break;
        case "copy-version":
          // 최종 버전의 내용을 그대로 복제해 실험전 상태의 새 버전을 만든다 (투표·최종 선택·Final 은 넘기지 않는다)
          if (!ctx.canEdit || v.status !== "final") return;
          addVersion({
            title: v.title,
            purpose: v.purpose,
            format: v.format,
            example: v.example,
            experiments: v.experiments.map((x) => copyExp(x)),
          });
          break;
        case "set-status":
          setStatus(v, el.dataset.status);
          break;
        case "confirm-final":
          if (!can.editFinal()) return;
          if (!window.confirm(`V${v.no}-Final을 최종으로 확정할까요?\n확정하면 V${v.no}의 모든 내용을 더 이상 고칠 수 없습니다.`)) return;
          touch();
          v.status = "final";
          v.confirmedAt = today();
          render();
          break;
        case "show-all-exp":
          tabState().exp = null;
          render();
          break;
        case "add-exp": {
          if (!can.addExp()) return;
          const used = new Set(v.experiments.map((x) => x.letter));
          const next = LETTERS.find((l) => !used.has(l));
          if (!next) return;
          v.experiments.push({ letter: next, title: "", purpose: "", format: v.format, example: v.example, images: [], votes: [] });
          v.experiments.sort((a, b) => a.letter.localeCompare(b.letter));
          tabState().exp = null; // 새 실험이 보이도록 전체 보기로 돌린다
          touch();
          render();
          const card = ctx.container.querySelector(`[data-exp-card="${next}"]`);
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.querySelector('[data-field="title"]').focus({ preventScroll: true });
          break;
        }
        case "toggle-final":
          if (!can.pickFinal()) return;
          v.finalLetter = v.finalLetter === letter ? null : letter;
          touch();
          render();
          break;
        case "delete-exp": {
          if (!can.addExp()) return;
          if (!window.confirm(`V${v.no}-${letter} 실험을 삭제할까요?`)) return;
          v.experiments = v.experiments.filter((x) => x.letter !== letter);
          if (v.finalLetter === letter) v.finalLetter = null;
          if (tabState().exp === letter) tabState().exp = null;
          touch();
          render();
          break;
        }
        case "remove-img":
          if (!canEditCard(findExp(letter))) return;
          findExp(letter).images.splice(Number(el.dataset.index), 1);
          touch();
          render();
          break;
        case "view-img": {
          const img = findExp(letter).images[Number(el.dataset.index)];
          document.getElementById("image-modal-img").src = img.url;
          document.getElementById("image-modal-img").alt = img.name;
          document.getElementById("image-modal-name").textContent = img.name;
          ctx.openModal(document.getElementById("image-modal"));
          break;
        }
        case "vote-open":
          if (!can.vote()) return;
          ctx.voteDraft = { letter, text: "", error: "" };
          render();
          ctx.container.querySelector("[data-vote-reason]").focus();
          break;
        case "vote-cancel":
          ctx.voteDraft = null;
          render();
          break;
        case "vote-submit": {
          if (!can.vote() || !ctx.voteDraft) return;
          const reason = ctx.voteDraft.text.trim();
          if (!reason) {
            ctx.voteDraft.error = "투표 이유를 적어 주세요.";
            render();
            ctx.container.querySelector("[data-vote-reason]").focus();
            return;
          }
          findExp(letter).votes.push({ userId: ctx.user.id, name: ctx.user.name, reason, at: today() });
          ctx.voteDraft = null;
          render();
          break;
        }
        case "unvote": {
          if (!can.vote()) return;
          if (!window.confirm(`V${v.no}-${letter} 투표를 취소할까요? 남긴 의견도 함께 지워집니다.`)) return;
          const exp = findExp(letter);
          exp.votes = exp.votes.filter((x) => x.userId !== ctx.user.id);
          render();
          break;
        }
      }
    });
  }

  function addImages(letter, files) {
    const exp = findExp(letter);
    if (!canEditCard(exp)) return;
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

  window.ImagePage = { TABS, mount };
})();
