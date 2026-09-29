/**
 * map.js - Leaflet 지도 컨트롤러
 * - 캔버스 렌더러 + 클러스터 최적화, 이동 중 블러 해제
 * - 단일 재사용 팝업(가독성 높은 주소 표시, 패널/시트에 가리지 않는 autoPan)
 * - 길안내 경로 표시
 */

export const BRAND_CONFIG = {
  "CU": { name: "CU", color: "#7c3aed", bgColor: "#ede9fe", textColor: "#6d28d9", label: "CU" },
  "GS25": { name: "GS25", color: "#0284c7", bgColor: "#e0f2fe", textColor: "#0369a1", label: "GS" },
  "세븐일레븐": { name: "세븐일레븐", color: "#059669", bgColor: "#d1fae5", textColor: "#047857", label: "7" },
  "이마트24": { name: "이마트24", color: "#d97706", bgColor: "#fef3c7", textColor: "#b45309", label: "24" },
  "미니스톱": { name: "미니스톱", color: "#2563eb", bgColor: "#dbeafe", textColor: "#1d4ed8", label: "M" },
  "씨스페이스": { name: "씨스페이스", color: "#ea580c", bgColor: "#ffedd5", textColor: "#c2410c", label: "C" },
  "스토리웨이": { name: "스토리웨이", color: "#0891b2", bgColor: "#cffafe", textColor: "#0e7490", label: "S" },
  "기타": { name: "기타", color: "#64748b", bgColor: "#f1f5f9", textColor: "#475569", label: "편" }
};

const STAR_ON = `<svg class="w-4 h-4 fill-amber-400 text-amber-500" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
const STAR_OFF = `<svg class="w-4 h-4 fill-none text-zinc-400 hover:text-amber-500" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;
const ICON_NAV = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>`;
const ICON_COPY = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>`;

const isDesktop = () => window.innerWidth >= 1024;

