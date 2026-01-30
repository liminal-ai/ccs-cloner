# Changelog

All notable changes to ccs-cloner will be documented in this file.

## [0.3.5] - 2026-01-30

### Fixed
- `--strip-tools` no longer consumes the next flag as its value
- `--strip-tools` and `--strip-tools=default` now both use the configured default preset

### Changed
- Clarified in docs that `--strip-tools` uses the configured default preset (initially `default`, configurable via `defaultPreset`)

## [0.3.4] - 2026-01-29

### Changed
- Replaced @types/bun with minimal custom bun-test.d.ts declarations
- Added @types/node for Node.js type definitions

### Security
- Removed @types/bun which contributed 66 low-severity vulnerability warnings

## [0.3.3] - 2026-01-29

### Changed
- Replaced eslint + prettier with biome for linting and formatting
- Upgraded c12 from 2.x to 3.3.3 to fix tar security vulnerabilities (3 high severity)

### Security
- Fixed 3 high severity vulnerabilities in tar via c12 dependency chain

## [0.3.2] - 2026-01-29

### Added
- `--dsp` flag to include `--dangerously-skip-permissions` in resume command
- Tip in help about configuring Claude Code to show session ID in status line

### Changed
- Disabled active branch extraction (was causing issues with cross-file parent references)
- Updated help and quickstart documentation

### Fixed
- Active branch extraction incorrectly discarding valid session entries

## [0.3.1] - 2026-01-29

### Fixed
- Handle boolean `true` from citty when `--strip-tools` is used without a value

## [0.3.0] - 2026-01-29

### Changed
- **Breaking:** Replaced percentage-based tool removal with preset system
- New presets: `default`, `aggressive`, `extreme`
- Tool removal now targets "turns with tools" instead of percentage of all turns
- This fixes degradation issue where repeated clones became less effective

### Added
- Custom presets via config file
- Preset validation at config load time
- Multi-clone degradation test

### Removed
- `--strip-tools=<percentage>` syntax (use preset names instead)
- `defaultToolRemovalPercentage` config option (use `defaultPreset` instead)

## [0.2.1] - 2026-01-28

### Fixed
- Use node shebang instead of bun for broader npm compatibility

## [0.2.0] - 2026-01-28

### Added
- Initial public release
- Clone Claude Code sessions with tool/thinking removal
- Percentage-based tool removal with `--strip-tools`
- `--truncate-remaining` option
- Session listing and info commands
- JSON output for programmatic use
- SDK exports for programmatic usage
- Comprehensive test coverage
- CI/CD with automatic npm publishing on tags
