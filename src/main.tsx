import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Slot } from "./core/types";
import type { Mp3Plugin } from "./core/types";
import { PluginManager } from "./core/plugin-manager";
import { FileSourcePlugin } from "./plugins/file-source";
import { TransportPlugin } from "./plugins/transport";
import { PlaylistPlugin } from "./plugins/playlist";
import { NowPlayingPlugin } from "./plugins/now-playing";
import { VolumePlugin } from "./plugins/volume";
import { EqualizerPlugin } from "./plugins/equalizer";
import { SpectrumPlugin } from "./plugins/spectrum";
import "./style.css";

// ── 插件清单 ── 一切功能皆在此注册
const ALL_PLUGINS: Mp3Plugin[] = [
  new FileSourcePlugin(),
  new TransportPlugin(),
  new PlaylistPlugin(),
  new NowPlayingPlugin(),
  new VolumePlugin(),
  new EqualizerPlugin(),
  new SpectrumPlugin(),
];

function App() {
  const containerRefs = useRef<Map<Slot, HTMLDivElement>>(new Map());
  const managerRef = useRef<PluginManager | null>(null);
  const [initDone, setInitDone] = useState(false);

  const refFor = (slot: Slot) => (el: HTMLDivElement | null) => {
    if (!el) return;
    containerRefs.current.set(slot, el);
  };

  useEffect(() => {
    if (initDone) return;
    const refs = containerRefs.current;
    const slotValues = Object.values(Slot);
    if (slotValues.some((s) => !refs.has(s))) return;

    const root = document.getElementById("root")!;
    const manager = new PluginManager(root);

    for (const slot of slotValues) {
      const el = refs.get(slot);
      if (el) manager.setSlotElement(slot, el);
    }

    for (const plugin of ALL_PLUGINS) {
      manager.register(plugin);
    }

    void manager.initAll().then(() => {
      for (const slot of slotValues) {
        manager.renderSlot(slot);
      }
      managerRef.current = manager;
      setInitDone(true);
    });

    return () => {
      manager.destroyAll();
    };
  }, [initDone]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🎵</span>
          <span className="brand-text">OurMP3</span>
          <span className="brand-tagline">一切皆插件</span>
        </div>
        <div ref={refFor(Slot.Playlist)} className="slot" data-slot="playlist" />
      </aside>

      <main className="main">
        <header className="topbar">
          <div ref={refFor(Slot.Toolbar)} className="slot slot-row" data-slot="toolbar" />
        </header>

        <section className="center">
          <div ref={refFor(Slot.NowPlaying)} className="slot" data-slot="now-playing" />
        </section>

        <div ref={refFor(Slot.Visualizer)} className="slot" data-slot="visualizer" />

        <footer className="bottombar">
          <div ref={refFor(Slot.Transport)} className="slot slot-transport" data-slot="transport" />
          <div className="bottom-row">
            <div ref={refFor(Slot.Mixer)} className="slot slot-row slot-mixer" data-slot="mixer" />
          </div>
        </footer>
      </main>
    </div>
  );
}

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(<App />);