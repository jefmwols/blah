const DEFAULT_LOCATION = 'Nashville';
let lastWeatherData = null;

// ── Weather code helpers ──────────────────────────────────────────────────

const WMO = {
  0:  { label: 'Clear Sky',         icon: '☀️',  bg: 'clear sky sunshine blue',        grad: '#1a6ba0,#87CEEB' },
  1:  { label: 'Mainly Clear',      icon: '🌤️', bg: 'partly cloudy blue sky',          grad: '#2a7ab5,#90c8e0' },
  2:  { label: 'Partly Cloudy',     icon: '⛅',  bg: 'partly cloudy sky',               grad: '#3a6b8a,#90a8c0' },
  3:  { label: 'Overcast',          icon: '☁️',  bg: 'overcast grey sky clouds',        grad: '#3a4a5a,#6a7a8a' },
  45: { label: 'Foggy',             icon: '🌫️', bg: 'foggy misty morning nature',      grad: '#5a6a7a,#8a9aaa' },
  48: { label: 'Icy Fog',           icon: '🌫️', bg: 'foggy misty winter',              grad: '#5a6a7a,#9aaabb' },
  51: { label: 'Light Drizzle',     icon: '🌦️', bg: 'light rain drizzle nature',       grad: '#2a4a6a,#4a7a9a' },
  53: { label: 'Drizzle',           icon: '🌧️', bg: 'rainy day grey sky',              grad: '#2a4060,#405070' },
  55: { label: 'Heavy Drizzle',     icon: '🌧️', bg: 'heavy rain storm clouds',         grad: '#202a3a,#304050' },
  61: { label: 'Light Rain',        icon: '🌦️', bg: 'rain drops water nature',         grad: '#1a3a5a,#2a5070' },
  63: { label: 'Rain',              icon: '🌧️', bg: 'rainy weather grey',              grad: '#1a304a,#2a4060' },
  65: { label: 'Heavy Rain',        icon: '🌧️', bg: 'heavy rain storm dark clouds',    grad: '#101a2a,#202a3a' },
  71: { label: 'Light Snow',        icon: '🌨️', bg: 'light snowfall winter landscape', grad: '#5a6a8a,#b0c0d8' },
  73: { label: 'Snow',              icon: '❄️',  bg: 'snow winter landscape serene',    grad: '#4a5a7a,#a0b0c8' },
  75: { label: 'Heavy Snow',        icon: '❄️',  bg: 'heavy snowstorm blizzard',        grad: '#3a4a6a,#8090a8' },
  77: { label: 'Snow Grains',       icon: '🌨️', bg: 'snow grains winter sky',          grad: '#4a5a78,#9aaac0' },
  80: { label: 'Rain Showers',      icon: '🌦️', bg: 'rain shower clouds nature',       grad: '#1a3a5a,#3a5a7a' },
  81: { label: 'Heavy Showers',     icon: '🌧️', bg: 'heavy rain shower storm',         grad: '#101a2a,#1a2a3a' },
  82: { label: 'Violent Showers',   icon: '⛈️', bg: 'violent storm rain dark sky',     grad: '#0a1020,#101a28' },
  85: { label: 'Snow Showers',      icon: '🌨️', bg: 'snow shower winter',              grad: '#3a4a6a,#8090b0' },
  86: { label: 'Heavy Snow Showers',icon: '❄️',  bg: 'heavy snowfall blizzard',         grad: '#2a3a5a,#6070a0' },
  95: { label: 'Thunderstorm',      icon: '⛈️', bg: 'thunderstorm lightning dark sky',  grad: '#0a0f1a,#0f1a28' },
  96: { label: 'Thunderstorm+Hail', icon: '⛈️', bg: 'thunderstorm hail storm',          grad: '#080e18,#0e1820' },
  99: { label: 'Severe Storm',      icon: '⛈️', bg: 'severe thunderstorm lightning',    grad: '#060b12,#0b1018' },
};

