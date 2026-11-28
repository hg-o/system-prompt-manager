// Image 화면: Feature / BYK / Gen Prompt 탭별 프롬프트 버전과 실험 관리 (프로토타입)
//
// 데이터는 메모리에만 있다. 새로고침하면 샘플 데이터로 돌아간다.
// 실제 구현에서는 아래 state 구조를 API 로 읽고 쓰면 된다 (HANDOFF.md 참고).
//
// 버전 상태 흐름: 실험 설계(design) → 실험안 작성(draft) → 의견수렴중(testing) → 실험완료(done) → 최종(final)
//   실험 설계   실험 설계안을 여러 개 올린다 ('+ 실험 설계안' → 파일 첨부 / 직접 작성). 목록에서 대표 설계안을 고른다
//   실험안 작성 실험안(A~J) 추가·삭제·작성
//   의견수렴중      갤러리 카드 보기(이미지 크게 + 제목·개선 목적·투표). 카드를 누르면 전체 내용. 투표(이유 필수), 최종 선택(★)
//   실험완료    ★ 실험안을 Final 로 복제해 다듬고 '최종 확정'
//   최종        모두 읽기 전용. '새 버전으로 사본 생성'만 가능
//
// 버전·실험안을 삭제하면 번호를 다시 매긴다 (V1 삭제 → V2 가 V1, 실험 B 삭제 → C 가 B).
(function () {
  "use strict";

  const TABS = [
    { key: "feature", label: "Feature" },
    { key: "byk", label: "BYK" },
    { key: "gen-prompt", label: "Gen Prompt" },
  ];
  const LETTERS = "ABCDEFGHIJ".split(""); // 한 버전당 실험 최대 10개 (A~J)
  const FINAL = "Final"; // 실험완료 때 만드는 최종본의 이름 (Vn-Final)
  const NEW = "__new"; // 버전 드롭다운 맨 위 "새 버전 추가" 항목의 값
  const MAX_IMAGES = 10;
  const TITLE_MAX = 100;
  const EXP_PURPOSE_MAX = 500;
  const VOTE_REASON_MAX = 500;
  const DELETE_PHRASE = "Delete This Version"; // 삭제 확인 창에 직접 입력해야 하는 문구
  const IMAGE_EXT_RE = /\.(png|jpe?g)$/i;
  const IMAGE_TYPES = ["image/png", "image/jpeg"];

  const STATUSES = [
    { key: "design", label: "실험 설계" },
    { key: "draft", label: "실험안 작성" },
    { key: "testing", label: "의견수렴중" },
    { key: "done", label: "실험완료" },
    { key: "final", label: "최종" },
  ];

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
  // 실험 설계안: { id, type: "file" | "text", createdAt, file?: { name, url }, title?, purpose?, body? }
  let designSeq = 0;
  const newDesignId = () => `d${++designSeq}`;
  const copyDesigns = (list) => list.map((d) => ({ ...d, file: d.file ? { ...d.file } : null }));
  const DESIGN_TYPES = { file: "파일 첨부", text: "직접 작성" };
  const designTitle = (d) => (d.type === "file" ? d.file.name : d.title);
  const mainDesign = (v) => v.designs.find((d) => d.id === v.mainDesign) || null;

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

    const sampleText = `[샘플] ${tabLabel} 실험 설계안 파일입니다.`;
    const v1design = {
      id: newDesignId(),
      type: "text",
      createdAt: "2026-10-02",
      file: null,
      title: `[샘플] ${tabLabel} 기본 프롬프트 설계`,
      purpose: `[샘플] ${tabLabel} 첫 버전입니다. 기준이 될 프롬프트를 정합니다.`,
      body: `[샘플] 실험 설계 본문\n\n1. 배경\n2. 가설\n3. 실험 방법\n4. 평가 기준`,
    };
    const v2design = {
      id: newDesignId(),
      type: "text",
      createdAt: "2026-11-03",
      file: null,
      title: `[샘플] ${tabLabel} 출력 형식 개선 설계`,
      purpose: `[샘플] V1 최종본을 바탕으로 출력 형식을 다듬습니다.`,
      body: `[샘플] 실험 설계 본문\n\n1. 배경: V1 결과물의 출력 형식이 일정하지 않음\n2. 가설: 제약 조건을 명시하면 형식이 안정된다\n3. 실험 방법: 실험안 3개(A~C)를 같은 입력으로 비교\n4. 평가 기준: 형식 준수, 이미지 품질`,
    };
    const v2file = {
      id: newDesignId(),
      type: "file",
      createdAt: "2026-11-05",
      file: { name: `[샘플] ${tabLabel} 실험 설계안.txt`, url: "data:text/plain;charset=utf-8," + encodeURIComponent(sampleText) },
    };

    return [
      {
        no: 1,
        status: "final",
        createdAt: "2026-10-02",
        updatedAt: "2026-10-15",
        confirmedAt: "2026-10-15",
        designs: [v1design],
        mainDesign: v1design.id,
        experiments: [v1a, v1b],
        finalLetter: "A",
        final: v1final,
      },
      {
        no: 2,
        status: "testing",
        createdAt: "2026-11-03",
        updatedAt: "2026-11-24",
        confirmedAt: null,
        designs: [v2file, v2design], // 최신순
        mainDesign: v2design.id,
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
  // { container, tab, canEdit, user, openModal, closeModal, imgError, statusError, voteDraft, hero }
  let ctx = null;

  const tabState = () => state[ctx.tab];
  const currentIndex = () => tabState().selected ?? tabState().versions.length - 1;
  const currentVersion = () => tabState().versions[currentIndex()];
  const findExp = (letter) =>
    letter === FINAL ? currentVersion().final : currentVersion().experiments.find((e) => e.letter === letter);

  // 상태별 권한 (Viewer 는 투표만 가능)
  const status = () => currentVersion().status;
  const can = {
    editDesign: () => ctx.canEdit && status() === "design",
    editExp: () => ctx.canEdit && (status() === "draft" || status() === "testing"),
    editFinal: () => ctx.canEdit && status() === "done",
    addExp: () => ctx.canEdit && status() === "draft",
    pickFinal: () => ctx.canEdit && status() === "testing",
    vote: () => !!ctx.user && status() === "testing",
  };
  const canEditCard = (e) => (e.letter === FINAL ? can.editFinal() : can.editExp());

  const TRASH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>';
  const CHEVRON =
    '<svg class="select-wrap__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>';

  function mount(container, options) {
    const first = !ctx || ctx.container !== container;
    if (ctx && ctx.tab !== options.tab) resetView();
    ctx = { imgError: null, statusError: null, voteDraft: null, hero: {}, designMenu: false, designForm: null, designExpanded: false, ...ctx, ...options, container };
    if (first) bind(container);
    render();
  }

  function field({ label, key, value, exp, rows = 3, max, single, editable, placeholder }) {
    const attrs = [
      `data-field="${key}"`,
      exp ? `data-exp="${exp}"` : "",
      placeholder && editable ? `placeholder="${esc(placeholder)}"` : "",
      max ? `maxlength="${max}"` : "",
      editable ? "" : "readonly",
    ].join(" ");
    const counter = max && editable ? `<span class="counter">${String(value).length}/${max}</span>` : "";
    const control = single
      ? `<input class="input" type="text" ${attrs} value="${esc(value)}" />`
      : `<textarea class="input textarea" rows="${rows}" ${attrs}>${esc(value)}</textarea>`;
    return `<label class="vfield"><span class="vfield__label">${label}${counter}</span>${control}</label>`;
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
      ${ctx.statusError ? `<p class="field__error status-error">${esc(ctx.statusError)}</p>` : ""}`;
  }

  // ---------- 실험 설계안 ----------
  // 실험 설계 단계: '+ 실험 설계안' 버튼(파일 첨부 / 직접 작성) + 목록(최신순, 대표 선택)
  // 그 뒤 단계: 접힌 읽기 전용 목록
  function designForm(editable) {
    const f = ctx.designForm;
    if (!f) return "";
    const ro = editable ? "" : "readonly";
    const heading = !editable ? "실험 설계안 보기" : f.id ? "실험 설계안 수정" : "실험 설계안 직접 작성";
    return `
      <div class="design-form">
        <h3 class="design-form__title">${heading}</h3>
        <label class="vfield">
          <span class="vfield__label">제목${editable ? `<span class="counter">${f.title.length}/${TITLE_MAX}</span>` : ""}</span>
          <input class="input" type="text" data-dfield="title" maxlength="${TITLE_MAX}" value="${esc(f.title)}" ${ro} />
        </label>
        <label class="vfield">
          <span class="vfield__label">개선 목적</span>
          <textarea class="input textarea" rows="3" data-dfield="purpose" ${ro}>${esc(f.purpose)}</textarea>
        </label>
        <label class="vfield">
          <span class="vfield__label">본문</span>
          <textarea class="input textarea" rows="10" data-dfield="body" ${ro}>${esc(f.body)}</textarea>
        </label>
        <p class="field__error">${esc(f.error || "")}</p>
        <div class="design-form__actions">
          <button type="button" class="btn btn--outline btn--sm" data-action="design-form-close">${editable ? "취소" : "닫기"}</button>
          ${editable ? `<button type="button" class="btn btn--primary btn--sm" data-action="design-form-save">저장</button>` : ""}
        </div>
      </div>`;
  }

  function designList(v, editable) {
    if (!v.designs.length) return `<div class="empty-state empty-state--sm">등록된 실험 설계안이 없습니다.</div>`;
    const rows = v.designs
      .map((d) => {
        const isMain = d.id === v.mainDesign;
        const title = designTitle(d) || "제목 없음";
        const link =
          d.type === "file"
            ? `<a class="design-link" href="${esc(d.file.url)}" download="${esc(d.file.name)}">${esc(title)}</a>`
            : `<button type="button" class="design-link" data-action="open-design" data-id="${d.id}">${esc(title)}</button>`;
        return `
          <tr class="${isMain ? "is-main" : ""}" data-design-row="${d.id}">
            <td class="design-table__main">
              <label class="main-pick">
                <input type="radio" name="main-design-${v.no}" data-action="main-design" value="${d.id}" ${isMain ? "checked" : ""} ${editable ? "" : "disabled"} aria-label="${esc(title)}을(를) 대표 설계안으로 선택" />
                ${isMain ? `<span class="badge-main">대표</span>` : ""}
              </label>
            </td>
            <td><span class="type-chip type-chip--${d.type}">${DESIGN_TYPES[d.type]}</span></td>
            <td class="design-table__title">${link}</td>
            <td class="design-table__date">${d.createdAt}</td>
            ${
              editable
                ? `<td class="design-table__del"><button type="button" class="icon-btn icon-btn--sm" data-action="delete-design" data-id="${d.id}" aria-label="${esc(title)} 삭제" title="삭제">${TRASH}</button></td>`
                : ""
            }
          </tr>`;
      })
      .join("");
    return `
      <table class="design-table">
        <thead><tr><th>대표 설계안</th><th>타입</th><th>제목</th><th>생성·업로드 일자</th>${editable ? `<th><span class="sr-only">삭제</span></th>` : ""}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function designBlock(v) {
    if (v.status === "design") {
      const editable = can.editDesign();
      const menu = ctx.designMenu
        ? `<div class="add-menu" role="menu">
             <label class="add-menu__item" role="menuitem">
               <input type="file" hidden data-action="add-design-file" />
               <b>파일 첨부</b><span>설계안 파일을 올립니다</span>
             </label>
             <button type="button" class="add-menu__item" role="menuitem" data-action="design-write">
               <b>직접 작성</b><span>제목·개선 목적·본문을 적습니다</span>
             </button>
           </div>`
        : "";
      return `
        <div class="design">
          ${
            editable
              ? `<div class="add-menu-wrap">
                   <button type="button" class="btn btn--primary btn--sm" data-action="design-menu" aria-haspopup="menu" aria-expanded="${!!ctx.designMenu}">+ 실험 설계안</button>
                   ${menu}
                 </div>`
              : ""
          }
          ${designForm(editable)}
          ${designList(v, editable)}
        </div>`;
    }
    const main = mainDesign(v);
    return `
      <details class="design-summary" ${ctx.designExpanded ? "open" : ""}>
        <summary>
          <span class="design-summary__label">실험 설계</span>
          <span class="design-summary__title">${main ? esc(designTitle(main) || "제목 없음") : "대표 설계안 없음"}</span>
          <span class="design-summary__count">설계안 ${v.designs.length}개</span>
        </summary>
        <div class="design-summary__body">
          ${designForm(false)}
          ${designList(v, false)}
        </div>
      </details>`;
  }

  function voteSection(e, compact) {
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
    // 갤러리 카드에서는 내 의견만 보여준다 (전체 의견은 카드를 눌러 들어가면 보인다)
    const list = (compact ? votes.filter((x) => x === mine) : votes)
      .map(
        (x) => `<li class="vote-item${ctx.user && x.userId === ctx.user.id ? " is-mine" : ""}">
          <div class="vote-item__meta"><b>${esc(x.name)}</b>${ctx.user && x.userId === ctx.user.id ? `<span class="vote-item__me">나</span>` : ""}<span>${x.at}</span></div>
          <p>${esc(x.reason)}</p></li>`
      )
      .join("");

    return `
      <div class="vote${compact ? " vote--compact" : ""}" data-no-open>
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
        `<button type="button" class="btn btn--danger-outline btn--xs" data-action="delete-exp" data-exp="${e.letter}">${TRASH}${id} 실험안 삭제</button>`
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
        ${isFinalCopy || v.status === "draft" ? "" : voteSection(e)}
      </article>`;
  }

  // 의견수렴중 갤러리 카드: 이미지를 가장 크게, 그 아래 제목·개선 목적·투표. 카드를 누르면 전체 내용이 열린다.
  function galleryCard(v, e) {
    const id = `V${v.no}-${e.letter}`;
    const isPicked = v.finalLetter === e.letter;
    const count = e.images.length;
    const hi = Math.min(ctx.hero[e.letter] || 0, Math.max(count - 1, 0));
    const hero = e.images[hi];
    const strip =
      count > 1
        ? `<div class="gcard__strip" data-no-open>${e.images
            .map(
              (img, i) =>
                `<button type="button" class="gcard__pick${i === hi ? " is-active" : ""}" data-action="hero-img" data-exp="${e.letter}" data-index="${i}" aria-label="이미지 ${i + 1} 보기"><img src="${esc(img.url)}" alt="" /></button>`
            )
            .join("")}</div>`
        : "";

    return `
      <article class="gcard${isPicked ? " is-final" : ""}" data-exp-card="${e.letter}" data-action="open-exp" data-exp="${e.letter}" tabindex="0" aria-label="${id} 전체 내용 보기">
        <div class="gcard__hero">
          ${hero ? `<img src="${esc(hero.url)}" alt="${esc(hero.name)}" />` : `<span class="gcard__noimg">등록된 이미지가 없습니다</span>`}
          <div class="gcard__tags">
            <span class="exp__id">${id}</span>
            ${isPicked ? `<span class="badge-final">★ 최종 선택</span>` : ""}
          </div>
          ${count > 1 ? `<span class="gcard__count">${hi + 1} / ${count}</span>` : ""}
        </div>
        ${strip}
        <div class="gcard__body">
          <h3 class="gcard__title">${e.title ? esc(e.title) : `<span class="gcard__empty">제목 없음</span>`}</h3>
          <p class="gcard__purpose">${e.purpose ? esc(e.purpose) : `<span class="gcard__empty">개선 목적이 없습니다.</span>`}</p>
          <span class="gcard__more">전체 내용 보기 ›</span>
        </div>
        ${v.status === "testing" ? voteSection(e, true) : ""}
      </article>`;
  }

  function voteSummary(v) {
    if (v.status !== "testing") return "";
    const ranked = v.experiments.filter((e) => e.votes.length).sort((a, b) => b.votes.length - a.votes.length);
    const top = ranked.length ? ranked[0].votes.length : 0;
    const chips = ranked
      .map((e) => `<span class="vote-chip${e.votes.length === top ? " is-top" : ""}">V${v.no}-${e.letter} <b>${e.votes.length}</b>표</span>`)
      .join("");
    return `<div class="vote-summary"><span class="vote-summary__label">투표 현황</span>${chips || `<span class="muted-sm">아직 투표가 없습니다.</span>`}</div>`;
  }

  function render() {
    const { versions } = tabState();
    const tabsHtml = `
      <div class="tabs" role="tablist">
        ${TABS.map(
          (t) => `<a class="tab${t.key === ctx.tab ? " is-active" : ""}" role="tab" href="#/image/${t.key}" aria-selected="${t.key === ctx.tab}">${t.label}</a>`
        ).join("")}
      </div>`;

    // 버전을 모두 지운 경우
    if (!versions.length) {
      ctx.container.innerHTML = `${tabsHtml}
        <section class="panel">
          <div class="empty-state">
            <p>버전이 없습니다.</p>
            ${ctx.canEdit ? `<button type="button" class="btn btn--primary btn--sm" data-action="new-version">＋ 새 버전 추가</button>` : ""}
          </div>
        </section>`;
      return;
    }

    const idx = currentIndex();
    const v = versions[idx];
    const latest = versions.length - 1;
    const n = v.experiments.length;

    const options = versions
      .map(
        (ver, i) =>
          `<option value="${i}" ${i === idx ? "selected" : ""}>V${ver.no}${i === latest ? " (현재)" : ""}</option>`
      )
      .reverse()
      .join("");
    const addVersionOption = ctx.canEdit ? `<option value="${NEW}">＋ 새 버전 추가</option>` : "";

    // 단계별로 보여주는 실험안
    //   실험 설계        없음 (실험안 작성 전 단계. 뒤 단계에서 돌아와 실험안이 남아 있어도 보여주지 않는다)
    //   실험안 작성·의견수렴중  전체 실험(갤러리 카드) ↔ 카드를 눌러 들어간 실험안 하나
    //   실험완료·최종    Vn-Final 하나만 (A~J 는 데이터에 남지만 보여주지 않는다)
    const inDesign = v.status === "design";
    const finalOnly = v.status === "done" || v.status === "final";
    const cards = inDesign ? [] : finalOnly ? [v.final].filter(Boolean) : v.experiments;
    const filter = !finalOnly && cards.some((e) => e.letter === tabState().exp) ? tabState().exp : null;
    const shown = filter ? cards.filter((e) => e.letter === filter) : cards;
    // 전체 보기 = 갤러리 카드 (실험안 작성에서는 투표 기능만 뺀다)
    const gallery = !finalOnly && !filter;

    const headAction = ctx.canEdit
      ? `<div class="version-actions">
           ${v.status === "final" ? `<button type="button" class="btn btn--primary btn--sm" data-action="copy-version">새 버전으로 사본 생성</button>` : ""}
           <button type="button" class="btn btn--danger-outline btn--sm" data-action="delete-version" title="V${v.no} 버전과 그 안의 실험안을 모두 삭제합니다">${TRASH}V${v.no} 버전 전체 삭제</button>
         </div>`
      : "";
    const emptyText = v.status === "draft" && ctx.canEdit ? "아직 실험안이 없습니다. '+ 실험 추가'로 실험안을 만들어 주세요." : "실험이 없습니다.";

    ctx.container.innerHTML = `${tabsHtml}

      <section class="panel${v.status === "final" ? " is-final-version" : ""}">
        <div class="version-head">
          <div class="version-meta">
            <div class="vpick">
              <span class="vpick__label">버전</span>
              <div class="select-wrap version-select">
                <select class="input select" data-action="select-version" aria-label="버전 선택">${addVersionOption}${options}</select>
                ${CHEVRON}
              </div>
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
        ${designBlock(v)}
      </section>

      <section class="exp-section" ${inDesign ? "hidden" : ""}>
        <div class="exp-section__head">
          <div class="exp-section__title">
            ${filter ? `<button type="button" class="btn btn--soft btn--sm" data-action="show-all-exp">← 전체보기</button>` : ""}
            <h2>${finalOnly ? "최종안" : `실험안 <span class="counter">${n}/${LETTERS.length}</span>`}</h2>
          </div>
          <div class="exp-section__actions">
            ${
              can.addExp()
                ? `<button type="button" class="btn btn--outline btn--sm" data-action="add-exp" ${n >= LETTERS.length ? "disabled" : ""}>+ 실험 추가</button>`
                : ""
            }
          </div>
        </div>
        ${voteSummary(v)}
        ${cards.length === 0 ? `<div class="empty-state">${emptyText}</div>` : ""}
        <div class="${gallery ? "exp-gallery" : "exp-list"}">${shown.map((e) => (gallery ? galleryCard(v, e) : experimentCard(v, e))).join("")}</div>
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

  // 버전·탭·상태가 바뀔 때 화면에만 있는 임시 상태를 지운다
  function resetView() {
    ctx.voteDraft = null;
    ctx.hero = {};
    ctx.designMenu = false;
    ctx.designForm = null;
    ctx.designExpanded = false;
  }

  function addVersion(fields) {
    const versions = tabState().versions;
    versions.push({
      no: versions.length + 1,
      status: "design",
      createdAt: today(),
      updatedAt: today(),
      confirmedAt: null,
      finalLetter: null,
      final: null,
      ...fields,
    });
    tabState().selected = null;
    tabState().exp = null;
    resetView();
    render();
    window.scrollTo(0, 0);
  }

  // 버전 드롭다운 맨 위 "새 버전 추가"
  function newVersion() {
    if (!ctx.canEdit) return render();
    addVersion({ designs: [], mainDesign: null, experiments: [] });
  }

  // 실험안 영역의 "+ 실험 추가" (실험안 작성 단계에서만)
  function addExperiment() {
    const v = currentVersion();
    const next = LETTERS[v.experiments.length]; // 실험안은 항상 A 부터 빈틈없이 이어진다
    if (!can.addExp() || !next) return render();
    v.experiments.push({ letter: next, title: "", purpose: "", format: "", example: "", images: [], votes: [] });
    tabState().exp = next; // 새 실험안을 바로 작성할 수 있게 그 실험안의 전체 내용을 연다
    touch();
    render();
    const card = ctx.container.querySelector(`[data-exp-card="${next}"]`);
    ctx.container.querySelector(".exp-section").scrollIntoView({ block: "start" });
    card.querySelector('[data-field="title"]').focus({ preventScroll: true });
  }

  function setStatus(v, next) {
    if (!ctx.canEdit || v.status === "final" || next === "final" || next === v.status) return;
    if (next === "testing" && !v.experiments.length) {
      ctx.statusError = "실험안이 없습니다. 실험안 작성 단계에서 실험안을 먼저 만들어 주세요.";
      return render();
    }
    if (next === "done") {
      const picked = v.experiments.find((x) => x.letter === v.finalLetter);
      if (!picked) {
        ctx.statusError = "최종 선택된 실험안이 없습니다. 의견수렴중 상태에서 실험안 하나를 '최종 선택'해 주세요.";
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
    resetView();
    touch();
    render();
  }

  // ---------- 삭제 (확인 문구 입력 + 번호 다시 매기기) ----------
  const deleteModal = document.getElementById("delete-modal");
  const deleteInput = document.getElementById("delete-input");
  const deleteConfirm = document.getElementById("delete-confirm");
  let pendingDelete = null;

  // kind: "version" | "exp". scope: 무엇이 지워지고 무엇이 남는지 알려주는 문장들
  function askDelete({ kind, target, scope, onConfirm }) {
    const isVersion = kind === "version";
    const chip = document.getElementById("delete-kind");
    chip.textContent = isVersion ? "버전 전체 삭제" : "실험안 1개 삭제";
    chip.className = `delete-kind delete-kind--${kind}`;
    document.getElementById("delete-title").textContent = `정말 이 ${isVersion ? "버전" : "실험안"}을 삭제하시겠습니까?`;
    document.getElementById("delete-target").textContent = target;
    document.getElementById("delete-scope").innerHTML = scope.map((line) => `<li>${line}</li>`).join("");
    deleteInput.value = "";
    deleteConfirm.disabled = true;
    pendingDelete = onConfirm;
    ctx.openModal(deleteModal);
  }

  function versionDeleteScope(v) {
    const { versions } = tabState();
    const ids = v.experiments.map((e) => `V${v.no}-${e.letter}`);
    const votes = v.experiments.reduce((sum, e) => sum + e.votes.length, 0);
    const parts = [`실험 설계안 ${v.designs.length}개`, ids.length ? `실험안 ${ids.length}개 (${ids.join(", ")})` : "실험안 0개"];
    if (v.final) parts.push(`V${v.no}-Final`);
    if (votes) parts.push(`투표 ${votes}건`);
    const scope = [`<b>V${v.no} 버전 전체</b>가 삭제됩니다.`, `함께 삭제되는 것: ${esc(parts.join(", "))}`];
    const next = versions[versions.indexOf(v) + 1];
    if (next) scope.push(`뒤 버전 번호가 하나씩 앞당겨집니다. (V${next.no} → V${v.no})`);
    return scope;
  }

  function expDeleteScope(v, exp) {
    const rest = v.experiments.length - 1;
    const scope = [
      `<b>실험안 V${v.no}-${exp.letter} 하나만</b> 삭제됩니다.`,
      `V${v.no} 버전${rest ? `과 다른 실험안 ${rest}개` : ""}는 그대로 남습니다.`,
    ];
    const next = v.experiments[v.experiments.indexOf(exp) + 1];
    if (next) scope.push(`뒤 실험안 이름이 하나씩 앞당겨집니다. (V${v.no}-${next.letter} → V${v.no}-${exp.letter})`);
    return scope;
  }

  deleteInput.addEventListener("input", () => {
    deleteConfirm.disabled = deleteInput.value.trim() !== DELETE_PHRASE;
  });
  deleteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !deleteConfirm.disabled) deleteConfirm.click();
  });
  deleteConfirm.addEventListener("click", () => {
    if (deleteInput.value.trim() !== DELETE_PHRASE || !pendingDelete) return;
    const run = pendingDelete;
    pendingDelete = null;
    ctx.closeModal(deleteModal);
    run();
  });

  // 버전을 지우고 남은 버전을 V1 부터 다시 매긴다
  function deleteVersion(v) {
    const ts = tabState();
    ts.versions = ts.versions.filter((x) => x !== v);
    ts.versions.forEach((x, i) => (x.no = i + 1));
    ts.selected = null;
    ts.exp = null;
    resetView();
    render();
    window.scrollTo(0, 0);
  }

  // 실험안을 지우고 남은 실험안을 A 부터 다시 매긴다. 최종 선택(★)과 Final 의 원본 표시도 따라 옮긴다.
  function deleteExperiment(v, letter) {
    v.experiments = v.experiments.filter((x) => x.letter !== letter);
    const moved = {};
    v.experiments.forEach((x, i) => {
      moved[x.letter] = LETTERS[i];
      x.letter = LETTERS[i];
    });
    v.finalLetter = moved[v.finalLetter] ?? null;
    if (v.final) {
      if (moved[v.final.source]) v.final.source = moved[v.final.source];
      else v.final = null; // 원본 실험안이 지워졌으면 Final 도 지운다
    }
    tabState().exp = null;
    ctx.voteDraft = null;
    ctx.hero = {};
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
      // 실험 설계안 직접 작성 폼: 저장을 눌러야 반영된다
      if (el.dataset.dfield) {
        if (!ctx.designForm || el.readOnly) return;
        ctx.designForm[el.dataset.dfield] = el.value;
        const dCounter = el.closest(".vfield").querySelector(".counter");
        if (dCounter) dCounter.textContent = `${el.value.length}/${el.maxLength}`;
        if (el.tagName === "TEXTAREA") autoGrow(el);
        return;
      }
      const key = el.dataset.field;
      if (!key || el.readOnly || !el.dataset.exp) return;
      const target = findExp(el.dataset.exp);
      target[key] = el.value;
      touch();
      const counter = el.closest(".vfield").querySelector(".counter");
      if (counter && el.maxLength > 0) counter.textContent = `${el.value.length}/${el.maxLength}`;
      if (el.tagName === "TEXTAREA") autoGrow(el);
    });

    // 접힌 실험 설계 목록의 펼침 상태를 다시 그려도 유지한다 (toggle 은 버블링하지 않아 capture 로 받는다)
    container.addEventListener(
      "toggle",
      (e) => {
        if (e.target.matches(".design-summary")) ctx.designExpanded = e.target.open;
      },
      true
    );

    // 갤러리 카드는 Enter·Space 로도 열 수 있다
    container.addEventListener("keydown", (e) => {
      if ((e.key !== "Enter" && e.key !== " ") || !e.target.matches('[data-action="open-exp"]')) return;
      e.preventDefault();
      e.target.click();
    });

    container.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.action === "select-version") {
        if (el.value === NEW) return newVersion();
        const i = Number(el.value);
        tabState().selected = i === tabState().versions.length - 1 ? null : i;
        tabState().exp = null;
        resetView();
        render();
      } else if (el.dataset.action === "add-img") {
        addImages(el.dataset.exp, [...el.files]);
      } else if (el.dataset.action === "add-design-file") {
        const f = el.files[0];
        if (!f || !can.editDesign()) return;
        const cv = currentVersion();
        const d = { id: newDesignId(), type: "file", createdAt: today(), file: { name: f.name, url: URL.createObjectURL(f) } };
        cv.designs.unshift(d); // 최신순
        if (!mainDesign(cv)) cv.mainDesign = d.id;
        ctx.designMenu = false;
        touch();
        render();
      } else if (el.dataset.action === "main-design") {
        if (!can.editDesign()) return render();
        currentVersion().mainDesign = el.value;
        touch();
        render();
      }
    });

    container.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el || el.tagName === "SELECT" || el.tagName === "INPUT") return;
      // 갤러리 카드 안의 투표 영역·이미지 고르기는 카드 열기로 치지 않는다
      if (el.dataset.action === "open-exp" && e.target.closest("[data-no-open]")) return;
      const v = currentVersion();
      const letter = el.dataset.exp;

      switch (el.dataset.action) {
        case "new-version":
          newVersion();
          break;
        case "delete-version":
          if (!ctx.canEdit || !v) return;
          askDelete({
            kind: "version",
            target: `V${v.no}${mainDesign(v) ? ` · ${designTitle(mainDesign(v))}` : ""}`,
            scope: versionDeleteScope(v),
            onConfirm: () => deleteVersion(v),
          });
          break;
        case "design-menu":
          if (!can.editDesign()) return;
          ctx.designMenu = !ctx.designMenu;
          render();
          break;
        case "design-write":
          if (!can.editDesign()) return;
          ctx.designMenu = false;
          ctx.designForm = { id: null, title: "", purpose: "", body: "", error: "" };
          render();
          ctx.container.querySelector('[data-dfield="title"]').focus();
          break;
        case "open-design": {
          const d = v.designs.find((x) => x.id === el.dataset.id);
          if (!d) return;
          ctx.designMenu = false;
          ctx.designForm = { id: d.id, title: d.title, purpose: d.purpose, body: d.body, error: "" };
          render();
          ctx.container.querySelector(".design-form").scrollIntoView({ block: "nearest" });
          break;
        }
        case "design-form-close":
          ctx.designForm = null;
          render();
          break;
        case "design-form-save": {
          const f = ctx.designForm;
          if (!can.editDesign() || !f) return;
          const title = f.title.trim();
          if (!title) {
            f.error = "제목을 입력해 주세요.";
            render();
            ctx.container.querySelector('[data-dfield="title"]').focus();
            return;
          }
          const existing = f.id && v.designs.find((x) => x.id === f.id);
          if (existing) Object.assign(existing, { title, purpose: f.purpose, body: f.body });
          else {
            const d = { id: newDesignId(), type: "text", createdAt: today(), file: null, title, purpose: f.purpose, body: f.body };
            v.designs.unshift(d); // 최신순
            if (!mainDesign(v)) v.mainDesign = d.id;
          }
          ctx.designForm = null;
          touch();
          render();
          break;
        }
        case "delete-design": {
          if (!can.editDesign()) return;
          const d = v.designs.find((x) => x.id === el.dataset.id);
          if (!d || !window.confirm(`실험 설계안 "${designTitle(d)}"을(를) 삭제할까요?`)) return;
          v.designs = v.designs.filter((x) => x !== d);
          if (v.mainDesign === d.id) v.mainDesign = v.designs.length ? v.designs[0].id : null; // 대표가 지워지면 가장 최근 것을 대표로
          if (ctx.designForm && ctx.designForm.id === d.id) ctx.designForm = null;
          touch();
          render();
          break;
        }
        case "open-exp":
          tabState().exp = letter;
          render();
          ctx.container.querySelector(".exp-section").scrollIntoView({ block: "start" });
          break;
        case "hero-img":
          ctx.hero[letter] = Number(el.dataset.index);
          render();
          break;
        case "copy-version":
          // 최종 버전의 실험 설계와 실험안을 그대로 복제해 실험안 작성 단계의 새 버전을 만든다 (투표·최종 선택·Final 은 넘기지 않는다)
          if (!ctx.canEdit || v.status !== "final") return;
          addVersion({ status: "draft", designs: copyDesigns(v.designs), mainDesign: v.mainDesign, experiments: v.experiments.map((x) => copyExp(x)) });
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
        case "add-exp":
          addExperiment();
          break;
        case "toggle-final":
          if (!can.pickFinal()) return;
          v.finalLetter = v.finalLetter === letter ? null : letter;
          touch();
          render();
          break;
        case "delete-exp": {
          if (!can.addExp()) return;
          const exp = findExp(letter);
          askDelete({
            kind: "exp",
            target: `V${v.no}-${letter}${exp.title ? ` · ${exp.title}` : ""}`,
            scope: expDeleteScope(v, exp),
            onConfirm: () => deleteExperiment(v, letter),
          });
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
