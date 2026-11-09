# 🔐 IntentLock Commerce

### AI-Powered Personal Shopping Agent with an Intelligent Payment Security Firewall

IntentLock Commerce is an AI-powered shopping assistant designed to make online shopping safer and smarter. It helps users discover products, compare options, understand purchasing requirements, and review security checks before proceeding to checkout.

The project aims to introduce an intelligent security layer between AI-driven shopping decisions and payment authorization.

---

## 🚀 Problem Statement

AI shopping agents can search for products, compare prices, recommend purchases, and potentially initiate transactions.

However, allowing an AI agent to make purchasing decisions introduces risks such as:

- Incorrect or misleading product information.
- Suspicious pricing and hidden costs.
- Untrusted merchants.
- Unwanted subscriptions or recurring payments.
- Prompt injection and malicious instructions.
- Unauthorized or unintended purchases.

IntentLock aims to address these risks through an intelligent payment security firewall that verifies purchasing intent before payment authorization.

---

## 💡 Key Features

### 1. AI Shopping Assistant
- Accepts natural-language shopping requirements.
- Helps users discover suitable products.
- Displays product recommendations.

### 2. Product Comparison
- Compares product specifications.
- Displays prices, features, ratings, and other product details.
- Helps users make informed purchasing decisions.

### 3. Intelligent Security Firewall
Proposed security verification layers include:
- Product verification.
- Price verification.
- Merchant verification.
- Subscription detection.
- Prompt injection detection.

### 4. Secure Checkout
- Displays order summaries.
- Provides a security scan interface.
- Designed for future PayPal Sandbox integration.
- Aims to verify purchases before payment authorization.

### 5. Transaction History
- Displays transaction activity.
- Shows completed, blocked, and pending statuses.
- Provides security-related transaction information.

### 6. User Settings
- Notification preferences.
- Privacy preferences.
- Theme selection.

---

## 🛠️ Technology Stack

### Frontend
- React.js
- Vite
- Tailwind CSS
- React Router
- Lucide React
- Recharts
- Axios

### Backend (Planned Integration)
- Node.js
- Express.js
- MongoDB

### AI and Payment Integration (Planned)
- LLM APIs
- PayPal Sandbox

---

## 📁 Project Structure

```text
PayPal/
│
├── public/
│
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.jsx
│   │   │   └── Sidebar.jsx
│   │   │
│   │   └── ui/
│   │       └── Skeleton.jsx
│   │
│   ├── context/
│   │   └── ToastContext.jsx
│   │
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Shopping.jsx
│   │   ├── Comparison.jsx
│   │   ├── Security.jsx
│   │   ├── Checkout.jsx
│   │   ├── Transactions.jsx
│   │   ├── Settings.jsx
│   │   └── PlaceholderPage.jsx
│   │
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
│
├── index.html
├── package.json
├── package-lock.json
└── vite.config.js
```

---

## ⚙️ Installation and Setup

### Prerequisites

Install the following:
- Node.js
- npm
- Git

### Step 1: Clone the repository

```bash
git clone https://github.com/adityasing9/PayPal.git
```

### Step 2: Navigate to the project directory

```bash
cd PayPal
```

### Step 3: Switch to the frontend development branch

```bash
git checkout member-4/frontend-ui
```

### Step 4: Install dependencies

```bash
npm install
```

### Step 5: Start the development server

```bash
npm run dev
```

Open the local URL displayed in your terminal, usually:

```text
http://localhost:5173
```

---

## 🎨 UI Theme

IntentLock uses a Teal + Warm White visual theme to communicate trust, simplicity, and financial security.

| Color | Hex Code | Purpose |
|---|---|---|
| Primary Teal | `#0D9488` | Branding and primary actions |
| Hover Teal | `#0F766E` | Button hover states |
| Amber | `#F59E0B` | Warnings and pending states |
| Warm White | `#F7F5F0` | Main background |
| Primary Text | `#1C1917` | Headings and text |
| Secondary Text | `#78716C` | Supporting text |

---

## 🔒 Current Development Status

The frontend interface includes:

- Dashboard.
- AI Shopping interface.
- Product comparison interface.
- Security center interface.
- Secure checkout interface.
- Transaction history.
- User settings.
- Light and dark themes.

**Development note:** The current frontend is a demonstration interface. Sample products, transaction records, and simulated security scan results are not live backend results. AI, database, real security verification, and PayPal payment functionality require their respective integrations.

---

## 👨‍💻 Team Contributions

The project is being developed collaboratively.

### Member 4 – Frontend Development & UI/UX
- React application structure.
- Responsive user interface.
- Dashboard design.
- AI shopping interface.
- Product comparison interface.
- Security and checkout interfaces.
- Transaction history and settings.
- Teal + Warm White theme implementation.

---

## 📌 Future Enhancements

- Connect the frontend to the backend APIs.
- Integrate LLM-powered product discovery.
- Implement real product and merchant verification.
- Develop the payment security engine.
- Integrate PayPal Sandbox.
- Store transaction and user data in MongoDB.
- Implement real-time security decisions.

---

## 📄 License

This project is developed for educational and hackathon purposes.
