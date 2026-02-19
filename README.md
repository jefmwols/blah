# 12-Day Weather Forecast

A single-file weather forecast web app (`index.html`) that shows current conditions, a 12-day daily forecast, and hourly detail for any day. No build step, no dependencies, no API keys required.

## Features

- **Auto-detects your location** on load via IP geolocation
- **Search by US ZIP code** to get weather for any location
- **12-day forecast** with daily high/low, precipitation probability, sunrise/sunset
- **Hourly breakdown** — tap any day card for an hour-by-hour detail sheet
- **Dynamic backgrounds** pulled from Unsplash based on current weather conditions
- Units: Fahrenheit, mph, inches

## Usage

Open `index.html` directly in a browser — no server required.

```
open index.html
```

To look up a location, type a US ZIP code into the search bar and press Enter.

## APIs Used

| API | Purpose | Docs |
|-----|---------|------|
| **Open-Meteo** | Weather forecast data (current, hourly, daily) | [open-meteo.com/en/docs](https://open-meteo.com/en/docs) |
| **Zippopotam.us** | ZIP code → latitude/longitude lookup | [zippopotam.us](https://www.zippopotam.us/) |
| **ipapi.co** | IP-based geolocation on page load | [ipapi.co/api](https://ipapi.co/api/) |
| **Unsplash Source** | Dynamic background images by weather keyword | [unsplash.com/documentation](https://unsplash.com/documentation) |

### Open-Meteo

Free and open-source weather API. No authentication needed. The app requests:
- `current`: temperature, weather code, wind speed, humidity, day/night flag
- `daily`: weather code, max/min temperature, precipitation probability, sunrise/sunset (12 days)
- `hourly`: temperature, weather code, precipitation probability, wind speed

Endpoint: `https://api.open-meteo.com/v1/forecast`

### Zippopotam.us

Free REST API for ZIP code lookups. Returns place name, state, latitude, and longitude.

Endpoint: `https://api.zippopotam.us/us/{zip}`

### ipapi.co

Free IP geolocation API (no key required for basic use). Used once on page load to pre-fill the user's location.

Endpoint: `https://ipapi.co/json/`

### Unsplash Source

Random photo endpoint filtered by keyword. Used to set a weather-appropriate background image.

Endpoint: `https://source.unsplash.com/1600x900/?{keyword}`
