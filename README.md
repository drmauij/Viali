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
- **Secure Authentication**: OpenID Connect (OIDC) via Replit Auth + local credentials
- **Database Rollback**: Built-in checkpoint system for data recovery
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
- **Replit** for hosting and deployment
- **Neon** for PostgreSQL database
- **OpenID Connect** for enterprise authentication

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database (or use Replit's built-in database)
- OpenAI API key (for AI features)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/viali.git
cd viali
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Database
DATABASE_URL=your_postgresql_url

# Authentication (optional - for production)
ISSUER_URL=your_oidc_provider_url

# AI Features (optional)
OPENAI_API_KEY=your_openai_key

# Email (optional)
RESEND_API_KEY=your_resend_key
```

4. Run database migrations:
```bash
npm run db:push
```

5. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

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
