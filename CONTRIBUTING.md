# Contributing to SentinelEdge

Thank you for your interest in contributing to SentinelEdge! We welcome contributions from the community.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Issues

- Check if the issue already exists in the issue tracker.
- Use a clear and descriptive title.
- Include steps to reproduce, expected behavior, and actual behavior.
- Attach screenshots or logs when relevant.

### Suggesting Enhancements

- Open an issue describing the enhancement and its use case.
- Explain why it would benefit most users.
- Keep scope focused and backwards-compatible where possible.

### Pull Requests

1. Fork the repository and create a new branch from `master`.
2. Make your changes in a focused commit.
3. Follow the code style and conventions below.
4. Add or update tests for any changed functionality.
5. Run the test suite and ensure all tests pass.
6. Open a pull request against `master` with a clear description.

## Code Style

- TypeScript with `strict: true`.
- Absolute import aliases (`@/*`).
- No comments in source code unless explicitly required.
- Conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `ci:`).
- Dark-mode palette: `#090D16` background, `#00F0FF` cyan, `#10B981` emerald. No purple.
- Native WHATWG Web Streams only — no external stream libraries.

## Testing

```bash
npm test
```

All 30 unit tests must pass before a pull request is merged.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
