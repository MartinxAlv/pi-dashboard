const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import routes and services
const weatherRoutes = require('./routes/weather.routes');
const calendarRoutes = require('./routes/calendar.routes');
const hueRoutes = require('./routes/hue.routes');
const SettingsService = require('./services/settings.service');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable for development
}));
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize settings service and load persistent settings
const settingsService = new SettingsService();
let dashboardState = settingsService.loadSettings();

// Add runtime-only properties
dashboardState.currentPage = 0;
dashboardState.weather = null;
dashboardState.calendar = null;
dashboardState.hue = null;
dashboardState.lastUpdated = new Date();

console.log('📋 Dashboard state loaded:', {
    hasWeatherKey: !!dashboardState.settings.weatherApiKey,
    hasCalendarKey: !!dashboardState.settings.googleCalendarApiKey,
    hasHueConfig: !!(dashboardState.settings.hueBridgeIp && dashboardState.settings.hueUsername),
    city: dashboardState.settings.city,
    autoCycle: dashboardState.autoCycle
});

// Make state available to routes
app.locals.dashboardState = dashboardState;
app.locals.io = io;

// Serve static files from new organized structure
app.use(express.static(path.join(__dirname, '../client/dashboard')));
app.use('/admin', express.static(path.join(__dirname, '../client/admin')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dashboard', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/admin', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Settings info endpoint
app.get('/api/dashboard/settings-info', (req, res) => {
    try {
        const fileInfo = settingsService.getFileInfo();
        res.json({
            success: true,
            fileInfo: fileInfo,
            currentSettings: {
                hasWeatherKey: !!dashboardState.settings.weatherApiKey,
                hasCalendarKey: !!dashboardState.settings.googleCalendarApiKey,
                hasHueConfig: !!(dashboardState.settings.hueBridgeIp && dashboardState.settings.hueUsername),
                city: dashboardState.settings.city,
                autoCycle: dashboardState.autoCycle,
                lastSaved: dashboardState.lastSaved
            }
        });
    } catch (error) {
        console.error('Error getting settings info:', error);
        res.status(500).json({ error: 'Failed to get settings info' });
    }
});

// Timezone settings endpoint
app.post('/api/dashboard/timezone', (req, res) => {
    try {
        const { timezone } = req.body;
        
        if (!timezone) {
            return res.status(400).json({ error: 'Timezone is required' });
        }
        
        // Validate timezone
        const validTimezones = [
            'auto', 'America/New_York', 'America/Chicago', 'America/Denver', 
            'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
            'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo',
            'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney', 'UTC'
        ];
        
        if (!validTimezones.includes(timezone)) {
            return res.status(400).json({ error: 'Invalid timezone' });
        }
        
        dashboardState.settings.timezone = timezone;
        dashboardState.lastSaved = new Date().toISOString();
        
        // Save settings
        settingsService.saveSettings(dashboardState);
        
        // Broadcast settings change to all connected clients
        io.emit('settingsUpdated', dashboardState);
        
        console.log(`✅ Timezone updated to: ${timezone}`);
        
        res.json({ 
            success: true, 
            timezone: timezone,
            message: `Timezone set to ${timezone}` 
        });
        
    } catch (error) {
        console.error('Error updating timezone:', error);
        res.status(500).json({ error: 'Failed to update timezone' });
    }
});

// API Routes
app.get('/api/dashboard/state', (req, res) => {
    res.json(dashboardState);
});

app.post('/api/dashboard/settings', (req, res) => {
    try {
        const { city, units, cycleInterval, autoCycle, weatherApiKey, panels } = req.body;
        
        if (city) {
            dashboardState.settings.city = city.trim().replace(/\s*,\s*/, ',');
        }
        if (units) dashboardState.settings.units = units;
        if (cycleInterval) dashboardState.cycleInterval = parseInt(cycleInterval);
        if (typeof autoCycle === 'boolean') dashboardState.autoCycle = autoCycle;
        if (weatherApiKey) {
            const cleanApiKey = weatherApiKey.trim();
            if (cleanApiKey.length > 10) {
                dashboardState.settings.weatherApiKey = cleanApiKey;
                console.log('Weather API key updated successfully');
            } else {
                return res.status(400).json({ error: 'Invalid API key format' });
            }
        }
        if (panels && typeof panels === 'object') {
            dashboardState.settings.panels = panels;
            console.log('Panel settings updated:', panels);
        }
        
        // Save settings to file
        settingsService.saveSettings(dashboardState);
        
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

// Reset settings to defaults
app.post('/api/dashboard/reset', (req, res) => {
    try {
        console.log('🔄 Resetting settings to defaults...');
        
        const defaultSettings = settingsService.getDefaultSettings();
        Object.assign(dashboardState, defaultSettings);
        
        console.log('✅ Settings reset to defaults:', {
            city: dashboardState.settings.city,
            units: dashboardState.settings.units,
            autoCycle: dashboardState.autoCycle
        });
        
        // Save reset settings to file
        settingsService.saveSettings(dashboardState);
        
        // Broadcast settings change to all connected clients
        io.emit('settingsUpdated', dashboardState);
        
        res.json({ 
            success: true, 
            message: 'Settings reset to defaults', 
            state: dashboardState
        });
    } catch (error) {
        console.error('Error resetting settings:', error);
        res.status(500).json({ error: 'Failed to reset settings' });
    }
});

// Use API routes
app.use('/api/weather', weatherRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/hue', hueRoutes);

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
        
        // Auto-save settings with debouncing
        settingsService.autoSave(dashboardState);
        
        io.emit('settingsUpdated', dashboardState);
    });
    
    // Handle theme changes from admin panel
    socket.on('themeChange', (theme) => {
        console.log('Theme updated:', theme);
        // Broadcast theme change to all connected dashboards
        socket.broadcast.emit('themeUpdated', theme);
    });
    
    // Handle panel changes from admin panel
    socket.on('panelsChanged', (panels) => {
        console.log('📋 Panels updated:', panels);
        // Broadcast panel changes to all connected dashboards
        io.emit('panelsChanged', panels);
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
    console.log(`🌡️  Weather API: ${dashboardState.settings.weatherApiKey ? 'Configured' : 'Not configured - Add API key in admin panel'}`);
    console.log(`📅 Calendar API: ${dashboardState.settings.googleCalendarApiKey ? 'Configured' : 'Not configured - Add API key in admin panel'}`);
    console.log(`💡 Hue Bridge: ${dashboardState.settings.hueBridgeIp && dashboardState.settings.hueUsername ? 'Configured' : 'Not configured - Set up in admin panel'}`);
    console.log(`🏙️  City: ${dashboardState.settings.city}`);
    console.log(`💾 Settings: Persistent storage enabled`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

module.exports = app;