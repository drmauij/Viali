# Viali - Hospital Inventory Management System

A mobile-first web application designed for hospital operations, featuring comprehensive modules for Inventory Management, Anesthesia Records, and Administration.

![Viali Dashboard](https://img.shields.io/badge/Status-Active-success)
![License](https://img.shields.io/badge/License-Open%20Source-blue)

## 🏥 Overview

Viali is a professional healthcare management platform that streamlines hospital operations across multiple critical areas:

### 📦 Inventory Management
- **Anesthesia Drugs & Consumables**: Optimize inventory across multiple hospitals
- **Smart Reordering**: Automated Min-Max rules to prevent stockouts
- **Expiry Tracking**: Minimize waste from expired items
- **Controlled Substances**: Full compliance tracking and electronic signatures
- **Barcode Scanning**: Quick item identification and tracking
- **AI-Powered Import**: Bulk photo import with automated item extraction using OpenAI Vision

### 💉 Anesthesia Records
- **Pre-OP Assessment**: Comprehensive pre-operative patient evaluation
- **OP Monitoring**: Real-time intraoperative monitoring with professional vitals timeline
- **PACU Management**: Post-Anesthesia Care Unit tracking with Aldrette scores
- **Medical Charting**: Industry-standard visualization matching professional medical systems
- **German Medical Terminology**: Professional terminology for international healthcare standards
- **AI Data Extraction**: Privacy-first patient de-identification

### 🔐 Administration
- **Multi-Hospital Support**: Manage multiple facilities from one platform
- **Role-Based Access Control**: Granular permissions per hospital
- **User Management**: Secure authentication with Google OAuth and local credentials
- **Audit Trails**: Complete activity logging for compliance

## ✨ Key Features

- **Mobile-First Design**: Optimized for smartphones and tablets
- **Dark Mode Support**: Comfortable viewing in any environment
- **Real-Time Updates**: Live data synchronization
- **Professional UI**: Built with Shadcn/ui and Tailwind CSS
- **Secure Authentication**: Google OAuth + local email/password credentials
- **Production-Ready**: Deploy anywhere with Node.js and PostgreSQL
- **Electronic Signatures**: Print-ready signature capture for controlled substances
- **PDF Export**: Generate professional reports and order forms

## 🛠️ Technology Stack

### Frontend
- **React** with TypeScript
- **Vite** for blazing-fast development
- **Wouter** for routing
- **TanStack Query** for server state management
- **Shadcn/ui** + **Radix UI** components
- **Tailwind CSS** for styling
- **Framer Motion** for animations

### Backend
- **Express.js** with TypeScript
- **PostgreSQL** (Neon serverless)
- **Drizzle ORM** for type-safe database queries
- **Passport.js** for authentication
- **OpenAI** for AI-powered features
- **Resend** for email notifications

### Infrastructure
- **Self-Hosted** on any server with Node.js 20+
- **PostgreSQL** (Exoscale, Aiven, or any provider)
- **Google OAuth 2.0** (optional)
- **PM2** for process management (recommended)

## 🚀 Self-Hosting Guide

Viali can be deployed on any server with Node.js and PostgreSQL. This guide covers deployment on EU-based servers like Exoscale, but works for any hosting provider.

### Prerequisites
- **Node.js** 20 or higher
- **PostgreSQL** database with SSL support (Exoscale, Aiven, or any provider)
- **SSH access** to your server
- **OpenAI API key** (required for AI features)

### Quick Start

#### 1. Clone the Repository
```bash
git clone https://github.com/drmauij/viali.git
cd viali
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Set Up Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# ========================================
# REQUIRED VARIABLES
# ========================================

# PostgreSQL Database Connection (with SSL)
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"

# Session Security (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET="your-random-secret-minimum-32-characters"

# Data Encryption for Patient Data
ENCRYPTION_SECRET="another-random-secret-minimum-32-characters"

# OpenAI API Key (for AI-powered features)
OPENAI_API_KEY="sk-proj-xxxxxxxxxxxxx"

# ========================================
# OPTIONAL VARIABLES
# ========================================

# Google OAuth (optional - if not set, only email/password auth works)
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"

# Email Service (optional - if not set, email features are disabled)
RESEND_API_KEY="re_xxxxxxxxxxxxx"
RESEND_FROM_EMAIL="noreply@yourdomain.com"

# Production URL (for OAuth callbacks and email links)
PRODUCTION_URL="https://yourdomain.com"

# Server Port (defaults to 5000)
PORT="5000"

# Database SSL Certificate Validation (defaults to true for security)
# Set to 'false' ONLY if using self-signed certificates in development
DB_SSL_REJECT_UNAUTHORIZED="false"
```

**Generate Random Secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 4. Build the Application
```bash
npm run build
```

#### 5. Database Setup

The application automatically runs database migrations on startup - no manual migration steps needed!

#### 6. Start the Application

**Option A: Using PM2 (Recommended for Production)**
```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start npm --name "viali" -- start

# Save the process list
pm2 save

# Enable auto-start on server reboot
pm2 startup
```

**Option B: Direct Node.js (Development)**
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

### 🔐 Authentication Setup

Viali supports two authentication methods that can work independently or together:

#### Google OAuth (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API**
4. Navigate to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure:
   - **Application type**: Web application
   - **Authorized redirect URIs**: `https://yourdomain.com/api/auth/google/callback`
6. Copy the **Client ID** and **Client Secret** to your `.env` file

If Google OAuth is not configured, the login page will only show email/password authentication.

#### Local Email/Password (Always Available)

Email/password authentication works out of the box. Users can sign up and log in using email credentials without any additional setup.

### 📧 Email Service Setup (Optional)

To enable email features (password reset, notifications):

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain or use their test domain for development
3. Create an API key in your Resend dashboard
4. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to your `.env` file

If email is not configured, the app works normally but email features will be disabled.

### 🌐 Nginx Reverse Proxy (Optional)

For production deployments, use Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 🔒 SSL/TLS Certificate

Use [Certbot](https://certbot.eff.org/) to get a free SSL certificate:

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 📊 Database Providers

Viali works with any PostgreSQL provider. Popular options:

- **[Exoscale](https://www.exoscale.com/)** - EU-based, GDPR compliant
- **[Aiven](https://aiven.io/)** - Multi-cloud PostgreSQL
- **[DigitalOcean](https://www.digitalocean.com/products/managed-databases-postgresql)** - Managed PostgreSQL
- **[Neon](https://neon.tech/)** - Serverless PostgreSQL
- **Self-hosted** PostgreSQL on your own server

Make sure your database connection string includes `?sslmode=require` for secure connections.

### 🔄 Updating the Application

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Rebuild the application
npm run build

# Restart with PM2
pm2 restart viali
```

Database migrations run automatically on startup.

## 📱 Usage

### Inventory Module
1. Navigate to the Inventory section
2. Add items with barcode scanning or manual entry
3. Set Min/Max thresholds for automatic reordering
4. Track lots and expiry dates
5. Generate orders and export to PDF

### Anesthesia Module
1. Create patient records
2. Complete Pre-OP assessments
3. Monitor patients during surgery with real-time vitals
4. Track PACU recovery with Aldrette scores
5. Document all procedures with electronic signatures

### Administration
1. Manage multiple hospitals
2. Create users and assign roles
3. Configure system settings
4. Review audit trails and activity logs

## 🤝 Contributing

We welcome contributions from the community! Viali is an open-source project built to improve healthcare efficiency and patient safety.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the branch** (`git push origin feature/AmazingFeature`)
5. **Open a Pull Request**

### Support Development

If you find Viali useful and want to support its continued development, you can contribute via Stripe:

**[💝 Support Viali Development](https://buy.stripe.com/6oU28reUg0Mo6Vqcm2aMU04)**

Your support helps us:
- Add new features
- Improve existing functionality
- Maintain documentation
- Provide community support
- Keep the project free and open-source

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with ❤️ for healthcare professionals
- Special thanks to all contributors
- Powered by modern web technologies

## 📞 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/viali/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/viali/discussions)
- **Email**: support@viali.app (if applicable)

---

**Made with ❤️ for better healthcare**
