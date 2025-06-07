const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for development
}));
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Store dashboard state
let dashboardState = {
  currentPage: 0,
  autoCycle: true,
  cycleInterval: parseInt(process.env.AUTO_CYCLE_INTERVAL) || 10000,
  weather: null,
  calendar: null,
  lastUpdated: new Date(),
  settings: {
    city: process.env.DEFAULT_CITY || 'Dallas,US',
    units: process.env.DEFAULT_UNITS || 'imperial',
    displayWidth: parseInt(process.env.DISPLAY_WIDTH) || 800,
    displayHeight: parseInt(process.env.DISPLAY_HEIGHT) || 480,
    weatherApiKey: process.env.WEATHER_API_KEY || null
  }
};

// API Rate Limiting
const apiCallTracker = {
  calls: [],
  maxCallsPerDay: 1000, // Official OpenWeatherMap free tier limit
  maxCallsPerMinute: 60, // Official rate limit per minute
  
  canMakeCall() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    
    // Remove calls older than 24 hours
    this.calls = this.calls.filter(callTime => callTime > oneDayAgo);
    
    // Check daily limit
    if (this.calls.length >= this.maxCallsPerDay) {
      return false;
    }
    
    // Check per-minute limit
    const callsLastMinute = this.calls.filter(callTime => callTime > oneMinuteAgo);
    if (callsLastMinute.length >= this.maxCallsPerMinute) {
      return false;
    }
    
    return true;
  },
  
  recordCall() {
    this.calls.push(new Date());
  },
  
  getCallsToday() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    this.calls = this.calls.filter(callTime => callTime > oneDayAgo);
    return this.calls.length;
  },
  
  getCallsLastMinute() {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    return this.calls.filter(callTime => callTime > oneMinuteAgo).length;
  },
  
  getTimeUntilReset() {
    if (this.calls.length === 0) return null;
    const oldestCall = new Date(Math.min(...this.calls));
    const resetTime = new Date(oldestCall.getTime() + 24 * 60 * 60 * 1000);
    return resetTime;
  }
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.get('/api/dashboard/state', (req, res) => {
  res.json(dashboardState);
});

