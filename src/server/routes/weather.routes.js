const express = require('express');
const WeatherService = require('../services/weather.service');

const router = express.Router();
const weatherService = new WeatherService();

// Weather API (current + forecast)
router.get('/', async (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const apiKey = dashboardState.settings.weatherApiKey || process.env.WEATHER_API_KEY;
        
        if (!apiKey) {
            return res.status(500).json({ 
                error: 'Weather API key not configured. Please add your OpenWeatherMap API key in the admin panel.' 
            });
        }

        const city = req.query.city || dashboardState.settings.city || 'Dallas,US';
        const units = req.query.units || dashboardState.settings.units || 'imperial';
        
        const weatherData = await weatherService.getCurrentWeatherAndForecast(apiKey, city, units);
        
        dashboardState.weather = weatherData;
        dashboardState.weatherLastUpdated = new Date();
        dashboardState.lastUpdated = new Date(); // Keep for compatibility
        
        res.json(weatherData);
    } catch (error) {
        console.error('❌ Weather API error:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            code: error.code
        });
        
        let errorMessage = 'Failed to fetch weather data';
        
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            
            if (status === 401) {
                errorMessage = 'Invalid API key. Please check your OpenWeatherMap API key is correct and active. New keys can take up to 2 hours to activate.';
            } else if (status === 404) {
                errorMessage = `City "${req.app.locals.dashboardState.settings.city}" not found. Please check the city format (e.g., "Dallas,US", "London,GB").`;
            } else if (status === 429) {
                errorMessage = 'API rate limit exceeded. Please wait a moment and try again.';
            } else {
                errorMessage = `Weather API error (${status}): ${data.message || 'Unknown error'}`;
            }
        } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Network error. Please check your internet connection.';
        }
        
        res.status(500).json({ error: errorMessage });
    }
});

module.exports = router;