export const MapController = {
  map: null,
  clusterGroup: null,
  userMarker: null,
  routeLayer: null,
  popup: null,
  cb: {},          // { getDist, isFav, onMarkerClick, onToggleFav }
  current: null,   // { store } - 현재 열린 팝업의 매장
  onRoute: null,   // app.js 에서 주입: (store) => 길안내 시작

  init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    this.map = L.map(containerId, {
      center: [35.179554, 129.075642],
      zoom: 12,
      minZoom: 9,
      maxZoom: 19,
      zoomControl: false,
      // padding 0.5: 캔버스를 화면 밖까지 넉넉히 그려 두어 패닝 중 재렌더 횟수를 줄인다
      renderer: L.canvas({ padding: 0.5 }),
      markerZoomAnimation: false,
      wheelDebounceTime: 40
    });

    L.control.zoom({ position: "topright" }).addTo(this.map);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      subdomains: "abc",
      updateWhenZooming: false,
      keepBuffer: 4
    }).addTo(this.map);

    this.clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 50,   // 한 번에 메인 스레드를 점유하는 시간(ms). 기존 200 → 50
      chunkDelay: 30,
      disableClusteringAtZoom: 16,
      maxClusterRadius: (zoom) => (zoom >= 15 ? 50 : 80), // 저배율에서 클러스터 수를 줄임
      removeOutsideVisibleBounds: true,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      animate: false,
      animateAddingMarkers: false
    });
    this.map.addLayer(this.clusterGroup);

    // 팝업은 하나만 만들어 재사용 (클릭마다 bindPopup 하던 방식 제거)
    this.popup = L.popup({
      maxWidth: 320,
      minWidth: 260,
      offset: [0, -4],
      className: "store-popup",
      autoPanPadding: [16, 16]
    });
    this.map.on("popupopen", (e) => this.bindPopupActions(e.popup));

    // 이동/줌 중에는 유리(blur) 효과를 꺼서 프레임 드랍 방지 (style.css 의 body.map-moving)
    let timer = null;
    this.map.on("movestart zoomstart", () => {
      clearTimeout(timer);
      document.body.classList.add("map-moving");
    });
    this.map.on("moveend zoomend", () => {
      clearTimeout(timer);
      timer = setTimeout(() => document.body.classList.remove("map-moving"), 150);
    });

    setTimeout(() => this.map && this.map.invalidateSize(), 250);
    window.addEventListener("resize", () => this.map && this.map.invalidateSize());
  },

  /** 패널/시트/상단바에 가려지는 영역을 피한 '보이는 지도 영역' 여백 [x, y] */
  getInsets(route = false) {
    if (isDesktop()) {
      const panel = document.getElementById("desktop-panel");
      const open = panel && panel.style.pointerEvents !== "none";
      return { tl: [open ? 452 : 24, 80], br: [route ? 372 : 24, route ? 40 : 24] };
    }
    // 모바일: 하단 시트는 접힌 상태(핸들 76px)로 간주 (마커/카드 선택 시 app.js 가 시트를 접음)
    return { tl: [16, route ? 190 : 80], br: [16, 92] };
  },

  createStoreMarker(store) {
    const cfg = BRAND_CONFIG[store.b] || BRAND_CONFIG["기타"];
    const marker = L.circleMarker([store.lat, store.lng], {
      radius: 7,
      fillColor: cfg.color,
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.95
    });
    marker.on("click", () => {
      this.openPopup(store);
      if (this.cb.onMarkerClick) this.cb.onMarkerClick(store);
    });
    return marker;
  },

  createPopupContent(store, distanceInfo, isFav) {
    const cfg = BRAND_CONFIG[store.b] || BRAND_CONFIG["기타"];
    const road = store.ra || store.ja;
    const showJibun = store.ja && store.ja !== road;
    const kakao = `https://map.kakao.com/link/to/${encodeURIComponent(store.n)},${store.lat},${store.lng}`;

    const distance = distanceInfo
      ? `<p class="text-xs font-black text-blue-600 mb-2.5">${distanceInfo.distText} · ${distanceInfo.timeText}</p>`
      : "";

    return `
      <div class="w-[290px] max-w-[80vw] p-4 bg-white text-zinc-900">
        <div class="flex items-center justify-between gap-2 mr-7 mb-2">
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black" style="background-color:${cfg.bgColor};color:${cfg.textColor};">${store.b}</span>
          <button data-action="fav" id="popup-fav-btn-${store.id}" class="p-2 -m-1 rounded-full hover:bg-zinc-100 transition-colors" title="즐겨찾기">${isFav ? STAR_ON : STAR_OFF}</button>
        </div>

        <h4 class="font-black text-base text-zinc-950 leading-snug mb-1">${store.n}</h4>
        ${distance || '<div class="mb-2"></div>'}

        <div class="select-text mb-3 p-3 rounded-xl bg-zinc-100 border border-zinc-300">
          <p class="text-xs font-black text-zinc-500 mb-0.5">도로명 주소</p>
          <p class="text-[15px] font-black text-zinc-950 leading-snug break-keep">${road}</p>
          ${showJibun ? `
            <p class="text-xs font-black text-zinc-500 mt-2 mb-0.5">지번 주소</p>
            <p class="text-[13px] font-bold text-zinc-700 leading-snug break-keep">${store.ja}</p>` : ""}
        </div>

        <div class="grid grid-cols-2 gap-2 text-[13px] font-black">
          <button data-action="route" class="col-span-2 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors active:scale-95">
            ${ICON_NAV}<span>여기까지 길안내</span>
          </button>
          <button data-action="copy" class="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-300 transition-colors active:scale-95">
            ${ICON_COPY}<span>주소 복사</span>
          </button>
          <a href="${kakao}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-zinc-950 transition-colors active:scale-95">
            카카오맵
          </a>
        </div>
      </div>
    `;
  },

  /** 팝업 안의 버튼은 팝업 요소에 한 번만 이벤트를 위임한다 */
  bindPopupActions(popup) {
    const el = popup.getElement();
    if (!el || el._actionsBound) return;
    el._actionsBound = true;
    el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || !this.current) return;
      const store = this.current.store;
      const action = btn.dataset.action;
      if (action === "fav") { if (this.cb.onToggleFav) this.cb.onToggleFav(store.id); }
      else if (action === "copy") window.copyAddress(store.ra || store.ja);
      else if (action === "route") { if (this.onRoute) this.onRoute(store); }
    });
  },

  openPopup(store, { autoPan = true, distInfo, isFav } = {}) {
    const { tl, br } = this.getInsets();
    Object.assign(this.popup.options, { autoPan, autoPanPaddingTopLeft: tl, autoPanPaddingBottomRight: br });

    const dist = distInfo !== undefined ? distInfo : (this.cb.getDist ? this.cb.getDist(store) : null);
    const fav = isFav !== undefined ? isFav : (this.cb.isFav ? this.cb.isFav(store.id) : false);

    this.popup
      .setLatLng([store.lat, store.lng])
      .setContent(this.createPopupContent(store, dist, fav))
      .openOn(this.map);
    this.current = { store }; // openOn 이 이전 팝업을 닫은 뒤에 지정
  },

  closePopup() {
    if (this.map) this.map.closePopup();
  },

  setStores(stores, getDist, isFav, onMarkerClick, onToggleFav) {
    this.cb = { getDist, isFav, onMarkerClick, onToggleFav };
    requestAnimationFrame(() => {
      this.clusterGroup.clearLayers();
      this.clusterGroup.addLayers(stores.map((s) => this.createStoreMarker(s)));
    });
  },

  focusStore(store, distInfo, isFav, onToggleFav) {
    if (onToggleFav) this.cb.onToggleFav = onToggleFav;

    // 매장이 '보이는 영역'의 한가운데 오도록 중심을 보정해서 이동
    const z = 17;
    const { tl, br } = this.getInsets();
    const target = this.map
      .project([store.lat, store.lng], z)
      .subtract([(tl[0] - br[0]) / 2, (tl[1] - br[1]) / 2]);
    this.map.flyTo(this.map.unproject(target, z), z, { animate: true, duration: 0.6 });

    this.openPopup(store, { autoPan: false, distInfo, isFav });
  },

  /* ---------- 길안내 경로 ---------- */
  showRoute(latlngs, dest, dashed = false) {
    this.clearRoute();
    const base = { interactive: false, lineCap: "round", lineJoin: "round" };
    const casing = L.polyline(latlngs, { ...base, color: "#ffffff", weight: 9, opacity: 0.95 });
    const line = L.polyline(latlngs, { ...base, color: "#2563eb", weight: 5, opacity: 1, dashArray: dashed ? "2 10" : null });
    const ring = L.circleMarker(dest, { interactive: false, radius: 13, color: "#2563eb", weight: 3, fillOpacity: 0 });

    this.routeLayer = L.layerGroup([casing, line, ring]).addTo(this.map);
    line.bringToBack();   // 매장 원 아래로 (흰 테두리가 파란 선 아래)
    casing.bringToBack();

    const { tl, br } = this.getInsets(true);
    this.map.fitBounds(L.latLngBounds(latlngs), { paddingTopLeft: tl, paddingBottomRight: br, maxZoom: 17 });
  },

  clearRoute() {
    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }
  },

  setUserLocation(lat, lng, name) {
    if (this.userMarker) this.map.removeLayer(this.userMarker);

    const icon = L.divIcon({
      html: `<div class="user-radar-pin" title="${name || "내 위치"}"></div>`,
      className: "user-location-marker",
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    this.userMarker = L.marker([lat, lng], { icon, zIndexOffset: 2000 }).addTo(this.map);
    this.map.flyTo([lat, lng], 15, { animate: true, duration: 0.8 });
  },

  resetView() {
    this.map.flyTo([35.179554, 129.075642], 12, { animate: true });
  }
};
