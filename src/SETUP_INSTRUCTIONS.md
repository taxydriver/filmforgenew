# Setup Instructions for Running FilmForge AI Locally

Follow these steps to run the FilmForge AI application on your laptop.

## Prerequisites

Make sure you have the following installed on your laptop:
- **Node.js** (version 18 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js) or **yarn** or **pnpm**

To check if you have Node.js installed:
```bash
node --version
npm --version
```

## Step 1: Download the Project

1. Download all the project files from Figma Make
2. Create a new folder on your laptop (e.g., `filmforge-ai`)
3. Copy all files into this folder, maintaining the folder structure

## Step 2: Update WorkflowSteps.tsx Import

Open `/components/WorkflowSteps.tsx` and change the import on line 2 from:
```typescript
import { Step, ProjectData } from '../App';
```

to:
```typescript
import { Step, ProjectData } from '../app/page';
```

## Step 3: Install Dependencies

Open your terminal/command prompt, navigate to the project folder, and run:

```bash
cd filmforge-ai
npm install
```

Or if you prefer yarn:
```bash
yarn install
```

Or if you prefer pnpm:
```bash
pnpm install
```

This will install all necessary packages including:
- Next.js
- React
- TypeScript
- Tailwind CSS
- Lucide React (icons)
- Shadcn UI components

## Step 4: Run the Development Server

After installation is complete, start the development server:

```bash
npm run dev
```

Or with yarn:
```bash
yarn dev
```

Or with pnpm:
```bash
pnpm dev
```

## Step 5: Open in Browser

Once the server starts, you'll see output like:
```
- Local:        http://localhost:3000
```

Open your web browser and go to:
```
http://localhost:3000
```

You should now see the FilmForge AI application running!

## Troubleshooting

### Error: "Module not found"

If you get module not found errors:
1. Make sure all files are in the correct folders
2. Delete `node_modules` folder and `package-lock.json`
3. Run `npm install` again

### Port 3000 Already in Use

If port 3000 is already being used:
```bash
npm run dev -- -p 3001
```
This will run on port 3001 instead.

### Tailwind CSS Not Working

If styles aren't loading:
1. Make sure `styles/globals.css` exists
2. Check that it's imported in `app/layout.tsx`
3. Restart the development server

## Building for Production

To create a production build:

```bash
npm run build
npm start
```

This will create an optimized production build and start the production server.

## Project Structure

```
filmforge-ai/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── ChatBox.tsx
│   ├── ConceptStep.tsx
│   ├── IdeaStep.tsx
│   ├── ScreenplayStep.tsx
│   ├── TrailerStep.tsx
│   ├── WorkflowSteps.tsx
│   └── ui/               # Shadcn UI components
├── styles/
│   └── globals.css       # Global styles
├── package.json          # Dependencies
├── tsconfig.json        # TypeScript config
└── next.config.js       # Next.js config
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Need Help?

- Next.js Documentation: https://nextjs.org/docs
- React Documentation: https://react.dev
- Tailwind CSS: https://tailwindcss.com/docs

## Optional: Deploy to Vercel

To deploy your app online for free:

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Sign up with GitHub
4. Import your repository
5. Click Deploy

Vercel will automatically detect it's a Next.js app and deploy it!
