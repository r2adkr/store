/**
 * app.js - Main Application Controller
 * Handles pure glassmorphism UI, custom non-native dropdowns, virtual chunk scrolling,
 * and mobile drawer gestures.
 */
import { MapController, BRAND_CONFIG } from "./map.js";
import { LocationManager } from "./location.js";
import { FavoritesManager } from "./favorites.js";
import { RouteManager } from "./route.js";

const AppState = {
  allStores: [],
  filteredStores: [],
  renderedCount: 0,
  chunkSize: 30,

  filters: {
    query: "",
    gu: "all",
    brand: "all",
    radius: "all",
    onlyFavorites: false,
    sortBy: "distance"
  },

  drawerState: "half"
};

// Global Toast
window.showToast = function(message) {
  const existing = document.getElementById("app-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "app-toast";
  toast.className = "fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-full bg-zinc-900/90 text-white text-xs font-bold shadow-2xl backdrop-blur-md flex items-center gap-2 border border-zinc-700/60 toast-animate";
  toast.innerHTML = `
    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.3s, transform 0.3s";
    toast.style.opacity = "0";
    toast.style.transform = "translate(-50%, -10px)";
    setTimeout(() => toast.remove(), 300);
  }, 2200);
};

// Clipboard copy helper
window.copyAddress = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    window.showToast("주소가 클립보드에 복사되었습니다.");
  }).catch(() => {
    window.showToast("복사에 실패했습니다.");
  });
};

document.addEventListener("DOMContentLoaded", () => {
  FavoritesManager.init();
  MapController.init("map");
  RouteManager.init({
    ensureOrigin: () => (LocationManager.currentLocation ? Promise.resolve(LocationManager.currentLocation) : handleGetLocation()),
    onStart: () => { if (window.innerWidth < 1024) setDrawerState("collapsed"); }
  });
  MapController.onRoute = (store) => RouteManager.start(store);

  AppState.allStores = window.CONVENIENCE_STORES || [];
  console.log(`Loaded ${AppState.allStores.length} convenience stores.`);

  setupBrandFilterChips();
  setupCustomDropdowns();
  setupEventListeners();
  setupBottomSheetGestures();

  applyFilters();
  updateFavoritesCountBadge();

  // Force map to adapt properly to layout
  setTimeout(() => {
    if (MapController.map) MapController.map.invalidateSize();
  }, 350);
});

// Setup Brand Filter Chips
function setupBrandFilterChips() {
  const container = document.getElementById("brand-filter-group");
  if (!container) return;

  const brands = ["all", "CU", "GS25", "세븐일레븐", "이마트24", "미니스톱", "기타"];
  container.innerHTML = brands.map((b) => {
    const isAll = b === "all";
    const label = isAll ? "전체" : b;
    const activeClass = isAll
      ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
      : "glass-pill text-zinc-700 hover:text-zinc-950";
    return `
      <button data-brand="${b}" class="brand-chip shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${activeClass}">
        ${label}
      </button>
    `;
  }).join("");

  container.querySelectorAll(".brand-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".brand-chip").forEach((el) => {
        el.className = el.className.replace("bg-zinc-900 text-white border-zinc-900 shadow-sm", "glass-pill text-zinc-700");
      });
      btn.className = btn.className.replace("glass-pill text-zinc-700", "bg-zinc-900 text-white border-zinc-900 shadow-sm");
      AppState.filters.brand = btn.dataset.brand;
      applyFilters();
    });
  });
}

// Setup Bespoke Custom Dropdowns (Zero Generic HTML Forms)
function setupCustomDropdowns() {
  // 1. Gu (District) Dropdown
  const guDropdown = document.getElementById("custom-gu-dropdown");
  const guPanel = document.getElementById("custom-gu-panel");
  const guLabel = document.getElementById("custom-gu-label");

  if (guDropdown && guPanel && guLabel) {
    const gus = Array.from(new Set(AppState.allStores.map((s) => s.g))).sort();
    gus.forEach((gu) => {
      const item = document.createElement("div");
      item.className = "custom-dropdown-item";
      item.dataset.val = gu;
      item.textContent = gu;
      guPanel.appendChild(item);
    });

    guDropdown.querySelector(".dropdown-trigger").addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllDropdowns(guPanel);
      guPanel.classList.toggle("open");
    });

    guPanel.querySelectorAll(".custom-dropdown-item").forEach((item) => {
      item.addEventListener("click", () => {
        guPanel.querySelectorAll(".custom-dropdown-item").forEach((el) => el.classList.remove("active"));
        item.classList.add("active");
        guLabel.textContent = item.textContent;
        AppState.filters.gu = item.dataset.val;
        guPanel.classList.remove("open");
        applyFilters();
      });
    });
  }

  // 2. Sort Dropdown
  const sortDropdown = document.getElementById("custom-sort-dropdown");
  const sortPanel = document.getElementById("custom-sort-panel");
  const sortLabel = document.getElementById("custom-sort-label");

  if (sortDropdown && sortPanel && sortLabel) {
    sortDropdown.querySelector(".dropdown-trigger").addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllDropdowns(sortPanel);
      sortPanel.classList.toggle("open");
    });

    sortPanel.querySelectorAll(".custom-dropdown-item").forEach((item) => {
      item.addEventListener("click", () => {
        sortPanel.querySelectorAll(".custom-dropdown-item").forEach((el) => el.classList.remove("active"));
        item.classList.add("active");
        sortLabel.textContent = item.textContent;
        AppState.filters.sortBy = item.dataset.val;
        sortPanel.classList.remove("open");
        applyFilters();
      });
    });
  }

  // 3. Landmark Dropdown (Demo Presets)
  const landmarkDropdown = document.getElementById("custom-landmark-dropdown");
  const landmarkPanel = document.getElementById("custom-landmark-panel");
  const landmarkLabel = document.getElementById("custom-landmark-label");

  if (landmarkDropdown && landmarkPanel && landmarkLabel) {
    LocationManager.presets.forEach((p, idx) => {
      const item = document.createElement("div");
      item.className = "custom-dropdown-item";
      item.dataset.val = idx;
      item.textContent = p.name;
      landmarkPanel.appendChild(item);
    });

    landmarkDropdown.querySelector(".dropdown-trigger").addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllDropdowns(landmarkPanel);
      landmarkPanel.classList.toggle("open");
    });

    landmarkPanel.querySelectorAll(".custom-dropdown-item").forEach((item) => {
      item.addEventListener("click", () => {
        landmarkPanel.classList.remove("open");
        const idx = parseInt(item.dataset.val, 10);
        const loc = LocationManager.setPreset(idx);
        if (loc) {
          landmarkLabel.textContent = loc.name.split(" ")[0];
          MapController.setUserLocation(loc.lat, loc.lng, loc.name);
          window.showToast(`[거점 체험] ${loc.name} 기준으로 거리를 계산합니다.`);
          updateLocationStatusText();
          applyFilters();
        }
      });
    });
  }

  // Close dropdowns on outside click
  document.addEventListener("click", () => {
    closeAllDropdowns();
  });
}

function closeAllDropdowns(exceptPanel) {
  document.querySelectorAll(".custom-dropdown-panel").forEach((panel) => {
    if (panel !== exceptPanel) panel.classList.remove("open");
  });
}

function getStoreDistance(store) {
  if (!LocationManager.currentLocation) return null;
  const dist = LocationManager.calculateDistance(
    LocationManager.currentLocation.lat,
    LocationManager.currentLocation.lng,
    store.lat,
    store.lng
  );
  return {
    meters: dist,
    distText: LocationManager.formatDistance(dist),
    timeText: LocationManager.formatWalkingTime(dist)
  };
}

function setupEventListeners() {
  // Desktop Search
  const searchInput = document.getElementById("search-input");
  let debounceTimer = null;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        AppState.filters.query = e.target.value.trim().toLowerCase();
        applyFilters();
      }, 200);
    });

    const clearBtn = document.getElementById("search-clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        AppState.filters.query = "";
        applyFilters();
      });
    }
  }

  // Mobile Search
  const mobileSearchInput = document.getElementById("mobile-search-input");
  if (mobileSearchInput) {
    let mobileTimer = null;
    mobileSearchInput.addEventListener("input", (e) => {
      clearTimeout(mobileTimer);
      mobileTimer = setTimeout(() => {
        AppState.filters.query = e.target.value.trim().toLowerCase();
        if (searchInput) searchInput.value = e.target.value;
        applyFilters();
      }, 200);
    });
  }

  // Radius Filter Buttons
  const radiusGroup = document.getElementById("radius-filter-group");
  if (radiusGroup) {
    radiusGroup.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        radiusGroup.querySelectorAll("button").forEach((b) => {
          b.className = "glass-pill px-2.5 py-0.5 rounded-full text-zinc-700 font-bold text-[11px] hover:bg-white";
        });
        btn.className = "px-2.5 py-0.5 rounded-full bg-zinc-900 text-white font-bold text-[11px]";
        AppState.filters.radius = btn.dataset.radius;
        applyFilters();
      });
    });
  }

  // Desktop Favorites Toggle
  const favToggleBtn = document.getElementById("favorites-toggle-btn");
  if (favToggleBtn) {
    favToggleBtn.addEventListener("click", () => {
      toggleOnlyFavorites();
    });
  }

  // Mobile Favorites Toggle
  const mobileFavBtn = document.getElementById("mobile-favorites-btn");
  if (mobileFavBtn) {
    mobileFavBtn.addEventListener("click", () => {
      toggleOnlyFavorites();
    });
  }

  // Mobile Filter Modal / Drawer Expand
  const mobileFilterModalBtn = document.getElementById("mobile-filter-modal-btn");
  if (mobileFilterModalBtn) {
    mobileFilterModalBtn.addEventListener("click", () => {
      setDrawerState("full");
    });
  }

  // Geolocation Buttons
  const myLocationBtn = document.getElementById("my-location-btn");
  if (myLocationBtn) {
    myLocationBtn.addEventListener("click", () => handleGetLocation());
  }

  const mapMyLocationBtn = document.getElementById("map-my-location-btn");
  if (mapMyLocationBtn) {
    mapMyLocationBtn.addEventListener("click", () => handleGetLocation());
  }

  // Reset Map View
  const resetMapBtn = document.getElementById("map-reset-btn");
  if (resetMapBtn) {
    resetMapBtn.addEventListener("click", () => MapController.resetView());
  }

  // Desktop Panel Close and Toggle Button
  const desktopPanel = document.getElementById("desktop-panel");
  const togglePanelBtn = document.getElementById("toggle-panel-btn");
  const panelCloseBtn = document.getElementById("panel-close-btn");
  const togglePanelText = document.getElementById("toggle-panel-text");
  const togglePanelIcon = document.getElementById("toggle-panel-icon");

  let isPanelOpen = true;

  function setDesktopPanelOpen(open) {
    isPanelOpen = open;
    if (desktopPanel) {
      if (open) {
        desktopPanel.style.transform = "translateX(0)";
        desktopPanel.style.opacity = "1";
        desktopPanel.style.pointerEvents = "auto";
      } else {
        desktopPanel.style.transform = "translateX(-450px)";
        desktopPanel.style.opacity = "0";
        desktopPanel.style.pointerEvents = "none";
      }
    }
    if (togglePanelText) {
      togglePanelText.textContent = open ? "패널 닫기" : "패널 열기";
    }
    if (togglePanelIcon) {
      togglePanelIcon.style.transform = open ? "rotate(0deg)" : "rotate(180deg)";
    }
  }

  if (togglePanelBtn) {
    togglePanelBtn.addEventListener("click", () => {
      // If mobile, toggle mobile drawer
      if (window.innerWidth < 1024) {
        const nextState = AppState.drawerState === "collapsed" ? "half" : "collapsed";
        setDrawerState(nextState);
      } else {
        setDesktopPanelOpen(!isPanelOpen);
      }
    });
  }

  if (panelCloseBtn) {
    panelCloseBtn.addEventListener("click", () => {
      setDesktopPanelOpen(false);
    });
  }

  // Mobile minimize button
  const mobileMinBtn = document.getElementById("mobile-minimize-btn");
  if (mobileMinBtn) {
    mobileMinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setDrawerState("collapsed");
    });
  }

  const mobileCloseAllBtn = document.getElementById("mobile-close-all-btn");
  if (mobileCloseAllBtn) {
    mobileCloseAllBtn.addEventListener("click", () => {
      const nextState = AppState.drawerState === "collapsed" ? "half" : "collapsed";
      setDrawerState(nextState);
    });
  }


  // Infinite Scroll Containers
  const listContainer = document.getElementById("store-list-container");
  if (listContainer) {
    listContainer.addEventListener("scroll", () => {
      if (listContainer.scrollTop + listContainer.clientHeight >= listContainer.scrollHeight - 150) {
        renderNextChunk();
      }
    });
  }

  const mobileListContainer = document.getElementById("mobile-store-list-container");
  if (mobileListContainer) {
    mobileListContainer.addEventListener("scroll", () => {
      if (mobileListContainer.scrollTop + mobileListContainer.clientHeight >= mobileListContainer.scrollHeight - 150) {
        renderNextChunk();
      }
    });
  }
}

function toggleOnlyFavorites() {
  AppState.filters.onlyFavorites = !AppState.filters.onlyFavorites;
  const isOnly = AppState.filters.onlyFavorites;

  const favBtn = document.getElementById("favorites-toggle-btn");
  if (favBtn) {
    favBtn.classList.toggle("bg-amber-500", isOnly);
    favBtn.classList.toggle("text-white", isOnly);
  }

  const mobileFavBtn = document.getElementById("mobile-favorites-btn");
  if (mobileFavBtn) {
    mobileFavBtn.classList.toggle("bg-amber-500", isOnly);
    mobileFavBtn.classList.toggle("text-white", isOnly);
  }

  applyFilters();
}

function handleGetLocation() {
  window.showToast("현재 GPS 위치를 확인하고 있습니다...");
  return LocationManager.getCurrentPosition()
    .then((loc) => {
      MapController.setUserLocation(loc.lat, loc.lng, "내 현재 위치");
      window.showToast("현재 위치를 성공적으로 확인했습니다.");
      updateLocationStatusText();

      AppState.filters.sortBy = "distance";
      const sortLabel = document.getElementById("custom-sort-label");
      if (sortLabel) sortLabel.textContent = "거리 가까운 순";

      applyFilters();
      return loc;
    })
    .catch((err) => {
      console.warn(err);
      window.showToast("위치 확인 실패: 거점 체험 모드를 이용해보세요.");
      const landmarkDropdown = document.getElementById("custom-landmark-dropdown");
      if (landmarkDropdown) {
        const panel = document.getElementById("custom-landmark-panel");
        if (panel) panel.classList.add("open");
      }
      return null;
    });
}

function updateLocationStatusText() {
  const el = document.getElementById("current-location-display");
  if (el && LocationManager.currentLocation) {
    el.textContent = LocationManager.currentLocation.name;
    el.classList.add("text-blue-600");
  }
}

function updateFavoritesCountBadge() {
  const badge = document.getElementById("favorites-count-badge");
  if (badge) {
    const count = FavoritesManager.getCount();
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-flex" : "none";
  }
}

function applyFilters() {
  const { query, gu, brand, radius, onlyFavorites, sortBy } = AppState.filters;

  let results = AppState.allStores;

  if (gu !== "all") {
    results = results.filter((s) => s.g === gu);
  }

  if (brand !== "all") {
    results = results.filter((s) => s.b === brand);
  }

  if (query) {
    results = results.filter((s) => {
      return (
        s.n.toLowerCase().includes(query) ||
        s.d.toLowerCase().includes(query) ||
        s.ra.toLowerCase().includes(query) ||
        s.ja.toLowerCase().includes(query)
      );
    });
  }

  if (onlyFavorites) {
    results = results.filter((s) => FavoritesManager.isFavorite(s.id));
  }

  if (LocationManager.currentLocation) {
    results = results.map((s) => {
      const distInfo = getStoreDistance(s);
      return { ...s, _dist: distInfo };
    });

    if (radius !== "all") {
      const maxMeters = parseInt(radius, 10);
      results = results.filter((s) => s._dist && s._dist.meters <= maxMeters);
    }

    if (sortBy === "distance") {
      results.sort((a, b) => (a._dist?.meters || 99999999) - (b._dist?.meters || 99999999));
    } else {
      results.sort((a, b) => a.n.localeCompare(b.n));
    }
  } else {
    if (sortBy === "name") {
      results.sort((a, b) => a.n.localeCompare(b.n));
    }
  }

  AppState.filteredStores = results;
  AppState.renderedCount = 0;

  updateResultCounts(results.length);

  MapController.setStores(
    results,
    (s) => s._dist || getStoreDistance(s),
    (id) => FavoritesManager.isFavorite(id),
    (store) => onStoreCardClick(store, false),
    (id) => toggleFavorite(id)
  );

  const listContainer = document.getElementById("store-list-container");
  const mobileListContainer = document.getElementById("mobile-store-list-container");

  if (listContainer) listContainer.innerHTML = "";
  if (mobileListContainer) mobileListContainer.innerHTML = "";

  if (results.length === 0) {
    if (listContainer) renderEmptyState(listContainer);
    if (mobileListContainer) renderEmptyState(mobileListContainer);
  } else {
    renderNextChunk();
  }
}

function updateResultCounts(count) {
  const countEl = document.getElementById("result-count-text");
  if (countEl) countEl.textContent = count.toLocaleString();

  const drawerCountEl = document.getElementById("drawer-result-count");
  if (drawerCountEl) drawerCountEl.textContent = count.toLocaleString();

  if (AppState.filters.gu !== "all" && AppState.filteredStores.length > 0) {
    const first = AppState.filteredStores[0];
    MapController.map.flyTo([first.lat, first.lng], 14, { animate: true });
  }
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center p-8 text-center my-auto">
      <div class="w-14 h-14 rounded-2xl glass-card flex items-center justify-center text-zinc-400 mb-3 shadow-md">
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
      </div>
      <h3 class="font-extrabold text-sm text-zinc-800 mb-1">조건에 맞는 편의점이 없습니다</h3>
      <p class="text-[11px] text-zinc-500 max-w-xs mb-4">선택하신 지역, 브랜드, 또는 반경 필터를 완화하여 다시 검색해보세요.</p>
      <button onclick="window.resetFilters()" class="text-xs font-black px-3.5 py-2 rounded-xl bg-zinc-900 text-white shadow-md hover:bg-zinc-800 transition-all active:scale-95">
        필터 전체 초기화
      </button>
    </div>
  `;
}

window.resetFilters = function() {
  AppState.filters.query = "";
  AppState.filters.gu = "all";
  AppState.filters.brand = "all";
  AppState.filters.radius = "all";
  AppState.filters.onlyFavorites = false;

  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";

  const guLabel = document.getElementById("custom-gu-label");
  if (guLabel) guLabel.textContent = "부산 전체 (16개 구·군)";

  setupBrandFilterChips();
  applyFilters();
};

function renderNextChunk() {
  const desktopContainer = document.getElementById("store-list-container");
  const mobileContainer = document.getElementById("mobile-store-list-container");
  if (!desktopContainer && !mobileContainer) return;

  const total = AppState.filteredStores.length;
  if (AppState.renderedCount >= total) return;

  const nextBatch = AppState.filteredStores.slice(
    AppState.renderedCount,
    AppState.renderedCount + AppState.chunkSize
  );

  const desktopFrag = document.createDocumentFragment();
  const mobileFrag = document.createDocumentFragment();

  nextBatch.forEach((store) => {
    if (desktopContainer) {
      desktopFrag.appendChild(createStoreCardElement(store, "desktop"));
    }
    if (mobileContainer) {
      mobileFrag.appendChild(createStoreCardElement(store, "mobile"));
    }
  });

  if (desktopContainer) desktopContainer.appendChild(desktopFrag);
  if (mobileContainer) mobileContainer.appendChild(mobileFrag);

  AppState.renderedCount += nextBatch.length;
}

function createStoreCardElement(store, prefix = "desktop") {
  const card = document.createElement("div");
  card.id = `store-card-${prefix}-${store.id}`;
  card.className = "store-card p-3.5 rounded-2xl hover:bg-white/95 transition-colors cursor-pointer group mb-2.5 relative";

  const cfg = BRAND_CONFIG[store.b] || BRAND_CONFIG["기타"];
  const isFav = FavoritesManager.isFavorite(store.id);
  const distInfo = store._dist || getStoreDistance(store);

  card.innerHTML = `
    <div class="flex items-start justify-between gap-2 mb-1.5">
      <div class="flex items-center gap-1.5">
        <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black" style="background-color: ${cfg.bgColor}; color: ${cfg.textColor};">
          ${store.b}
        </span>
        <span class="text-xs text-zinc-500 font-bold">${store.g} · ${store.d}</span>
      </div>
      <button class="fav-toggle-btn p-1 -mr-1 rounded-full hover:bg-white/80 transition-colors" data-id="${store.id}" title="즐겨찾기">
        <svg class="w-4 h-4 ${isFav ? 'fill-amber-400 text-amber-500' : 'fill-none text-zinc-300 hover:text-amber-500'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
        </svg>
      </button>
    </div>

    <h4 class="font-black text-sm text-zinc-900 group-hover:text-blue-600 transition-colors leading-snug mb-1">
      ${store.n}
    </h4>

    <p class="text-xs text-zinc-700 font-semibold leading-snug break-keep mb-2">
      ${store.ra || store.ja}
    </p>

    <div class="flex items-center justify-between pt-2 border-t border-white/60 text-xs">
      <div class="flex items-center gap-1.5 text-blue-600 font-bold">
        ${distInfo ? `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
          <span>${distInfo.distText} (${distInfo.timeText})</span>
        ` : `
          <span class="text-zinc-400 font-normal">거리 미확인</span>
        `}
      </div>

      <div class="flex items-center gap-1">
        <button class="route-btn text-blue-600 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50/80 transition-colors" title="길안내 (사이트 내)">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
        </button>
        <button class="copy-btn text-zinc-500 hover:text-zinc-900 p-1.5 rounded-lg hover:bg-white/80 transition-all" title="주소 복사" data-addr="${store.ra || store.ja}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
        </button>
        <a href="https://map.kakao.com/link/to/${encodeURIComponent(store.n)},${store.lat},${store.lng}" target="_blank" rel="noopener noreferrer"
           class="text-amber-600 hover:text-amber-800 p-1.5 rounded-lg hover:bg-amber-50/80 transition-all" title="카카오맵 길찾기" onclick="event.stopPropagation()">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
        </a>
      </div>
    </div>
  `;

  card.addEventListener("click", () => {
    onStoreCardClick(store, true);
  });

  const favBtn = card.querySelector(".fav-toggle-btn");
  if (favBtn) {
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(store.id);
    });
  }

  const copyBtn = card.querySelector(".copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.copyAddress(copyBtn.dataset.addr);
    });
  }

  const routeBtn = card.querySelector(".route-btn");
  if (routeBtn) {
    routeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      RouteManager.start(store);
    });
  }

  return card;
}

