/**
 * location.js - Geolocation, Haversine Distance, Landmark Presets
 */

// Earth radius in meters
const EARTH_RADIUS = 6371000;

export const LocationManager = {
  currentLocation: null, // { lat, lng, name, isPreset }

  // Landmark Presets for Demo Mode & Fallback
  presets: [
    { name: "서면역 (중심 상권)", lat: 35.157816, lng: 129.059283 },
    { name: "해운대 해수욕장", lat: 35.158698, lng: 129.160384 },
    { name: "부산역 (KTX)", lat: 35.115225, lng: 129.042243 },
    { name: "광안리 해변로", lat: 35.153169, lng: 129.118971 },
    { name: "부산대 정문", lat: 35.232759, lng: 129.084128 }
  ],

  // Haversine formula
  calculateDistance(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS * c; // in meters
  },

  // Format distance into human-friendly string
  formatDistance(meters) {
    if (meters === null || meters === undefined) return "";
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  },

  // Calculate estimated walking time (average 67m/min ~ 4km/h)
  formatWalkingTime(meters) {
    if (meters === null || meters === undefined) return "";
    const minutes = Math.max(1, Math.round(meters / 67));
    if (minutes < 60) {
      return `도보 ${minutes}분`;
    }
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `도보 ${hours}시간 ${remMinutes}분`;
  },

  // Request HTML5 Geolocation (single shot for battery preservation)
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("브라우저가 위치 정보를 지원하지 않습니다."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.currentLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            name: "내 현재 위치",
            isPreset: false
          };
          resolve(this.currentLocation);
        },
        (err) => {
          reject(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  },

  // Set manual preset location
  setPreset(index) {
    if (this.presets[index]) {
      const p = this.presets[index];
      this.currentLocation = {
        lat: p.lat,
        lng: p.lng,
        accuracy: 30,
        name: p.name,
        isPreset: true
      };
      return this.currentLocation;
    }
    return null;
  }
};
