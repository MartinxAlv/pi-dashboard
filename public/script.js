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
        
        // Keyboard navigation
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
            }
        });
        
        // Touch gestures
        let touchStartX = 0;
        let touchEndX = 0;
        
        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });
        
        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        });
        
        const handleSwipe = () => {
            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;
            
            if (Math.abs(diff) > swipeThreshold) {
                if (diff > 0) {
                    this.nextPage();
                } else {
                    this.previousPage();
                }
            }
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