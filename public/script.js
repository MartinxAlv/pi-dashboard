class Dashboard {
    constructor() {
        this.currentPage = 0;
        this.totalPages = 2;
        this.autoCycle = true;
        this.cycleInterval = 10000;
        this.cycleTimer = null;
        this.socket = null;
        this.weatherUpdateInterval = null;
        this.calendarUpdateInterval = null;
        this.statusEl = null; // Track the status element
        
        this.init();
    }

    init() {
        this.setupSocket();
        this.setupEventListeners();
        this.startClock();
        this.loadWeather();
        this.loadCalendar();
        this.startAutoCycle();
        this.loadTheme(); // Load saved theme
        
        // Update weather every 30 minutes (instead of 10)
        this.weatherUpdateInterval = setInterval(() => {
            this.loadWeather();
        }, 30 * 60 * 1000);
        
        // Update calendar every 5 minutes
        this.calendarUpdateInterval = setInterval(() => {
            this.loadCalendar();
        }, 5 * 60 * 1000);
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
            
            if (this.autoCycle) {
                this.startAutoCycle();
            } else {
                this.stopAutoCycle();
            }
        });

        // Listen for theme updates from admin
        this.socket.on('themeUpdated', (theme) => {
            this.applyTheme(theme);
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
        // Touch/click navigation
        document.getElementById('nav-left').addEventListener('click', () => {
            this.previousPage();
        });
        
        document.getElementById('nav-right').addEventListener('click', () => {
            this.nextPage();
        });
        
        // Page indicators
        document.querySelectorAll('.indicator').forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                this.goToPage(index);
            });
        });
        
        // Keyboard navigation and kiosk controls
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                    this.previousPage();
                    break;
                case 'ArrowRight':
                    this.nextPage();
                    break;
                case ' ':
                    e.preventDefault();
                    this.toggleAutoCycle();
                    break;
                    
                // KIOSK CONTROLS
                case 'F5':
                case 'r':
                case 'R':
                    // Refresh page
                    e.preventDefault();
                    console.log('🔄 Refreshing dashboard...');
                    window.location.reload();
                    break;
                    
                case 'Escape':
                case 'q':
                case 'Q':
                    // Exit kiosk/fullscreen mode
                    e.preventDefault();
                    this.exitKioskMode();
                    break;
                    
                case 'f':
                case 'F':
                    // Toggle fullscreen
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                    
                case 'h':
                case 'H':
                case '?':
                    // Show help overlay
                    e.preventDefault();
                    this.showHelpOverlay();
                    break;
                    
                case 'a':
                case 'A':
                    // Open admin panel (redirect)
                    e.preventDefault();
                    window.location.href = '/admin';
                    break;
                    
                case 'c':
                case 'C':
                    // Clear cache and reload
                    e.preventDefault();
                    this.clearCacheAndReload();
                    break;
            }
        });
        
        // Touch gestures for navigation - Simplified for single-touch screens
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartTime = 0;
        let touchTimeout = null;
        let isLongPress = false;
        
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
            
            // Show visual touch indicator
            const touch = e.changedTouches[0];
            this.showTouchIndicator(touch.clientX, touch.clientY);
            
            touchStartX = touch.clientX;
            touchStartTime = Date.now();
            isLongPress = false;
            
            // Clear any existing timeout
            if (touchTimeout) {
                clearTimeout(touchTimeout);
            }
            
            // Set long press timer - Extended to 8 seconds
            touchTimeout = setTimeout(() => {
                isLongPress = true;
                console.log('🔒 Long press detected (8 seconds)');
                this.showQuickActions();
            }, 8000); // 8 seconds for deliberate action
        });
        
        document.addEventListener('touchmove', (e) => {
            // Cancel long press if user starts moving
            if (touchTimeout) {
                clearTimeout(touchTimeout);
                touchTimeout = null;
            }
        });
        
        document.addEventListener('touchend', (e) => {
            debugTouch(e, 'END');
            
            // Clear long press timer
            if (touchTimeout) {
                clearTimeout(touchTimeout);
                touchTimeout = null;
            }
            
            // Don't process if it was a long press
            if (isLongPress) {
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
        
        // Also add mouse events as fallback for testing
        let mouseStartX = 0;
        let mouseStartTime = 0;
        let mousePressed = false;
        
        document.addEventListener('mousedown', (e) => {
            mouseStartX = e.clientX;
            mouseStartTime = Date.now();
            mousePressed = true;
            
            // Long press with mouse - Updated to 5 seconds
            setTimeout(() => {
                if (mousePressed) {
                    console.log('🖱️ Mouse long press (5 seconds)');
                    this.showQuickActions();
                }
            }, 5000); // Changed from 8000ms to 5000ms
        });
        
        document.addEventListener('mouseup', (e) => {
            if (!mousePressed) return;
            mousePressed = false;
            
            const mouseEndX = e.clientX;
            const mouseDuration = Date.now() - mouseStartTime;
            const diff = mouseStartX - mouseEndX;
            
            // Mouse swipe detection
            if (Math.abs(diff) > 100 && mouseDuration < 500) {
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
            
            // Update time
            const timeOptions = {
                hour: '2-digit',
                minute: '2-digit',
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
        const iconMap = {
            '01d': '☀️', '01n': '🌙',
            '02d': '⛅', '02n': '⛅',
            '03d': '☁️', '03n': '☁️',
            '04d': '☁️', '04n': '☁️',
            '09d': '🌧️', '09n': '🌧️',
            '10d': '🌦️', '10n': '🌦️',
            '11d': '⛈️', '11n': '⛈️',
            '13d': '❄️', '13n': '❄️',
            '50d': '🌫️', '50n': '🌫️'
        };
        
        // Handle both old format (direct weather) and new format (with current + forecast)
        const currentWeather = weather.current || weather;
        
        document.getElementById('weather-icon').textContent = iconMap[currentWeather.icon] || '🌤️';
        document.getElementById('temperature').textContent = `${currentWeather.temperature}°`;
        document.getElementById('weather-desc').textContent = currentWeather.description;
        document.getElementById('weather-location').textContent = `${currentWeather.city}, ${currentWeather.country}`;
        
        // Update forecast if available
        if (weather.forecast && weather.forecast.length > 0) {
            this.updateForecastDisplay(weather.forecast);
        }
    }

    updateForecastDisplay(forecast) {
        const forecastContainer = document.getElementById('forecast-list');
        
        const iconMap = {
            '01d': '☀️', '01n': '☀️',
            '02d': '⛅', '02n': '⛅',
            '03d': '☁️', '03n': '☁️',
            '04d': '☁️', '04n': '☁️',
            '09d': '🌧️', '09n': '🌧️',
            '10d': '🌦️', '10n': '🌦️',
            '11d': '⛈️', '11n': '⛈️',
            '13d': '❄️', '13n': '❄️',
            '50d': '🌫️', '50n': '🌫️'
        };
        
        const forecastHtml = forecast.map(day => {
            const date = new Date(day.date);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const isToday = date.toDateString() === new Date().toDateString();
            
            return `
                <div class="forecast-item">
                    <div class="forecast-day">${isToday ? 'Today' : dayName}</div>
                    <div class="forecast-icon">${iconMap[day.icon] || '🌤️'}</div>
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
        
        const eventsHtml = events.map(event => {
            const startDate = new Date(event.start);
            const endDate = new Date(event.end);
            
            const timeStr = startDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            
            const dateStr = startDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
            
            return `
                <div class="event-item">
                    <div class="event-title">${event.title}</div>
                    <div class="event-time">${timeStr}</div>
                    <div class="event-date">${dateStr}</div>
                </div>
            `;
        }).join('');
        
        eventsContainer.innerHTML = eventsHtml;
    }

    goToPage(pageIndex) {
        if (pageIndex < 0 || pageIndex >= this.totalPages) return;
        
        const currentPageEl = document.getElementById(`page-${this.currentPage}`);
        const newPageEl = document.getElementById(`page-${pageIndex}`);
        const currentIndicator = document.querySelector(`.indicator[data-page="${this.currentPage}"]`);
        const newIndicator = document.querySelector(`.indicator[data-page="${pageIndex}"]`);
        
        // Update classes
        currentPageEl.classList.remove('active');
        currentPageEl.classList.add('prev');
        
        newPageEl.classList.remove('prev');
        newPageEl.classList.add('active');
        
        currentIndicator.classList.remove('active');
        newIndicator.classList.add('active');
        
        // Clean up after transition
        setTimeout(() => {
            currentPageEl.classList.remove('prev');
        }, 500);
        
        this.currentPage = pageIndex;
        
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
        
        // Restart auto cycle
        if (this.autoCycle) {
            this.startAutoCycle();
        }
    }

    nextPage() {
        const nextPage = (this.currentPage + 1) % this.totalPages;
        this.goToPage(nextPage);
    }

    previousPage() {
        const prevPage = (this.currentPage - 1 + this.totalPages) % this.totalPages;
        this.goToPage(prevPage);
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
                    <h3>⌨️ Keyboard Shortcuts</h3>
                    <div class="help-grid">
                        <span>R or F5</span><span>Refresh page</span>
                        <span>Q or Escape</span><span>Exit kiosk mode</span>
                        <span>F</span><span>Toggle fullscreen</span>
                        <span>H or ?</span><span>Show/hide this help</span>
                        <span>A</span><span>Open admin panel</span>
                        <span>C</span><span>Clear cache & reload</span>
                        <span>Space</span><span>Toggle auto-cycle</span>
                        <span>← →</span><span>Navigate pages</span>
                    </div>
                </div>

                <div class="help-section">
                    <h3>👆 Touch Gestures</h3>
                    <div class="help-grid">
                        <span>Swipe left/right</span><span>Navigate pages</span>
                        <span>Long press (5s)</span><span>Quick actions menu</span>
                    </div>
                </div>

                <div class="help-footer">
                    <p>Press H, ? or tap anywhere to close</p>
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