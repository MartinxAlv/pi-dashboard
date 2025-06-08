class AdminPanel {
    constructor() {
        this.socket = null;
        this.dashboardState = null;
        this.updatingFromSocket = false; // Flag to prevent infinite loops
        
        this.init();
    }

    init() {
        this.setupSocket();
        this.setupEventListeners();
        this.setupKioskControls(); // Add kiosk controls
        this.loadInitialData();
        this.startCalendarRefreshTimer(); // Start timer for calendar refresh countdown
    }

    setupSocket() {
        this.socket = io();
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        
        this.socket.on('connect', () => {
            console.log('Admin connected to server');
            statusDot.className = 'status-dot';
            statusText.textContent = 'Connected';
        });
        
        this.socket.on('disconnect', () => {
            console.log('Admin disconnected from server');
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Disconnected';
        });
        
        this.socket.on('dashboardState', (state) => {
            this.dashboardState = state;
            this.updateAdminDisplay(state);
        });
        
        this.socket.on('pageChanged', (pageIndex) => {
            this.updateCurrentPageDisplay(pageIndex);
        });
        
        this.socket.on('settingsUpdated', (state) => {
            this.dashboardState = state;
            this.updatingFromSocket = true; // Set flag to prevent loop
            this.updateAdminDisplay(state);
            this.updatingFromSocket = false; // Clear flag
        });
        
        statusDot.className = 'status-dot connecting';
        statusText.textContent = 'Connecting...';
    }

    setupEventListeners() {
        // Auto cycle toggle
        const autoCycleToggle = document.getElementById('auto-cycle');
        if (autoCycleToggle) {
            autoCycleToggle.addEventListener('change', (e) => {
                // Only emit if this isn't a programmatic update from socket
                if (!this.updatingFromSocket) {
                    this.socket.emit('updateSettings', {
                        autoCycle: e.target.checked
                    });
                }
            });
        }
        
        // Cycle interval update
        const cycleInterval = document.getElementById('cycle-interval');
        if (cycleInterval) {
            cycleInterval.addEventListener('change', (e) => {
                const interval = parseInt(e.target.value) * 1000; // Convert to milliseconds
                this.socket.emit('updateSettings', {
                    cycleInterval: interval
                });
            });
        }
    }

    setupKioskControls() {
        // Remove keyboard shortcuts and touch controls
        // Admin page uses UI buttons instead
        console.log('🎮 Admin page using UI buttons for controls');
        
        // Disable all keyboard shortcuts to prevent interference with typing
        document.addEventListener('keydown', (e) => {
            // Allow normal typing in form fields - comprehensive check
            if (e.target.matches('input, textarea, select') || 
                e.target.contentEditable === 'true' ||
                e.target.isContentEditable ||
                e.target.closest('input, textarea, select')) {
                console.log('✅ AdminJS: Allowing typing in form field:', e.target.tagName, e.key);
                return; // Allow normal typing
            }
            
            // Block most keyboard shortcuts when not in form fields
            const blockedKeys = [' ', 'ArrowLeft', 'ArrowRight', 'c', 'C', 'a', 'A'];
            
            if (blockedKeys.includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                console.log('🚫 AdminJS: Blocked keyboard shortcut:', e.key);
            }
        });
        
        // Only prevent context menu in kiosk scenarios
        document.addEventListener('contextmenu', (e) => {
            // Only prevent if not in a form field
            if (!e.target.matches('input, textarea, select')) {
                e.preventDefault();
            }
        });
    }

    // Kiosk helper methods for UI buttons
    exitKioskMode() {
        console.log('🚪 Attempting to exit kiosk mode...');
        
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        
        try {
            window.close();
        } catch (e) {
            console.log('Cannot close window - not opened by script');
        }
        
        this.showNotification('Press Alt+F4 or Ctrl+W to close, or use window controls', 4000);
    }

    goToDashboard() {
        console.log('🖥️ Redirecting to dashboard...');
        window.location.href = '/';
    }

    showNotification(message, duration = 2000) {
        const existing = document.getElementById('admin-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.id = 'admin-notification';
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
            z-index: 999997;
            transition: opacity 0.3s ease;
            backdrop-filter: blur(10px);
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    async loadInitialData() {
        try {
            // Load dashboard state
            const stateResponse = await fetch('/api/dashboard/state');
            if (stateResponse.ok) {
                this.dashboardState = await stateResponse.json();
                this.updateAdminDisplay(this.dashboardState);
            }
            
            // Check weather API status
            this.checkWeatherAPI();
            
            // Check calendar API status
            this.checkCalendarAPI();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async checkCalendarAPI() {
        try {
            const statusElement = document.getElementById('system-calendar-status');
            
            // Get current dashboard state to check calendar sources
            const stateResponse = await fetch('/api/dashboard/state');
            if (stateResponse.ok) {
                const state = await stateResponse.json();
                const calendarSources = state.settings?.calendarSources || [];
                const enabledSources = calendarSources.filter(s => s.enabled);
                
                if (calendarSources.length === 0) {
                    statusElement.textContent = 'Not configured';
                    statusElement.style.color = '#ff9800';
                } else if (enabledSources.length === 0) {
                    statusElement.textContent = 'All disabled';
                    statusElement.style.color = '#ff9800';
                } else {
                    // Test the main calendar endpoint to see if it's working
                    const calendarResponse = await fetch('/api/calendar');
                    if (calendarResponse.ok) {
                        statusElement.textContent = `✓ ${enabledSources.length} source(s)`;
                        statusElement.style.color = '#4CAF50';
                    } else {
                        statusElement.textContent = 'Error ✗';
                        statusElement.style.color = '#f44336';
                    }
                }
                
                // Update calendar refresh information
                this.updateCalendarRefreshInfo(state);
            } else {
                statusElement.textContent = 'Connection Error';
                statusElement.style.color = '#f44336';
            }
        } catch (error) {
            const statusElement = document.getElementById('system-calendar-status');
            statusElement.textContent = 'Error ✗';
            statusElement.style.color = '#f44336';
            console.error('Error checking calendar API status:', error);
        }
    }

    updateCalendarRefreshInfo(state) {
        const refreshInfoEl = document.getElementById('calendar-refresh-info');
        const calendarLastUpdateEl = document.getElementById('calendar-last-update');
        const weatherLastUpdateEl = document.getElementById('weather-last-update');
        const nextUpdateEl = document.getElementById('calendar-next-update');
        
        if (refreshInfoEl) {
            refreshInfoEl.textContent = 'Every 5 minutes';
        }
        
        // Update calendar last update
        if (calendarLastUpdateEl) {
            if (state.calendarLastUpdated) {
                const lastUpdate = new Date(state.calendarLastUpdated);
                calendarLastUpdateEl.textContent = lastUpdate.toLocaleTimeString();
            } else {
                calendarLastUpdateEl.textContent = 'Never';
            }
        }
        
        // Update weather last update
        if (weatherLastUpdateEl) {
            if (state.weatherLastUpdated) {
                const lastUpdate = new Date(state.weatherLastUpdated);
                weatherLastUpdateEl.textContent = lastUpdate.toLocaleTimeString();
            } else {
                weatherLastUpdateEl.textContent = 'Never';
            }
        }
        
        // Update calendar next update countdown
        if (nextUpdateEl) {
            if (state.calendarLastUpdated) {
                const lastUpdate = new Date(state.calendarLastUpdated);
                const nextUpdate = new Date(lastUpdate.getTime() + 5 * 60 * 1000); // Add 5 minutes
                const now = new Date();
                
                if (nextUpdate > now) {
                    const timeUntilNext = Math.ceil((nextUpdate - now) / 1000 / 60);
                    nextUpdateEl.textContent = `In ${timeUntilNext} minute${timeUntilNext !== 1 ? 's' : ''}`;
                } else {
                    nextUpdateEl.textContent = 'Due now';
                }
            } else {
                nextUpdateEl.textContent = 'When dashboard loads';
            }
        }
    }

    startCalendarRefreshTimer() {
        // Update calendar refresh countdown every 30 seconds
        setInterval(() => {
            this.updateCalendarRefreshCountdown();
        }, 30000);
    }

    async updateCalendarRefreshCountdown() {
        try {
            const stateResponse = await fetch('/api/dashboard/state');
            if (stateResponse.ok) {
                const state = await stateResponse.json();
                const nextUpdateEl = document.getElementById('calendar-next-update');
                
                if (nextUpdateEl && state.calendarLastUpdated) {
                    const lastUpdate = new Date(state.calendarLastUpdated);
                    const nextUpdate = new Date(lastUpdate.getTime() + 5 * 60 * 1000); // Add 5 minutes
                    const now = new Date();
                    
                    if (nextUpdate > now) {
                        const timeUntilNext = Math.ceil((nextUpdate - now) / 1000 / 60);
                        nextUpdateEl.textContent = `In ${timeUntilNext} minute${timeUntilNext !== 1 ? 's' : ''}`;
                    } else {
                        nextUpdateEl.textContent = 'Due now';
                    }
                }
            }
        } catch (error) {
            // Silently fail - don't spam console with errors
        }
    }

    async checkWeatherAPI() {
        try {
            const response = await fetch('/api/weather');
            const statusElement = document.getElementById('weather-api-status');
            
            if (response.ok) {
                statusElement.textContent = '✓ Configured';
                statusElement.style.color = '#4CAF50';
            } else {
                statusElement.textContent = 'Error';
                statusElement.style.color = '#f44336';
            }
        } catch (error) {
            const statusElement = document.getElementById('weather-api-status');
            statusElement.textContent = 'Not configured';
            statusElement.style.color = '#ff9800';
        }
    }

    updateAdminDisplay(state) {
        if (!state) return;
        
        console.log('Updating admin display with state:', state);
        
        // Update auto cycle toggle
        const autoCycleToggle = document.getElementById('auto-cycle');
        if (autoCycleToggle) {
            autoCycleToggle.checked = state.autoCycle;
        }
        
        // Update cycle interval
        const cycleInterval = document.getElementById('cycle-interval');
        if (cycleInterval) {
            cycleInterval.value = Math.floor(state.cycleInterval / 1000);
        }
        
        // Update current page info
        this.updateCurrentPageDisplay(state.currentPage);
        
        // Update last updated time
        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated && state.lastUpdated) {
            const date = new Date(state.lastUpdated);
            lastUpdated.textContent = date.toLocaleTimeString();
        }
        
        // Update weather city if available - ALWAYS update this field
        const weatherCity = document.getElementById('weather-city');
        if (weatherCity) {
            if (state.settings && state.settings.city) {
                console.log('Setting city field to:', state.settings.city);
                weatherCity.value = state.settings.city;
            } else {
                console.log('No city in state, setting default');
                weatherCity.value = 'Dallas,US';
            }
        }
        
        // Update weather units if available
        if (state.settings && state.settings.units) {
            const weatherUnits = document.getElementById('weather-units');
            if (weatherUnits) {
                weatherUnits.value = state.settings.units;
            }
        }
        
        // Update calendar sources list
        if (state.settings && state.settings.calendarSources) {
            updateCalendarSourcesList(state.settings.calendarSources);
        }
        
        if (state.settings && state.settings.maxCalendarEvents) {
            const maxEvents = document.getElementById('max-events');
            if (maxEvents) {
                maxEvents.value = state.settings.maxCalendarEvents;
            }
        }
        
        // Update API key status
        this.updateApiKeyStatus(state.settings && state.settings.weatherApiKey);
        
        // Update weather API key field with masked value if saved
        const weatherApiKeyField = document.getElementById('weather-api-key');
        if (weatherApiKeyField) {
            if (state.settings && state.settings.weatherApiKey) {
                weatherApiKeyField.placeholder = '•••••••••••••••••••••••••••••••• (Key saved - enter new key to update)';
                weatherApiKeyField.value = ''; // Keep field empty but show placeholder
                weatherApiKeyField.title = 'API key is saved. Enter a new key to update it.';
            } else {
                weatherApiKeyField.placeholder = 'Enter your OpenWeatherMap API key';
                weatherApiKeyField.title = '';
            }
        }
        
        // Update Hue bridge IP field if saved
        const hueBridgeIpField = document.getElementById('hue-bridge-ip');
        if (hueBridgeIpField) {
            if (state.settings && state.settings.hueBridgeIp) {
                hueBridgeIpField.value = state.settings.hueBridgeIp; // Show actual IP since it's not sensitive
            } else {
                hueBridgeIpField.value = ''; // Clear if no IP saved
            }
        }
        
        // Update Hue username field with masked value if saved
        const hueUsernameField = document.getElementById('hue-username');
        if (hueUsernameField) {
            if (state.settings && state.settings.hueUsername) {
                hueUsernameField.placeholder = '•••••••••••••••••••••••••••••••• (Username saved - enter new to update)';
                hueUsernameField.value = ''; // Keep field empty but show placeholder
                hueUsernameField.title = 'Username is saved. Enter a new username to update it.';
            } else {
                hueUsernameField.placeholder = 'Generated username from button press';
                hueUsernameField.title = '';
            }
        }
        
        // Update Hue status indicators
        this.updateHueBridgeStatus(state.settings && state.settings.hueBridgeIp);
        this.updateHueUsernameStatus(state.settings && state.settings.hueUsername);
        
        // Update panel settings if available
        if (state.settings && state.settings.panels) {
            this.updatePanelToggles(state.settings.panels);
        }
        
        // Update calendar refresh information
        this.updateCalendarRefreshInfo(state);
    }

    updateCalendarApiKeyStatus(hasApiKey) {
        const statusElement = document.getElementById('calendar-api-indicator');
        const statusContainer = document.getElementById('calendar-api-status');
        
        if (statusElement && statusContainer) {
            if (hasApiKey) {
                statusElement.textContent = 'Calendar API key saved (•••••••••••••••)';
                statusContainer.className = 'api-status has-key';
            } else {
                statusElement.textContent = 'No Calendar API key saved';
                statusContainer.className = 'api-status no-key';
            }
        }
    }

    updateCalendarIdStatus(hasCalendarId) {
        const statusElement = document.getElementById('calendar-id-indicator');
        const statusContainer = document.getElementById('calendar-id-status');
        
        if (statusElement && statusContainer) {
            if (hasCalendarId) {
                statusElement.textContent = 'Calendar ID saved (•••••••••••••••)';
                statusContainer.className = 'api-status has-key';
            } else {
                statusElement.textContent = 'No Calendar ID saved';
                statusContainer.className = 'api-status no-key';
            }
        }
    }

    updateApiKeyStatus(hasApiKey) {
        const statusElement = document.getElementById('api-key-indicator');
        const statusContainer = document.getElementById('api-key-status');
        
        if (statusElement && statusContainer) {
            if (hasApiKey) {
                statusElement.textContent = 'API key saved (•••••••••••••••)';
                statusContainer.className = 'api-status has-key';
            } else {
                statusElement.textContent = 'No API key saved';
                statusContainer.className = 'api-status no-key';
            }
        }
    }

    updateHueBridgeStatus(hasBridgeIp) {
        const statusElement = document.getElementById('hue-bridge-indicator');
        const statusContainer = document.getElementById('hue-bridge-status');
        
        if (statusElement && statusContainer) {
            if (hasBridgeIp) {
                statusElement.textContent = `Bridge IP saved: ${hasBridgeIp}`;
                statusContainer.className = 'api-status has-key';
            } else {
                statusElement.textContent = 'No bridge IP saved';
                statusContainer.className = 'api-status no-key';
            }
        }
    }

    updateHueUsernameStatus(hasUsername) {
        const statusElement = document.getElementById('hue-username-indicator');
        const statusContainer = document.getElementById('hue-username-status');
        
        if (statusElement && statusContainer) {
            if (hasUsername) {
                statusElement.textContent = 'Username saved (•••••••••••••••)';
                statusContainer.className = 'api-status has-key';
            } else {
                statusElement.textContent = 'No username saved';
                statusContainer.className = 'api-status no-key';
            }
        }
    }

    updatePanelToggles(panels) {
        const datetimeToggle = document.getElementById('panel-datetime');
        const calendarToggle = document.getElementById('panel-calendar');
        const hueToggle = document.getElementById('panel-hue');
        
        if (datetimeToggle) datetimeToggle.checked = panels.datetime !== false;
        if (calendarToggle) calendarToggle.checked = panels.calendar !== false;
        if (hueToggle) hueToggle.checked = panels.hue !== false;
    }

    updateCurrentPageDisplay(pageIndex) {
        const pageNames = [
            'Page 1: Date & Weather',
            'Page 2: Calendar & Events',
            'Page 3: Philips Hue'
        ];
        
        const currentPageElement = document.getElementById('current-page');
        const currentPageInfo = document.getElementById('current-page-info');
        
        if (currentPageElement && pageNames[pageIndex]) {
            currentPageElement.textContent = pageNames[pageIndex];
        }
        
        if (currentPageInfo) {
            currentPageInfo.textContent = pageIndex + 1;
        }
    }
}

// Global functions for button clicks
function changePage(pageIndex) {
    if (window.adminPanel && window.adminPanel.socket) {
        window.adminPanel.socket.emit('changePage', pageIndex);
    }
}

function updateCycleInterval() {
    const interval = document.getElementById('cycle-interval').value;
    if (window.adminPanel && window.adminPanel.socket) {
        window.adminPanel.socket.emit('updateSettings', {
            cycleInterval: parseInt(interval) * 1000
        });
    }
}


async function showCurrentApiKey() {
    try {
        const response = await fetch('/api/dashboard/state');
        if (response.ok) {
            const state = await response.json();
            const apiKey = state.settings?.weatherApiKey;
            
            if (apiKey) {
                const maskedKey = `${apiKey.substring(0, 8)}${'*'.repeat(apiKey.length - 12)}${apiKey.substring(apiKey.length - 4)}`;
                alert(`Current API Key:\n${maskedKey}\n\nFull key: ${apiKey}`);
            } else {
                alert('No API key is currently saved.');
            }
        } else {
            alert('Failed to retrieve API key information.');
        }
    } catch (error) {
        console.error('Error retrieving API key:', error);
        alert('Error retrieving API key information.');
    }
}

function toggleApiKeyVisibility() {
    const apiKeyInput = document.getElementById('weather-api-key');
    const toggleButton = apiKeyInput.nextElementSibling;
    
    if (apiKeyInput && toggleButton) {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleButton.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleButton.textContent = '👁️';
        }
    }
}

async function updateApiKey() {
    const apiKey = document.getElementById('weather-api-key').value.trim();
    
    if (!apiKey) {
        alert('Please enter an API key');
        return;
    }
    
    if (apiKey.length < 10) {
        alert('API key seems too short. Please check your OpenWeatherMap API key.');
        return;
    }
    
    try {
        console.log('Saving API key...');
        const response = await fetch('/api/dashboard/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ weatherApiKey: apiKey })
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            alert('API key saved successfully! Testing weather...');
            // Clear the password field for security
            document.getElementById('weather-api-key').value = '';
            // Test the weather immediately
            setTimeout(testWeather, 1000);
        } else {
            console.error('API key save failed:', responseData);
            alert(`Failed to save API key: ${responseData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving API key:', error);
        alert('Error saving API key. Please check the console for details.');
    }
}

async function testWeather() {
    const statusElement = document.getElementById('weather-api-status');
    if (statusElement) {
        statusElement.textContent = 'Testing...';
        statusElement.style.color = '#ff9800';
    }
    
    try {
        const response = await fetch('/api/weather?test=true');
        
        if (response.ok) {
            const weatherData = await response.json();
            if (statusElement) {
                statusElement.textContent = 'Working ✓';
                statusElement.style.color = '#4CAF50';
            }
            
            alert(`Weather test successful!\n` +
                  `Location: ${weatherData.current.city}, ${weatherData.current.country}\n` +
                  `Temperature: ${weatherData.current.temperature}°\n` +
                  `Condition: ${weatherData.current.description}`);
        } else {
            const errorData = await response.json();
            if (statusElement) {
                statusElement.textContent = 'Error ✗';
                statusElement.style.color = '#f44336';
            }
            
            if (errorData.error.includes('API key')) {
                alert('API Key Error: Please check that your OpenWeatherMap API key is correct and active. ' +
                      'New API keys can take up to 2 hours to activate.');
            } else if (errorData.error.includes('city')) {
                alert('City Error: Please check that the city name is spelled correctly (e.g., "Dallas,US" or "London,GB")');
            } else {
                alert(`Weather API Error: ${errorData.error}`);
            }
        }
    } catch (error) {
        console.error('Error testing weather:', error);
        if (statusElement) {
            statusElement.textContent = 'Connection Error';
            statusElement.style.color = '#f44336';
        }
        alert('Error connecting to weather service');
    }
}

async function updateWeatherCity() {
    const city = document.getElementById('weather-city').value.trim();
    
    if (!city) {
        alert('Please enter a city name');
        return;
    }
    
    // Validate city format
    if (!city.includes(',')) {
        alert('Please use format: "City,Country" (e.g., "Dallas,US" or "London,GB")');
        return;
    }
    
    try {
        const response = await fetch('/api/dashboard/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ city })
        });
        
        if (response.ok) {
            alert('Weather city updated successfully!');
            refreshWeather();
        } else {
            const errorData = await response.json();
            alert(`Failed to update weather city: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error updating weather city:', error);
        alert('Error updating weather city');
    }
}

async function updateWeatherUnits() {
    const units = document.getElementById('weather-units').value;
    try {
        const response = await fetch('/api/dashboard/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ units })
        });
        
        if (response.ok) {
            alert('Weather units updated successfully!');
            refreshWeather();
        } else {
            alert('Failed to update weather units');
        }
    } catch (error) {
        console.error('Error updating weather units:', error);
        alert('Error updating weather units');
    }
}

async function refreshWeather() {
    try {
        const response = await fetch('/api/weather');
        if (response.ok) {
            alert('Weather data refreshed!');
            if (window.adminPanel) {
                window.adminPanel.checkWeatherAPI();
            }
        } else {
            alert('Failed to refresh weather data');
        }
    } catch (error) {
        console.error('Error refreshing weather:', error);
        alert('Error refreshing weather data');
    }
}

async function refreshAll() {
    try {
        // Refresh weather
        await fetch('/api/weather');
        
        // Refresh calendar
        await fetch('/api/calendar');
        
        alert('All data refreshed successfully!');
        
        if (window.adminPanel) {
            window.adminPanel.loadInitialData();
        }
    } catch (error) {
        console.error('Error refreshing data:', error);
        alert('Error refreshing data');
    }
}

async function resetToDefaults() {
    if (confirm('Reset all settings to defaults?\n\nThis will:\n• Reset city to Dallas,US\n• Reset units to Imperial\n• Reset auto-cycle to enabled\n• Clear all saved API keys\n• Reset all configurations\n\nContinue?')) {
        try {
            const response = await fetch('/api/dashboard/reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                alert('Settings reset to defaults successfully!');
                
                // Reload the admin panel to show updated values
                if (window.adminPanel) {
                    window.adminPanel.loadInitialData();
                }
                
                // Refresh the page to reload form values
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                const errorData = await response.json();
                alert(`Failed to reset settings: ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error resetting to defaults:', error);
            alert('Error resetting settings');
        }
    }
}

function fullscreenDashboard() {
    // Redirect to dashboard instead of opening new window
    window.location.href = '/';
}

// Calendar management functions
function toggleCalendarApiKeyVisibility() {
    const apiKeyInput = document.getElementById('calendar-api-key');
    const toggleButton = apiKeyInput.nextElementSibling;
    
    if (apiKeyInput && toggleButton) {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleButton.textContent = '🙈';
        } else {
            apiKeyInput.type = 'password';
            toggleButton.textContent = '👁️';
        }
    }
}

async function updateCalendarApiKey() {
    const apiKey = document.getElementById('calendar-api-key').value.trim();
    
    if (!apiKey) {
        alert('Please enter a Calendar API key');
        return;
    }
    
    if (apiKey.length < 30) {
        alert('API key seems too short. Please check your Google Calendar API key.');
        return;
    }
    
    try {
        console.log('Saving Calendar API key...');
        const response = await fetch('/api/calendar/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ googleCalendarApiKey: apiKey })
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            alert('Calendar API key saved successfully!');
            // Clear the password field for security
            document.getElementById('calendar-api-key').value = '';
            
            // Update the status display
            if (window.adminPanel) {
                window.adminPanel.updateCalendarApiKeyStatus(true);
                // Also refresh the API status in system tab
                setTimeout(() => {
                    window.adminPanel.checkCalendarAPI();
                }, 1000);
            }
        } else {
            console.error('Calendar API key save failed:', responseData);
            alert(`Failed to save Calendar API key: ${responseData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving Calendar API key:', error);
        alert('Error saving Calendar API key. Please check the console for details.');
    }
}

async function updateCalendarId() {
    const calendarId = document.getElementById('calendar-id').value.trim();
    
    if (!calendarId) {
        alert('Please enter a Calendar ID');
        return;
    }
    
    // Basic validation for calendar ID format
    if (!calendarId.includes('@') && !calendarId.includes('.')) {
        alert('Please enter a valid Calendar ID (e.g., your-email@gmail.com)');
        return;
    }
    
    try {
        const response = await fetch('/api/calendar/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ calendarId })
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            alert('Calendar ID updated successfully!');
            
            // Update the status display
            if (window.adminPanel) {
                window.adminPanel.updateCalendarIdStatus(true);
            }
            
            // Test the calendar connection
            setTimeout(testCalendar, 1000);
        } else {
            alert(`Failed to update Calendar ID: ${responseData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error updating Calendar ID:', error);
        alert('Error updating Calendar ID');
    }
}

async function updateMaxEvents() {
    const maxEvents = document.getElementById('max-events').value;
    
    try {
        const response = await fetch('/api/calendar/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ maxCalendarEvents: parseInt(maxEvents) })
        });
        
        if (response.ok) {
            alert('Max events setting updated successfully!');
            refreshCalendar();
        } else {
            alert('Failed to update max events setting');
        }
    } catch (error) {
        console.error('Error updating max events:', error);
        alert('Error updating max events setting');
    }
}

async function testCalendar() {
    const statusElement = document.getElementById('calendar-api-status');
    if (statusElement) {
        statusElement.textContent = 'Testing...';
        statusElement.style.color = '#ff9800';
    }
    
    try {
        const response = await fetch('/api/calendar/test');
        
        if (response.ok) {
            const calendarData = await response.json();
            if (statusElement) {
                statusElement.textContent = 'Working ✓';
                statusElement.style.color = '#4CAF50';
            }
            
            alert(`Calendar test successful!\n\n` +
                  `Calendar: ${calendarData.calendar.summary}\n` +
                  `ID: ${calendarData.calendar.id}\n` +
                  `Time Zone: ${calendarData.calendar.timeZone}\n` +
                  `Description: ${calendarData.calendar.description}`);
        } else {
            const errorData = await response.json();
            if (statusElement) {
                statusElement.textContent = 'Error ✗';
                statusElement.style.color = '#f44336';
            }
            
            if (errorData.error.includes('API key')) {
                alert('Calendar API Key Error: Please check that your Google Calendar API key is correct and has Calendar API access enabled.');
            } else if (errorData.error.includes('Calendar not found')) {
                alert('Calendar Error: Please check that the Calendar ID is correct and the calendar is publicly accessible or you have proper permissions.');
            } else if (errorData.error.includes('not configured')) {
                alert('Configuration Error: Please make sure both API key and Calendar ID are configured.');
            } else {
                alert(`Calendar API Error: ${errorData.error}`);
            }
        }
    } catch (error) {
        console.error('Error testing calendar:', error);
        if (statusElement) {
            statusElement.textContent = 'Connection Error';
            statusElement.style.color = '#f44336';
        }
        alert('Error testing calendar connection. Please check the console for details.');
    }
}

async function showCurrentCalendarApiKey() {
    try {
        const response = await fetch('/api/dashboard/state');
        if (response.ok) {
            const state = await response.json();
            const apiKey = state.settings?.googleCalendarApiKey;
            
            if (apiKey) {
                const maskedKey = `${apiKey.substring(0, 8)}${'*'.repeat(apiKey.length - 12)}${apiKey.substring(apiKey.length - 4)}`;
                alert(`Current Calendar API Key:\n${maskedKey}\n\nFull key: ${apiKey}`);
            } else {
                alert('No Calendar API key is currently saved.');
            }
        } else {
            alert('Failed to retrieve Calendar API key information.');
        }
    } catch (error) {
        console.error('Error retrieving Calendar API key:', error);
        alert('Error retrieving Calendar API key information.');
    }
}

async function refreshCalendar() {
    try {
        const response = await fetch('/api/calendar');
        if (response.ok) {
            const events = await response.json();
            alert(`Calendar refreshed! Found ${events.length} upcoming events.`);
            
            // Also refresh the calendar API status
            if (window.adminPanel) {
                window.adminPanel.checkCalendarAPI();
            }
        } else {
            alert('Failed to refresh calendar data');
        }
    } catch (error) {
        console.error('Error refreshing calendar:', error);
        alert('Error refreshing calendar data');
    }
}

// ===== HUE ADMIN FUNCTIONS =====
async function discoverHueBridge() {
    const discoverBtn = document.querySelector('button[onclick="discoverHueBridge()"]');
    const originalText = discoverBtn.textContent;
    
    try {
        discoverBtn.textContent = '🔄 Discovering...';
        discoverBtn.disabled = true;
        
        const response = await fetch('/api/hue/discover');
        const result = await response.json();
        
        if (result.success && result.bridgeIp) {
            // Auto-fill the bridge IP field
            const bridgeIpField = document.getElementById('hue-bridge-ip');
            if (bridgeIpField) {
                bridgeIpField.value = result.bridgeIp;
                
                // Update the status indicator
                const statusElement = document.getElementById('hue-bridge-indicator');
                if (statusElement) {
                    statusElement.textContent = `Bridge found: ${result.bridgeIp}`;
                    statusElement.parentElement.className = 'api-status has-key';
                }
                
                alert(`✅ Hue Bridge Found!\n\nIP Address: ${result.bridgeIp}\nBridge ID: ${result.bridgeId || 'Unknown'}\n\nThe IP has been automatically filled in. Click "Save IP" to save it.`);
            }
        } else {
            alert(`❌ No Hue Bridge Found\n\nError: ${result.error}\n\nTry:\n• Make sure your bridge is connected to the same network\n• Check if your bridge is powered on\n• Manually enter the IP address if you know it`);
        }
    } catch (error) {
        console.error('Bridge discovery error:', error);
        alert(`❌ Discovery Failed\n\nError: ${error.message}\n\nTry manually entering your bridge IP address.`);
    } finally {
        discoverBtn.textContent = originalText;
        discoverBtn.disabled = false;
    }
}

async function updateHueBridgeIp() {
    const bridgeIp = document.getElementById('hue-bridge-ip').value.trim();
    
    if (!bridgeIp) {
        alert('Please enter a bridge IP address');
        return;
    }
    
    // Basic IP validation
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(bridgeIp)) {
        alert('Please enter a valid IP address (e.g., 192.168.1.100)');
        return;
    }
    
    try {
        const response = await fetch('/api/hue/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hueBridgeIp: bridgeIp })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Update status indicator
            const statusElement = document.getElementById('hue-bridge-indicator');
            if (statusElement) {
                statusElement.textContent = `Bridge IP saved: ${bridgeIp}`;
                statusElement.parentElement.className = 'api-status has-key';
            }
            
            alert(`✅ Bridge IP Saved!\n\nIP Address: ${bridgeIp}\n\nNext step: Create a username by pressing the bridge button and clicking "Create Username".`);
        } else {
            alert(`❌ Failed to save bridge IP\n\nError: ${result.error}`);
        }
    } catch (error) {
        console.error('Error saving bridge IP:', error);
        alert('Error saving bridge IP');
    }
}

async function createHueUsername() {
    const bridgeIp = document.getElementById('hue-bridge-ip').value.trim();
    
    if (!bridgeIp) {
        alert('Please enter and save a bridge IP address first');
        return;
    }
    
    const createBtn = document.querySelector('button[onclick="createHueUsername()"]');
    const originalText = createBtn.textContent;
    
    try {
        createBtn.textContent = '🔄 Creating...';
        createBtn.disabled = true;
        
        // First, show instructions
        const proceed = confirm(`📝 Hue Bridge Authentication\n\n1. Press the PHYSICAL BUTTON on your Hue Bridge\n2. You have 30 seconds after pressing the button\n3. Click OK to continue with username creation\n\nPress the bridge button now, then click OK!`);
        
        if (!proceed) {
            return;
        }
        
        // Attempt to create username
        const response = await fetch(`http://${bridgeIp}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ devicetype: 'pi-dashboard#admin' })
        });
        
        const result = await response.json();
        
        if (result && result[0]) {
            if (result[0].success) {
                const username = result[0].success.username;
                
                // Auto-fill the username field
                const usernameField = document.getElementById('hue-username');
                if (usernameField) {
                    usernameField.value = username;
                }
                
                // Save the username
                const saveResponse = await fetch('/api/hue/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hueUsername: username })
                });
                
                if (saveResponse.ok) {
                    // Update status indicator
                    const statusElement = document.getElementById('hue-username-indicator');
                    if (statusElement) {
                        statusElement.textContent = 'Username saved (•••••••••••••••)';
                        statusElement.parentElement.className = 'api-status has-key';
                    }
                    
                    alert(`✅ Username Created and Saved!\n\nUsername: ${username}\n\nYour Hue bridge is now connected! Try the "Test Connection" button.`);
                } else {
                    alert(`⚠️ Username created but failed to save: ${username}\n\nPlease manually save this username.`);
                }
            } else if (result[0].error) {
                const errorType = result[0].error.type;
                const errorDesc = result[0].error.description;
                
                if (errorType === 101) {
                    alert(`❌ Bridge Button Not Pressed\n\n${errorDesc}\n\nPlease:\n1. Press the physical button on your Hue Bridge\n2. Try again within 30 seconds`);
                } else {
                    alert(`❌ Authentication Error\n\nError ${errorType}: ${errorDesc}`);
                }
            }
        } else {
            alert('❌ Unexpected response from bridge');
        }
    } catch (error) {
        console.error('Error creating username:', error);
        alert(`❌ Connection Error\n\nError: ${error.message}\n\nCheck:\n• Bridge IP address is correct\n• Bridge is on the same network\n• No firewall blocking the connection`);
    } finally {
        createBtn.textContent = originalText;
        createBtn.disabled = false;
    }
}

async function updateHueUsername() {
    const username = document.getElementById('hue-username').value.trim();
    
    if (!username) {
        alert('Please enter a username');
        return;
    }
    
    if (username.length < 10) {
        alert('Username appears to be invalid (too short)');
        return;
    }
    
    try {
        const response = await fetch('/api/hue/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hueUsername: username })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Update status indicator
            const statusElement = document.getElementById('hue-username-indicator');
            if (statusElement) {
                statusElement.textContent = 'Username saved (•••••••••••••••)';
                statusElement.parentElement.className = 'api-status has-key';
            }
            
            alert('✅ Hue username saved successfully!');
        } else {
            alert(`❌ Failed to save username\n\nError: ${result.error}`);
        }
    } catch (error) {
        console.error('Error saving username:', error);
        alert('Error saving username');
    }
}

function toggleHueUsernameVisibility() {
    const field = document.getElementById('hue-username');
    const btn = document.querySelector('button[onclick="toggleHueUsernameVisibility()"]');
    
    if (field.type === 'password') {
        field.type = 'text';
        btn.textContent = '🙈';
    } else {
        field.type = 'password';
        btn.textContent = '👁️';
    }
}

async function showCurrentHueUsername() {
    try {
        const response = await fetch('/api/dashboard/state');
        if (response.ok) {
            const state = await response.json();
            const username = state.settings?.hueUsername;
            
            if (username) {
                const maskedUsername = `${username.substring(0, 8)}${'*'.repeat(username.length - 12)}${username.substring(username.length - 4)}`;
                alert(`Current Hue Username:\n${maskedUsername}\n\nFull username: ${username}`);
            } else {
                alert('No Hue username is currently saved.');
            }
        } else {
            alert('Failed to retrieve Hue username information.');
        }
    } catch (error) {
        console.error('Error retrieving Hue username:', error);
        alert('Error retrieving Hue username information.');
    }
}

async function testHueConnection() {
    const testBtn = document.querySelector('button[onclick="testHueConnection()"]');
    const originalText = testBtn.textContent;
    const resultsDiv = document.getElementById('hue-test-results');
    const outputDiv = document.getElementById('hue-test-output');
    
    try {
        testBtn.textContent = '🔄 Testing...';
        testBtn.disabled = true;
        
        if (resultsDiv) resultsDiv.style.display = 'block';
        if (outputDiv) outputDiv.innerHTML = 'Testing connection...';
        
        const response = await fetch('/api/hue/test');
        const result = await response.json();
        
        if (result.success) {
            if (outputDiv) {
                outputDiv.innerHTML = `
                    <div style="color: #4CAF50;">✅ Connection Successful!</div>
                    <div>Lights found: ${result.lightCount}</div>
                    <div>Message: ${result.message}</div>
                `;
            }
            alert(`✅ Hue Connection Successful!\n\nLights found: ${result.lightCount}\n\nYour Hue integration is working! Check Page 3 of your dashboard.`);
        } else {
            if (outputDiv) {
                outputDiv.innerHTML = `
                    <div style="color: #f44336;">❌ Connection Failed</div>
                    <div>Error: ${result.error}</div>
                `;
            }
            alert(`❌ Connection Failed\n\nError: ${result.error}\n\nCheck your bridge IP and username settings.`);
        }
    } catch (error) {
        console.error('Error testing connection:', error);
        if (outputDiv) {
            outputDiv.innerHTML = `
                <div style="color: #f44336;">❌ Test Failed</div>
                <div>Error: ${error.message}</div>
            `;
        }
        alert(`❌ Test Failed\n\nError: ${error.message}`);
    } finally {
        testBtn.textContent = originalText;
        testBtn.disabled = false;
    }
}

async function refreshHueLights() {
    try {
        const response = await fetch('/api/hue');
        if (response.ok) {
            const data = await response.json();
            alert(`Hue lights refreshed! Found ${data.lights?.length || 0} lights.`);
        } else {
            alert('Failed to refresh Hue lights');
        }
    } catch (error) {
        console.error('Error refreshing Hue lights:', error);
        alert('Error refreshing Hue lights');
    }
}

async function applyHueScene(scene) {
    try {
        const response = await fetch(`/api/hue/scenes/${scene}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            alert(`✅ Applied "${scene}" scene successfully!`);
        } else {
            const error = await response.json();
            alert(`❌ Failed to apply scene: ${error.error}`);
        }
    } catch (error) {
        console.error('Error applying scene:', error);
        alert('Error applying scene');
    }
}

// ===== PANEL MANAGEMENT FUNCTIONS =====
async function savePanelSettings() {
    const datetime = document.getElementById('panel-datetime').checked;
    const calendar = document.getElementById('panel-calendar').checked;
    const hue = document.getElementById('panel-hue').checked;
    
    // Ensure at least one panel is enabled
    if (!datetime && !calendar && !hue) {
        alert('⚠️ At least one panel must be enabled!');
        // Re-enable the datetime panel as default
        document.getElementById('panel-datetime').checked = true;
        return;
    }
    
    const panels = { datetime, calendar, hue };
    
    try {
        const response = await fetch('/api/dashboard/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ panels })
        });
        
        if (response.ok) {
            alert('✅ Panel settings saved! Dashboard will update automatically.');
            
            // Notify dashboard to update panels
            if (window.adminPanel && window.adminPanel.socket) {
                window.adminPanel.socket.emit('panelsChanged', panels);
            }
        } else {
            const error = await response.json();
            alert(`❌ Failed to save panel settings: ${error.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving panel settings:', error);
        alert('❌ Error saving panel settings');
    }
}

async function resetPanelSettings() {
    if (confirm('Reset all panels to enabled?\n\nThis will show all dashboard panels.')) {
        document.getElementById('panel-datetime').checked = true;
        document.getElementById('panel-calendar').checked = true;
        document.getElementById('panel-hue').checked = true;
        
        await savePanelSettings();
    }
}

function updateCalendarSourcesList(sources) {
    const container = document.getElementById('calendar-sources-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (sources.length === 0) {
        container.innerHTML = '<p class="no-sources">No calendar sources configured. Add one below to get started!</p>';
        return;
    }
    
    sources.forEach(source => {
        const sourceDiv = document.createElement('div');
        sourceDiv.className = 'calendar-source-item';
        sourceDiv.innerHTML = `
            <div class="source-header">
                <div class="source-info">
                    <h4>${source.name}</h4>
                    <span class="source-type">${source.type === 'ical' ? '🔗 iCal' : '📊 Google'}</span>
                    <span class="source-status ${source.enabled ? 'enabled' : 'disabled'}">
                        ${source.enabled ? '✅ Enabled' : '❌ Disabled'}
                    </span>
                </div>
                <div class="source-actions">
                    <button class="btn btn-small ${source.enabled ? 'btn-warning' : 'btn-secondary'}" 
                            onclick="toggleCalendarSource('${source.id}')">
                        ${source.enabled ? '⏸️ Disable' : '▶️ Enable'}
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="testCalendarSource('${source.id}')">🧪 Test</button>
                    <button class="btn btn-small btn-danger" onclick="deleteCalendarSource('${source.id}')">🗑️ Delete</button>
                </div>
            </div>
            <div class="source-details">
                ${source.type === 'ical' ? 
                    `<p><strong>URL:</strong> ${source.config.url}</p>` :
                    `<p><strong>Calendar ID:</strong> ${source.config.calendarId}</p>`
                }
            </div>
        `;
        container.appendChild(sourceDiv);
    });
}

// ===== NEW CALENDAR MANAGEMENT FUNCTIONS =====

function toggleCalendarTypeFields() {
    const type = document.getElementById('new-calendar-type').value;
    const icalFields = document.getElementById('ical-fields');
    const googleFields = document.getElementById('google-fields');
    
    if (type === 'ical') {
        icalFields.style.display = 'block';
        googleFields.style.display = 'none';
    } else {
        icalFields.style.display = 'none';
        googleFields.style.display = 'block';
    }
}

async function addCalendarSource() {
    const name = document.getElementById('new-calendar-name').value.trim();
    const type = document.getElementById('new-calendar-type').value;
    
    if (!name) {
        alert('Please enter a calendar name');
        return;
    }
    
    const data = { name, type };
    
    if (type === 'ical') {
        const url = document.getElementById('new-calendar-url').value.trim();
        if (!url) {
            alert('Please enter a calendar URL');
            return;
        }
        data.url = url;
    } else if (type === 'google') {
        const apiKey = document.getElementById('new-google-api-key').value.trim();
        const calendarId = document.getElementById('new-google-calendar-id').value.trim();
        
        if (!apiKey || !calendarId) {
            alert('Please enter both API key and calendar ID for Google calendars');
            return;
        }
        
        data.apiKey = apiKey;
        data.calendarId = calendarId;
    }
    
    try {
        const response = await fetch('/api/calendar/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Calendar source added successfully!');
            
            // Clear the form
            document.getElementById('new-calendar-name').value = '';
            document.getElementById('new-calendar-url').value = '';
            document.getElementById('new-google-api-key').value = '';
            document.getElementById('new-google-calendar-id').value = '';
            
            // Refresh the calendar data
            refreshCalendar();
        } else {
            alert(`Failed to add calendar source: ${result.error}`);
        }
    } catch (error) {
        console.error('Error adding calendar source:', error);
        alert('Error adding calendar source');
    }
}

async function toggleCalendarSource(sourceId) {
    try {
        // Get current state
        const stateResponse = await fetch('/api/dashboard/state');
        const state = await stateResponse.json();
        const source = state.settings.calendarSources?.find(s => s.id === sourceId);
        
        if (!source) {
            alert('Calendar source not found');
            return;
        }
        
        const response = await fetch(`/api/calendar/sources/${sourceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !source.enabled })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`Calendar source ${source.enabled ? 'disabled' : 'enabled'} successfully!`);
            refreshCalendar();
        } else {
            alert(`Failed to update calendar source: ${result.error}`);
        }
    } catch (error) {
        console.error('Error toggling calendar source:', error);
        alert('Error updating calendar source');
    }
}

async function testCalendarSource(sourceId) {
    try {
        const response = await fetch(`/api/calendar/sources/${sourceId}/test`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`Calendar test successful!\n\nEvents found: ${result.eventsFound}\nMessage: ${result.message}`);
        } else {
            alert(`Calendar test failed: ${result.error}`);
        }
    } catch (error) {
        console.error('Error testing calendar source:', error);
        alert('Error testing calendar source');
    }
}

async function deleteCalendarSource(sourceId) {
    if (!confirm('Are you sure you want to delete this calendar source?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/calendar/sources/${sourceId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Calendar source deleted successfully!');
            refreshCalendar();
        } else {
            alert(`Failed to delete calendar source: ${result.error}`);
        }
    } catch (error) {
        console.error('Error deleting calendar source:', error);
        alert('Error deleting calendar source');
    }
}

async function testAllCalendars() {
    try {
        const stateResponse = await fetch('/api/dashboard/state');
        const state = await stateResponse.json();
        const sources = state.settings.calendarSources || [];
        
        if (sources.length === 0) {
            alert('No calendar sources configured to test');
            return;
        }
        
        let results = '';
        let totalEvents = 0;
        
        for (const source of sources) {
            if (!source.enabled) continue;
            
            try {
                const response = await fetch(`/api/calendar/sources/${source.id}/test`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    results += `✅ ${source.name}: ${result.eventsFound} events\n`;
                    totalEvents += result.eventsFound;
                } else {
                    results += `❌ ${source.name}: ${result.error}\n`;
                }
            } catch (error) {
                results += `❌ ${source.name}: Connection error\n`;
            }
        }
        
        alert(`Calendar Test Results:\n\n${results}\nTotal events found: ${totalEvents}`);
    } catch (error) {
        console.error('Error testing calendars:', error);
        alert('Error testing calendars');
    }
}

// AdminPanel is now initialized from the HTML file
console.log('Admin panel script loaded successfully');

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (window.adminPanel && window.adminPanel.socket) {
        window.adminPanel.socket.disconnect();
    }
});