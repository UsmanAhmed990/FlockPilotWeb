# FlockPilot - Chicken Marketplace 

A production-level MERN stack food delivery application connecting customers.

## Features


- 🥗 Seller Buyer Teams
- 🛒 Shopping cart with real-time updates
- 👨‍🍳 Seller dashboard for menu management
- 🔐 Session-based authentication
- 📱 Fully responsive design
- 🎨 Modern UI with Tailwind CSS

## Tech Stack

**Frontend:** React, Redux Toolkit, React Router, Tailwind CSS, Axios  
**Backend:** Node.js, Express, MongoDB, Mongoose  
**Auth:** Session-based (express-session + connect-mongo)

## Quick Start

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Default Credentials

The application supports three user roles:
- **Customer** - Browse and order food
- **Seller** - Manage menu and orders
- **Admin** - Platform management

Register via `/signup` and select your role.

## Environment Variables

Create `backend/.env`:
```
PORT=5020
MONGO_URI=mongodb://localhost:27017/FlockPilot
SESSION_SECRET=your_secret_key
```

## API Documentation

See [walkthrough.md](walkthrough.md) for complete API documentation.

## Project Structure

```
├── backend/          # Express API server
│   ├── models/       # Mongoose schemas
│   ├── controllers/  # Route handlers
│   ├── routes/       # API routes
│   └── middleware/   # Auth & validation
└── frontend/         # React application
    ├── src/
    │   ├── components/  # Reusable components
    │   ├── features/    # Redux slices
    │   └── pages/       # Route pages
```

## License

MIT

---

Built with ❤️ Chciken Marketplace
