const express = require('express');
const CalendarService = require('../services/calendar.service');
const SettingsService = require('../services/settings.service');

const router = express.Router();
const calendarService = new CalendarService();
const settingsService = new SettingsService();

// Multi-source Calendar API
router.get('/', async (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const calendarSources = dashboardState.settings.calendarSources || [];
        const maxResults = dashboardState.settings.maxCalendarEvents || 10;
        
        // Filter to only enabled sources
        const enabledSources = calendarSources.filter(s => s.enabled);
        
        // If no calendar sources configured, return sample data
        if (enabledSources.length === 0) {
            console.log('📅 No calendars configured, returning sample events');
            const sampleEvents = calendarService.getSampleEvents();
            dashboardState.calendar = sampleEvents;
            return res.json(sampleEvents);
        }

        const upcomingEvents = await calendarService.getAllEvents(enabledSources, maxResults);
        
        dashboardState.calendar = upcomingEvents;
        dashboardState.calendarLastUpdated = new Date();
        dashboardState.lastUpdated = new Date(); // Keep for compatibility
        
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

// Legacy calendar settings endpoint (for max events only)
router.post('/settings', (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const { maxCalendarEvents } = req.body;
        
        if (maxCalendarEvents) {
            const maxEvents = parseInt(maxCalendarEvents);
            if (maxEvents > 0 && maxEvents <= 50) {
                dashboardState.settings.maxCalendarEvents = maxEvents;
                console.log('Max calendar events updated:', maxEvents);
                
                // Save settings to file
                settingsService.saveSettings(dashboardState);
                
                // Broadcast settings change to all connected clients
                req.app.locals.io.emit('settingsUpdated', dashboardState);
                
                res.json({ 
                    success: true, 
                    settings: {
                        maxCalendarEvents: dashboardState.settings.maxCalendarEvents
                    }
                });
            } else {
                return res.status(400).json({ error: 'Invalid max events value' });
            }
        } else {
            return res.status(400).json({ error: 'No valid settings provided' });
        }
        
    } catch (error) {
        console.error('Error updating calendar settings:', error);
        res.status(500).json({ error: 'Failed to update calendar settings' });
    }
});

// Add new calendar source
router.post('/sources', (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const { name, type, url, apiKey, calendarId, icon, color } = req.body;
        
        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }
        
        // Initialize calendar sources if they don't exist
        if (!dashboardState.settings.calendarSources) {
            dashboardState.settings.calendarSources = [];
        }
        
        const newSource = {
            id: Date.now().toString(),
            name: name.trim(),
            type: type,
            enabled: true,
            icon: icon || 'calendar',
            color: color || '#607D8B',
            config: {}
        };
        
        if (type === 'ical') {
            if (!url) {
                return res.status(400).json({ error: 'URL is required for iCal calendars' });
            }
            newSource.config.url = url.trim();
        } else if (type === 'google') {
            if (!apiKey || !calendarId) {
                return res.status(400).json({ error: 'API key and calendar ID are required for Google calendars' });
            }
            newSource.config.apiKey = apiKey.trim();
            newSource.config.calendarId = calendarId.trim();
        }
        
        dashboardState.settings.calendarSources.push(newSource);
        
        // Save settings
        settingsService.saveSettings(dashboardState);
        
        // Broadcast settings change
        req.app.locals.io.emit('settingsUpdated', dashboardState);
        
        res.json({ success: true, source: newSource });
        
    } catch (error) {
        console.error('Error adding calendar source:', error);
        res.status(500).json({ error: 'Failed to add calendar source' });
    }
});

// Update calendar source
router.put('/sources/:id', (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const { id } = req.params;
        const { name, enabled, url, apiKey, calendarId, icon, color } = req.body;
        
        const sources = dashboardState.settings.calendarSources || [];
        const sourceIndex = sources.findIndex(s => s.id === id);
        
        if (sourceIndex === -1) {
            return res.status(404).json({ error: 'Calendar source not found' });
        }
        
        const source = sources[sourceIndex];
        
        if (name) source.name = name.trim();
        if (enabled !== undefined) source.enabled = enabled;
        if (icon) source.icon = icon;
        if (color) source.color = color;
        
        if (source.type === 'ical' && url) {
            source.config.url = url.trim();
        } else if (source.type === 'google') {
            if (apiKey) source.config.apiKey = apiKey.trim();
            if (calendarId) source.config.calendarId = calendarId.trim();
        }
        
        // Save settings
        settingsService.saveSettings(dashboardState);
        
        // Broadcast settings change
        req.app.locals.io.emit('settingsUpdated', dashboardState);
        
        res.json({ success: true, source });
        
    } catch (error) {
        console.error('Error updating calendar source:', error);
        res.status(500).json({ error: 'Failed to update calendar source' });
    }
});

// Delete calendar source
router.delete('/sources/:id', (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const { id } = req.params;
        
        if (!dashboardState.settings.calendarSources) {
            return res.status(404).json({ error: 'Calendar source not found' });
        }
        
        const initialLength = dashboardState.settings.calendarSources.length;
        dashboardState.settings.calendarSources = dashboardState.settings.calendarSources.filter(s => s.id !== id);
        
        if (dashboardState.settings.calendarSources.length === initialLength) {
            return res.status(404).json({ error: 'Calendar source not found' });
        }
        
        // Save settings
        settingsService.saveSettings(dashboardState);
        
        // Broadcast settings change
        req.app.locals.io.emit('settingsUpdated', dashboardState);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error deleting calendar source:', error);
        res.status(500).json({ error: 'Failed to delete calendar source' });
    }
});

// Test calendar source
router.post('/sources/:id/test', async (req, res) => {
    try {
        const { dashboardState } = req.app.locals;
        const { id } = req.params;
        
        const sources = dashboardState.settings.calendarSources || [];
        const source = sources.find(s => s.id === id);
        
        if (!source) {
            return res.status(404).json({ error: 'Calendar source not found' });
        }
        
        let result;
        
        if (source.type === 'google') {
            result = await calendarService.testConnection(source.config.apiKey, source.config.calendarId);
        } else if (source.type === 'ical') {
            // Test by trying to fetch a few events
            const events = await calendarService.getICalEvents(source.config.url, 3);
            result = {
                success: true,
                message: 'iCal calendar is accessible',
                eventsFound: events.length,
                url: source.config.url
            };
        }
        
        res.json(result);
        
    } catch (error) {
        console.error('Calendar source test error:', error);
        
        let errorMessage = 'Calendar test failed';
        if (error.message.includes('iCal')) {
            errorMessage = 'Failed to fetch iCal calendar. Check that the URL is correct and accessible.';
        }
        
        res.status(500).json({ error: errorMessage, details: error.message });
    }
});

module.exports = router;