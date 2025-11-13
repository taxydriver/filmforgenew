# FilmForge AI

Transform your ideas into cinematic stories with AI-powered tools.

## Features

- **Idea Generation**: Start with a simple concept or logline
- **Concept Development**: AI generates a detailed film concept with characters, themes, and structure
- **Screenplay Writing**: Create a full screenplay with proper formatting
- **Trailer Creation**: Generate trailer concepts and storyboards
- **AI Refinement Chat**: Iteratively improve your concept and screenplay through natural conversation

## Getting Started

First, install the dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS v4** - Modern utility-first CSS
- **Shadcn UI** - High-quality React components
- **Lucide React** - Beautiful icon library

## Project Structure

```
├── app/
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Home page with main workflow
├── components/
│   ├── ChatBox.tsx      # AI chat interface
│   ├── IdeaStep.tsx     # Idea input step
│   ├── ConceptStep.tsx  # Concept generation step
│   ├── ScreenplayStep.tsx # Screenplay generation step
│   ├── TrailerStep.tsx  # Trailer generation step
│   ├── WorkflowSteps.tsx # Progress stepper
│   └── ui/              # Shadcn UI components
└── styles/
    └── globals.css      # Global styles and Tailwind config
```

## Features in Detail

### Multi-Step Workflow

The app guides users through a structured workflow:
1. **Idea** - Input your film concept
2. **Concept** - AI generates detailed concept document
3. **Screenplay** - AI creates formatted screenplay
4. **Trailer** - Generate trailer concept and storyboard

### AI Refinement Chat

Both Concept and Screenplay steps include a chat interface where you can:
- Request changes ("Make it more dramatic")
- Add elements ("Add more dialogue")
- Refine specific aspects ("Enhance the visual descriptions")
- Make it concise ("Make it shorter")

### Next Steps

To connect to real AI APIs:
1. Set up a backend with API routes or use Supabase Edge Functions
2. Connect to OpenAI, Anthropic, or similar AI services
3. Replace the mock generation functions with real API calls

## License

MIT
