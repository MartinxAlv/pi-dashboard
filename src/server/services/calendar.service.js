const axios = require('axios');
const ical = require('ical');

class CalendarService {
    // Fetch events from multiple calendar sources
    async getAllEvents(calendarSources = [], maxResults = 10) {
        console.log('📅 Fetching events from multiple calendar sources...');
        
        const allEvents = [];
        
        for (const source of calendarSources) {
            if (!source.enabled) continue;
            
            try {
                let events = [];
                
                if (source.type === 'google') {
                    events = await this.getGoogleEvents(
                        source.config.apiKey, 
                        source.config.calendarId, 
                        maxResults
                    );
                } else if (source.type === 'ical') {
                    events = await this.getICalEvents(source.config.url, maxResults);
                }
                
                // Add source info to events
                events = events.map(event => ({
                    ...event,
                    source: source.name,
                    sourceId: source.id
                }));
                
                allEvents.push(...events);
                
            } catch (error) {
                console.error(`❌ Error fetching from ${source.name}:`, error.message);
                // Continue with other sources if one fails
            }
        }
        
        // Sort all events by start time and limit results
        const sortedEvents = allEvents
            .sort((a, b) => new Date(a.start) - new Date(b.start))
            .slice(0, maxResults);
        
        console.log(`✅ Combined ${sortedEvents.length} events from ${calendarSources.filter(s => s.enabled).length} sources`);
        return sortedEvents;
    }

    async getGoogleEvents(apiKey, calendarId, maxResults = 10) {
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

    // Legacy method for backward compatibility
    async getEvents(apiKey, calendarId, maxResults = 10) {
        return this.getGoogleEvents(apiKey, calendarId, maxResults);
    }

    // Parse iCal/webcal calendar feeds
    async getICalEvents(icalUrl, maxResults = 10) {
        console.log('📅 Fetching iCal events from:', icalUrl);
        
        try {
            // Convert webcal:// to https://
            const url = icalUrl.replace(/^webcal:\/\//, 'https://');
            
            // Fetch the iCal data
            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Calendar-Dashboard/1.0)'
                }
            });
            
            // Parse the iCal data
            const parsedData = ical.parseICS(response.data);
            const events = [];
            
            const now = new Date();
            const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            
            for (const key in parsedData) {
                const event = parsedData[key];
                
                if (event.type === 'VEVENT' && event.start) {
                    const startTime = new Date(event.start);
                    const endTime = new Date(event.end || event.start);
                    
                    // Only include upcoming events within the next 30 days
                    if (startTime > now && startTime < thirtyDaysFromNow) {
                        events.push({
                            id: event.uid || key,
                            title: event.summary || 'Untitled Event',
                            start: startTime.toISOString(),
                            end: endTime.toISOString(),
                            description: event.description || '',
                            location: event.location || '',
                            isAllDay: !event.start.dateTime,
                            attendees: 0,
                            status: 'confirmed',
                            created: event.created ? new Date(event.created).toISOString() : new Date().toISOString(),
                            updated: event.lastmodified ? new Date(event.lastmodified).toISOString() : new Date().toISOString()
                        });
                    }
                }
            }
            
            // Sort by start time and limit results
            const sortedEvents = events
                .sort((a, b) => new Date(a.start) - new Date(b.start))
                .slice(0, maxResults);
            
            console.log(`✅ iCal parsed: ${sortedEvents.length} upcoming events`);
            return sortedEvents;
            
        } catch (error) {
            console.error('❌ iCal parsing error:', error.message);
            throw new Error(`Failed to fetch iCal calendar: ${error.message}`);
        }
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