# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TimerBot is an Astro-based countdown timer web application with multi-tab synchronization capabilities. The timer defaults to 10 minutes and persists state across browser sessions and tabs using localStorage and BroadcastChannel APIs.

## Commands

Development and deployment commands (run from project root):

- `npm install` - Install dependencies
- `npm run dev` - Start development server at localhost:4321
- `npm run build` - Build production site to ./dist/
- `npm run preview` - Preview build locally
- `npx wrangler deploy` - Deploy to Cloudflare Pages

## Architecture

### Core Components

- **src/pages/index.astro** - Main page displaying Dashboard component
- **src/pages/timer.astro** - Alternative timer page with Timer component
- **src/components/Dashboard.astro** - Full timer interface with controls
- **src/components/Timer.astro** - Display-only timer component
- **src/scripts/timer.js** - Timer class with state management and multi-tab sync

### Key Features

The Timer class in `src/scripts/timer.js` implements:
- Cross-tab synchronization using BroadcastChannel API
- State persistence with localStorage
- Start/pause/reset functionality
- Automatic state restoration on page load

### Deployment

Configured for Cloudflare Pages deployment via wrangler.jsonc with static assets served from `./dist` directory.

### Development Configuration

- Uses Astro with path aliases (`@/` maps to `src/`)
- Google Fonts integration (Inter font family)
- Development server allows `dev.local` host
- Spanish language labels ("minutos", "segundos")