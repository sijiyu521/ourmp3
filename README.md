# freemp3

A media player for playing MP3 files. Audio backends, music sources, decoders,
effects, commands and UI integrations are designed to be replaceable plugins.

## Plugin architecture

The stable boundary is defined by [plugin_api.h](plugin_api.h). Every plugin
exports `ourmp3_plugin_get_descriptor`, declares a unique ID and implements
`init`/`shutdown`. Plugins can be statically registered or loaded from a shared
library at runtime through [plugin_manager.h](plugin_manager.h).

The host exposes three deliberately small primitives:

- **Services**: named interfaces for reusable capabilities such as playback,
  metadata, storage or output.
- **Events**: decoupled notifications such as `player.track_changed` and
  `player.state_changed`.
- **Plugin kinds**: source, decoder, output, effect, UI and command plugins.

This keeps the core independent of any particular streaming provider or audio
backend. A plugin must be compiled against the same `OURMP3_PLUGIN_API_VERSION`
as the host. The example in [examples/echo_plugin.c](examples/echo_plugin.c)
shows the minimum dynamic plugin.

## Building

The manager is C99-compatible. On POSIX systems link `plugin_manager.c` with
`-ldl`; on Windows it uses `LoadLibraryA` and requires no extra library.
