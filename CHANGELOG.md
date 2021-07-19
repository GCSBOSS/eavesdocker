# Eavesdocker Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.1.7] - 2021-07-19

### Fixed
- container list endpoint ignoring swarm siblings

## [v0.1.6] - 2021-07-19

### Added
- GUI: Escape key binding to list search field

### Fixed
- wrong redis key being used for swarm mode
- container data not clean on redis store in swarm mode

## [v0.1.5] - 2021-07-19

### Added
- GUI: list search feature
- GUI: camel-case handling on log entry keys

### Fixed
- GUI: reversed service focus list settings

## [v0.1.4] - 2021-07-17

### Added
- GUI: setting to hide specific fields on all log entries in a list

### Fixed
- GUI: bad spacing on no container message
- GUI: bug trying to parse JSON when something starts with curly-braces
- GUI: listener leak when deleting lists

## [v0.1.3] - 2021-07-14

### Added
- endpoint to list all active containers
- SSE endpoint to check container events and log entries in real-time
- logic to handle swarm events via redis pubsub and cache
- monitoring UI

## [v0.1.2] - 2021-04-01

### Added
- transform to ensure log entry has a date time key

### Fixed
- logs demultiplexing bug handling buffers

## [v0.1.1] - 2021-03-30

### Fixed
- api logs stream demultiplexing mishandling frame headers
- message trailing new line being preserved for non-json log entry

## [v0.1.0] - 2021-03-29

### Added
- transform pipeline feature
- throttling to mongodb transport through buffering
- redis pub transport

### Fixed
- eavesdocker adding it's own container to prevent feedback
- crash when adding container with logging driver set to 'none'

### Changed
- container identification on stdout logs to be more informative

## [v0.0.1] - 2020-08-20
- First officially published version.

[v0.0.1]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.0.1
[v0.1.0]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.1.0
[v0.1.1]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.1.1
[v0.1.2]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.1.2
[v0.1.3]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.1.3
[v0.1.4]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.1.4
[v0.1.5]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.1.5
[v0.1.6]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.1.6
[v0.1.7]: https://gitlab.com/GCSBOSS/eavesdocker/-/tags/v0.1.7
