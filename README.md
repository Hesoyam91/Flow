# Flow

**Interactive diagrams, moodboards and rich notes in one desktop app.**

Build a diagram, attach as much writing as you want to any element, and open it again with a right-click. Flow is made for the moment when a box on a diagram is not enough: your nodes can hold a full description, task lists, links to other nodes and images, without leaving the canvas.

🌐 English · [Español](README.es.md)

<p align="center">
  <img src="docs/screenshot-light.png" alt="Flow in the light theme" width="49%">
  <img src="docs/screenshot-night.png" alt="Flow in the night theme" width="49%">
</p>

## Features

- **Interactive diagrams.** Each card has its own title and short description, edited right on the canvas (double-click). Right-click any element to open an independent, post-style *expanded note* with its own title, cover image, headings, lists, task lists, quotes, links and images, so the card stays tidy while the detail lives one click away. Elements show a badge when they have an expanded note (and task progress like `☑ 2/5`).
- **Infinite canvas** with boxes, rounded/pill/ellipse/diamond/hexagon shapes, free text, sticky notes, images and **sections** (titled containers with their own rich text that move their contents together).
- **Scrum boards like Trello.** To Do, In Progress and Done columns: drag cards between them, reorder them, add new ones and let them grow with their text. Any sticky note can be dropped into a column, and any card dragged out.
- **Templates** for a Scrum board, flowchart, mind map, timeline and moodboard.
- **Connectors** that are straight, elbow or curved, with no arrowhead, one or both ends, solid or dashed, and editable labels.
- **Freehand drawing** with pen colors and thickness, plus an eraser. Strokes are regular elements: move, resize, undo.
- **Moodboards.** Paste images from the clipboard or add them from disk (they are compressed automatically).
- **Multiple boards** in tabs, saved together in a single `.flow` file.
- **Productivity.** Undo/redo, copy/paste/duplicate, multi-select, align and distribute, search (`Ctrl+F`) across titles and notes, filter by color, links between elements.
- **Export** the whole board to PNG, SVG or PDF.
- **Two themes**: a soft *light* theme and a starry *night*, both in the logo's colors.
- **Preferences** to hide the minimap, zoom controls, instructions, background dots or stars, snap to grid, and more.
- **Asks before exiting** when you have changes not saved to a file.
- **English and Spanish** interface (follows your system language; change it in Preferences).
- **Local and private.** Everything is stored on your machine. No accounts, no network.

## Download

Grab the Windows installer from the [Releases](../../releases) page, or build it yourself (below).
Examples to try: open [`examples/demo.flow`](examples/demo.flow) with **Open**.

## Run from source

Requires [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev      # development with hot reload
npm start        # build and run the production bundle
```

## Build the installer

```bash
npm run dist     # creates release/Flow-Setup-<version>.exe (Windows, NSIS)
```

The installer is not code-signed, so Windows SmartScreen may warn on first run. Building for macOS or Linux requires running `electron-builder` on that operating system.

## Keyboard and mouse

| Action | How |
| --- | --- |
| Open an element's expanded note | Right-click |
| Rename in place | Double-click |
| Select several | Drag on the canvas, or `Shift`+click |
| Pan | `Space` + drag, or middle mouse button |
| Zoom | Mouse wheel |
| Undo / Redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Copy / Cut / Paste / Duplicate | `Ctrl/Cmd+C` / `X` / `V` / `D` |
| Select all | `Ctrl/Cmd+A` |
| Search | `Ctrl/Cmd+F` |
| Save | `Ctrl/Cmd+S` |

## Tests

```bash
npm test            # unit tests (document sanitizing, IPC guards, utilities, layout)
npm run test:e2e    # builds, then drives the real app: security, UI flows, export
```

The end-to-end suite starts the actual Electron app and checks, among other things, that the Content Security Policy blocks inline scripts and network access, that the main process rejects invalid requests, and that a hostile `.flow` file cannot run code or reach the internet.

## Diagnostics

If the app ever crashes, it writes a local log (never sent anywhere) to `%APPDATA%/flow/logs/flow.log` on Windows, and native crash dumps to the `Crashpad` folder next to it. Please attach them when reporting a problem.

## Security notes

Flow treats `.flow` files as untrusted input. Files are sanitized on load (unknown element types, remote images, invalid colors and dangling links are dropped, sizes are capped). The renderer is sandboxed and context-isolated, runs under a strict CSP, and can only write to files chosen in a system dialog.

## Tech stack

[Electron](https://www.electronjs.org) · [React](https://react.dev) · [Vite](https://vite.dev) · [React Flow (@xyflow/react)](https://reactflow.dev) for the canvas · [TipTap](https://tiptap.dev) for rich text · [i18next](https://www.i18next.com) · [perfect-freehand](https://github.com/steveruizok/perfect-freehand) · [html-to-image](https://github.com/bubkoo/html-to-image) and [jsPDF](https://github.com/parallax/jsPDF) for export · [Vitest](https://vitest.dev).

Thanks to the React Flow team at [xyflow](https://xyflow.com): the library is MIT-licensed and powers the canvas here. If it is useful to you, consider [supporting them](https://reactflow.dev/pro).

## Project layout

```
electron/   main process, preload and IPC guards
src/        React app (canvas, nodes, edges, editor, i18n)
tests/      unit tests and end-to-end suite
scripts/    logo and icon generator
examples/   demo.flow
docs/       screenshots
```

## License

[MIT](LICENSE)
