# Quick Start Guide

## TL;DR - Get Running in 3 Steps

### 1. Install Node.js
Download and install from: https://nodejs.org/
(Choose the LTS version)

### 2. Open Terminal and Install Dependencies
```bash
cd path/to/filmforge-ai
npm install
```

### 3. Run the App
```bash
npm run dev
```

Then open: **http://localhost:3000**

---

## That's it! 🎉

The app should now be running on your laptop.

### Common Issues:

**"npm command not found"**
- Install Node.js from https://nodejs.org/

**Port 3000 in use**
- Run: `npm run dev -- -p 3001`

**Module errors**
- Delete `node_modules` folder
- Run: `npm install` again

For detailed instructions, see `SETUP_INSTRUCTIONS.md`
