# Viali - Hospital Inventory Management System

A mobile-first web application designed for hospital operations, featuring comprehensive modules for Inventory Management, Anesthesia Records, and Administration.

![Viali Dashboard](https://img.shields.io/badge/Status-Active-success)
[![License](https://img.shields.io/badge/License-BUSL%201.1-blue.svg)](./LICENSE)

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

## 🚀 Production Deployment Guide

Viali uses a **background worker architecture** for reliable bulk image processing and can be deployed on any server with Node.js and PostgreSQL. This guide covers production deployment on EU-based servers (Exoscale, Aiven), but works for any hosting provider.

### System Architecture

Viali runs **two processes** managed by PM2:
- **Main Application**: Web server handling HTTP requests (port 5000)
- **Background Worker**: Processes bulk image imports asynchronously with progress tracking

### Prerequisites
- **Node.js** 20 or higher
- **PostgreSQL** database with SSL support
- **SSH access** to your server
- **PM2** process manager
- **Nginx** web server (recommended)
- **OpenAI API key** (required for AI features)

---

### Step 1: Clone and Install

```bash
# Clone repository
cd /home/ubuntu  # or your preferred directory
git clone https://github.com/drmauij/viali.git
cd viali

# Install dependencies
npm ci
```

---

### Step 2: Configure PM2 Ecosystem (Important!)

On production servers, environment variables must be configured in `ecosystem.config.cjs` because they are not automatically injected during the build process.

#### Create Production Config

```bash
# Copy the template
cp ecosystem.config.template.cjs ecosystem.config.cjs

# Edit with your actual secrets
nano ecosystem.config.cjs
```

#### Required Environment Variables

Both processes need these variables in `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'viali-app',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
        DATABASE_URL: 'postgresql://user:password@host:port/database?sslmode=require',
        SESSION_SECRET: 'your-random-secret-minimum-32-characters',
        ENCRYPTION_SECRET: 'another-random-secret-minimum-32-characters',
        OPENAI_API_KEY: 'sk-proj-xxxxxxxxxxxxx',
        GOOGLE_CLIENT_ID: 'your-client-id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'your-client-secret',
        RESEND_API_KEY: 're_xxxxxxxxxxxxx',
        RESEND_FROM_EMAIL: 'noreply@yourdomain.com',
        PRODUCTION_URL: 'https://yourdomain.com',
        DB_SSL_REJECT_UNAUTHORIZED: 'false',  // Set to 'false' for Aiven/Exoscale SSL
      },
    },
    {
      name: 'viali-worker',
      script: './node_modules/.bin/tsx',
      args: 'server/worker.ts',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password@host:port/database?sslmode=require',
        OPENAI_API_KEY: 'sk-proj-xxxxxxxxxxxxx',
        DB_SSL_REJECT_UNAUTHORIZED: 'false',
      },
    },
  ],
};
```

**Generate Random Secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 🔒 Critical Security Notes

⚠️ **IMPORTANT**: The `ecosystem.config.cjs` file contains ALL your production secrets!

1. ✅ **Already in `.gitignore`** - Never commit this file to git
2. 🔐 **Set restrictive permissions:**
   ```bash
   chmod 600 ecosystem.config.cjs
   ```
3. 💾 **Backup securely** - If lost, you'll need to regenerate all secrets
4. 🔄 **If secrets are exposed:**
   - Rotate ALL secrets immediately
   - Revoke exposed credentials
   - Generate new ones and update the config

---

### Step 3: Build and Deploy

```bash
# Build the application
npm run build

# Start both app and worker with PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Setup auto-start on server reboot
pm2 startup
# Follow the instructions to run the generated command, then:
pm2 save
```

#### Verify Deployment

```bash
# Check process status
pm2 status

# View logs
pm2 logs

# View specific process logs
pm2 logs viali-app
pm2 logs viali-worker
```

The application will be available at `http://localhost:5000`

**Database migrations run automatically on startup** - no manual migration steps needed!

---

### Step 4: Configure Nginx (Production)

For production deployments, use Nginx as a reverse proxy with proper timeout configuration for bulk uploads.

**File: `/etc/nginx/sites-available/viali`**

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL Configuration (use certbot to generate)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # IMPORTANT: Allow large uploads for bulk image imports
    client_max_body_size 100M;

    # IMPORTANT: Increase timeouts for upload processing
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

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

**Enable and test:**
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/viali /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

### Step 5: SSL Certificate

Use [Certbot](https://certbot.eff.org/) for free SSL certificates:

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Certbot will automatically update your nginx configuration with SSL settings.

---

### 🔄 Deploying Updates

Create a deployment script for easy updates:

**File: `deploy.sh`**
```bash
#!/bin/bash
cd /home/ubuntu/viali
git pull origin main
npm ci
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

**Usage:**
```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
1. Pull latest code from GitHub
2. Install dependencies
3. Rebuild the application
4. Reload PM2 processes with zero-downtime
5. Run database migrations automatically

---

### 📊 PM2 Management Commands

```bash
# View status
pm2 status

# View live logs
pm2 logs

# Restart all processes
pm2 restart all

# Restart specific process
pm2 restart viali-app
pm2 restart viali-worker

# Monitor resource usage
pm2 monit

# Stop all processes
pm2 stop all

# Delete all processes
pm2 delete all
```

---

### Development Setup (Local)

For local development, use environment variables instead of PM2:

**Create `.env` file:**
```bash
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/viali
SESSION_SECRET=your-dev-secret
ENCRYPTION_SECRET=your-dev-secret
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

**Start development server:**
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

---

### 📊 Supported Database Providers

Viali works with any PostgreSQL provider:

- **[Exoscale](https://www.exoscale.com/)** - EU-based, GDPR compliant
- **[Aiven](https://aiven.io/)** - Multi-cloud PostgreSQL with global regions
- **[DigitalOcean](https://www.digitalocean.com/products/managed-databases-postgresql)** - Managed PostgreSQL
- **[Neon](https://neon.tech/)** - Serverless PostgreSQL (great for development)
- **Self-hosted** PostgreSQL on your own server

Make sure your database connection string includes `?sslmode=require` for secure connections.

---

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

viali.app is licensed under the [Business Source License 1.1](./LICENSE).

- ✅ Free for hospitals and healthcare providers
- ✅ Modify and use internally without restrictions
- ❌ Cannot resell or offer as commercial SaaS

Converts to Apache 2.0 on 2029-01-20.

See the [LICENSE](./LICENSE) file for full details.

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
