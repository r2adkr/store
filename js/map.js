/**
 * map.js - High-Performance Canvas Map with Leaflet & Pure OpenStreetMap
 * Zero API keys, ultra-fast render, zero lag
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

export const MapController = {
  map: null,
  clusterGroup: null,
  userMarker: null,
  markerMap: new Map(),

  init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Busan Center
    const center = [35.179554, 129.075642];

    this.map = L.map(containerId, {
      center: center,
      zoom: 12,
      minZoom: 9,
      maxZoom: 19,
      zoomControl: false,
      preferCanvas: true // GPU canvas hardware acceleration
    });

    // Zoom Control in top right
    L.control.zoom({ position: "topright" }).addTo(this.map);

    // 100% Free Public OpenStreetMap Standard Tile - NO API KEY EVER
    // Using {s} subdomains (a,b,c) enables parallel requests → ~3x faster tile loading
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      subdomains: "abc"
    }).addTo(this.map);

    // High performance cluster group
    this.clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 200,
      chunkDelay: 10,
      disableClusteringAtZoom: 16,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      animate: false // disable animation to eliminate lag
    });

    this.map.addLayer(this.clusterGroup);

    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 250);

    window.addEventListener("resize", () => {
      if (this.map) this.map.invalidateSize();
    });
  },

  // Circle Marker (Canvas Accelerated) for Ultra Smooth Performance
  createStoreMarker(store, getDistanceFn, isFavFn, onMarkerClick, onToggleFav) {
    const cfg = BRAND_CONFIG[store.b] || BRAND_CONFIG["기타"];

    // Canvas CircleMarker is 10x faster than DOM DivIcon
    const marker = L.circleMarker([store.lat, store.lng], {
      radius: 7,
      fillColor: cfg.color,
      color: "#ffffff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.95
    });

    marker.on("click", () => {
      const distInfo = getDistanceFn ? getDistanceFn(store) : null;
      const isFav = isFavFn ? isFavFn(store.id) : false;
      const popupContent = this.createPopupContent(store, distInfo, isFav, onToggleFav);

      marker.bindPopup(popupContent, { maxWidth: 300 }).openPopup();

      setTimeout(() => {
        const favBtn = document.getElementById(`popup-fav-btn-${store.id}`);
        if (favBtn) {
          favBtn.onclick = (e) => {
            e.stopPropagation();
            if (onToggleFav) onToggleFav(store.id);
          };
        }
      }, 30);

      if (onMarkerClick) onMarkerClick(store);
    });

    return marker;
  },

  createPopupContent(store, distanceInfo, isFav, onToggleFav) {
    const cfg = BRAND_CONFIG[store.b] || BRAND_CONFIG["기타"];
    const distanceBadge = distanceInfo
      ? `<div class="flex items-center gap-1.5 text-xs text-blue-600 font-bold bg-blue-50/90 px-2 py-0.5 rounded-full border border-blue-200/60 shadow-sm">
           <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path></svg>
           <span>${distanceInfo.distText} · ${distanceInfo.timeText}</span>
         </div>`
      : "";

    const favIcon = isFav
      ? `<svg class="w-4 h-4 fill-amber-400 text-amber-500" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`
      : `<svg class="w-4 h-4 fill-none text-zinc-400 hover:text-amber-500" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;

    return `
      <div class="p-4 w-72 text-zinc-900 bg-white">
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black" style="background-color: ${cfg.bgColor}; color: ${cfg.textColor};">
            ${store.b}
          </span>
          <button id="popup-fav-btn-${store.id}" class="p-1 rounded-full hover:bg-zinc-100 transition-colors" title="즐겨찾기">
            ${favIcon}
          </button>
        </div>

        <h4 class="font-black text-sm text-zinc-900 leading-snug mb-1.5">${store.n}</h4>
        
        ${distanceBadge ? `<div class="mb-2.5">${distanceBadge}</div>` : ""}

        <div class="text-[11px] text-zinc-600 space-y-1 mb-3 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/60">
          <p class="flex items-start gap-1.5">
            <span class="font-bold text-zinc-700 shrink-0">도로명</span>
            <span class="text-zinc-600 break-all leading-tight">${store.ra || store.ja}</span>
          </p>
          <p class="flex items-start gap-1.5">
            <span class="font-bold text-zinc-500 shrink-0">지번</span>
            <span class="text-zinc-500 break-all leading-tight">${store.ja}</span>
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs font-bold">
          <button onclick="window.copyAddress('${store.ra || store.ja}')" 
                  class="flex items-center justify-center gap-1.5 py-2 px-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl transition-all active:scale-95 border border-zinc-200/80">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
            <span>주소 복사</span>
          </button>
          <a href="https://map.kakao.com/link/to/${encodeURIComponent(store.n)},${store.lat},${store.lng}" target="_blank" rel="noopener noreferrer"
             class="flex items-center justify-center gap-1.5 py-2 px-2 bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-xl transition-all active:scale-95 shadow-sm">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"></path></svg>
            <span>길찾기</span>
          </a>
        </div>
      </div>
    `;
  },

  setStores(stores, getDistanceFn, isFavFn, onMarkerClick, onToggleFav) {
    // Defer heavy layer operations to next frame so the UI stays responsive
    requestAnimationFrame(() => {
      this.clusterGroup.clearLayers();
      this.markerMap.clear();

      const markers = [];
      stores.forEach((store) => {
        const marker = this.createStoreMarker(store, getDistanceFn, isFavFn, onMarkerClick, onToggleFav);
        markers.push(marker);
        this.markerMap.set(store.id, marker);
      });

      this.clusterGroup.addLayers(markers);
    });
  },

  focusStore(store, distInfo, isFav, onToggleFav) {
    const marker = this.markerMap.get(store.id);
    if (!marker) return;

    this.map.flyTo([store.lat, store.lng], 17, { animate: true, duration: 0.6 });

    const popupContent = this.createPopupContent(store, distInfo, isFav, onToggleFav);
    marker.bindPopup(popupContent, { maxWidth: 300 }).openPopup();

    setTimeout(() => {
      const favBtn = document.getElementById(`popup-fav-btn-${store.id}`);
      if (favBtn) {
        favBtn.onclick = (e) => {
          e.stopPropagation();
          if (onToggleFav) onToggleFav(store.id);
        };
      }
    }, 30);
  },

  setUserLocation(lat, lng, name) {
    if (this.userMarker) {
      this.map.removeLayer(this.userMarker);
    }

    const icon = L.divIcon({
      html: `<div class="user-radar-pin" title="${name || '내 위치'}"></div>`,
      className: "user-location-marker",
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    this.userMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 2000 }).addTo(this.map);
    this.map.flyTo([lat, lng], 15, { animate: true, duration: 0.8 });
  },

  resetView() {
    this.map.flyTo([35.179554, 129.075642], 12, { animate: true });
  }
};
