# Pi Dashboard - Project Structure

## Overview
This project has been reorganized from a single monolithic file to a well-structured, maintainable architecture.

## Current Structure

```
pi-dashboard/
├── src/                        # Source code
│   ├── server/                 # Backend/API code
│   │   ├── routes/             # Express route handlers
│   │   │   ├── weather.routes.js     # Weather API endpoints
│   │   │   └── calendar.routes.js    # Calendar API endpoints
│   │   ├── services/           # Business logic services
│   │   │   ├── weather.service.js    # Weather data processing
│   │   │   └── calendar.service.js   # Calendar data processing
│   │   └── app.js              # Main Express application
│   ├── client/                 # Frontend code (future organization)
│   │   ├── dashboard/          # Main dashboard frontend
│   │   └── admin/              # Admin panel frontend
│   └── shared/                 # Shared utilities and types
├── public/                     # Dashboard static files
│   ├── index.html              # Dashboard HTML
│   ├── script.js               # Dashboard JavaScript
│   └── style.css               # Dashboard CSS
├── admin/                      # Admin panel static files
│   ├── index.html              # Admin HTML
│   ├── admin.js                # Admin JavaScript
│   └── admin.css               # Admin CSS
├── docs/                       # Documentation
├── config/                     # Configuration files (future)
├── tests/                      # Test files (future)
├── .env                        # Environment variables
├── package.json                # Node.js dependencies
├── server.js                   # Legacy server file (backup)
└── docker-compose.yml          # Docker configuration
```

## Benefits of New Structure

### 1. **Separation of Concerns**
- **Routes**: Handle HTTP requests/responses
- **Services**: Contain business logic
- **Models**: Data structures (future)

### 2. **Maintainability** 
- Smaller, focused files
- Easier to find and modify specific functionality
- Clear responsibilities for each module

### 3. **Scalability**
- Easy to add new features
- Can add more routes/services without cluttering
- Prepared for testing and TypeScript conversion

### 4. **Code Reusability**
- Services can be used by multiple routes
- Shared utilities in common location
- Better modularity

## Migration Status

### ✅ Completed
- [x] Created organized folder structure
- [x] Extracted WeatherService from monolithic server
- [x] Extracted CalendarService from monolithic server  
- [x] Created modular route handlers
- [x] Updated package.json scripts
- [x] Maintained full backward compatibility

### 🚧 In Progress
- [ ] Move client-side code to organized structure
- [ ] Create shared constants/utilities
- [ ] Add configuration management

### 📋 Future Improvements
- [ ] Add TypeScript for better type safety
- [ ] Add unit tests for services
- [ ] Add API documentation (OpenAPI/Swagger)
- [ ] Add database layer for persistence
- [ ] Add logging service
- [ ] Add error handling middleware

## Running the Application

### New Structure
```bash
npm start              # Uses new organized structure
npm run dev           # Development with nodemon
```

### Legacy Fallback  
```bash
npm run start:old     # Uses original server.js (backup)
```

## Key Files

### Core Application
- `src/server/app.js` - Main Express server
- `src/server/services/weather.service.js` - Weather API logic
- `src/server/services/calendar.service.js` - Calendar API logic
- `src/server/routes/weather.routes.js` - Weather endpoints
- `src/server/routes/calendar.routes.js` - Calendar endpoints

### Frontend (unchanged locations)
- `public/` - Dashboard frontend
- `admin/` - Admin panel frontend

### Configuration
- `.env` - Environment variables
- `package.json` - Dependencies and scripts
- `docker-compose.yml` - Docker configuration

## Development Guidelines

### Adding New Features
1. **API Features**: Add to appropriate service in `src/server/services/`
2. **New Endpoints**: Create route in `src/server/routes/`
3. **Frontend Features**: Add to `public/` or `admin/`
4. **Shared Code**: Place in `src/shared/`

### Code Organization
- Keep files small and focused (< 200 lines)
- Use clear, descriptive names
- Add comments for complex logic
- Follow existing patterns and conventions

### Testing (Future)
- Unit tests in `tests/unit/`
- Integration tests in `tests/integration/`
- E2E tests in `tests/e2e/`

This structure provides a solid foundation for continued development and makes the codebase much more maintainable!