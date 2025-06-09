const axios = require('axios');

class WeatherService {
    constructor() {
        this.apiCallTracker = {
            calls: [],
            maxCallsPerDay: 1000,
            maxCallsPerMinute: 60
        };
    }

    canMakeCall() {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        
        // Remove calls older than 24 hours
        this.apiCallTracker.calls = this.apiCallTracker.calls.filter(callTime => callTime > oneDayAgo);
        
        // Check daily limit
        if (this.apiCallTracker.calls.length >= this.apiCallTracker.maxCallsPerDay) {
            return false;
        }
        
        // Check per-minute limit
        const callsLastMinute = this.apiCallTracker.calls.filter(callTime => callTime > oneMinuteAgo);
        if (callsLastMinute.length >= this.apiCallTracker.maxCallsPerMinute) {
            return false;
        }
        
        return true;
    }

    recordCall() {
        this.apiCallTracker.calls.push(new Date());
    }


    async getCurrentWeatherAndForecast(apiKey, city, units) {
        console.log(`🌤️  Making weather API calls for "${city}"`);
        
        const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${units}`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${units}`;
        
        // Execute both requests in parallel
        const [currentResponse, forecastResponse] = await Promise.all([
            axios.get(currentWeatherUrl, { timeout: 15000 }),
            axios.get(forecastUrl, { timeout: 15000 })
        ]);
        
        console.log(`✅ Weather API success for ${currentResponse.data.name}`);
        
        // Process current weather
        const currentWeather = {
            temperature: Math.round(currentResponse.data.main.temp),
            description: currentResponse.data.weather[0].description,
            icon: currentResponse.data.weather[0].icon,
            humidity: currentResponse.data.main.humidity,
            windSpeed: currentResponse.data.wind.speed,
            city: currentResponse.data.name,
            country: currentResponse.data.sys.country,
            timestamp: new Date().toISOString()
        };
        
        // Process 5-day forecast
        const forecastList = forecastResponse.data.list;
        const dailyForecasts = [];
        
        // Group forecasts by date and calculate actual daily highs/lows
        const forecastsByDate = {};
        forecastList.forEach(forecast => {
            const date = new Date(forecast.dt * 1000).toDateString();
            const hour = new Date(forecast.dt * 1000).getHours();
            const temp = forecast.main.temp;
            
            if (!forecastsByDate[date]) {
                forecastsByDate[date] = {
                    forecasts: [],
                    maxTemp: temp,
                    minTemp: temp,
                    noonForecast: null,
                    noonHourDiff: 24
                };
            }
            
            // Track all forecasts for this date
            forecastsByDate[date].forecasts.push(forecast);
            
            // Update daily max/min temperatures
            forecastsByDate[date].maxTemp = Math.max(forecastsByDate[date].maxTemp, temp);
            forecastsByDate[date].minTemp = Math.min(forecastsByDate[date].minTemp, temp);
            
            // Find forecast closest to noon for weather icon/description
            const hourDiff = Math.abs(hour - 12);
            if (hourDiff < forecastsByDate[date].noonHourDiff) {
                forecastsByDate[date].noonForecast = forecast;
                forecastsByDate[date].noonHourDiff = hourDiff;
            }
        });
        
        // Convert to array and take first 5 days
        Object.keys(forecastsByDate).slice(0, 5).forEach(dateStr => {
            const dayData = forecastsByDate[dateStr];
            const noonForecast = dayData.noonForecast;
            
            dailyForecasts.push({
                date: new Date(noonForecast.dt * 1000),
                temperature: {
                    high: Math.round(dayData.maxTemp),
                    low: Math.round(dayData.minTemp),
                    current: Math.round(noonForecast.main.temp)
                },
                description: noonForecast.weather[0].description,
                icon: noonForecast.weather[0].icon,
                humidity: noonForecast.main.humidity,
                windSpeed: noonForecast.wind.speed
            });
        });
        
        return {
            current: currentWeather,
            forecast: dailyForecasts
        };
    }
}

module.exports = WeatherService;