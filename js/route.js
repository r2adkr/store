/**
 * route.js - 사이트 내 길안내 (API 키 없이 OSM 기반 공개 라우팅 서버 사용)
 * 도보/자동차 경로를 지도에 그리고, 구간별 안내를 카드에 표시한다.
 * 서버 연결에 실패하면 직선 거리로 대체 표시한다.
 */
import { MapController } from "./map.js";
import { LocationManager } from "./location.js";

// URL 의 'driving' 은 형식상 값이고, 실제 이동수단은 routed-foot / routed-car 경로가 결정한다.
const ENDPOINT = {
  foot: "https://routing.openstreetmap.de/routed-foot/route/v1/driving/",
  car: "https://routing.openstreetmap.de/routed-car/route/v1/driving/"
};

const TURN_TEXT = {
  "left": "좌회전",
  "right": "우회전",
  "slight left": "왼쪽 방향",
  "slight right": "오른쪽 방향",
  "sharp left": "크게 좌회전",
  "sharp right": "크게 우회전",
  "uturn": "유턴",
  "straight": "직진"
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtDist = (m) => LocationManager.formatDistance(m);

const fmtTime = (sec) => {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간 ${min % 60}분`;
};

function stepText(step) {
  const { type, modifier } = step.maneuver;
  const road = step.name ? ` · ${step.name}` : "";
  if (type === "depart") return `출발${road}`;
  if (type === "arrive") return "목적지 도착";
  if (type === "roundabout" || type === "rotary") return `회전교차로 진입${road}`;
  return `${TURN_TEXT[modifier] || "직진"}${road}`;
}

export const RouteManager = {
  card: null,
  store: null,
  mode: "foot",
  ctrl: null,
  state: { status: "idle" },
  showSteps: false,
  opts: {},

  init(opts = {}) {
    this.opts = opts;
    this.card = document.getElementById("route-card");
    this.showSteps = window.innerWidth >= 1024; // 모바일은 요약만, 데스크톱은 단계까지 펼침
    if (!this.card) return;

    this.card.addEventListener("click", (e) => {
      const el = e.target.closest("[data-route-action]");
      if (!el) return;
      const action = el.dataset.routeAction;
      if (action === "close") this.stop();
      else if (action === "mode") this.start(this.store, el.dataset.mode);
      else if (action === "steps") {
        this.showSteps = !this.showSteps;
        this.render();
      }
    });
  },

  async start(store, mode = this.mode) {
    if (!store || !this.card) return;
    this.ctrl?.abort();
    const ctrl = (this.ctrl = new AbortController());

    this.store = store;
    this.mode = mode;
    this.state = { status: "loading" };
    MapController.closePopup();
    MapController.clearRoute();
    this.card.classList.remove("hidden");
    this.render();
    if (this.opts.onStart) this.opts.onStart();

    const origin = this.opts.ensureOrigin ? await this.opts.ensureOrigin() : LocationManager.currentLocation;
    if (this.ctrl !== ctrl) return;
    if (!origin) {
      this.state = { status: "error", message: "출발 위치를 확인할 수 없어요. '거점 체험'에서 출발지를 선택해 주세요." };
      this.render();
      return;
    }

    const url = `${ENDPOINT[mode]}${origin.lng},${origin.lat};${store.lng},${store.lat}?overview=full&geometries=geojson&steps=true`;
    const timer = setTimeout(() => ctrl.abort(), 9000);

    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes || !data.routes.length) throw new Error(data.code || "no route");

      const route = data.routes[0];
      const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const steps = (route.legs[0]?.steps || [])
        .filter((s) => s.maneuver.type === "arrive" || s.distance > 0)
        .map((s) => ({ text: stepText(s), distance: s.maneuver.type === "arrive" ? 0 : s.distance }));

      this.state = { status: "ok", origin, distance: route.distance, duration: route.duration, steps };
      MapController.showRoute(latlngs, [store.lat, store.lng]);
    } catch (err) {
      if (this.ctrl !== ctrl) return; // 다른 요청/닫기로 대체된 경우
      console.warn("Route request failed:", err);
      const meters = LocationManager.calculateDistance(origin.lat, origin.lng, store.lat, store.lng);
      this.state = { status: "fallback", origin, distance: meters };
      MapController.showRoute([[origin.lat, origin.lng], [store.lat, store.lng]], [store.lat, store.lng], true);
    } finally {
      clearTimeout(timer);
    }
    if (this.ctrl === ctrl) this.render();
  },

  stop() {
    if (this.ctrl) this.ctrl.abort();
    this.ctrl = null;
    this.store = null;
    this.state = { status: "idle" };
    MapController.clearRoute();
    if (this.card) this.card.classList.add("hidden");
  },

  render() {
    const st = this.store;
    if (!st || !this.card) return;
    const s = this.state;

    const chip = (m, label) => `
      <button data-route-action="mode" data-mode="${m}"
        class="px-3 py-1.5 rounded-full text-xs font-black transition-colors ${this.mode === m ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}">${label}</button>`;

    let summary = "";
    let steps = "";
    let stepsBtn = "";

    if (s.status === "loading") {
      summary = `<p class="text-sm font-bold text-zinc-500 py-1">경로를 찾는 중…</p>`;
    } else if (s.status === "error") {
      summary = `<p class="text-sm font-bold text-red-600 leading-snug py-1">${esc(s.message)}</p>`;
    } else {
      const rough = s.status === "fallback";
      summary = `
        <p class="text-[11px] font-bold text-zinc-500 mb-0.5">출발 · ${esc(s.origin.name || "내 위치")}</p>
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-black text-blue-600">${rough ? `직선 ${fmtDist(s.distance)}` : fmtTime(s.duration)}</span>
          ${rough ? "" : `<span class="text-sm font-bold text-zinc-500">${fmtDist(s.distance)}</span>`}
        </div>
        ${rough ? `<p class="text-xs font-bold text-amber-600 mt-1 leading-snug">경로 서버에 연결하지 못해 직선 거리만 표시했어요.</p>` : ""}`;

      if (!rough && s.steps.length) {
        stepsBtn = `<button data-route-action="steps" class="text-xs font-black text-zinc-600 hover:text-zinc-950 px-2 py-1.5 rounded-lg hover:bg-zinc-100">${this.showSteps ? "단계 접기" : "단계 보기"}</button>`;
        if (this.showSteps) {
          steps = `
            <ol class="mt-3 max-h-[30vh] lg:max-h-[36vh] overflow-y-auto border-t border-zinc-200">
              ${s.steps.map((p, i) => `
                <li class="flex items-start gap-2.5 py-2 border-b border-zinc-100 last:border-0">
                  <span class="w-5 h-5 shrink-0 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center mt-px">${i + 1}</span>
                  <span class="flex-1 text-[13px] font-semibold text-zinc-800 leading-snug break-keep">${esc(p.text)}</span>
                  ${p.distance ? `<span class="text-xs font-bold text-zinc-500 shrink-0">${fmtDist(p.distance)}</span>` : ""}
                </li>`).join("")}
            </ol>`;
        }
      }
    }

    const kakao = `https://map.kakao.com/link/to/${encodeURIComponent(st.n)},${st.lat},${st.lng}`;

    this.card.innerHTML = `
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="min-w-0">
          <p class="text-[11px] font-black text-zinc-500">길안내 · 도착지</p>
          <h3 class="font-black text-base text-zinc-950 leading-snug truncate">${esc(st.n)}</h3>
          <p class="text-xs font-semibold text-zinc-600 leading-snug break-keep">${esc(st.ra || st.ja)}</p>
        </div>
        <button data-route-action="close" class="p-1.5 -mr-1 rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 shrink-0" title="길안내 닫기">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-1.5">${chip("foot", "도보")}${chip("car", "자동차")}</div>
        ${stepsBtn}
      </div>
      ${summary}
      ${steps}
      <a href="${kakao}" target="_blank" rel="noopener noreferrer" class="block mt-3 text-center text-xs font-black text-zinc-600 hover:text-zinc-950 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 transition-colors">카카오맵에서 열기</a>
    `;
  }
};
