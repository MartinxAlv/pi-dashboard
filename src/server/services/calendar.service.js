const axios = require('axios');

class CalendarService {
    async getEvents(apiKey, calendarId, maxResults = 10) {
        console.log('📅 Fetching Google Calendar events...');
        
        // Set time range for events (next 30 days)
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const calendarUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
        const params = new URLSearchParams({
            key: apiKey,
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: maxResults.toString()
        });
        
        const response = await axios.get(`${calendarUrl}?${params}`, {
            timeout: 15000
        });
        
        console.log(`✅ Calendar API success: ${response.data.items?.length || 0} events`);
        
        // Process and format events
        const events = (response.data.items || []).map(event => {
            let startTime, endTime;
            
            if (event.start.dateTime) {
                // Timed event
                startTime = new Date(event.start.dateTime);
                endTime = new Date(event.end.dateTime);
            } else if (event.start.date) {
                // All-day event
                startTime = new Date(event.start.date + 'T00:00:00');
                endTime = new Date(event.end.date + 'T23:59:59');
            }
            
            return {
                id: event.id,
                title: event.summary || 'Untitled Event',
                start: startTime.toISOString(),
                end: endTime.toISOString(),
                description: event.description || '',
                location: event.location || '',
                isAllDay: !event.start.dateTime,
                attendees: event.attendees ? event.attendees.length : 0,
                status: event.status || 'confirmed',
                created: event.created,
                updated: event.updated
            };
        });
        
        // Filter out past events and sort by start time
        const now = new Date();
        const upcomingEvents = events
            .filter(event => new Date(event.start) > now)
            .sort((a, b) => new Date(a.start) - new Date(b.start));
        
        return upcomingEvents;
    }

    async testConnection(apiKey, calendarId) {
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        
        const testUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
        const params = new URLSearchParams({
            key: apiKey,
            timeMin: timeMin,
            timeMax: timeMax,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '1'
        });
        
        const response = await axios.get(`${testUrl}?${params}`, { timeout: 10000 });
        
        return {
            success: true,
            message: 'Calendar API key is working correctly',
            eventsFound: response.data.items?.length || 0,
            calendarId: calendarId
        };
    }

    getSampleEvents() {
        return [
            {
                id: 'sample-1',
                title: 'Team Meeting',
                start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                end: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
                description: 'Weekly team sync',
                location: 'Conference Room A'
            },
            {
                id: 'sample-2', 
                title: 'Project Review',
                start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                end: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
                description: 'Q4 project milestone review',
                location: 'Online'
            },
            {
                id: 'sample-3',
                title: 'Client Call',
                start: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                end: new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString(),
                description: 'Monthly check-in call',
                location: 'Phone'
            }
        ];
    }
}

module.exports = CalendarService;