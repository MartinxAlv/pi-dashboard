const express = require('express');
const CalendarService = require('../services/calendar.service');
const SettingsService = require('../services/settings.service');

const router = express.Router();
const calendarService = new CalendarService();
const settingsService = new SettingsService();

// Google Calendar API
router.get('/', async (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const apiKey = dashboardState.settings.googleCalendarApiKey || process.env.GOOGLE_CALENDAR_API_KEY;
        const calendarId = dashboardState.settings.calendarId || process.env.GOOGLE_CALENDAR_ID;
        
        // If no API key or calendar ID, return sample data
        if (!apiKey || !calendarId) {
            console.log('📅 Google Calendar not configured, returning sample events');
            const sampleEvents = calendarService.getSampleEvents();
            dashboardState.calendar = sampleEvents;
            return res.json(sampleEvents);
        }

        const maxResults = dashboardState.settings.maxCalendarEvents;
        const upcomingEvents = await calendarService.getEvents(apiKey, calendarId, maxResults);
        
        dashboardState.calendar = upcomingEvents;
        dashboardState.lastUpdated = new Date();
        
        res.json(upcomingEvents);
        
    } catch (error) {
        console.error('❌ Calendar API error:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
        });
        
        let errorMessage = 'Failed to fetch calendar events';
        
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            
            if (status === 401) {
                errorMessage = 'Invalid Google Calendar API key. Please check your API key is correct and has Calendar API access.';
            } else if (status === 403) {
                errorMessage = 'Google Calendar API access denied. Check API key permissions and quotas.';
            } else if (status === 404) {
                errorMessage = 'Calendar not found. Please check the Calendar ID is correct and publicly accessible.';
            } else {
                errorMessage = `Google Calendar API error (${status}): ${data.error?.message || 'Unknown error'}`;
            }
        } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Network error connecting to Google Calendar API.';
        }
        
        // Return sample events on error so dashboard still works
        const fallbackEvents = [
            {
                id: 'error-sample',
                title: 'Calendar Error',
                start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                description: errorMessage,
                location: 'Error'
            }
        ];
        
        req.app.locals.dashboardState.calendar = fallbackEvents;
        res.status(500).json({ error: errorMessage, fallbackEvents });
    }
});

// Calendar settings endpoint
router.post('/settings', (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const { googleCalendarApiKey, calendarId, maxCalendarEvents } = req.body;
        
        if (googleCalendarApiKey) {
            const cleanApiKey = googleCalendarApiKey.trim();
            if (cleanApiKey.length > 10) {
                dashboardState.settings.googleCalendarApiKey = cleanApiKey;
                console.log('Google Calendar API key updated');
            } else {
                return res.status(400).json({ error: 'Invalid API key format' });
            }
        }
        
        if (calendarId) {
            dashboardState.settings.calendarId = calendarId.trim();
            console.log('Calendar ID updated:', calendarId);
        }
        
        if (maxCalendarEvents) {
            const maxEvents = parseInt(maxCalendarEvents);
            if (maxEvents > 0 && maxEvents <= 50) {
                dashboardState.settings.maxCalendarEvents = maxEvents;
                console.log('Max calendar events updated:', maxEvents);
            }
        }
        
        // Save settings to file
        settingsService.saveSettings(dashboardState);
        
        // Broadcast settings change to all connected clients
        req.app.locals.io.emit('settingsUpdated', dashboardState);
        
        res.json({ 
            success: true, 
            settings: {
                hasApiKey: !!dashboardState.settings.googleCalendarApiKey,
                calendarId: dashboardState.settings.calendarId,
                maxCalendarEvents: dashboardState.settings.maxCalendarEvents
            }
        });
        
    } catch (error) {
        console.error('Error updating calendar settings:', error);
        res.status(500).json({ error: 'Failed to update calendar settings' });
    }
});

// Test calendar endpoint
router.get('/test', async (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const apiKey = dashboardState.settings.googleCalendarApiKey;
        const calendarId = dashboardState.settings.calendarId;
        
        if (!apiKey) {
            return res.status(400).json({ error: 'No Google Calendar API key configured' });
        }
        
        if (!calendarId) {
            return res.status(400).json({ error: 'No Calendar ID configured' });
        }
        
        const result = await calendarService.testConnection(apiKey, calendarId);
        res.json(result);
        
    } catch (error) {
        console.error('Calendar test error:', error);
        
        let errorMessage = 'Calendar test failed';
        if (error.response) {
            const status = error.response.status;
            if (status === 401) {
                errorMessage = 'Invalid API key or API key lacks Calendar API permissions';
            } else if (status === 404) {
                errorMessage = 'Calendar not found. Check that the Calendar ID is correct and the calendar is publicly accessible.';
            } else if (status === 403) {
                errorMessage = 'API key lacks Calendar API permissions or has reached quota limits';
            }
        }
        
        res.status(500).json({ error: errorMessage, details: error.message });
    }
});

module.exports = router;