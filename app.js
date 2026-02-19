const DEFAULT_LOCATION = 'Nashville';
let lastWeatherData = null;

// ── Cache helpers ─────────────────────────────────────────────────────────

const TTL = {
  forecast: 30 * 60 * 1000,          // 30 minutes
  geo:      7 * 24 * 60 * 60 * 1000, // 7 days
  ip:       4 * 60 * 60 * 1000,      // 4 hours
};

function cacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ── Weather code helpers ──────────────────────────────────────────────────

const WMO = {
  0:  { label: 'Clear Sky',          icon: '☀️' },
  1:  { label: 'Mainly Clear',       icon: '🌤️' },
  2:  { label: 'Partly Cloudy',      icon: '⛅' },
  3:  { label: 'Overcast',           icon: '☁️' },
  45: { label: 'Foggy',              icon: '🌫️' },
  48: { label: 'Icy Fog',            icon: '🌫️' },
  51: { label: 'Light Drizzle',      icon: '🌦️' },
  53: { label: 'Drizzle',            icon: '🌧️' },
  55: { label: 'Heavy Drizzle',      icon: '🌧️' },
  61: { label: 'Light Rain',         icon: '🌦️' },
  63: { label: 'Rain',               icon: '🌧️' },
  65: { label: 'Heavy Rain',         icon: '🌧️' },
  71: { label: 'Light Snow',         icon: '🌨️' },
  73: { label: 'Snow',               icon: '❄️' },
  75: { label: 'Heavy Snow',         icon: '❄️' },
  77: { label: 'Snow Grains',        icon: '🌨️' },
  80: { label: 'Rain Showers',       icon: '🌦️' },
  81: { label: 'Heavy Showers',      icon: '🌧️' },
  82: { label: 'Violent Showers',    icon: '⛈️' },
  85: { label: 'Snow Showers',       icon: '🌨️' },
  86: { label: 'Heavy Snow Showers', icon: '❄️' },
  95: { label: 'Thunderstorm',       icon: '⛈️' },
  96: { label: 'Thunderstorm+Hail',  icon: '⛈️' },
  99: { label: 'Severe Storm',       icon: '⛈️' },
};

function wmo(code) {
  return WMO[code] ?? { label: 'Unknown', icon: '🌡️' };
}

// ── Background gradient ────────────────────────────────────────────────────

let currentBgKey = '';

const SNOW_CODES  = new Set([71, 73, 75, 77, 85, 86]);
const RAIN_CODES  = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const FOG_CODES   = new Set([45, 48]);
const STORM_CODES = new Set([95, 96, 99]);

function getGradient(code, isDay) {
  if (!isDay) {
    if (STORM_CODES.has(code)) return 'linear-gradient(to bottom,#04060e 0%,#0b0e1a 50%,#111828 100%)';
    if (SNOW_CODES.has(code))  return 'linear-gradient(to bottom,#1c2340 0%,#263060 50%,#3a4580 100%)';
    if (RAIN_CODES.has(code))  return 'linear-gradient(to bottom,#0c1220 0%,#172035 50%,#1e2a42 100%)';
    if (FOG_CODES.has(code))   return 'linear-gradient(to bottom,#1a2030 0%,#2a3040 50%,#3a4050 100%)';
    if (code >= 2)             return 'linear-gradient(to bottom,#0e1628 0%,#18243c 50%,#202e50 100%)';
    // clear/mainly clear night — deep navy with slight indigo
    return 'linear-gradient(to bottom,#070d20 0%,#0f1a35 40%,#1a2850 70%,#1e3060 100%)';
  }
  // Day
  if (STORM_CODES.has(code))  return 'linear-gradient(to bottom,#1a1f2e 0%,#252c40 35%,#303850 65%,#3a4560 100%)';
  if (RAIN_CODES.has(code))   return 'linear-gradient(to bottom,#2c3e4f 0%,#3d5264 35%,#4f6678 65%,#607a8c 100%)';
  if (FOG_CODES.has(code))    return 'linear-gradient(to bottom,#6a7c88 0%,#8a9ca8 40%,#a8b8c4 70%,#c0d0d8 100%)';
  if (SNOW_CODES.has(code))   return 'linear-gradient(to bottom,#6070a0 0%,#8090b8 35%,#a8b8d0 65%,#d0dce8 100%)';
  if (code === 3)             return 'linear-gradient(to bottom,#4a5a68 0%,#607080 35%,#788898 65%,#8a9aaa 100%)';
  if (code === 2)             return 'linear-gradient(to bottom,#3070a8 0%,#4a88bc 35%,#70a8d0 65%,#a8cce0 100%)';
  if (code === 1)             return 'linear-gradient(to bottom,#1565c0 0%,#1e88e5 35%,#42a5f5 65%,#90caf9 100%)';
  // code 0: clear sky — vivid blue to pale horizon
  return 'linear-gradient(to bottom,#0d47a1 0%,#1565c0 20%,#1e88e5 50%,#64b5f6 80%,#b3e5fc 100%)';
}