function onStoreCardClick(store, shouldFlyMap) {
  document.querySelectorAll(".store-card").forEach((c) => {
    c.classList.remove("border-blue-500", "ring-2", "ring-blue-400/40");
  });

  const dCard = document.getElementById(`store-card-desktop-${store.id}`);
  const mCard = document.getElementById(`store-card-mobile-${store.id}`);

  if (dCard) {
    dCard.classList.add("border-blue-500", "ring-2", "ring-blue-400/40");
    dCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  if (mCard) {
    mCard.classList.add("border-blue-500", "ring-2", "ring-blue-400/40");
    mCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (shouldFlyMap) {
    const distInfo = store._dist || getStoreDistance(store);
    const isFav = FavoritesManager.isFavorite(store.id);
    MapController.focusStore(store, distInfo, isFav, (id) => toggleFavorite(id));
  }

  // 모바일: 팝업이 하단 시트에 가려지지 않도록 시트를 접는다
  if (window.innerWidth < 1024) setDrawerState("collapsed");
}

function toggleFavorite(id) {
  const isFav = FavoritesManager.toggle(id);
  updateFavoritesCountBadge();
  window.showToast(isFav ? "즐겨찾기에 등록되었습니다." : "즐겨찾기에서 제외되었습니다.");

  if (AppState.filters.onlyFavorites) {
    applyFilters();
  } else {
    [`store-card-desktop-${id}`, `store-card-mobile-${id}`].forEach((cardId) => {
      const targetCard = document.getElementById(cardId);
      if (targetCard) {
        const favSvg = targetCard.querySelector(".fav-toggle-btn svg");
        if (favSvg) {
          // SVG elements use SVGAnimatedString — must use setAttribute, not className=
          favSvg.setAttribute("class", isFav
            ? "w-4 h-4 fill-amber-400 text-amber-500"
            : "w-4 h-4 fill-none text-zinc-300 hover:text-amber-500"
          );
        }
      }
    });

    // Also update popup favorite button if it's currently open
    const popupFavBtn = document.getElementById(`popup-fav-btn-${id}`);
    if (popupFavBtn) {
      const favIcon = isFav
        ? `<svg class="w-4 h-4 fill-amber-400 text-amber-500" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`
        : `<svg class="w-4 h-4 fill-none text-zinc-400 hover:text-amber-500" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;
      popupFavBtn.innerHTML = favIcon;
    }

  }
}

function setupBottomSheetGestures() {
  const drawer = document.getElementById("mobile-drawer");
  const handle = document.getElementById("drawer-drag-handle");
  if (!drawer || !handle) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  handle.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });

  handle.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
  }, { passive: true });

  handle.addEventListener("touchend", () => {
    if (!isDragging) return;
    isDragging = false;
    const diff = currentY - startY;

    if (diff < -50) {
      if (AppState.drawerState === "collapsed") setDrawerState("half");
      else if (AppState.drawerState === "half") setDrawerState("full");
    } else if (diff > 50) {
      if (AppState.drawerState === "full") setDrawerState("half");
      else if (AppState.drawerState === "half") setDrawerState("collapsed");
    }
  });

  handle.addEventListener("click", () => {
    if (AppState.drawerState === "collapsed") setDrawerState("half");
    else if (AppState.drawerState === "half") setDrawerState("full");
    else setDrawerState("half");
  });
}

function setDrawerState(state) {
  const drawer = document.getElementById("mobile-drawer");
  if (!drawer) return;

  drawer.classList.remove("drawer-snap-collapsed", "drawer-snap-half", "drawer-snap-full");
  if (state === "collapsed") drawer.classList.add("drawer-snap-collapsed");
  else if (state === "half") drawer.classList.add("drawer-snap-half");
  else if (state === "full") drawer.classList.add("drawer-snap-full");

  AppState.drawerState = state;
}