function wmo(code) {
  return WMO[code] ?? { label: 'Unknown', icon: '🌡️', bg: 'sky nature', grad: '#1a1a2e,#2a2a4e' };
}

// ── Background image ──────────────────────────────────────────────────────

let currentBgKeyword = '';

function setBackground(code, isDay) {
  const info = wmo(code);
  const keyword = info.bg + (isDay === false ? ' night' : '');
  if (keyword === currentBgKeyword) return;
  currentBgKeyword = keyword;

  const bg = document.getElementById('bg');
  bg.style.opacity = '0';

  const encoded = encodeURIComponent(keyword);
  const img = new Image();
  const url = `https://source.unsplash.com/1600x900/?${encoded}`;
  img.onload = () => {
    bg.style.backgroundImage = `url('${img.src}')`;
    bg.style.opacity = '1';
  };
  img.onerror = () => {
    const [c1, c2] = info.grad.split(',');
    bg.style.backgroundImage = `linear-gradient(160deg, ${c1}, ${c2})`;
    bg.style.opacity = '1';
  };
  img.src = url;
}

// ── ZIP → lat/lon via zippopotam.us ───────────────────────────────────────

async function zipToLatLon(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${zip.trim()}`);
  if (!res.ok) throw new Error(`ZIP code "${zip}" not found.`);
  const data = await res.json();
  const place = data.places[0];
  return {
    lat: parseFloat(place.latitude),
    lon: parseFloat(place.longitude),
    city: place['place name'],
    state: place['state abbreviation'],
  };
}

// ── City name → lat/lon via Open-Meteo geocoding ─────────────────────────

async function cityToLatLon(name) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
  );
  if (!res.ok) throw new Error('Geocoding service unavailable.');
  const data = await res.json();
  if (!data.results?.length) throw new Error(`City "${name}" not found.`);
  const r = data.results[0];
  const state = r.country_code === 'US' ? (r.admin1 ?? r.country) : (r.country ?? r.country_code);
  return {
    lat: r.latitude,
    lon: r.longitude,
    city: r.name,
    state,
    zip: '',
  };
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
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('Weather data unavailable.');
  return res.json();
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

// ── Device GPS geolocation ────────────────────────────────────────────────

function deviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(new Error(err.message)),
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}

// ── Reverse geocoding via Nominatim ───────────────────────────────────────

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('Reverse geocoding failed');
  const data = await res.json();
  const addr = data.address || {};
  const city  = addr.city || addr.town || addr.village || addr.county || 'Your Location';
  const state = addr.state_code || addr.state || addr.country_code?.toUpperCase() || '';
  const zip   = addr.postcode || '';
  return { lat, lon, city, state, zip };
}

// ── IP geolocation ────────────────────────────────────────────────────────

async function ipToLocation() {
  const res = await fetch('https://ipapi.co/json/');
  if (!res.ok) throw new Error('IP lookup failed');
  const data = await res.json();
  if (!data.latitude) throw new Error('No coordinates from IP');
  return {
    lat: data.latitude,
    lon: data.longitude,
    city: data.city || 'Your Location',
    state: data.region_code || data.country_code || '',
    zip: data.postal || '',
  };
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

// Boot: try device GPS → IP geolocation → default location
(async () => {
  document.getElementById('app').innerHTML = '<p class="status-msg">Detecting your location…</p>';
  try {
    const { lat, lon } = await deviceLocation();
    const location = await reverseGeocode(lat, lon);
    if (location.zip) document.getElementById('zipInput').value = location.zip;
    else document.getElementById('zipInput').value = location.city;
    const data = await fetchForecast(location.lat, location.lon);
    renderWeather(location, data);
  } catch {
    // Device GPS unavailable or denied — fall back to IP geolocation
    try {
      const location = await ipToLocation();
      if (location.zip) document.getElementById('zipInput').value = location.zip;
      const data = await fetchForecast(location.lat, location.lon);
      renderWeather(location, data);
    } catch {
      document.getElementById('zipInput').value = DEFAULT_LOCATION;
      loadWeather();
    }
  }
})();