app.post('/api/dashboard/settings', (req, res) => {
  try {
    const { city, units, cycleInterval, autoCycle, weatherApiKey } = req.body;
    
    if (city) {
      // Clean up city format (remove extra spaces)
      dashboardState.settings.city = city.trim().replace(/\s*,\s*/, ',');
    }
    if (units) dashboardState.settings.units = units;
    if (cycleInterval) dashboardState.cycleInterval = parseInt(cycleInterval);
    if (typeof autoCycle === 'boolean') dashboardState.autoCycle = autoCycle;
    if (weatherApiKey) {
      // Clean and validate API key
      const cleanApiKey = weatherApiKey.trim();
      if (cleanApiKey.length > 10) { // Basic validation
        dashboardState.settings.weatherApiKey = cleanApiKey;
        console.log('Weather API key updated successfully');
      } else {
        return res.status(400).json({ error: 'Invalid API key format' });
      }
    }
    
    // Broadcast settings change to all connected clients
    io.emit('settingsUpdated', dashboardState);
    
    console.log('Settings updated:', {
      city: dashboardState.settings.city,
      units: dashboardState.settings.units,
      autoCycle: dashboardState.autoCycle,
      cycleInterval: dashboardState.cycleInterval,
      hasApiKey: !!dashboardState.settings.weatherApiKey
    });
    
    res.json({ success: true, state: dashboardState });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Weather API (current + forecast)
app.get('/api/weather', async (req, res) => {
  try {
    const apiKey = dashboardState.settings.weatherApiKey || process.env.WEATHER_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Weather API key not configured. Please add your OpenWeatherMap API key in the admin panel.' 
      });
    }

    const city = req.query.city || dashboardState.settings.city || 'Dallas,US';
    const units = req.query.units || dashboardState.settings.units || 'imperial';
    
    console.log(`🌤️  Making weather API calls for "${city}"`);
    
    // Make both current weather and forecast calls
    const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${units}`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${units}`;
    
    console.log(`   Current: ${currentWeatherUrl.replace(apiKey, '***API_KEY***')}`);
    console.log(`   Forecast: ${forecastUrl.replace(apiKey, '***API_KEY***')}`);
    
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
    
    // Process 5-day forecast (get daily forecasts at noon)
    const forecastList = forecastResponse.data.list;
    const dailyForecasts = [];
    
    // Group forecasts by date and pick the one closest to noon
    const forecastsByDate = {};
    forecastList.forEach(forecast => {
      const date = new Date(forecast.dt * 1000).toDateString();
      const hour = new Date(forecast.dt * 1000).getHours();
      
      if (!forecastsByDate[date] || Math.abs(hour - 12) < Math.abs(forecastsByDate[date].hour - 12)) {
        forecastsByDate[date] = {
          ...forecast,
          hour: hour,
          date: date
        };
      }
    });
    
    // Convert to array and take first 5 days
    Object.values(forecastsByDate).slice(0, 5).forEach(forecast => {
      dailyForecasts.push({
        date: new Date(forecast.dt * 1000),
        temperature: {
          high: Math.round(forecast.main.temp_max),
          low: Math.round(forecast.main.temp_min),
          current: Math.round(forecast.main.temp)
        },
        description: forecast.weather[0].description,
        icon: forecast.weather[0].icon,
        humidity: forecast.main.humidity,
        windSpeed: forecast.wind.speed
      });
    });
    
    const weatherData = {
      current: currentWeather,
      forecast: dailyForecasts
    };
    
    dashboardState.weather = weatherData;
    dashboardState.lastUpdated = new Date();
    
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
        errorMessage = `City "${dashboardState.settings.city}" not found. Please check the city format (e.g., "Dallas,US", "London,GB").`;
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

// API Usage status endpoint
app.get('/api/usage', (req, res) => {
  const callsToday = apiCallTracker.getCallsToday();
  const callsLastMinute = apiCallTracker.getCallsLastMinute();
  const resetTime = apiCallTracker.getTimeUntilReset();
  
  res.json({
    callsToday,
    maxCallsPerDay: apiCallTracker.maxCallsPerDay,
    remaining: apiCallTracker.maxCallsPerDay - callsToday,
    percentUsed: Math.round((callsToday / apiCallTracker.maxCallsPerDay) * 100),
    callsLastMinute,
    maxCallsPerMinute: apiCallTracker.maxCallsPerMinute,
    resetTime: resetTime?.toISOString(),
    status: callsToday >= apiCallTracker.maxCallsPerDay ? 'limit_reached' : 
            callsToday >= apiCallTracker.maxCallsPerDay * 0.8 ? 'warning' : 'ok'
  });
});

// Reset settings to environment defaults
app.post('/api/dashboard/reset', (req, res) => {
  try {
    console.log('🔄 Resetting settings to .env defaults...');
    console.log('🔍 Environment variables:');
    console.log('   DEFAULT_CITY:', process.env.DEFAULT_CITY);
    console.log('   DEFAULT_UNITS:', process.env.DEFAULT_UNITS);
    console.log('   WEATHER_API_KEY set:', !!process.env.WEATHER_API_KEY);
    
    // Reset to .env defaults with forced fallback
    dashboardState.settings = {
      city: process.env.DEFAULT_CITY || 'Dallas,US',
      units: process.env.DEFAULT_UNITS || 'imperial',
      displayWidth: parseInt(process.env.DISPLAY_WIDTH) || 800,
      displayHeight: parseInt(process.env.DISPLAY_HEIGHT) || 480,
      weatherApiKey: process.env.WEATHER_API_KEY || null
    };
    
    dashboardState.autoCycle = true;
    dashboardState.cycleInterval = parseInt(process.env.AUTO_CYCLE_INTERVAL) || 10000;
    
    console.log('✅ Settings reset to:', {
      city: dashboardState.settings.city,
      units: dashboardState.settings.units,
      hasApiKey: !!dashboardState.settings.weatherApiKey
    });
    
    // Broadcast settings change to all connected clients
    io.emit('settingsUpdated', dashboardState);
    
    res.json({ 
      success: true, 
      message: 'Settings reset to .env defaults', 
      state: dashboardState,
      envValues: {
        DEFAULT_CITY: process.env.DEFAULT_CITY,
        DEFAULT_UNITS: process.env.DEFAULT_UNITS,
        hasWeatherApiKey: !!process.env.WEATHER_API_KEY
      }
    });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});

// Calendar API placeholder (will implement Google Calendar later)
app.get('/api/calendar', (req, res) => {
  // Placeholder calendar data
  const sampleEvents = [
    {
      id: 1,
      title: 'Team Meeting',
      start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 2,
      title: 'Project Review',
      start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString()
    }
  ];
  
  dashboardState.calendar = sampleEvents;
  res.json(sampleEvents);
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send initial state to new client
  socket.emit('dashboardState', dashboardState);
  
  // Handle page changes from admin
  socket.on('changePage', (pageIndex) => {
    dashboardState.currentPage = pageIndex;
    io.emit('pageChanged', pageIndex);
  });
  
  // Handle settings updates
  socket.on('updateSettings', (settings) => {
    Object.assign(dashboardState.settings, settings);
    if (settings.cycleInterval) {
      dashboardState.cycleInterval = settings.cycleInterval;
    }
    if (typeof settings.autoCycle === 'boolean') {
      dashboardState.autoCycle = settings.autoCycle;
    }
    io.emit('settingsUpdated', dashboardState);
  });
  
  // Handle theme changes from admin panel
  socket.on('themeChange', (theme) => {
    console.log('Theme updated:', theme);
    // Broadcast theme change to all connected dashboards
    socket.broadcast.emit('themeUpdated', theme);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Pi Dashboard running on port ${PORT}`);
  console.log(`📱 Dashboard: http://localhost:${PORT}`);
  console.log(`⚙️  Admin: http://localhost:${PORT}/admin`);
  console.log(`🌡️  Weather API: ${dashboardState.settings.weatherApiKey || process.env.WEATHER_API_KEY ? 'Configured' : 'Not configured - Add API key in admin panel'}`);
  console.log(`🏙️  Default City: ${dashboardState.settings.city}`);
  console.log(`🔧 Environment: DEFAULT_CITY=${process.env.DEFAULT_CITY || 'not set'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});