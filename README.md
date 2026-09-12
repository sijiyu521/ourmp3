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

## WinUI 3 desktop client

The [`OurMp3.WinUI`](OurMp3.WinUI) project provides a Windows App SDK desktop
client for the player. It currently supports:

- selecting multiple MP3/WAV files with the native Windows file picker;
- maintaining a local playlist and switching tracks;
- importing by drag-and-drop, skipping duplicate files, and automatically
  advancing to the next track;
- play, pause, stop, and volume controls through `MediaPlayerElement`;
- toggling play/pause with the Space key;
- visible status and error feedback without interrupting the player window.

Open [`OurMp3.WinUI/OurMp3.WinUI.csproj`](OurMp3.WinUI/OurMp3.WinUI.csproj) in
Visual Studio 2022 with the Windows App SDK installed, or build it from the
repository root:

```powershell
dotnet build OurMp3.WinUI\OurMp3.WinUI.csproj -p:Platform=x64
```

The client uses Windows' media playback pipeline for this first UI slice. The
existing C plugin manager remains independent and can be connected to playback
and decoder plugins through a future native bridge.
