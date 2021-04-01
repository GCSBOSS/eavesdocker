# Eavesdocker Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
