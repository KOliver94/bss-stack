# Maintainers

## Releases

Releases are built by [`.github/workflows/release.yml`](./.github/workflows/release.yml).
Every run pushes a Docker image to `ghcr.io/kir-dev/bss-stack` and then
creates a GitHub release with generated notes. The image is pushed first, so a
release never exists without its image.

### Stable releases

Bump `version` in `package.json` on `main`, then tag that commit:

```bash
git tag v0.2.0
git push origin v0.2.0
```

- The tag must be semver (`vX.Y.Z`, or `vX.Y.Z-rc.1` for a pre-release) and
  point at a commit on `main`, otherwise the run fails.
- A tag that doesn't match `package.json` still releases, with a warning.
- Release notes cover everything since the previous stable tag.

### Snapshot releases

Every push or merge to `main` without a tag produces a snapshot versioned as
the `package.json` version plus the UTC date and time, e.g.
`0.1.0-20261025134500`. It is published as a GitHub pre-release and the
workflow creates the matching `v0.1.0-20261025134500` tag.

If a commit and its semver tag are pushed together, only the stable release is
built.

### Image tags

| Release              | Tags                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `vX.Y.Z`             | `X.Y.Z`, `X.Y`, `X` (not while `X` is 0), `latest`, `sha-<short sha>` |
| `vX.Y.Z-rc.1`        | `X.Y.Z-rc.1`, `sha-<short sha>`                                       |
| Snapshot from `main` | `X.Y.Z-<yyyymmddHHMMSS>`, `edge`, `sha-<short sha>`                   |

```bash
docker pull ghcr.io/kir-dev/bss-stack:latest   # newest stable
docker pull ghcr.io/kir-dev/bss-stack:edge     # newest main
```

Only `linux/amd64` is built.
