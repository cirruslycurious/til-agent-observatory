# Frontend Quick Start Guide

## Running the Frontend Locally

### Step 1: Start the Development Server

```bash
cd packages/frontend
npm run dev
```

The frontend will start on **http://localhost:3000**

### Step 2: View in Browser

Open your browser and navigate to:
```
http://localhost:3000
```

You should see:
- **Landing Page** with "TIL — Agent Workflow Observatory" heading
- **Conference dropdown** (Black Hat USA, AWS re:Invent, KubeCon)
- **Topic dropdown** (GenAI, Cybersecurity, Containers, etc.)
- **"Run Instrumented Workflow" button** (disabled until both fields are selected)

### Step 3: Testing the Form

1. **Select a conference** from the dropdown
2. **Select a topic** from the dropdown
3. **Click "Run Instrumented Workflow"**

**Note:** The form will try to submit to `POST /api/v1/jobs` at `http://localhost:3001`

### API Server (Optional)

If you want to test the full flow, you'll need the API server running:

```bash
# In a separate terminal
cd packages/api
npm run dev
```

The API should run on **http://localhost:3001**

### Testing Without API

If the API isn't running, you'll see an error message when you submit the form. This is expected behavior - the frontend is working correctly, it just can't reach the backend.

### What You'll See

**Landing Page Features:**
- ✅ Dark theme (obsidian background)
- ✅ Instrumentation harness messaging
- ✅ "Non-goals" section
- ✅ Form validation (button disabled until both fields selected)
- ✅ Mobile-responsive design (try resizing your browser)
- ✅ Error handling (if API is unavailable)

**Mobile View:**
- Sticky bottom button with "Run" label
- Safe area padding for iOS devices

**Desktop View:**
- Full-width button with "Run Instrumented Workflow" label
- Tooltip on hover

### Troubleshooting

**Port 3000 already in use?**
```bash
# Kill the process using port 3000
lsof -ti:3000 | xargs kill -9
```

**Module not found errors?**
```bash
cd packages/frontend
npm install
```

**Build errors?**
```bash
cd packages/frontend
npm run build
```

### Development Commands

```bash
# Start dev server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Next Steps

Once you can see the landing page:
1. Try selecting different conference/topic combinations
2. Test form validation (try submitting with only one field)
3. Test error handling (submit when API is down)
4. Check mobile responsiveness (resize browser or use dev tools)
