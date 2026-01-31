# Project Vision

## What is this?

GroupMixer is a web application for distributing people into groups based on constraints and preferences. It has a Rust backend (solver-core, solver-server, solver-wasm) and TypeScript frontend (webapp).

## Goals

### Primary: 100% AI-Testable Application

Make the entire application end-to-end testable by AI agents without human intervention. AI should be able to:

1. **Visual Testing**
   - Render every screen/route of the app
   - Render all modals and overlays
   - Test on all screen sizes (mobile, tablet, desktop)
   - Take screenshots and visually verify layout/styling
   - Detect visual regressions automatically

2. **Functional Testing**
   - Test all user interactions (clicks, inputs, drag-drop)
   - Verify all API endpoints work correctly
   - Test error states and edge cases
   - Validate data flow end-to-end

3. **Full Stack Coverage**
   - Frontend: All UI components, routing, state management
   - Backend: All API endpoints, business logic, solver algorithms
   - Integration: Frontend ↔ Backend communication

### Secondary Goals
- Self-documenting test coverage
- Reproducible test environments
- Fast feedback loops for AI debugging

## Current State

- Rust backend with solver-core, solver-server, solver-wasm
- TypeScript webapp frontend
- Existing CLAUDE.md for coding conventions
- No comprehensive AI-friendly testing infrastructure yet

## Roadmap

### Near-term (Next Features)
- Research existing AI E2E testing approaches for similar stacks
- Set up screenshot-based visual regression testing
- Create programmatic access to all UI states
- Implement API contract testing

### Long-term
- Full autonomous debugging by AI agents
- AI can identify, diagnose, and fix issues without human help
- Continuous AI-driven quality assurance

## Technical Constraints

- Stack: Rust backend, TypeScript/JS frontend
- Must work in CI/CD pipelines
- Should support headless browser automation
- Must be deterministic and reproducible

## Research Areas

- Playwright/Puppeteer for browser automation
- Visual regression testing tools (Percy, Chromatic, etc.)
- Storybook for component isolation
- API testing frameworks (for Rust backend)
- AI-specific testing patterns used in similar projects
- How other Rust+TS webapps achieve full test coverage

## Feature Guidelines

- Features should enable AI agents to test autonomously
- Prefer programmatic interfaces over manual testing
- All UI states should be reachable via URL or API
- Tests should be self-verifying with clear pass/fail criteria

## Not Now

- Performance optimization (focus on testability first)
- New user-facing features (infrastructure first)
