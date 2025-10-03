# AnaStock - Hospital Inventory Management System

## Overview

AnaStock is a mobile-first web application designed to manage anesthesia drugs and general consumables across one or more hospitals. The system focuses on preventing stockouts of critical drugs, minimizing waste from expiry, automating reordering via Min-Max rules, ensuring compliance for controlled substances, and supporting multi-hospital management with per-hospital users and roles.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**
- React with TypeScript for type safety and modern UI development
- Vite as the build tool and development server
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching
- Shadcn/ui components built on Radix UI primitives for accessible, customizable UI components
- Tailwind CSS for utility-first styling with custom design tokens

**Design Patterns**
- Mobile-first responsive design philosophy
- Component-based architecture with reusable UI components
- Custom hooks for shared logic (useAuth, useIsMobile, useToast)
- Theme provider pattern for light/dark mode support
- Query-based data fetching with automatic caching and refetching strategies

**Key UI Features**
- Bottom navigation for mobile-optimized user experience
- Barcode scanning capability for inventory management
- Signature pad for controlled substance documentation
- Real-time item quick panels for stock adjustments
- Hospital switcher for multi-tenant functionality

### Backend Architecture

**Technology Stack**
- Express.js as the HTTP server framework
- TypeScript for type-safe server code
- Drizzle ORM for database operations with PostgreSQL
- Neon serverless PostgreSQL as the database provider
- OpenID Connect (OIDC) for authentication via Replit Auth
- Express session with PostgreSQL session store

**API Design**
- RESTful API architecture with resource-based endpoints
- Authentication middleware protecting all API routes
- JSON request/response format
- Centralized error handling and logging
- Route structure organized by feature domain

**Data Access Layer**
- Storage abstraction pattern isolating database operations
- Drizzle ORM for type-safe SQL query building
- Shared schema definitions between client and server
- Support for complex queries with joins and filtering

### Authentication & Authorization

**Authentication Strategy**
- Hybrid authentication supporting both Google OAuth and local credentials
- OpenID Connect (OIDC) integration for Replit authentication
- Session-based authentication with PostgreSQL session storage
- Per-hospital authentication method configuration (Google/Local can be enabled/disabled)

**Authorization Model**
- Multi-hospital support with user-hospital-role relationships
- Role-based access control per hospital
- User context includes hospital memberships and active hospital selection

### Database Schema

**Core Entities**
- Users: Authentication and profile information
- Hospitals: Multi-tenant organization units
- UserHospitalRoles: Many-to-many relationship with role assignments
- Items: Inventory items (drugs/consumables) with barcode support
- StockLevels: Current inventory quantities per item/hospital
- Lots: Batch tracking with expiry dates
- Orders: Purchase orders with vendor information
- OrderLines: Line items for orders
- Activities: Audit trail for all inventory actions
- Alerts: System-generated notifications
- Vendors: Supplier information
- Locations: Storage location tracking

**Key Design Decisions**
- UUID primary keys for distributed system compatibility
- Timestamp tracking (createdAt/updatedAt) on all entities
- Boolean flags for item properties (critical, controlled)
- Min/Max thresholds for automated reordering logic
- Separate lot tracking for expiry management and compliance

### External Dependencies

**Database**
- Neon Serverless PostgreSQL: Cloud-native PostgreSQL with connection pooling and serverless scaling
- WebSocket support for real-time database connections via @neondatabase/serverless

**Authentication Services**
- Replit OIDC Provider: OAuth 2.0 / OpenID Connect authentication
- Session management via connect-pg-simple for PostgreSQL-backed sessions

**UI Component Libraries**
- Radix UI: Unstyled, accessible component primitives
- Shadcn/ui: Pre-configured component library built on Radix UI
- Lucide React: Icon library
- Font Awesome: Additional icon support

**Development Tools**
- Vite plugins for Replit integration (@replit/vite-plugin-cartographer, @replit/vite-plugin-dev-banner)
- Drizzle Kit: Database migration and schema management
- Zod: Runtime type validation for forms and API inputs

**Barcode Scanning**
- Browser native camera API for barcode capture
- Support for 1D (EAN, UPC, Code128, GS1-128) and 2D (QR, DataMatrix) formats
- GTIN (Global Trade Item Number) lookup system

**Form Management**
- React Hook Form: Form state management and validation
- Hookform Resolvers: Integration with Zod schemas for validation

**Utilities**
- bcrypt: Password hashing for local authentication
- date-fns: Date manipulation and formatting
- nanoid: Unique ID generation
- memoizee: Function result caching