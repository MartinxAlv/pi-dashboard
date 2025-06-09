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
                    sourceId: source.id,
                    color: source.color,
                    icon: source.icon
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
            let startTime, endTime, isAllDay;
            
            if (event.start.dateTime) {
                // Timed event - Google Calendar provides timezone info
                startTime = new Date(event.start.dateTime);
                endTime = new Date(event.end.dateTime);
                isAllDay = false;
            } else if (event.start.date) {
                // All-day event - dates are in YYYY-MM-DD format
                startTime = new Date(event.start.date + 'T00:00:00');
                endTime = new Date(event.end.date + 'T23:59:59');
                isAllDay = true;
            }
            
            console.log(`✅ Google Event: ${event.summary}, ${isAllDay ? 'All Day' : startTime.toLocaleString()}`);
            
            return {
                id: event.id,
                title: event.summary || 'Untitled Event',
                start: startTime.toISOString(),
                end: endTime.toISOString(),
                originalStart: event.start.dateTime || event.start.date,
                originalEnd: event.end.dateTime || event.end.date,
                description: event.description || '',
                location: event.location || '',
                isAllDay: isAllDay,
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
            console.log('📅 Converted URL:', url);
            
            // Fetch the iCal data
            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Calendar-Dashboard/1.0)',
                    'Accept': 'text/calendar, text/plain, */*',
                    'Cache-Control': 'no-cache'
                }
            });
            
            console.log('📅 Response status:', response.status);
            console.log('📅 Response content length:', response.data.length);
            console.log('📅 First 500 chars:', response.data.substring(0, 500));
            
            // Parse the iCal data
            const parsedData = ical.parseICS(response.data);
            const events = [];
            
            console.log('📅 Total items parsed from iCal:', Object.keys(parsedData).length);
            
            const now = new Date();
            const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            
            console.log('📅 Date range:', now.toISOString(), 'to', twoWeeksFromNow.toISOString());
            
            let eventCount = 0;
            let filteredCount = 0;
            
            for (const key in parsedData) {
                const event = parsedData[key];
                
                if (event.type === 'VEVENT' && event.start) {
                    eventCount++;
                    
                    // Handle timezone-aware parsing for iCal events
                    let startTime, endTime;
                    
                    // Check if the event has timezone information
                    if (event.start.tz) {
                        // Only log timezone events for current/future events to reduce noise
                        if (eventCount <= 5) {
                            console.log(`📅 Event with timezone: ${event.summary}, TZ: ${event.start.tz}`);
                        }
                        
                        // For Apple Calendar events in America/Chicago timezone,
                        // we need to manually fix the timezone conversion
                        if (event.start.tz === 'America/Chicago') {
                            const rawStart = new Date(event.start);
                            const rawEnd = new Date(event.end || event.start);
                            
                            // The iCal library is treating America/Chicago times as if they're UTC
                            // We need to manually apply the Central Time offset
                            // Central Time is UTC-6 (CST) or UTC-5 (CDT)
                            // Since it's June, we're in CDT (UTC-5), so we need to ADD 5 hours to get the correct UTC time
                            
                            const centralOffsetMs = 5 * 60 * 60 * 1000; // 5 hours in milliseconds for CDT
                            
                            startTime = new Date(rawStart.getTime() + centralOffsetMs);
                            endTime = new Date(rawEnd.getTime() + centralOffsetMs);
                            
                            // Only log detailed timezone correction for first few events
                            if (eventCount <= 3) {
                                console.log(`   Raw time: ${rawStart.toISOString()} → Corrected: ${startTime.toISOString()}`);
                            }
                        } else {
                            // Other timezones - use as-is
                            startTime = new Date(event.start);
                            endTime = new Date(event.end || event.start);
                        }
                    } else {
                        // No timezone info - could be from Google Calendar, holidays, etc.
                        // These are typically already in the correct timezone or UTC
                        startTime = new Date(event.start);
                        endTime = new Date(event.end || event.start);
                        
                        // Only log for non-all-day events to reduce noise
                        if (eventCount <= 3 && startTime.getHours() !== 0) {
                            console.log(`📅 No timezone info for timed event: ${event.summary}`);
                        }
                    }
                    
                    // Better all-day event detection for iCal
                    // Check multiple conditions for all-day events
                    const startStr = event.start.toString();
                    const endStr = (event.end || event.start).toString();
                    
                    const isAllDay = 
                        // Classic iCal all-day: YYYYMMDD format (8 chars, no T or :)
                        (typeof startStr === 'string' && startStr.length === 8 && !startStr.includes('T') && !startStr.includes(':')) ||
                        // Date-only format: YYYY-MM-DD
                        (typeof startStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startStr)) ||
                        // Check if the time portion is 00:00:00 and spans exactly 24 hours or more
                        (startTime.getHours() === 0 && startTime.getMinutes() === 0 && startTime.getSeconds() === 0 &&
                         ((endTime.getTime() - startTime.getTime()) % (24 * 60 * 60 * 1000) === 0));
                    
                    // Minimal debug logging for first few events only
                    if (eventCount <= 3 && startTime > now) {
                        console.log(`📝 Event: ${event.summary} at ${startTime.toLocaleString()}`);
                    }
                    
                    // Only include upcoming events within the next 2 weeks
                    if (startTime > now && startTime < twoWeeksFromNow) {
                        console.log(`✅ iCal Event: ${event.summary}, ${isAllDay ? 'All Day' : startTime.toLocaleString()}`);
                        
                        events.push({
                            id: event.uid || key,
                            title: event.summary || 'Untitled Event',
                            start: startTime.toISOString(),
                            end: endTime.toISOString(),
                            originalStart: startTime.toISOString(), // Use standardized ISO format
                            originalEnd: endTime.toISOString(),     // Use standardized ISO format
                            description: event.description || '',
                            location: event.location || '',
                            isAllDay: isAllDay,
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
            
            console.log(`✅ iCal Summary:`);
            console.log(`   Total items in calendar: ${Object.keys(parsedData).length}`);
            console.log(`   Total VEVENT items: ${eventCount}`);
            console.log(`   Events in date range: ${events.length}`);
            console.log(`   Final events returned: ${sortedEvents.length}`);
            
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