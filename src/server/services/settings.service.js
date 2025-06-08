const fs = require('fs');
const path = require('path');

class SettingsService {
    constructor() {
        this.dataDir = path.join(process.cwd(), 'data');
        this.settingsFile = path.join(this.dataDir, 'settings.json');
        this.backupFile = path.join(this.dataDir, 'settings.backup.json');
        
        // Ensure data directory exists
        this.ensureDataDirectory();
    }

    ensureDataDirectory() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
                console.log('📁 Created data directory:', this.dataDir);
            }
        } catch (error) {
            console.error('❌ Failed to create data directory:', error);
        }
    }

    // Load settings from file
    loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const settingsData = fs.readFileSync(this.settingsFile, 'utf8');
                const settings = JSON.parse(settingsData);
                console.log('✅ Settings loaded from file');
                return settings;
            } else {
                console.log('📝 No settings file found, using defaults');
                return this.getDefaultSettings();
            }
        } catch (error) {
            console.error('❌ Failed to load settings, trying backup:', error);
            return this.loadBackup();
        }
    }

    // Load backup settings
    loadBackup() {
        try {
            if (fs.existsSync(this.backupFile)) {
                const backupData = fs.readFileSync(this.backupFile, 'utf8');
                const settings = JSON.parse(backupData);
                console.log('✅ Settings loaded from backup file');
                return settings;
            } else {
                console.log('⚠️ No backup found, using defaults');
                return this.getDefaultSettings();
            }
        } catch (error) {
            console.error('❌ Failed to load backup settings, using defaults:', error);
            return this.getDefaultSettings();
        }
    }

    // Save settings to file
    saveSettings(settings) {
        try {
            // Create backup of current settings first
            if (fs.existsSync(this.settingsFile)) {
                fs.copyFileSync(this.settingsFile, this.backupFile);
            }

            // Remove sensitive data and prepare for storage
            const settingsToSave = this.sanitizeSettings(settings);
            
            // Write new settings
            const settingsData = JSON.stringify(settingsToSave, null, 2);
            fs.writeFileSync(this.settingsFile, settingsData, 'utf8');
            
            console.log('💾 Settings saved successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to save settings:', error);
            return false;
        }
    }

    // Remove circular references and non-serializable data
    sanitizeSettings(settings) {
        const sanitized = JSON.parse(JSON.stringify(settings));
        
        // Remove functions, sockets, and other non-serializable items
        delete sanitized.io;
        
        // Keep only the settings we want to persist
        return {
            settings: sanitized.settings || {},
            autoCycle: sanitized.autoCycle !== undefined ? sanitized.autoCycle : true,
            cycleInterval: sanitized.cycleInterval || 10000,
            totalPages: sanitized.totalPages || 3,
            lastSaved: new Date().toISOString()
        };
    }

    // Get default settings structure
    getDefaultSettings() {
        return {
            settings: {
                city: 'Dallas,US',
                units: 'imperial',
                displayWidth: 800,
                displayHeight: 480,
                weatherApiKey: null,
                googleCalendarApiKey: null,
                calendarId: null,
                maxCalendarEvents: 10,
                hueBridgeIp: null,
                hueUsername: null
            },
            autoCycle: true,
            cycleInterval: 10000,
            totalPages: 3,
            lastSaved: null
        };
    }

    // Update specific setting
    updateSetting(key, value, settings) {
        try {
            if (settings.settings) {
                settings.settings[key] = value;
            } else {
                settings[key] = value;
            }
            
            const saved = this.saveSettings(settings);
            if (saved) {
                console.log(`✅ Updated setting: ${key}`);
            }
            return saved;
        } catch (error) {
            console.error(`❌ Failed to update setting ${key}:`, error);
            return false;
        }
    }

    // Get settings file info
    getFileInfo() {
        try {
            const info = {
                dataDir: this.dataDir,
                settingsFile: this.settingsFile,
                exists: fs.existsSync(this.settingsFile),
                backupExists: fs.existsSync(this.backupFile)
            };

            if (info.exists) {
                const stats = fs.statSync(this.settingsFile);
                info.lastModified = stats.mtime;
                info.size = stats.size;
            }

            return info;
        } catch (error) {
            console.error('❌ Failed to get file info:', error);
            return { error: error.message };
        }
    }

    // Reset settings to defaults
    resetToDefaults() {
        try {
            const defaults = this.getDefaultSettings();
            const saved = this.saveSettings(defaults);
            if (saved) {
                console.log('🔄 Settings reset to defaults');
            }
            return saved ? defaults : null;
        } catch (error) {
            console.error('❌ Failed to reset settings:', error);
            return null;
        }
    }

    // Create settings backup manually
    createBackup() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = path.join(this.dataDir, `settings-backup-${timestamp}.json`);
                fs.copyFileSync(this.settingsFile, backupPath);
                console.log('📋 Settings backup created:', backupPath);
                return backupPath;
            } else {
                console.log('⚠️ No settings file to backup');
                return null;
            }
        } catch (error) {
            console.error('❌ Failed to create backup:', error);
            return null;
        }
    }

    // Auto-save with debouncing (prevent too frequent saves)
    autoSave(settings, delay = 1000) {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(() => {
            this.saveSettings(settings);
        }, delay);
    }
}

module.exports = SettingsService;