function setBackground(code, isDay) {
  const key = `${code}_${isDay}`;
  if (key === currentBgKey) return;
  currentBgKey = key;

  const bg = document.getElementById('bg');
  bg.style.opacity = '0';
  setTimeout(() => {
    bg.style.backgroundImage = getGradient(code, isDay);
    bg.style.opacity = '1';
  }, 350);
}

// ── Device GPS ────────────────────────────────────────────────────────────

function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error('Geolocation denied')),
      { timeout: 8000 }
    );
  });
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
    { headers: { 'Accept-Language': 'en' } }
  );
  const data = res.ok ? await res.json() : {};
  const addr = data.address || {};
  return {
    lat,
    lon,
    city:  addr.city || addr.town || addr.village || addr.county || 'Your Location',
    state: addr.state_code || addr.state || '',
    zip:   addr.postcode || '',
  };
}

// ── ZIP → lat/lon via zippopotam.us ───────────────────────────────────────

async function zipToLatLon(zip) {
  const cacheKey = `weather_geo_zip_${zip}`;
  const cached = cacheGet(cacheKey, TTL.geo);
  if (cached) return cached;

  const res = await fetch(`https://api.zippopotam.us/us/${zip.trim()}`);
  if (!res.ok) throw new Error(`ZIP code "${zip}" not found.`);
  const data = await res.json();
  const place = data.places[0];
  const result = {
    lat: parseFloat(place.latitude),
    lon: parseFloat(place.longitude),
    city: place['place name'],
    state: place['state abbreviation'],
  };
  cacheSet(cacheKey, result);
  return result;
}

// ── City name → lat/lon via Open-Meteo geocoding ─────────────────────────

async function cityToLatLon(name) {
  const cacheKey = `weather_geo_city_${name.toLowerCase().trim()}`;
  const cached = cacheGet(cacheKey, TTL.geo);
  if (cached) return cached;

  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
  );
  if (!res.ok) throw new Error('Geocoding service unavailable.');
  const data = await res.json();
  if (!data.results?.length) throw new Error(`City "${name}" not found.`);
  const r = data.results[0];
  const state = r.country_code === 'US' ? (r.admin1 ?? r.country) : (r.country ?? r.country_code);
  const result = {
    lat: r.latitude,
    lon: r.longitude,
    city: r.name,
    state,
    zip: '',
  };
  cacheSet(cacheKey, result);
  return result;
}

// ── Open-Meteo forecast ───────────────────────────────────────────────────

