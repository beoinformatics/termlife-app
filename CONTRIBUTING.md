# Contributing to TermLife

Thanks for your interest in contributing! TermLife is a hobby project and community contributions of all kinds are welcome — whether it's bug reports, feature ideas, code, or documentation.

## Getting Started

1. Fork the repo and clone your fork
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`
4. Make your changes
5. Run tests: `npm test`
6. Run type checking: `npm run typecheck`
7. Open a pull request

## Ways to Contribute

- **Bug reports** — Open an issue describing what happened and how to reproduce it
- **Feature ideas** — Open an issue to discuss before starting work on big changes
- **Code** — Bug fixes, new features, performance improvements
- **Documentation** — README improvements, code comments, examples
- **Visual effects** — New shaders, animations, or rendering experiments are especially welcome

## Guidelines

- Keep pull requests focused — one feature or fix per PR
- Add tests for new functionality (we use Vitest)
- Make sure `npm test` and `npm run typecheck` pass before submitting
- No need to be an expert — if you're learning, that's great too

## Development Notes

- The renderer is entirely PixiJS — no DOM manipulation
- Terminal state is managed by @xterm/headless
- PTY communication happens over Electron IPC
- See the Architecture section in the README for the data flow

## Code of Conduct

Be kind and respectful. We're all here to learn and build something fun.

## Questions?

Open an issue — there are no silly questions.
