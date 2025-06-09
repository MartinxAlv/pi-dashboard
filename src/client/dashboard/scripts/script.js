class Dashboard {
    constructor() {
        this.currentPage = 0;
        this.totalPages = 3;
        this.autoCycle = true;
        this.cycleInterval = 10000;
        this.cycleTimer = null;
        this.socket = null;
        this.weatherUpdateInterval = null;
        this.calendarUpdateInterval = null;
        this.hueUpdateInterval = null;
        this.statusEl = null; // Track the status element
        this.panels = { datetime: true, calendar: true, hue: true }; // Panel visibility
        this.activePanels = []; // Array of active panel indices
        this.calendarScrollInterval = null; // Calendar auto-scroll
        this.touchPauseTimeout = null; // Touch pause timer
        this.isPaused = false; // Touch pause state
        this.countdownInterval = null; // Touch pause countdown
        this.touchPauseClickHandler = null; // Touch pause click handler
        this.originalAutoCycleSetting = true; // Store original auto-cycle setting for touch pause
        
        this.init();
    }

    init() {
        this.setupSocket();
        this.setupEventListeners();
        this.startClock();
        this.loadWeather();
        this.loadCalendar();
        this.loadHue();
        this.initializePanels(); // Initialize panel visibility
        this.startAutoCycle();
        this.loadTheme(); // Load saved theme
        this.updateCycleButton(); // Initialize pause button state
        this.setupTouchPause(); // Setup touch-to-pause functionality
        
        // Update weather every 30 minutes (instead of 10)
        this.weatherUpdateInterval = setInterval(() => {
            this.loadWeather();
        }, 30 * 60 * 1000);
        
        // Update calendar every 5 minutes
        this.calendarUpdateInterval = setInterval(() => {
            this.loadCalendar();
        }, 5 * 60 * 1000);
        
        // Update Hue lights every 30 seconds
        this.hueUpdateInterval = setInterval(() => {
            this.loadHue();
        }, 30 * 1000);
    }

    setupSocket() {
        this.socket = io();
        
        // MEGA DEBUG: Create status indicator that's impossible to hide
        console.log('=== CREATING STATUS INDICATOR ===');
        
        // Remove any existing status elements
        const existingElements = document.querySelectorAll('#status, .status-indicator');
        existingElements.forEach(el => {
            console.log('Removing existing status element:', el);
            el.remove();
        });
        
        // Create a properly styled status indicator
        this.statusEl = document.createElement('div');
        this.statusEl.id = 'status';
        
        // Nice, clean status indicator styling
        this.statusEl.style.cssText = `
            width: 12px !important;
            height: 12px !important;
            position: fixed !important;
            top: 10px !important;
            right: 10px !important;
            z-index: 1000 !important;
            border-radius: 50% !important;
            border: 2px solid rgba(255, 255, 255, 0.8) !important;
            pointer-events: none !important;
            opacity: 1 !important;
            visibility: visible !important;
            transition: background-color 0.3s ease !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
        `;
        
        // Add it to the body
        document.body.appendChild(this.statusEl);
        
        console.log('Clean status indicator created');
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            if (this.statusEl) {
                this.statusEl.style.backgroundColor = '#4CAF50'; // Green
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            if (this.statusEl) {
                this.statusEl.style.backgroundColor = '#f44336'; // Red
            }
        });
        
        this.socket.on('pageChanged', (pageIndex) => {
            this.goToPage(pageIndex);
        });
        
        this.socket.on('settingsUpdated', (state) => {
            this.autoCycle = state.autoCycle;
            this.cycleInterval = state.cycleInterval;
            this.dashboardState = state; // Store state for timezone access
            
            if (this.autoCycle) {
                this.startAutoCycle();
            } else {
                this.stopAutoCycle();
            }
            
            // Update the visual cycle button to match the new state
            this.updateCycleButton();
            
            // If timezone changed, refresh calendar display
            if (state.settings?.timezone) {
                localStorage.setItem('dashboardTimezone', state.settings.timezone);
                this.loadCalendar(); // Refresh to apply new timezone
            }
        });

        // Listen for theme updates from admin
        this.socket.on('themeUpdated', (theme) => {
            this.applyTheme(theme);
        });
        
        this.socket.on('panelsChanged', (panels) => {
            this.updatePanelVisibility(panels);
        });
        
        // Set initial connecting state
        if (this.statusEl) {
            this.statusEl.style.backgroundColor = '#ff9800'; // Orange for connecting
        }
    }

    loadTheme() {
        // Load theme from localStorage (saved by admin panel)
        const savedTheme = localStorage.getItem('adminTheme');
        if (savedTheme) {
            try {
                const theme = JSON.parse(savedTheme);
                this.applyTheme(theme);
            } catch (e) {
                console.warn('Failed to load saved theme:', e);
            }
        }
    }

    applyTheme(theme) {
        if (!theme) return;
        
        const root = document.documentElement;
        root.style.setProperty('--dashboard-bg-start', theme.bgStart || theme.primary);
        root.style.setProperty('--dashboard-bg-end', theme.bgEnd || theme.secondary);
        
        // Save theme to localStorage so it persists
        localStorage.setItem('adminTheme', JSON.stringify(theme));
        
        console.log('Applied theme:', theme);
    }

    setupEventListeners() {
        // Navigation areas removed - using swipe gestures only
        
        // Page indicators
        document.querySelectorAll('.indicator').forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                this.goToPage(index);
            });
        });
        
        
        // Touch gestures for navigation - Simplified for single-touch screens
        let touchStartX = undefined;
        let touchEndX = 0;
        let touchStartTime = 0;
        
        // Add touch debugging
        const debugTouch = (event, type) => {
            console.log(`Touch ${type}:`, {
                touches: event.touches.length,
                changedTouches: event.changedTouches.length,
                targetTouches: event.targetTouches.length,
                timestamp: Date.now()
            });
        };
        
        document.addEventListener('touchstart', (e) => {
            debugTouch(e, 'START');
            
            // Check if touch is on an interactive element (sliders, buttons, etc.)
            const target = e.target;
            const isInteractive = target.matches('input[type="range"], .light-slider, button, .light-toggle, .scene-btn, .master-btn') ||
                                 target.closest('.light-controls, .hue-scenes, .master-controls, .light-card');
            
            if (isInteractive) {
                console.log('🎛️ Touch on interactive element, skipping swipe detection');
                e.stopPropagation(); // Prevent event bubbling
                return; // Don't track swipe gestures on interactive elements
            }
            
            // Show visual touch indicator
            const touch = e.changedTouches[0];
            this.showTouchIndicator(touch.clientX, touch.clientY);
            
            touchStartX = touch.clientX;
            touchStartTime = Date.now();
        });
        
        document.addEventListener('touchmove', (e) => {
            // Touch move handling for swipe detection
        });
        
        document.addEventListener('touchend', (e) => {
            debugTouch(e, 'END');
            
            // Check if this touch started on an interactive element
            const target = e.target;
            const isInteractive = target.matches('input[type="range"], .light-slider, button, .light-toggle, .scene-btn, .master-btn') ||
                                 target.closest('.light-controls, .hue-scenes, .master-controls, .light-card');
            
            if (isInteractive) {
                console.log('🎛️ Touch end on interactive element, skipping swipe detection');
                e.stopPropagation(); // Prevent event bubbling
                return; // Don't process swipe gestures on interactive elements
            }
            
            // Only process swipe if we have valid start coordinates
            if (touchStartX === undefined) {
                return;
            }
            
            touchEndX = e.changedTouches[0].clientX;
            const touchDuration = Date.now() - touchStartTime;
            
            console.log('Touch duration:', touchDuration, 'ms');
            
            // Handle swipe gestures with corrected direction
            const swipeThreshold = 80; // Threshold for Pi touchscreen
            const diff = touchStartX - touchEndX;
            
            if (Math.abs(diff) > swipeThreshold) {
                if (diff > 0) {
                    // Swipe left (finger moved left) = go to previous page
                    console.log('👋 Swipe left detected');
                    this.previousPage();
                    this.showNotification('← Previous page');
                } else {
                    // Swipe right (finger moved right) = go to next page
                    console.log('👋 Swipe right detected');
                    this.nextPage();
                    this.showNotification('→ Next page');
                }
            }
        });
        
        // Mouse swipe detection for testing (no long press)
        let mouseStartX = 0;
        let mousePressed = false;
        
        document.addEventListener('mousedown', (e) => {
            // Check if mouse is on an interactive element
            const target = e.target;
            const isInteractive = target.matches('input[type="range"], .light-slider, button, .light-toggle, .scene-btn, .master-btn') ||
                                 target.closest('.light-controls, .hue-scenes, .master-controls, .light-card');
            
            if (isInteractive) {
                e.stopPropagation(); // Prevent event bubbling
                return; // Don't track mouse gestures on interactive elements
            }
            
            mouseStartX = e.clientX;
            mousePressed = true;
        });
        
        document.addEventListener('mouseup', (e) => {
            // Check if mouse is on an interactive element
            const target = e.target;
            const isInteractive = target.matches('input[type="range"], .light-slider, button, .light-toggle, .scene-btn, .master-btn') ||
                                 target.closest('.light-controls, .hue-scenes, .master-controls, .light-card');
            
            if (isInteractive) {
                e.stopPropagation(); // Prevent event bubbling
                mousePressed = false; // Reset state
                return; // Don't track mouse gestures on interactive elements
            }
            
            if (!mousePressed) return;
            mousePressed = false;
            
            const mouseEndX = e.clientX;
            const diff = mouseStartX - mouseEndX;
            
            // Mouse swipe detection only
            if (Math.abs(diff) > 100) {
                console.log('🖱️ Mouse swipe:', diff > 0 ? 'left' : 'right');
                if (diff > 0) {
                    this.nextPage();
                } else {
                    this.previousPage();
                }
            }
        });
        
        const handleSwipe = () => {
            // This is now handled in the touch events above
        };
        
        this.handleSwipe = handleSwipe;

        // Listen for theme changes from admin panel (same origin)
        window.addEventListener('storage', (e) => {
            if (e.key === 'adminTheme' && e.newValue) {
                try {
                    const theme = JSON.parse(e.newValue);
                    this.applyTheme(theme);
                } catch (err) {
                    console.warn('Failed to parse theme from storage:', err);
                }
            }
        });
        
        // Prevent context menu on long press (kiosk mode)
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Prevent text selection (kiosk mode)
        document.addEventListener('selectstart', (e) => {
            e.preventDefault();
        });
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            
            // Update time with seconds
            const timeOptions = {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            };
            document.getElementById('time').textContent = now.toLocaleTimeString('en-US', timeOptions);
            
            // Update date
            const dateOptions = {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            document.getElementById('date').textContent = now.toLocaleDateString('en-US', dateOptions);
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }

    async loadWeather() {
        try {
            const response = await fetch('/api/weather');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Weather fetch failed');
            }
            
            const weather = await response.json();
            this.updateWeatherDisplay(weather);
        } catch (error) {
            console.error('Error loading weather:', error);
            
            let errorMessage = 'Weather unavailable';
            let errorIcon = '❌';
            
            if (error.message.includes('API key')) {
                errorMessage = 'API key needed';
                errorIcon = '🔑';
            } else if (error.message.includes('City not found')) {
                errorMessage = 'City not found';
                errorIcon = '🏙️';
            } else if (error.message.includes('Network error')) {
                errorMessage = 'Network error';
                errorIcon = '📶';
            }
            
            this.updateWeatherDisplay({
                temperature: '--',
                description: errorMessage,
                icon: errorIcon,
                city: 'Error',
                country: ''
            });
        }
    }

    updateWeatherDisplay(weather) {
        // Handle both old format (direct weather) and new format (with current + forecast)
        const currentWeather = weather.current || weather;
        
        // Use OpenWeatherMap's actual weather icons
        const iconCode = currentWeather.icon;
        const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
        const weatherIconElement = document.getElementById('weather-icon');
        
        // Replace emoji with actual weather icon
        weatherIconElement.innerHTML = `<img src="${iconUrl}" alt="${currentWeather.description}" class="weather-icon-img">`;
        
        document.getElementById('temperature').textContent = `${currentWeather.temperature}°`;
        document.getElementById('weather-desc').textContent = currentWeather.description;
        document.getElementById('weather-location').textContent = `${currentWeather.city}, ${currentWeather.country}`;
        
        // Add last updated timestamp
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
        document.getElementById('weather-updated').textContent = `Updated: ${timeStr}`;
        
        // Update forecast if available
        if (weather.forecast && weather.forecast.length > 0) {
            this.updateForecastDisplay(weather.forecast);
        }
    }

    updateForecastDisplay(forecast) {
        const forecastContainer = document.getElementById('forecast-list');
        
        const forecastHtml = forecast.map(day => {
            const date = new Date(day.date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const isToday = date.toDateString() === new Date().toDateString();
            
            // Use OpenWeatherMap's actual weather icons
            const iconUrl = `https://openweathermap.org/img/wn/${day.icon}@2x.png`;
            
            return `
                <div class="forecast-item">
                    <div class="forecast-day">${isToday ? 'Today' : dayName}</div>
                    <div class="forecast-icon">
                        <img src="${iconUrl}" alt="${day.description}" class="forecast-icon-img">
                    </div>
                    <div class="forecast-temps">
                        <div class="forecast-high">${day.temperature.high}°</div>
                        <div class="forecast-low">${day.temperature.low}°</div>
                    </div>
                    <div class="forecast-desc">${day.description}</div>
                </div>
            `;
        }).join('');
        
        forecastContainer.innerHTML = forecastHtml;
    }

    async loadCalendar() {
        try {
            const response = await fetch('/api/calendar');
            if (!response.ok) throw new Error('Calendar fetch failed');
            
            const events = await response.json();
            this.updateCalendarDisplay(events);
        } catch (error) {
            console.error('Error loading calendar:', error);
            this.updateCalendarDisplay([]);
        }
    }

    updateCalendarDisplay(events) {
        const eventsContainer = document.getElementById('events-list');
        
        if (!events || events.length === 0) {
            eventsContainer.innerHTML = '<div class="loading">No upcoming events</div>';
            return;
        }
        
        // Get timezone setting from dashboard state
        const timezone = this.getTimezoneSettings();
        
        const eventsHtml = events.map(event => {
            // Use original timezone-aware strings when available (preserves correct time)
            // Fall back to ISO strings for compatibility
            const startDateStr = event.originalStart || event.start;
            const endDateStr = event.originalEnd || event.end;
            
            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);
            
            // Simplified logging - only show if there are issues
            if (Math.abs(startDate.getTime() - new Date(event.start).getTime()) > 60000) {
                console.log(`⚠️ Time difference detected for: ${event.title}`);
                console.log(`  Original: ${startDateStr} vs ISO: ${event.start}`);
            }
            
            // Create time range string (start - end time)
            let timeStr;
            if (event.isAllDay) {
                timeStr = 'All Day';
            } else {
                // Always use the formatDateTime method for consistent timezone handling
                const startTimeStr = this.formatDateTime(startDate, timezone, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                
                const endTimeStr = this.formatDateTime(endDate, timezone, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                
                // If start and end are on the same day, just show time range
                if (startDate.toDateString() === endDate.toDateString()) {
                    timeStr = `${startTimeStr} - ${endTimeStr}`;
                } else {
                    // Multi-day event
                    timeStr = `${startTimeStr} - ${this.formatDateTime(endDate, timezone, { month: 'short', day: 'numeric' })} ${endTimeStr}`;
                }
            }
            
            const dateStr = this.formatDateTime(startDate, timezone, {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
            
            // Icon mapping function
            const getIconEmoji = (iconType) => {
                const iconMap = {
                    'calendar': '📅',
                    'work': '💼',
                    'personal': '🏠',
                    'school': '🎓',
                    'family': '👨‍👩‍👧‍👦',
                    'health': '🏥',
                    'sports': '⚽',
                    'travel': '✈️',
                    'birthday': '🎂',
                    'meeting': '📞',
                    'event': '🎉',
                    'task': '✅'
                };
                return iconMap[iconType] || '📅';
            };
            
            // Get calendar-based color and icon
            const getCalendarVisuals = (event) => {
                // If event has custom color and icon from calendar source, use them
                if (event.color && event.icon) {
                    return { color: event.color, icon: getIconEmoji(event.icon) };
                }
                
                const source = event.source || 'default';
                const title = (typeof event.title === 'object' ? 
                    (event.title.val || event.title.value || 'Untitled Event') : 
                    event.title).toLowerCase();
                
                // Calendar-specific colors and icons (fallback)
                const calendarStyles = {
                    'personal': { color: '#4CAF50', icon: '🏠' },
                    'work': { color: '#2196F3', icon: '💼' },
                    'family': { color: '#FF9800', icon: '👨‍👩‍👧‍👦' },
                    'holidays': { color: '#F44336', icon: '🎉' },
                    'birthdays': { color: '#E91E63', icon: '🎂' },
                    'appointments': { color: '#9C27B0', icon: '🏥' },
                    'default': { color: '#607D8B', icon: '📅' }
                };
                
                // Try to match calendar source name
                let style = calendarStyles.default;
                for (const [key, val] of Object.entries(calendarStyles)) {
                    if (source.toLowerCase().includes(key)) {
                        style = val;
                        break;
                    }
                }
                
                // If no calendar match, try title-based icons with calendar color
                if (style === calendarStyles.default) {
                    if (title.includes('meeting') || title.includes('call')) {
                        style = { ...style, icon: '📞' };
                    } else if (title.includes('lunch') || title.includes('dinner') || title.includes('meal')) {
                        style = { ...style, icon: '🍽️' };
                    } else if (title.includes('birthday') || title.includes('party')) {
                        style = { ...style, icon: '🎉' };
                    } else if (title.includes('appointment') || title.includes('doctor') || title.includes('medical')) {
                        style = { ...style, icon: '🏥' };
                    } else if (title.includes('travel') || title.includes('flight') || title.includes('trip')) {
                        style = { ...style, icon: '✈️' };
                    } else if (title.includes('exercise') || title.includes('gym') || title.includes('workout')) {
                        style = { ...style, icon: '💪' };
                    } else if (event.isAllDay) {
                        style = { ...style, icon: '📅' };
                    } else {
                        style = { ...style, icon: '📋' };
                    }
                }
                
                return style;
            };
            
            // Handle title that might be an object or string
            const eventTitle = typeof event.title === 'object' ? 
                (event.title.val || event.title.value || 'Untitled Event') : 
                event.title;
            
            const calendarVisuals = getCalendarVisuals(event);
            
            // Helper function to convert hex to RGB
            const hexToRgb = (hex) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? 
                    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
                    '96, 125, 139'; // fallback color
            };

            return `
                <div class="event-item" style="border-left: 4px solid ${calendarVisuals.color};">
                    <div class="event-icon" style="color: ${calendarVisuals.color};">${calendarVisuals.icon}</div>
                    <div class="event-details">
                        <div class="event-title">${eventTitle}</div>
                        <div class="event-time">${timeStr}</div>
                        <div class="event-date">${dateStr}</div>
                        ${event.source ? `<div class="event-source" style="color: ${calendarVisuals.color}; font-weight: 600; font-size: 0.85rem; background: rgba(${hexToRgb(calendarVisuals.color)}, 0.1); padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px;">${event.icon ? getIconEmoji(event.icon) : calendarVisuals.icon} ${event.source}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        eventsContainer.innerHTML = eventsHtml;
        
        // Start auto-scroll for calendar events if we have multiple events
        this.startCalendarAutoScroll();
    }

    startCalendarAutoScroll() {
        // Clear any existing scroll interval
        if (this.calendarScrollInterval) {
            clearInterval(this.calendarScrollInterval);
        }

        const eventsContainer = document.getElementById('events-list');
        if (!eventsContainer || eventsContainer.children.length <= 3) {
            return; // Don't scroll if we have 3 or fewer events (all visible)
        }

        // Auto-scroll every 3 seconds when calendar page is active
        this.calendarScrollInterval = setInterval(() => {
            if (this.currentPage === 1 && !this.isPaused) { // Calendar is page 1
                const scrollHeight = eventsContainer.scrollHeight;
                const clientHeight = eventsContainer.clientHeight;
                const currentScroll = eventsContainer.scrollTop;
                
                // Scroll down by one event height (approximately)
                const eventHeight = 80; // Approximate height of one event
                const newScroll = currentScroll + eventHeight;
                
                if (newScroll >= scrollHeight - clientHeight) {
                    // We've reached the bottom, scroll back to top
                    eventsContainer.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    // Scroll down
                    eventsContainer.scrollTo({ top: newScroll, behavior: 'smooth' });
                }
            }
        }, 3000); // Scroll every 3 seconds
    }

    setupTouchPause() {
        // Add touch/click listeners to pause auto-cycling
        document.addEventListener('touchstart', (e) => this.pauseForTouch(e));
        document.addEventListener('click', (e) => this.pauseForTouch(e));
        
        // Also listen for mouse interaction
        document.addEventListener('mousedown', (e) => this.pauseForTouch(e));
    }

    pauseForTouch(event) {
        // Don't trigger touch pause if clicking on control buttons or if already paused
        if (this.isPaused) return;
        
        const target = event?.target;
        if (target && (
            target.closest('.control-btn') || 
            target.closest('.indicator') ||
            target.closest('#pause-indicator')
        )) {
            return; // Ignore clicks on control buttons
        }
        
        console.log('👆 Touch detected - pausing for 1 minute');
        
        // Set pause state
        this.isPaused = true;
        
        // Stop auto-cycling
        if (this.cycleTimer) {
            clearTimeout(this.cycleTimer);
            this.cycleTimer = null;
        }
        
        // Stop calendar scrolling
        if (this.calendarScrollInterval) {
            clearInterval(this.calendarScrollInterval);
        }
        
        // Clear any existing pause timeout
        if (this.touchPauseTimeout) {
            clearTimeout(this.touchPauseTimeout);
        }
        
        // Show pause indicator
        this.showPauseIndicator();
        
        // Resume after 1 minute
        this.touchPauseTimeout = setTimeout(() => {
            console.log('⏰ Resuming auto-cycle after 1 minute');
            this.isPaused = false;
            this.hidePauseIndicator();
            
            // Resume auto-cycling if it was enabled
            if (this.autoCycle) {
                this.startAutoCycle();
            }
            
            // Resume calendar scrolling
            this.startCalendarAutoScroll();
        }, 60000); // 1 minute
    }

    showPauseIndicator() {
        const cycleControl = document.getElementById('cycle-control');
        const cycleIcon = document.getElementById('cycle-icon');
        
        if (cycleControl && cycleIcon) {
            // Save original auto-cycle setting and temporarily disable
            this.originalAutoCycleSetting = this.autoCycle;
            this.autoCycle = false;
            this.updateCycleButton();
            
            // Add countdown to the existing button
            let seconds = 60;
            
            // Create countdown display
            const updateCountdown = () => {
                cycleIcon.textContent = `⏸️`;
                cycleControl.title = `Touch Paused - Click to resume or wait ${seconds}s`;
                cycleControl.classList.add('touch-paused');
            };
            
            updateCountdown();
            
            // Add click handler to allow manual unpause
            const handleTouchPauseClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('👆 Touch pause cancelled by user click');
                this.cancelTouchPause();
            };
            
            // Store the handler so we can remove it later
            this.touchPauseClickHandler = handleTouchPauseClick;
            cycleControl.addEventListener('click', handleTouchPauseClick);
            
            // Start countdown
            this.countdownInterval = setInterval(() => {
                seconds--;
                updateCountdown();
                
                if (seconds <= 0) {
                    clearInterval(this.countdownInterval);
                }
            }, 1000);
        }
    }

    cancelTouchPause() {
        // Clear the touch pause timeout
        if (this.touchPauseTimeout) {
            clearTimeout(this.touchPauseTimeout);
            this.touchPauseTimeout = null;
        }
        
        // Resume immediately
        this.isPaused = false;
        this.hidePauseIndicator();
        
        // Resume auto-cycling and calendar scrolling with original setting
        if (this.originalAutoCycleSetting) {
            this.startAutoCycle();
        }
        this.startCalendarAutoScroll();
    }

    hidePauseIndicator() {
        const cycleControl = document.getElementById('cycle-control');
        
        if (cycleControl) {
            // Restore original auto-cycle setting
            this.autoCycle = this.originalAutoCycleSetting;
            this.updateCycleButton();
            cycleControl.classList.remove('touch-paused');
            
            // Remove touch pause click handler
            if (this.touchPauseClickHandler) {
                cycleControl.removeEventListener('click', this.touchPauseClickHandler);
                this.touchPauseClickHandler = null;
            }
            
            // Clear countdown
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
            }
        }
    }

    // ===== PANEL MANAGEMENT =====
    async initializePanels() {
        try {
            const response = await fetch('/api/dashboard/state');
            if (response.ok) {
                const state = await response.json();
                if (state.settings && state.settings.panels) {
                    this.updatePanelVisibility(state.settings.panels);
                } else {
                    // Default: all panels enabled
                    this.updatePanelVisibility({ datetime: true, calendar: true, hue: true });
                }
            }
        } catch (error) {
            console.error('Error loading panel settings:', error);
            // Default: all panels enabled
            this.updatePanelVisibility({ datetime: true, calendar: true, hue: true });
        }
    }

    updatePanelVisibility(panels) {
        console.log('📋 Updating panel visibility:', panels);
        this.panels = panels;
        
        // Get all panel elements
        const datetimePage = document.getElementById('page-0');
        const calendarPage = document.getElementById('page-1');
        const huePage = document.getElementById('page-2');
        
        // Show/hide panels
        datetimePage.style.display = panels.datetime ? 'flex' : 'none';
        calendarPage.style.display = panels.calendar ? 'flex' : 'none';
        huePage.style.display = panels.hue ? 'flex' : 'none';
        
        // Build active panels list
        this.activePanels = [];
        if (panels.datetime) this.activePanels.push(0);
        if (panels.calendar) this.activePanels.push(1);
        if (panels.hue) this.activePanels.push(2);
        
        // Update total pages and indicators
        this.totalPages = this.activePanels.length;
        this.updatePageIndicators();
        
        // Ensure current page is valid
        if (this.currentPage >= this.activePanels.length) {
            this.currentPage = 0;
        }
        
        // Go to the first active page
        if (this.activePanels.length > 0) {
            this.goToPage(0, true); // true = use active panel index
        }
        
        console.log('📋 Active panels:', this.activePanels, 'Total pages:', this.totalPages);
    }

    updatePageIndicators() {
        const indicatorsContainer = document.querySelector('.page-indicators');
        if (!indicatorsContainer) return;
        
        // Clear existing indicators
        indicatorsContainer.innerHTML = '';
        
        // Create indicators for active panels only
        this.activePanels.forEach((panelIndex, index) => {
            const indicator = document.createElement('div');
            indicator.className = `indicator ${index === this.currentPage ? 'active' : ''}`;
            indicator.setAttribute('data-page', index.toString());
            indicator.addEventListener('click', () => {
                this.goToPage(index, true); // true = use active panel index
            });
            indicatorsContainer.appendChild(indicator);
        });
    }

    goToPage(pageIndex, useActivePanels = false) {
        if (pageIndex < 0 || pageIndex >= this.totalPages) return;
        
        // Convert active panel index to actual page index if needed
        const actualCurrentPage = useActivePanels && this.activePanels.length > 0 ? this.activePanels[this.currentPage] : this.currentPage;
        const actualNewPage = useActivePanels && this.activePanels.length > 0 ? this.activePanels[pageIndex] : pageIndex;
        
        if (actualNewPage === undefined) return;
        
        const currentPageEl = document.getElementById(`page-${actualCurrentPage}`);
        const newPageEl = document.getElementById(`page-${actualNewPage}`);
        const currentIndicator = document.querySelector(`.indicator[data-page="${this.currentPage}"]`);
        const newIndicator = document.querySelector(`.indicator[data-page="${pageIndex}"]`);
        
        if (!currentPageEl || !newPageEl) return;
        
        // Determine direction (forward = right-to-left slide, backward = left-to-right slide)
        const isForward = pageIndex > this.currentPage;
        
        // Clear any existing transition classes
        const allPages = document.querySelectorAll('.page');
        allPages.forEach(page => {
            page.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right', 'prev');
        });
        
        // Set up new page initial position
        if (isForward) {
            // Moving forward: new page starts from right
            newPageEl.classList.add('slide-in-right');
        } else {
            // Moving backward: new page starts from left  
            newPageEl.classList.add('slide-in-left');
        }
        
        // Force a reflow to ensure the initial position is set
        newPageEl.offsetHeight;
        
        // Start the transition
        currentPageEl.classList.remove('active');
        
        if (isForward) {
            // Moving forward: current page slides out left
            currentPageEl.classList.add('slide-out-left');
        } else {
            // Moving backward: current page slides out right
            currentPageEl.classList.add('slide-out-right');
        }
        
        // Bring in the new page
        newPageEl.classList.remove('slide-in-left', 'slide-in-right');
        newPageEl.classList.add('active');
        
        // Update indicators
        if (currentIndicator) currentIndicator.classList.remove('active');
        if (newIndicator) newIndicator.classList.add('active');
        
        // Clean up after transition
        setTimeout(() => {
            allPages.forEach(page => {
                page.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right', 'prev');
            });
        }, 450); // Slightly less than CSS transition time
        
        this.currentPage = pageIndex;
        
        // Handle calendar auto-scroll when switching pages
        const actualPage = useActivePanels && this.activePanels.length > 0 ? this.activePanels[pageIndex] : pageIndex;
        if (actualPage === 1) { // Calendar page
            this.startCalendarAutoScroll();
        } else {
            // Stop calendar scrolling when not on calendar page
            if (this.calendarScrollInterval) {
                clearInterval(this.calendarScrollInterval);
            }
        }
        
        // Notify admin panel of page change (for live preview)
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'pageChanged',
                    pageIndex: pageIndex
                }, '*');
            }
        } catch (e) {
            // Ignore errors if not in iframe
        }
        
        // Restart auto cycle (only if not paused)
        if (this.autoCycle && !this.isPaused) {
            this.startAutoCycle();
        }
    }

    nextPage() {
        const nextPage = (this.currentPage + 1) % this.totalPages;
        this.goToPage(nextPage, true); // Use active panels
    }

    previousPage() {
        const prevPage = (this.currentPage - 1 + this.totalPages) % this.totalPages;
        this.goToPage(prevPage, true); // Use active panels
    }

    startAutoCycle() {
        this.stopAutoCycle();
        if (this.autoCycle) {
            this.cycleTimer = setTimeout(() => {
                this.nextPage();
            }, this.cycleInterval);
        }
    }

    stopAutoCycle() {
        if (this.cycleTimer) {
            clearTimeout(this.cycleTimer);
            this.cycleTimer = null;
        }
    }

    toggleAutoCycle() {
        this.autoCycle = !this.autoCycle;
        if (this.autoCycle) {
            this.startAutoCycle();
        } else {
            this.stopAutoCycle();
        }
        
        // Update button appearance
        this.updateCycleButton();
        
        // Update the socket to sync with admin panel
        if (this.socket) {
            this.socket.emit('updateSettings', {
                autoCycle: this.autoCycle
            });
        }
        
        // Show brief notification
        this.showNotification(`Auto-cycle ${this.autoCycle ? 'enabled' : 'disabled'}`);
    }

    toggleAutoCycleFromMenu() {
        this.toggleAutoCycle();
        // Close the menu after toggling
        const overlay = document.getElementById('quick-actions-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    // Kiosk mode helper methods
    exitKioskMode() {
        console.log('🚪 Attempting to exit kiosk mode...');
        
        // Try multiple methods to exit fullscreen/kiosk
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        // Try to close window (works if opened programmatically)
        try {
            window.close();
        } catch (e) {
            console.log('Cannot close window - not opened by script');
        }
        
        // Show notification with instructions
        this.showNotification('Press Alt+F4 or Ctrl+W to close, or use window controls', 4000);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            // Enter fullscreen
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
            this.showNotification('Entered fullscreen mode');
        } else {
            // Exit fullscreen
            this.exitKioskMode();
        }
    }

    clearCacheAndReload() {
        console.log('🧹 Clearing cache and reloading...');
        
        // Clear localStorage
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (e) {
            console.log('Could not clear storage:', e);
        }
        
        // Force reload with cache bypass
        window.location.reload(true);
    }

    showHelpOverlay() {
        // Remove existing overlay
        const existingOverlay = document.getElementById('help-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'help-overlay';
        overlay.innerHTML = `
            <div class="help-content">
                <h2>🎮 Dashboard Controls</h2>
                
                <div class="help-section">
                    <h3>👆 Touch Controls</h3>
                    <div class="help-grid">
                        <span>Swipe left/right</span><span>Navigate pages</span>
                        <span>⚙️ Button (bottom-left)</span><span>Quick actions menu</span>
                        <span>⏸️/▶️ Button (top-left)</span><span>Pause/resume auto-cycle</span>
                    </div>
                </div>

                <div class="help-footer">
                    <p>Tap anywhere to close</p>
                </div>
            </div>
        `;

        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', sans-serif;
        `;

        const helpContent = overlay.querySelector('.help-content');
        helpContent.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;

        // Style help sections
        overlay.querySelectorAll('.help-section').forEach(section => {
            section.style.marginBottom = '25px';
        });

        overlay.querySelectorAll('h2').forEach(h => {
            h.style.cssText = 'margin-bottom: 20px; text-align: center; font-size: 1.8rem;';
        });

        overlay.querySelectorAll('h3').forEach(h => {
            h.style.cssText = 'margin-bottom: 15px; font-size: 1.2rem; color: #64b5f6;';
        });

        overlay.querySelectorAll('.help-grid').forEach(grid => {
            grid.style.cssText = `
                display: grid;
                grid-template-columns: 1fr 2fr;
                gap: 8px 15px;
                font-size: 0.9rem;
                line-height: 1.4;
            `;
        });

        overlay.querySelectorAll('.help-grid span:nth-child(odd)').forEach(span => {
            span.style.cssText = 'font-weight: bold; color: #81c784;';
        });

        overlay.querySelector('.help-footer').style.cssText = `
            text-align: center;
            margin-top: 20px;
            font-size: 0.85rem;
            opacity: 0.7;
        `;

        // Close on click or key press
        overlay.addEventListener('click', () => overlay.remove());
        
        document.body.appendChild(overlay);
    }

    showQuickActions() {
        // Remove existing overlay
        const existingOverlay = document.getElementById('quick-actions-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'quick-actions-overlay';
        overlay.innerHTML = `
            <div class="quick-actions-content">
                <h2>⚡ Quick Actions</h2>
                <div class="action-buttons">
                    <button onclick="window.location.reload()" class="action-btn">🔄 Refresh</button>
                    <button onclick="window.dashboard.toggleAutoCycleFromMenu()" class="action-btn auto-cycle-btn" id="auto-cycle-btn">
                        ${this.autoCycle ? '⏸️ Auto-Cycle ON' : '▶️ Auto-Cycle OFF'}
                    </button>
                    <button onclick="window.dashboard.showHelpOverlay(); document.getElementById('quick-actions-overlay').remove()" class="action-btn">❓ Help</button>
                    <button onclick="window.dashboard.exitKioskMode()" class="action-btn">🚪 Exit</button>
                    <button onclick="window.open('/admin', '_blank')" class="action-btn">⚙️ Admin</button>
                    <button onclick="window.dashboard.toggleFullscreen()" class="action-btn">📺 Fullscreen</button>
                    <button onclick="window.dashboard.clearCacheAndReload()" class="action-btn">🧹 Clear Cache</button>
                    <button onclick="document.getElementById('quick-actions-overlay').remove()" class="action-btn close-btn">❌ Close</button>
                </div>
            </div>
        `;

        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', sans-serif;
        `;

        const content = overlay.querySelector('.quick-actions-content');
        content.style.cssText = `
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 20px;
            color: #333;
            text-align: center;
            max-width: 700px;
            width: 90%;
            max-height: 400px;
            overflow-y: auto;
        `;

        // Style the button grid for 800x480
        const buttonContainer = overlay.querySelector('.action-buttons');
        buttonContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 15px;
        `;

        overlay.querySelectorAll('.action-btn').forEach(btn => {
            btn.style.cssText = `
                padding: 12px 8px;
                border: none;
                border-radius: 8px;
                background: #667eea;
                color: white;
                font-size: 0.9rem;
                cursor: pointer;
                transition: all 0.3s ease;
                min-height: 50px;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                line-height: 1.2;
            `;
            
            btn.addEventListener('mousedown', () => {
                btn.style.background = '#5a6fd8';
                btn.style.transform = 'scale(0.95)';
            });
            
            btn.addEventListener('mouseup', () => {
                btn.style.transform = 'scale(1)';
            });
        });

        // Color the auto-cycle button based on state
        const autoCycleBtn = overlay.querySelector('#auto-cycle-btn');
        if (autoCycleBtn) {
            autoCycleBtn.style.background = this.autoCycle ? '#4CAF50' : '#f44336'; // Green if ON, Red if OFF
        }

        // Make close button different color
        const closeBtn = overlay.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.style.background = '#6c757d';
        }

        // Close on background click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);
    }

    showNotification(message, duration = 2000) {
        // Remove existing notification
        const existing = document.getElementById('dashboard-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.id = 'dashboard-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 0.9rem;
            z-index: 5000;
            transition: opacity 0.3s ease;
            backdrop-filter: blur(10px);
        `;

        document.body.appendChild(notification);

        // Fade out and remove
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    // Add visual touch feedback for debugging
    showTouchIndicator(x, y) {
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: fixed;
            left: ${x - 25}px;
            top: ${y - 25}px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: rgba(255, 0, 0, 0.5);
            border: 2px solid red;
            z-index: 9999;
            pointer-events: none;
            animation: touchPulse 0.6s ease-out forwards;
        `;

        // Add CSS animation
        if (!document.getElementById('touch-indicator-style')) {
            const style = document.createElement('style');
            style.id = 'touch-indicator-style';
            style.textContent = `
                @keyframes touchPulse {
                    0% { transform: scale(0.5); opacity: 1; }
                    100% { transform: scale(2); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(indicator);
        setTimeout(() => indicator.remove(), 600);
    }

    destroy() {
        this.stopAutoCycle();
        if (this.weatherUpdateInterval) clearInterval(this.weatherUpdateInterval);
        if (this.calendarUpdateInterval) clearInterval(this.calendarUpdateInterval);
        if (this.socket) this.socket.disconnect();
        
        // Clean up status element
        if (this.statusEl && this.statusEl.parentNode) {
            this.statusEl.parentNode.removeChild(this.statusEl);
        }
    }

    // ===== HUE METHODS =====
    async loadHue() {
        try {
            const response = await fetch('/api/hue');
            const data = await response.json();
            
            if (response.ok && data.lights) {
                this.displayHueLights(data.lights, data.configured);
            } else {
                console.warn('Hue API error:', data.error);
                this.displayHueLights(data.lights || [], false);
            }
        } catch (error) {
            console.error('Failed to load Hue lights:', error);
            this.displayHueLights([], false);
        }
    }

    displayHueLights(lights, configured) {
        const lightsGrid = document.getElementById('lights-grid');
        const masterToggle = document.getElementById('master-toggle');
        const masterText = document.getElementById('master-text');
        
        if (!lightsGrid) return;

        if (lights.length === 0) {
            lightsGrid.innerHTML = `
                <div class="loading">
                    ${configured ? 'No lights found' : 'Hue not configured - showing demo lights'}
                </div>
            `;
            return;
        }

        lightsGrid.innerHTML = lights.map(light => `
            <div class="light-card ${light.on ? 'on' : ''}" data-light-id="${light.id}">
                <div class="light-header">
                    <div class="light-name">${light.name}</div>
                    <div class="light-toggle ${light.on ? 'on' : ''}" onclick="toggleLight(${light.id})"></div>
                </div>
                <div class="light-controls">
                    <input type="range" 
                           class="light-slider" 
                           min="1" 
                           max="254" 
                           value="${light.brightness || 1}"
                           onchange="setBrightness(${light.id}, this.value)"
                           ontouchstart="event.stopPropagation()"
                           ontouchmove="event.stopPropagation()"
                           ontouchend="event.stopPropagation()"
                           onmousedown="event.stopPropagation()"
                           onmousemove="event.stopPropagation()"
                           onmouseup="event.stopPropagation()"
                           ${!light.on ? 'disabled' : ''}>
                    <div class="light-color" style="background: ${this.hueToRgb(light.hue, light.saturation)}"></div>
                </div>
                <div class="light-info">
                    ${light.on ? `${Math.round((light.brightness || 1) / 254 * 100)}% brightness` : 'Off'}
                    ${light.reachable ? '' : ' • Unreachable'}
                </div>
            </div>
        `).join('');

        // Update master toggle
        const onLights = lights.filter(l => l.on).length;
        const allLights = lights.length;
        
        if (masterText) {
            if (onLights === 0) {
                masterText.textContent = 'Turn All On';
            } else if (onLights === allLights) {
                masterText.textContent = 'Turn All Off';
            } else {
                masterText.textContent = `Turn All On (${onLights}/${allLights})`;
            }
        }
    }

    hueToRgb(hue, sat) {
        if (!hue && !sat) return '#FFFFFF';
        
        const h = (hue || 0) / 65535;
        const s = (sat || 0) / 254;
        const l = 0.5;

        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }

    // Get timezone settings
    getTimezoneSettings() {
        // Try to get from socket state first, then localStorage as fallback
        const socketState = this.dashboardState || {};
        const timezone = socketState.settings?.timezone || localStorage.getItem('dashboardTimezone') || 'auto';
        // Timezone setting loaded
        return timezone;
    }
    
    // Format date/time with timezone
    formatDateTime(date, timezone, options = {}) {
        let result;
        if (timezone === 'auto') {
            result = date.toLocaleString('en-US', options);
        } else {
            try {
                result = date.toLocaleString('en-US', { 
                    ...options, 
                    timeZone: timezone 
                });
            } catch (e) {
                console.warn('Invalid timezone, falling back to auto:', timezone);
                result = date.toLocaleString('en-US', options);
            }
        }
        // Removed excessive logging
        return result;
    }

    // Update the cycle control button state
    updateCycleButton() {
        const cycleControl = document.getElementById('cycle-control');
        const cycleIcon = document.getElementById('cycle-icon');
        
        if (cycleControl && cycleIcon) {
            // Always clear touch-paused class when updating button state
            cycleControl.classList.remove('touch-paused');
            
            if (this.autoCycle) {
                cycleIcon.textContent = '⏸️';
                cycleControl.classList.remove('paused');
                cycleControl.title = 'Pause Auto-Cycle';
            } else {
                cycleIcon.textContent = '▶️';
                cycleControl.classList.add('paused');
                cycleControl.title = 'Resume Auto-Cycle';
            }
        }
    }
}

// ===== GLOBAL HUE FUNCTIONS =====
async function toggleLight(lightId) {
    try {
        const lightCard = document.querySelector(`[data-light-id="${lightId}"]`);
        const isOn = lightCard?.classList.contains('on');
        
        const response = await fetch(`/api/hue/lights/${lightId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ on: !isOn })
        });
        
        if (response.ok) {
            // Refresh lights display
            if (window.dashboard) window.dashboard.loadHue();
        }
    } catch (error) {
        console.error('Failed to toggle light:', error);
    }
}

async function setBrightness(lightId, brightness) {
    try {
        const response = await fetch(`/api/hue/lights/${lightId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bri: parseInt(brightness) })
        });
        
        if (response.ok) {
            // Update just the info text without full refresh
            const lightCard = document.querySelector(`[data-light-id="${lightId}"]`);
            if (lightCard) {
                const infoEl = lightCard.querySelector('.light-info');
                if (infoEl) {
                    const percentage = Math.round(brightness / 254 * 100);
                    infoEl.innerHTML = `${percentage}% brightness`;
                }
            }
        }
    } catch (error) {
        console.error('Failed to set brightness:', error);
    }
}

async function applyScene(scene) {
    try {
        const response = await fetch(`/api/hue/scenes/${scene}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            // Refresh lights display
            if (window.dashboard) window.dashboard.loadHue();
        }
    } catch (error) {
        console.error('Failed to apply scene:', error);
    }
}

async function toggleAllLights() {
    try {
        const lightsGrid = document.getElementById('lights-grid');
        const onLights = lightsGrid?.querySelectorAll('.light-card.on').length || 0;
        const allLights = lightsGrid?.querySelectorAll('.light-card').length || 0;
        
        // If any lights are on, turn all off. Otherwise, turn all on.
        const targetState = onLights === 0;
        
        const response = await fetch('/api/hue/lights', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ on: targetState })
        });
        
        if (response.ok) {
            // Refresh lights display
            if (window.dashboard) window.dashboard.loadHue();
        }
    } catch (error) {
        console.error('Failed to toggle all lights:', error);
    }
}

// ===== GLOBAL AUTO-CYCLE CONTROL =====
function toggleAutoCycle() {
    if (window.dashboard) {
        window.dashboard.autoCycle = !window.dashboard.autoCycle;
        
        if (window.dashboard.autoCycle) {
            window.dashboard.startAutoCycle();
            console.log('🔄 Auto-cycle resumed');
        } else {
            window.dashboard.stopAutoCycle();
            console.log('⏸️ Auto-cycle paused');
        }
        
        // Update button appearance using the centralized method
        window.dashboard.updateCycleButton();
        
        // Update the socket to sync with admin panel
        if (window.dashboard.socket) {
            window.dashboard.socket.emit('updateSettings', {
                autoCycle: window.dashboard.autoCycle
            });
        }
    }
}

// ===== GLOBAL QUICK ACTIONS FUNCTION =====
function showQuickActions() {
    if (window.dashboard) {
        window.dashboard.showQuickActions();
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DASHBOARD INITIALIZING ===');
    console.log('DOM fully loaded, creating dashboard...');
    window.dashboard = new Dashboard();
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboard) {
        window.dashboard.destroy();
    }
});