async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    hourly: 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: 12,
  });
  const cacheKey = `weather_forecast_${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const cached = cacheGet(cacheKey, TTL.forecast);
  if (cached) return cached;

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('Weather data unavailable.');
  const data = await res.json();
  cacheSet(cacheKey, data);
  return data;
}

// ── Render ────────────────────────────────────────────────────────────────

function dayLabel(dateStr, index) {
  if (index === 0) return 'Today';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function dayDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderWeather(location, data) {
  lastWeatherData = data;

  const c = data.current;
  const d = data.daily;
  const info = wmo(c.weather_code);

  setBackground(c.weather_code, c.is_day === 1);

  const forecastCards = d.time.map((date, i) => {
    const di = wmo(d.weather_code[i]);
    const rain = d.precipitation_probability_max[i];
    return `
      <div class="day-card ${i === 0 ? 'today' : ''}" onclick="openDayDetail(${i})">
        <div class="day-name">${dayLabel(date, i)}</div>
        <div class="day-date">${dayDate(date)}</div>
        <div class="day-icon">${di.icon}</div>
        <div class="day-hi">${Math.round(d.temperature_2m_max[i])}°</div>
        <div class="day-lo">${Math.round(d.temperature_2m_min[i])}°</div>
        ${rain != null ? `<div class="day-rain">💧${rain}%</div>` : ''}
      </div>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <div class="current-card">
      <div class="location">${location.city}, ${location.state}${location.zip ? ' · ' + location.zip : ''}</div>
      <span class="big-icon">${info.icon}</span>
      <div class="condition-label">${info.label}</div>
      <div class="big-temp">${Math.round(c.temperature_2m)}°F</div>
      <div class="current-meta">
        <span>💨 ${Math.round(c.wind_speed_10m)} mph</span>
        <span>💧 ${c.relative_humidity_2m}% humidity</span>
        <span>Hi ${Math.round(d.temperature_2m_max[0])}° / Lo ${Math.round(d.temperature_2m_min[0])}°</span>
      </div>
    </div>

    <div class="forecast-title">12-Day Forecast</div>
    <div class="forecast-grid">${forecastCards}</div>
  `;
}

// ── Day detail sheet ──────────────────────────────────────────────────────

function openDayDetail(dayIndex) {
  if (!lastWeatherData) return;
  const d = lastWeatherData.daily;
  const h = lastWeatherData.hourly;
  const dateStr = d.time[dayIndex];
  const dayInfo = wmo(d.weather_code[dayIndex]);

  const dateObj = new Date(dateStr + 'T12:00:00');
  const fullDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const dayName = dayIndex === 0 ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'long' });

  const hours = h.time
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.startsWith(dateStr));

  const nowHour = dayIndex === 0
    ? new Date().toISOString().slice(0, 13)
    : null;

  const hourItems = hours.map(({ t, i }) => {
    const hourLabel = new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    const isNow = nowHour && t.startsWith(nowHour);
    const rain = h.precipitation_probability[i];
    return `
      <div class="hour-item ${isNow ? 'current-hour' : ''}">
        <div class="h-time">${isNow ? 'Now' : hourLabel}</div>
        <div class="h-icon">${wmo(h.weather_code[i]).icon}</div>
        <div class="h-temp">${Math.round(h.temperature_2m[i])}°</div>
        ${rain != null ? `<div class="h-rain">💧${rain}%</div>` : ''}
      </div>`;
  }).join('');

  const fmtTime = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const sunriseStr = d.sunrise?.[dayIndex] ? fmtTime(d.sunrise[dayIndex]) : null;
  const sunsetStr  = d.sunset?.[dayIndex]  ? fmtTime(d.sunset[dayIndex])  : null;
  const sunSection = (sunriseStr || sunsetStr) ? `
    <div class="sheet-section-label">Sun</div>
    <div class="sun-row">
      ${sunriseStr ? `<div class="sun-item"><div class="sun-label">Sunrise</div><div class="sun-time">🌅 ${sunriseStr}</div></div>` : ''}
      ${sunsetStr  ? `<div class="sun-item"><div class="sun-label">Sunset</div><div class="sun-time">🌇 ${sunsetStr}</div></div>`  : ''}
    </div>` : '';

  document.getElementById('detailContent').innerHTML = `
    <div class="sheet-header">
      <div class="sh-day">${dayName}</div>
      <div class="sh-date">${fullDate}</div>
      <div class="sh-summary">
        <span>${dayInfo.icon}</span>
        <span>${dayInfo.label}</span>
      </div>
      <div class="sh-hilo">
        Hi ${Math.round(d.temperature_2m_max[dayIndex])}° &nbsp;/&nbsp; Lo ${Math.round(d.temperature_2m_min[dayIndex])}°
      </div>
    </div>

    <div class="sheet-section-label">Hourly</div>
    <div class="hourly-scroll">${hourItems}</div>
    ${sunSection}
  `;

  document.getElementById('detailBackdrop').classList.add('open');
  document.getElementById('detailSheet').classList.add('open');
  setTimeout(() => {
    const cur = document.querySelector('.hour-item.current-hour');
    if (cur) cur.scrollIntoView({ inline: 'center', behavior: 'smooth' });
  }, 350);
}

function closeDetail() {
  document.getElementById('detailBackdrop').classList.remove('open');
  document.getElementById('detailSheet').classList.remove('open');
}

// ── IP geolocation ────────────────────────────────────────────────────────

async function ipToLocation() {
  const cacheKey = 'weather_ip_loc';
  const cached = cacheGet(cacheKey, TTL.ip);
  if (cached) return cached;

  const res = await fetch('https://ipapi.co/json/');
  if (!res.ok) throw new Error('IP lookup failed');
  const data = await res.json();
  if (!data.latitude) throw new Error('No coordinates from IP');
  const result = {
    lat: data.latitude,
    lon: data.longitude,
    city: data.city || 'Your Location',
    state: data.region_code || data.country_code || '',
    zip: data.postal || '',
  };
  cacheSet(cacheKey, result);
  return result;
}

// ── Main entry ────────────────────────────────────────────────────────────

async function loadWeather() {
  const query = document.getElementById('zipInput').value.trim() || DEFAULT_LOCATION;
  document.getElementById('zipInput').value = query;

  document.getElementById('app').innerHTML = '<p class="status-msg">Fetching forecast…</p>';

  try {
    const isZip = /^\d{5}$/.test(query);
    let location;
    if (isZip) {
      location = await zipToLatLon(query);
      location.zip = query;
    } else {
      location = await cityToLatLon(query);
    }
    const data = await fetchForecast(location.lat, location.lon);
    localStorage.setItem('weather_user_location', JSON.stringify({ query, location }));
    renderWeather(location, data);
  } catch (err) {
    document.getElementById('app').innerHTML = `
      <p class="error-msg">⚠️ ${err.message}</p>
      <p class="status-msg">Try a 5-digit ZIP code or a city name.</p>`;
  }
}

// Allow Enter key in input
document.getElementById('zipInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadWeather();
});

// Boot: last user search → GPS → IP geolocation → default city
(async () => {
  document.getElementById('app').innerHTML = '<p class="status-msg">Detecting your location…</p>';
  try {
    // Restore the user's last explicit search first
    const saved = localStorage.getItem('weather_user_location');
    if (saved) {
      const { query, location } = JSON.parse(saved);
      document.getElementById('zipInput').value = query;
      const data = await fetchForecast(location.lat, location.lon);
      renderWeather(location, data);
      return;
    }

    let location;
    try {
      const coords = await getDeviceLocation();
      location = await reverseGeocode(coords.lat, coords.lon);
    } catch {
      location = await ipToLocation();
    }
    if (location.zip) document.getElementById('zipInput').value = location.zip;
    const data = await fetchForecast(location.lat, location.lon);
    renderWeather(location, data);
  } catch {
    document.getElementById('zipInput').value = DEFAULT_LOCATION;
    loadWeather();
  }
})();
