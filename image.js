// Image 화면: Feature / BYK / Gen Prompt 탭별 프롬프트 버전과 실험 관리 (프로토타입)
//
// 데이터는 메모리에만 있다. 새로고침하면 샘플 데이터로 돌아간다.
// 실제 구현에서는 아래 state 구조를 API 로 읽고 쓰면 된다 (HANDOFF.md 참고).
//
// 버전 진행 단계(status):
//   실험 설계(design) → 실험안 작성(draft) → 의견수렴중(testing) → 실험완료(done) → 최종(final)
// 다음 단계로는 각 단계의 확정 버튼으로 넘어가고, 의견수렴중·실험완료·최종에서는 '전단계로 돌아가기'로 한 단계 되돌릴 수 있다.
//
//   실험 설계    실험 설계안을 여러 개 올린다 ('+ 실험 설계안' → 파일 첨부 / 직접 작성). 목록에서 대표 설계안을 고른다
//   실험안 작성  실험안(A~J)을 추가·작성(임시저장 / 저장)·삭제. '실험안 후보 확정' → 의견수렴중
//   의견수렴중   갤러리 카드에서 투표(이유 필수). '최종 선택' → 카드 고르기 → '확정' → 실험완료 (최종안 사본 Vn-Final 생성)
//   실험완료     Vn-Final 을 다듬고 '최종 확정' → 최종
//   최종         모두 읽기 전용. '새 버전으로 사본 생성'(최종본 하나를 새 버전의 A안으로)과 '전단계로 돌아가기'만 가능
//
// 상태바에서 지나온 단계를 누르면 그 단계 화면을 볼 수 있다 (보는 단계 = view).
// 의견수렴중이 되면 실험 설계·실험안 작성은 보기 전용이 되고, 지나간 단계는 모두 보기 전용이다.
// 보기 전용으로 잠긴 단계는 상태바의 단계 이름 옆에 자물쇠 아이콘이 붙는다.
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
  // 실험 설계안 파일: html, pptx, pdf, word 만. 용량 제한 없음
  const DESIGN_EXT_RE = /\.(html?|pptx|pdf|docx?)$/i;
  const DESIGN_ACCEPT = ".html,.htm,.pptx,.pdf,.doc,.docx";
  // '전단계로 돌아가기' 확인 문구
  const BACK_MESSAGES = {
    testing: "이전 단계로 돌아가면 현재까지 진행된 투표 및 작성된 의견이 모두 초기화됩니다. 전단계로 돌아가시겠습니까?",
    done: "이전 단계로 돌아가면 현재까지 작성된 내용이 모두 초기화됩니다. 전단계로 돌아가시겠습니까?",
    final: "'실험완료' 단계로 돌아가면 최종 확정이 풀리고, 지금 최종본 내용 그대로 다시 수정할 수 있게 됩니다. 전단계로 돌아가시겠습니까?",
  };
  const UNSAVED_MESSAGE =
    "저장되지 않은 실험안이 있습니다. 페이지에서 벗어나시면 작성된 내용이 사라질 수 있습니다. 페이지에서 벗어나시겠습니까?";

  const STATUSES = [
    { key: "design", label: "실험 설계" },
    { key: "draft", label: "실험안 작성" },
    { key: "testing", label: "의견수렴중" },
    { key: "done", label: "실험완료" },
    { key: "final", label: "최종" },
  ];
  const stageIdx = (key) => STATUSES.findIndex((s) => s.key === key);

  const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- 복제 ----------
  // 이미지 url 은 원본과 같이 쓴다 (프로토타입이라 blob 을 따로 해제하지 않는다)
  // 실험안: { letter, title, purpose, format, example, images, votes, saved: "temp"(임시저장) | "saved"(저장) }
  const cloneExp = (e) => ({ ...e, images: e.images.map((img) => ({ ...img })), votes: e.votes.map((x) => ({ ...x })) });
  const copyExp = (e, letter = e.letter) => ({ ...cloneExp(e), letter, votes: [], saved: "saved" });
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
      saved: "saved",
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

    const sampleText = `<!doctype html><meta charset="utf-8"><title>[샘플] ${tabLabel} 실험 설계안</title><p>[샘플] ${tabLabel} 실험 설계안 파일입니다.</p>`;
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
      file: { name: `[샘플] ${tabLabel} 실험 설계안.html`, url: "data:text/html;charset=utf-8," + encodeURIComponent(sampleText) },
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
        finalLetter: null, // 의견수렴중: 아직 최종안을 고르지 않았다
        final: null,
      },
    ];
  }

  // tabKey → { versions, selected: 버전 index | null(최신), view: 보고 있는 단계 | null(진행 단계), exp: 열어 본 실험 letter | null(전체보기) }
  const state = Object.fromEntries(
    TABS.map((t, i) => [t.key, { versions: seed(t.label, 140 + i * 70), selected: null, view: null, exp: null }])
  );

  // ---------- 화면 ----------
  // ctx: { container, tab, canEdit, user, openModal, closeModal } + 화면에만 있는 임시 상태
  //   editor      실험안 작성 페이지 { isNew, dirty, data(작업 사본), error, note }
  //   picking     의견수렴중 '최종 선택' 모드 { letter | null }
  //   voteDraft   투표 이유 입력 { letter, text, error }
  //   designMenu / designForm / designError   실험 설계안 추가 메뉴 / 직접 작성 폼 / 파일 형식 오류
  let ctx = null;

  const tabState = () => state[ctx.tab];
  const currentIndex = () => tabState().selected ?? tabState().versions.length - 1;
  const currentVersion = () => tabState().versions[currentIndex()];
  // 보고 있는 단계. 진행 단계보다 뒤는 볼 수 없다
  const viewOf = (v) => {
    const view = tabState().view;
    return view && stageIdx(view) <= stageIdx(v.status) ? view : v.status;
  };
  const findExp = (letter) => {
    if (letter === FINAL) return currentVersion().final;
    if (ctx.editor) return ctx.editor.data;
    return currentVersion().experiments.find((e) => e.letter === letter);
  };

  // 단계별 권한. 지나간 단계는 보기 전용이고, 의견수렴중부터는 실험 설계·실험안 작성도 보기 전용이다. (Viewer 는 투표만 가능)
  const at = (view, ...statuses) => {
    const v = currentVersion();
    return !!v && viewOf(v) === view && statuses.includes(v.status);
  };
  const can = {
    editDesign: () => ctx.canEdit && at("design", "design", "draft"),
    editDraft: () => ctx.canEdit && at("draft", "draft"),
    vote: () => !!ctx.user && at("testing", "testing"),
    pickFinal: () => ctx.canEdit && at("testing", "testing"),
    editFinal: () => ctx.canEdit && at("done", "done"),
    // 전단계로 돌아가기: 진행 중인 단계(의견수렴중·실험완료·최종) 화면에서만
    goBack: () => ctx.canEdit && (at("testing", "testing") || at("done", "done") || at("final", "final")),
  };
  // 보기 전용으로 잠긴 단계인지 (진행 단계 기준. 어떤 단계를 보고 있든 같다)
  //   실험 설계·실험안 작성: 의견수렴중부터 / 의견수렴중: 실험완료부터 / 실험완료·최종: 최종일 때
  const LOCK_FROM = { design: "testing", draft: "testing", testing: "done", done: "final", final: "final" };
  const isLocked = (v, key) => stageIdx(v.status) >= stageIdx(LOCK_FROM[key]);
  const isEditing = (e) => !!ctx.editor && ctx.editor.data === e;
  const canEditCard = (e) => (e.letter === FINAL ? can.editFinal() : isEditing(e));
  const hasUnsaved = () => !!(ctx && ctx.editor && ctx.editor.dirty);

  const TRASH =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>';
  const CHEVRON =
    '<svg class="select-wrap__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>';
  const LOCK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>';

  const VIEW_DEFAULTS = {
    imgError: null,
    sectionError: null,
    voteDraft: null,
    hero: {},
    editor: null,
    picking: null,
    designMenu: false,
    designForm: null,
    designError: null,
  };

  // 버전·탭·단계가 바뀔 때 화면에만 있는 임시 상태를 지운다
  function resetView() {
    Object.assign(ctx, VIEW_DEFAULTS, { hero: {} });
  }

  function mount(container, options) {
    const first = !ctx || ctx.container !== container;
    if (ctx && ctx.tab !== options.tab) resetView();
    ctx = { ...VIEW_DEFAULTS, hero: {}, ...ctx, ...options, container };
    if (first) bind(container);
    render();
  }

  // ---------- 확인 창 ----------
  const confirmModal = document.getElementById("confirm-modal");
  const confirmOk = document.getElementById("confirm-ok");
  let pendingConfirm = null;

  function confirmBox(message, onOk, { okLabel = "확인", danger = false } = {}) {
    document.getElementById("confirm-message").textContent = message;
    confirmOk.textContent = okLabel;
    confirmOk.className = `btn ${danger ? "btn--danger" : "btn--primary"}`;
    pendingConfirm = onOk;
    ctx.openModal(confirmModal);
  }

  confirmOk.addEventListener("click", () => {
    const run = pendingConfirm;
    pendingConfirm = null;
    ctx.closeModal(confirmModal);
    if (run) run();
  });

  // 저장하지 않은 실험안이 있으면 경고하고, 벗어나겠다고 하면 작업 내용을 버린 뒤 proceed 를 실행한다
  function guardLeave(proceed) {
    if (!hasUnsaved()) return proceed();
    confirmBox(
      UNSAVED_MESSAGE,
      () => {
        ctx.editor = null;
        tabState().exp = null;
        proceed();
      },
      { okLabel: "벗어나기", danger: true }
    );
  }

  // 새로고침·창 닫기: 브라우저 기본 경고창이 뜬다 (문구는 브라우저가 정한다)
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsaved()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // ---------- 공통 조각 ----------
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

  // 상태바: 지나온 단계(✓)와 진행 중인 단계는 눌러서 볼 수 있다. 다음 단계로는 각 단계의 확정 버튼으로만 넘어간다.
  // (예외: 실험 설계 → 실험안 작성은 상태바에서 바로 넘어간다)
  function statusRow(v) {
    const sIdx = stageIdx(v.status);
    const view = viewOf(v);
    const steps = STATUSES.map((s, i) => {
      const viewing = s.key === view;
      const reachable = i <= sIdx || (v.status === "design" && s.key === "draft" && ctx.canEdit);
      const cls = ["status-step", `status-step--${s.key}`, viewing ? "is-active" : "", i < sIdx ? "is-done" : "", i === sIdx ? "is-current" : ""]
        .filter(Boolean)
        .join(" ");
      return `<button type="button" class="${cls}" data-action="go-stage" data-status="${s.key}" aria-current="${viewing ? "step" : "false"}" ${reachable ? "" : "disabled"}>
        <span class="status-step__no">${i < sIdx ? "✓" : i + 1}</span>${s.label}${
          isLocked(v, s.key) ? `<span class="status-step__lock" role="img" aria-label="보기 전용" title="보기 전용">${LOCK}</span>` : ""
        }</button>`;
    }).join("");
    return `
      <div class="status-row">
        <span class="status-row__label">상태</span>
        <div class="status-steps" aria-label="V${v.no} 상태">${steps}</div>
        ${can.goBack() ? `<button type="button" class="btn btn--outline btn--sm status-back" data-action="go-back">← 전단계로 돌아가기</button>` : ""}
      </div>`;
  }

  // ---------- 실험 설계안 ----------
  // '+ 실험 설계안' 버튼(파일 첨부 / 직접 작성) + 목록(최신순, 대표 선택). 의견수렴중부터는 목록만 보기 전용으로 나온다.
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
    const editable = can.editDesign();
    const menu = ctx.designMenu
      ? `<div class="add-menu" role="menu">
           <label class="add-menu__item" role="menuitem">
             <input type="file" hidden accept="${DESIGN_ACCEPT}" data-action="add-design-file" />
             <b>파일 첨부</b><span>html, pptx, pdf, word 파일을 올립니다</span>
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
               </div>
               <p class="field__error design-error">${esc(ctx.designError || "")}</p>`
            : ""
        }
        ${designForm(editable)}
        ${designList(v, editable)}
      </div>`;
  }

  // ---------- 투표 ----------
  // 의견수렴중 화면에서만 나온다. 의견수렴이 마감된 뒤에는 기록만 보인다.
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

  function voteSummary(v) {
    const ranked = v.experiments.filter((e) => e.votes.length).sort((a, b) => b.votes.length - a.votes.length);
    const top = ranked.length ? ranked[0].votes.length : 0;
    const chips = ranked
      .map((e) => `<span class="vote-chip${e.votes.length === top ? " is-top" : ""}">V${v.no}-${e.letter} <b>${e.votes.length}</b>표</span>`)
      .join("");
    return `<div class="vote-summary"><span class="vote-summary__label">투표 현황</span>${chips || `<span class="muted-sm">아직 투표가 없습니다.</span>`}</div>`;
  }

  // ---------- 실험안 카드 ----------
  // 실험안 하나의 전체 내용. 실험안 작성 페이지(편집), 보기 전용 상세, Vn-Final 에 함께 쓴다.
  function experimentCard(v, e, view) {
    const isFinalCopy = e.letter === FINAL;
    const editing = isEditing(e);
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

    const badges = [];
    if (isFinalCopy) {
      badges.push(`<span class="badge-source">V${v.no}-${e.source} 복제본</span>`);
      if (v.status === "final") badges.push(`<span class="badge-final">✔ 최종 확정</span>`);
    } else {
      if (isPicked) badges.push(`<span class="badge-final">★ 최종 선택</span>`);
      if (editing && ctx.editor.isNew) badges.push(`<span class="badge-new">새 실험안</span>`);
      else if (e.saved === "temp") badges.push(`<span class="badge-temp">임시 저장</span>`);
    }

    const actions = [];
    if (editing && !ctx.editor.isNew)
      actions.push(
        `<button type="button" class="btn btn--danger-outline btn--xs" data-action="delete-exp" data-exp="${e.letter}">${TRASH}${id} 실험안 삭제</button>`
      );
    if (isFinalCopy && can.editFinal())
      actions.push(`<button type="button" class="btn btn--primary btn--xs" data-action="confirm-final">최종 확정</button>`);

    const footer = editing
      ? `<footer class="exp__footer">
           <p class="exp__note${ctx.editor.error ? " is-error" : ""}">${esc(ctx.editor.error || ctx.editor.note || (ctx.editor.dirty ? "저장되지 않은 변경 사항이 있습니다." : ""))}</p>
           <button type="button" class="btn btn--outline btn--sm" data-action="save-temp">임시저장</button>
           <button type="button" class="btn btn--primary btn--sm" data-action="save-exp">저장</button>
         </footer>`
      : "";

    const cls = ["exp", isFinalCopy ? "exp--final-copy" : "", isPicked ? "is-final" : "", editable ? "" : "is-locked"].filter(Boolean).join(" ");

    return `
      <article class="${cls}" data-exp-card="${e.letter}">
        <header class="exp__head">
          <span class="exp__id">${id}</span>
          ${badges.join("")}
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
        ${!isFinalCopy && view === "testing" ? voteSection(e) : ""}
        ${footer}
      </article>`;
  }

  // 전체보기 갤러리 카드: 이미지를 가장 크게, 그 아래 제목·개선 목적. 의견수렴중에서는 투표도 나온다.
  // 카드를 누르면 그 실험안의 전체 내용이 열린다. '최종 선택' 모드에서는 카드를 누르면 최종안으로 고른다.
  function galleryCard(v, e, view) {
    const id = `V${v.no}-${e.letter}`;
    const picking = view === "testing" && ctx.picking;
    const chosen = picking && ctx.picking.letter === e.letter;
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
    const cls = ["gcard", isPicked ? "is-final" : "", picking ? "is-pickable" : "", chosen ? "is-chosen" : ""].filter(Boolean).join(" ");
    const label = picking ? `${id}을(를) 최종안으로 선택` : `${id} 전체 내용 보기`;

    return `
      <article class="${cls}" data-exp-card="${e.letter}" data-action="open-exp" data-exp="${e.letter}" tabindex="0" aria-label="${label}" ${picking ? `aria-pressed="${!!chosen}"` : ""}>
        <div class="gcard__hero">
          ${hero ? `<img src="${esc(hero.url)}" alt="${esc(hero.name)}" />` : `<span class="gcard__noimg">등록된 이미지가 없습니다</span>`}
          <div class="gcard__tags">
            <span class="exp__id">${id}</span>
            ${isPicked ? `<span class="badge-final">★ 최종 선택</span>` : ""}
            ${e.saved === "temp" ? `<span class="badge-temp">임시 저장</span>` : ""}
          </div>
          ${picking ? `<span class="gcard__check" aria-hidden="true">${chosen ? "✓" : ""}</span>` : ""}
          ${count > 1 ? `<span class="gcard__count">${hi + 1} / ${count}</span>` : ""}
        </div>
        ${strip}
        <div class="gcard__body">
          <h3 class="gcard__title">${e.title ? esc(e.title) : `<span class="gcard__empty">제목 없음</span>`}</h3>
          <p class="gcard__purpose">${e.purpose ? esc(e.purpose) : `<span class="gcard__empty">개선 목적이 없습니다.</span>`}</p>
          <span class="gcard__more">${picking ? (chosen ? "최종안으로 선택됨" : "눌러서 최종안으로 선택") : "전체 내용 보기 ›"}</span>
        </div>
        ${view === "testing" ? voteSection(e, true) : ""}
      </article>`;
  }

  // ---------- 그리기 ----------
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
    const view = viewOf(v);

    const options = versions
      .map((ver, i) => `<option value="${i}" ${i === idx ? "selected" : ""}>V${ver.no}${i === latest ? " (현재)" : ""}</option>`)
      .reverse()
      .join("");
    const addVersionOption = ctx.canEdit ? `<option value="${NEW}">＋ 새 버전 추가</option>` : "";

    // 보는 단계별 실험안
    //   실험 설계               없음 (실험안 작성 전 단계)
    //   실험안 작성·의견수렴중  전체보기(갤러리 카드) ↔ 카드를 눌러 들어간 실험안 하나
    //   실험완료·최종           Vn-Final 하나만
    const inDesign = view === "design";
    const finalOnly = view === "done" || view === "final";
    const editing = view === "draft" && ctx.editor;
    const cards = inDesign ? [] : finalOnly ? [v.final].filter(Boolean) : v.experiments;
    const filter = !finalOnly && !editing && cards.some((e) => e.letter === tabState().exp) ? tabState().exp : null;
    const shown = editing ? [ctx.editor.data] : filter ? cards.filter((e) => e.letter === filter) : cards;
    const gallery = !finalOnly && !editing && !filter;
    const picking = view === "testing" && ctx.picking;

    const headAction = ctx.canEdit
      ? `<div class="version-actions">
           ${v.status === "final" ? `<button type="button" class="btn btn--primary btn--sm" data-action="copy-version">새 버전으로 사본 생성</button>` : ""}
           <button type="button" class="btn btn--danger-outline btn--sm" data-action="delete-version" title="V${v.no} 버전과 그 안의 실험안을 모두 삭제합니다">${TRASH}V${v.no} 버전 전체 삭제</button>
         </div>`
      : "";

    // 전체보기 오른쪽 버튼
    let sectionActions = "";
    if (gallery && can.editDraft())
      sectionActions = `
        <button type="button" class="btn btn--outline btn--sm" data-action="add-exp" ${n >= LETTERS.length ? "disabled" : ""}>+ 실험안 추가</button>
        <button type="button" class="btn btn--primary btn--sm" data-action="confirm-candidates">실험안 후보 확정</button>`;
    else if (gallery && can.pickFinal())
      sectionActions = picking
        ? `<button type="button" class="btn btn--outline btn--sm" data-action="pick-cancel">취소</button>
           <button type="button" class="btn btn--primary btn--sm" data-action="pick-confirm" ${ctx.picking.letter ? "" : "disabled"}>확정</button>`
        : `<button type="button" class="btn btn--primary btn--sm" data-action="pick-start" ${n ? "" : "disabled"}>최종 선택</button>`;

    const emptyText = can.editDraft() ? "아직 실험안이 없습니다. '+ 실험안 추가'로 실험안을 만들어 주세요." : "실험안이 없습니다.";

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
        ${inDesign ? designBlock(v) : ""}
      </section>

      <section class="exp-section" ${inDesign ? "hidden" : ""}>
        <div class="exp-section__head">
          <div class="exp-section__title">
            ${editing || filter ? `<button type="button" class="btn btn--soft btn--sm" data-action="show-all-exp">← 전체보기</button>` : ""}
            <h2>${finalOnly ? "최종안" : `실험안 <span class="counter">${n}/${LETTERS.length}</span>`}</h2>
          </div>
          <div class="exp-section__actions">${sectionActions}</div>
        </div>
        ${ctx.sectionError ? `<p class="field__error section-error">${esc(ctx.sectionError)}</p>` : ""}
        ${picking && gallery ? `<p class="pick-guide">최종안으로 확정할 실험안 카드를 누른 뒤 '확정'을 눌러 주세요.</p>` : ""}
        ${view === "testing" ? voteSummary(v) : ""}
        ${shown.length === 0 ? `<div class="empty-state">${emptyText}</div>` : ""}
        <div class="${gallery ? "exp-gallery" : "exp-list"}">${shown.map((e) => (gallery ? galleryCard(v, e, view) : experimentCard(v, e, view))).join("")}</div>
      </section>`;

    ctx.imgError = null;
    ctx.sectionError = null;
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

  // 실험안 내용이 바뀌었을 때: 작성 페이지면 '저장 필요' 표시만 하고, Vn-Final 이면 바로 반영한다
  function markChanged(e) {
    if (!isEditing(e)) return touch();
    const ed = ctx.editor;
    ed.dirty = true;
    ed.error = "";
    ed.note = "";
    const note = ctx.container.querySelector(".exp__note");
    if (note) {
      note.textContent = "저장되지 않은 변경 사항이 있습니다.";
      note.classList.remove("is-error");
    }
  }

  // ---------- 버전 ----------
  function selectVersion(index) {
    const ts = tabState();
    ts.selected = index === null || index === ts.versions.length - 1 ? null : index;
    ts.view = null;
    ts.exp = null;
    resetView();
    render();
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
    selectVersion(null);
    window.scrollTo(0, 0);
  }

  // 버전 드롭다운 맨 위 "새 버전 추가"
  function newVersion() {
    if (!ctx.canEdit) return render();
    addVersion({ designs: [], mainDesign: null, experiments: [] });
  }

  // ---------- 단계 이동 ----------
  // 상태바: 지나온 단계는 보기만 바꾼다. 실험 설계 → 실험안 작성만 여기서 진행 단계를 넘긴다.
  function goStage(v, key) {
    const ts = tabState();
    if (stageIdx(key) <= stageIdx(v.status)) ts.view = key === v.status ? null : key;
    else if (v.status === "design" && key === "draft" && ctx.canEdit) advance(v, "draft");
    else return;
    ts.exp = null;
    resetView();
    render();
  }

  function advance(v, next) {
    v.status = next;
    tabState().view = null;
    tabState().exp = null;
    resetView();
    touch();
  }

  // ---------- 실험안 작성 ----------
  // "+ 실험안 추가": 작성 페이지를 연다. 임시저장이나 저장을 해야 전체보기에 나온다.
  function addExperiment() {
    const v = currentVersion();
    const next = LETTERS[v.experiments.length]; // 실험안은 항상 A 부터 빈틈없이 이어진다
    if (!can.editDraft() || !next) return;
    ctx.editor = {
      isNew: true,
      dirty: false,
      error: "",
      note: "",
      data: { letter: next, title: "", purpose: "", format: "", example: "", images: [], votes: [], saved: null },
    };
    render();
    ctx.container.querySelector(".exp-section").scrollIntoView({ block: "start" });
    ctx.container.querySelector('[data-exp-card] [data-field="title"]').focus({ preventScroll: true });
  }

  function openEditor(exp) {
    ctx.editor = { isNew: false, dirty: false, error: "", note: "", data: cloneExp(exp) };
    render();
    ctx.container.querySelector(".exp-section").scrollIntoView({ block: "start" });
  }

  // mode: "temp"(임시저장: 작성 페이지에 머문다) | "saved"(저장: 전체보기로 돌아간다)
  function saveEditor(mode) {
    const ed = ctx.editor;
    if (!ed || !can.editDraft()) return;
    const v = currentVersion();
    const d = ed.data;
    if (mode === "saved" && !d.title.trim()) {
      ed.error = "저장하려면 제목을 입력해 주세요. 아직 작성 중이면 임시저장을 눌러 주세요.";
      render();
      ctx.container.querySelector('[data-exp-card] [data-field="title"]').focus();
      return;
    }
    d.saved = mode;
    const snapshot = cloneExp(d);
    const pos = v.experiments.findIndex((x) => x.letter === d.letter);
    if (pos >= 0) v.experiments[pos] = snapshot;
    else v.experiments.push(snapshot);
    touch();
    if (mode === "saved") {
      ctx.editor = null;
      tabState().exp = null;
    } else {
      Object.assign(ed, { isNew: false, dirty: false, error: "", note: "임시저장되었습니다." });
    }
    render();
  }

  // "실험안 후보 확정": 의견수렴중으로 넘어가고, 실험 설계·실험안 작성은 보기 전용이 된다
  function confirmCandidates(v) {
    if (!can.editDraft()) return;
    const temps = v.experiments.filter((e) => e.saved === "temp").map((e) => `V${v.no}-${e.letter}`);
    if (!v.experiments.length) ctx.sectionError = "실험안이 없습니다. '+ 실험안 추가'로 실험안을 먼저 만들어 주세요.";
    else if (temps.length) ctx.sectionError = `임시 저장 상태인 실험안이 있습니다 (${temps.join(", ")}). 저장한 뒤 확정해 주세요.`;
    if (ctx.sectionError) return render();
    confirmBox(
      `실험안 후보 ${v.experiments.length}개를 확정할까요?\n확정하면 '의견수렴중' 단계로 넘어가고, 실험 설계와 실험안은 더 이상 추가·수정할 수 없습니다.`,
      () => {
        advance(v, "testing");
        render();
      },
      { okLabel: "후보 확정" }
    );
  }

  // 의견수렴중 '최종 선택' → 카드 고르기 → '확정': 의견수렴을 마감하고 최종안의 사본(Vn-Final)을 실험완료 단계로 넘긴다
  function confirmPick(v) {
    const picked = ctx.picking && v.experiments.find((e) => e.letter === ctx.picking.letter);
    if (!can.pickFinal() || !picked) return;
    confirmBox(
      `V${v.no}-${picked.letter}을(를) 최종안으로 확정할까요?\n확정하면 의견수렴이 마감되어 더 이상 투표하거나 최종안을 바꿀 수 없고, 사본(V${v.no}-Final)이 '실험완료' 단계로 넘어갑니다.`,
      () => {
        v.finalLetter = picked.letter;
        v.final = makeFinal(picked);
        advance(v, "done");
        render();
        window.scrollTo(0, 0);
      },
      { okLabel: "최종안 확정" }
    );
  }

  // '전단계로 돌아가기': 진행 단계를 한 단계 되돌린다
  //   의견수렴중 → 실험안 작성  투표·의견을 모두 지운다. 실험안은 다시 추가·수정·삭제할 수 있다
  //   실험완료 → 의견수렴중     Vn-Final(실험 완료본)과 최종 선택을 지운다. 투표는 그대로 두고 다시 투표·최종 선택을 할 수 있다
  //   최종 → 실험완료           최종본 내용 그대로 두고 최종 확정만 푼다
  function goBack(v) {
    if (!can.goBack()) return;
    const from = v.status;
    confirmBox(
      BACK_MESSAGES[from],
      () => {
        if (from === "testing") {
          v.experiments.forEach((e) => (e.votes = []));
          advance(v, "draft");
        } else if (from === "done") {
          v.final = null;
          v.finalLetter = null;
          advance(v, "testing");
        } else {
          v.confirmedAt = null;
          advance(v, "done");
        }
        render();
        window.scrollTo(0, 0);
      },
      { okLabel: "전단계로 돌아가기", danger: from !== "final" }
    );
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
    const next = v.experiments[v.experiments.findIndex((x) => x.letter === exp.letter) + 1];
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
    selectVersion(null);
    window.scrollTo(0, 0);
  }

  // 실험안을 지우고 남은 실험안을 A 부터 다시 매긴다 (실험안 작성 단계에서만 지울 수 있다)
  function deleteExperiment(v, letter) {
    v.experiments = v.experiments.filter((x) => x.letter !== letter);
    v.experiments.forEach((x, i) => (x.letter = LETTERS[i]));
    tabState().exp = null;
    resetView();
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
      markChanged(target);
      const counter = el.closest(".vfield").querySelector(".counter");
      if (counter && el.maxLength > 0) counter.textContent = `${el.value.length}/${el.maxLength}`;
      if (el.tagName === "TEXTAREA") autoGrow(el);
    });

    // 갤러리 카드는 Enter·Space 로도 열 수 있다
    container.addEventListener("keydown", (e) => {
      if ((e.key !== "Enter" && e.key !== " ") || !e.target.matches('[data-action="open-exp"]')) return;
      e.preventDefault();
      e.target.click();
    });

    container.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.action === "select-version") {
        const value = el.value;
        render(); // 드롭다운 표시를 일단 되돌린다 (경고 창에서 취소할 수 있으므로)
        guardLeave(() => (value === NEW ? newVersion() : selectVersion(Number(value))));
      } else if (el.dataset.action === "add-img") {
        addImages(el.dataset.exp, [...el.files]);
      } else if (el.dataset.action === "add-design-file") {
        const f = el.files[0];
        if (!f || !can.editDesign()) return;
        ctx.designMenu = false;
        if (!DESIGN_EXT_RE.test(f.name)) {
          ctx.designError = "html, pptx, pdf, word(doc, docx) 파일만 올릴 수 있습니다.";
          return render();
        }
        const cv = currentVersion();
        const d = { id: newDesignId(), type: "file", createdAt: today(), file: { name: f.name, url: URL.createObjectURL(f) } };
        cv.designs.unshift(d); // 최신순
        if (!mainDesign(cv)) cv.mainDesign = d.id;
        ctx.designError = null;
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
        // ----- 버전 -----
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
        case "copy-version":
          // 최종본(Vn-Final) 하나만 새 버전의 A안으로 복제한다. 이전 버전의 실험안 A~J 와 투표는 넘기지 않는다.
          // 실험 설계안은 그대로 복제하고, 새 버전은 실험안 작성 단계에서 시작한다.
          if (!ctx.canEdit || v.status !== "final" || !v.final) return;
          {
            const { source, ...first } = copyExp(v.final, LETTERS[0]);
            addVersion({ status: "draft", designs: copyDesigns(v.designs), mainDesign: v.mainDesign, experiments: [first] });
          }
          break;
        case "go-back":
          goBack(v);
          break;
        case "go-stage":
          guardLeave(() => goStage(v, el.dataset.status));
          break;

        // ----- 실험 설계안 -----
        case "design-menu":
          if (!can.editDesign()) return;
          ctx.designMenu = !ctx.designMenu;
          render();
          break;
        case "design-write":
          if (!can.editDesign()) return;
          ctx.designMenu = false;
          ctx.designError = null;
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
          if (!d) return;
          confirmBox(
            "정말 삭제하시겠습니까?",
            () => {
              v.designs = v.designs.filter((x) => x !== d);
              if (v.mainDesign === d.id) v.mainDesign = v.designs.length ? v.designs[0].id : null; // 대표가 지워지면 가장 최근 것을 대표로
              if (ctx.designForm && ctx.designForm.id === d.id) ctx.designForm = null;
              touch();
              render();
            },
            { okLabel: "삭제", danger: true }
          );
          break;
        }

        // ----- 실험안 -----
        case "open-exp": {
          const exp = v.experiments.find((x) => x.letter === letter);
          if (!exp) return;
          if (ctx.picking && can.pickFinal()) {
            ctx.picking.letter = letter; // '최종 선택' 모드: 카드를 눌러 최종안을 고른다
            return render();
          }
          if (can.editDraft()) return openEditor(exp);
          tabState().exp = letter;
          render();
          ctx.container.querySelector(".exp-section").scrollIntoView({ block: "start" });
          break;
        }
        case "show-all-exp":
          guardLeave(() => {
            ctx.editor = null;
            tabState().exp = null;
            render();
          });
          break;
        case "hero-img":
          ctx.hero[letter] = Number(el.dataset.index);
          render();
          break;
        case "add-exp":
          addExperiment();
          break;
        case "save-temp":
          saveEditor("temp");
          break;
        case "save-exp":
          saveEditor("saved");
          break;
        case "confirm-candidates":
          confirmCandidates(v);
          break;
        case "delete-exp": {
          if (!can.editDraft() || !ctx.editor || ctx.editor.isNew) return;
          const exp = ctx.editor.data;
          askDelete({
            kind: "exp",
            target: `V${v.no}-${exp.letter}${exp.title ? ` · ${exp.title}` : ""}`,
            scope: expDeleteScope(v, exp),
            onConfirm: () => deleteExperiment(v, exp.letter),
          });
          break;
        }
        case "remove-img": {
          const exp = findExp(letter);
          if (!canEditCard(exp)) return;
          exp.images.splice(Number(el.dataset.index), 1);
          markChanged(exp);
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

        // ----- 의견수렴중: 투표, 최종 선택 -----
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
          confirmBox(
            `V${v.no}-${letter} 투표를 취소할까요? 남긴 의견도 함께 지워집니다.`,
            () => {
              const exp = findExp(letter);
              exp.votes = exp.votes.filter((x) => x.userId !== ctx.user.id);
              render();
            },
            { okLabel: "투표 취소", danger: true }
          );
          break;
        }
        case "pick-start":
          if (!can.pickFinal()) return;
          ctx.picking = { letter: null };
          ctx.voteDraft = null;
          render();
          break;
        case "pick-cancel":
          ctx.picking = null;
          render();
          break;
        case "pick-confirm":
          confirmPick(v);
          break;

        // ----- 실험완료 -----
        case "confirm-final":
          if (!can.editFinal()) return;
          confirmBox(
            `V${v.no}-Final을 최종으로 확정할까요?\n확정하면 V${v.no}의 모든 내용을 더 이상 고칠 수 없습니다.`,
            () => {
              v.confirmedAt = today();
              advance(v, "final");
              render();
              window.scrollTo(0, 0);
            },
            { okLabel: "최종 확정" }
          );
          break;
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
    if (accepted.length) markChanged(exp);
    ctx.imgError = messages.length ? { letter, message: messages.join(" ") } : null;
    render();
  }

  // hasUnsaved / guardLeave: 메뉴 이동·탭 이동·로그아웃 때 app.js 가 저장 안 된 실험안이 있는지 확인하는 데 쓴다
  window.ImagePage = { TABS, mount, hasUnsaved, guardLeave };
})();
