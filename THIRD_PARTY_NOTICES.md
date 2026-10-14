# Third party provenance

The skill adapter, child profiles, capability checks, review workflow, background research adapter, worktree lifecycle, and tests are original project code. No upstream
skill instructions or code from the audited integration packages are bundled.
Review preparation reads the original installed skill at runtime to capture its
smell baseline in local review evidence; it does not ship a copied baseline.
`upstream.lock.json` includes upstream skill names and descriptions, invocation
flags, and hashes. The upstream license is retained below for that metadata.

The design is informed by these MIT-licensed projects. Pi, pi-subagents, and pi-web-access are runtime dependencies; other integrations remain design
references. No implementation code from these projects is copied into this package:

| Project | Inspected revision | Design reference |
| --- | --- | --- |
| [Matt Pocock skills](https://github.com/mattpocock/skills) | `49dd158d1076134a641b33efb035946536778336` | Skill contracts and invocation policy |
| [Pi](https://github.com/earendil-works/pi) | Installed release `1.0.3` | Native extension API and nested tool execution |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | Release `0.78.0` | Child-agent runtime and public launch-contract API |
| [pi-web-access](https://github.com/nicobailon/pi-web-access) | Release `0.40.0` | Child-only web tools; runtime dependency, no copied implementation |
| [pi-matt-subagent](https://github.com/hu3rror/pi-matt-subagent) | Release `0.11.0` | Independent review roles and background completion |
| [pi-matt-implement-flow](https://github.com/toomanyopenfiles/pi-matt-implement-flow) | Release `0.4.0` | Child skill selection and review bundles |
| [FradSer Pi packages](https://github.com/FradSer/pi-packages) | `pi-matt-pocock` release `0.2.2` | Upstream inventory and verification discipline |
| [Pi Matt skill router](https://github.com/zhangnan/pi-matt-skill-router) | npm release `0.2.3` | Missing-skill diagnostics |

The worktree lifecycle uses Git directly to preserve branches through integration.
It does not copy the runtime's temporary worktree allocator or cleanup implementation.

Before copying third-party code, add its source path, exact revision, retained
copyright and license text, and local modifications here. Dependencies retain
their own licenses in their distributions and the lockfile records versions.

## Matt Pocock skill metadata

Source: `mattpocock/skills` at `49dd158d1076134a641b33efb035946536778336`.
Only metadata and content hashes are retained in `upstream.lock.json`.

MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
