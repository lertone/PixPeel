# Changelog

## 1.3.0

A real super-resolution model for small elements, stricter vector export, and editable vector shapes on the Board.

- **Offline Real-ESRGAN HD repair.** The installer bundles Real-ESRGAN general x4v3 (SRVGGNetCompact, 1.21M parameters, 4.8 MB, BSD-3-Clause) and ONNX Runtime Web. The Library’s “✦ HD” button now runs the model on the GPU through WebGPU (about 0.55 s per 128 px tile, first load about 1.4 s), with a WASM fallback when WebGPU is unavailable. Everything stays local. Automatic HD during save keeps the fast classical path, and Settings → Tools adds a switch to disable the model. Measured on a 96×64 sticker: text and circle edges stay sharp, while the classical / bilinear results blur.
- **Vector export only opens for simple elements.** A flat-graphics check (dominant colour count, share of semi-transparent edge pixels) now runs before tracing. Logos, text, lines and flat graphics are traced; photos, gradients and complex illustrations stay embedded PNG, and a batch with nothing traceable reports “no simple flat element” instead of producing fragments. Measured: simple logo → 1 vector layer, 24 paths, 4 KB, no `<image>`; gradient photo → refused / fallback.
- **Basic vector shapes on the Board.** Seven editable shapes — rectangle, rounded rectangle, ellipse, line, arrow, triangle and star — can be added, selected, moved, scaled, rotated and exported; fill / hollow / outline colour / outline width / corner radius / star points are adjustable in the properties panel. Shapes are redrawn at export resolution, so they stay sharp, and they survive Board archives.

## 1.2.1

Fixes for the Board and Extract issues reported while testing 1.2.0, plus real SVG vectorisation.

- **Multi-selection / groups now scale and rotate as a whole.** With two or more elements selected, a group box appears with corner resize handles and a top rotation handle; dragging them changes position, size and angle together. The bottom Angle / Size sliders now apply to every selected element too (size by the same ratio, positions scaled around the group centre).
- **Double-click layer rename fixed.** Electron does not support `window.prompt()` — the old call threw immediately. It now uses an in-app input dialog, and works around the list being rebuilt on every click (which made native `dblclick` impossible) by measuring the interval between two clicks. SVG Canvas layer rename is fixed the same way.
- **Extract “Add to current / Subtract / Split off a piece” reworked.** Fixed using the previous tile's coordinates after switching images, which put results in the wrong place; with no explicit selection the operation now targets the element under the loop (topmost); results are forced on so the change is visible; a no-op shows a clear message; the panel shows the current element's name.
- **Distribute H / V** only moves elements, never creates text, and reports “Distributed N elements evenly”.
- **AI negative points are clearer.** Explicit “+ Include point / − Exclude point” buttons replace the hidden Alt-only interaction. Markers are larger, outlined, and drawn immediately (visible even if the model download fails). The legend explains green + keeps and red − removes, with Alt to reverse temporarily.
- **No stray checkbox in the Library.** Checkboxes are hidden by default; a “Select multiple” button in the header enables them, the marquee and the bulk-delete bar, and exiting clears the selection.
- **New “Vector SVG” export.** ImageTracer.js (Unlicense / public domain) is bundled and traces selected simple logos, text, lines and graphics into real `<path>` vectors that stay sharp for UI, posters and upscaling. Overly complex or huge elements fall back to embedded PNG so the file is always complete. Measured on a 300×200 logo + text: 3 vector layers, 70 paths, about 12 KB, no embedded images, renders correctly.

## 1.2.0

A batch that rounds out extraction, layers/effects and batch organisation. The Board gains archives; the Library and SVG Library gain marquee selection and batch delete.

- **Extract: split another piece out of the selected element.** Wand / Lasso / AI pick gain a “Split off a piece” mode: the marked area becomes its own element and the original keeps only the remainder.
- **AI pick supports negative points.** Click to include, Alt-click to exclude. Keep clicking the same object to refine it — AI re-runs with every prompt point. The canvas marks include points with a green + and exclude points with a red −, and the panel shows the counts plus “Clear points”.
- **Add brush.** The preview window gains an add brush (mutually exclusive with the eraser): paint back pixels that were erased by mistake or missed. It edits the mask on the Extract page and the bitmap on the Board, and Ctrl+Z undoes it. Text layers cannot be painted.
- **Soft edge (feather).** Settings → Tools & shortcuts adds a 0–6 px soft edge: the alpha is feathered and semi-transparent edge colours are pulled toward the interior colour, reducing white / dark fringes. Measured on one element: transition pixels 4,291 → 6,770, hard-edge pixels 8,054 → 6,677.
- **Automatic text / line tidying.** The Extract page gains “Tidy text/lines”: long thin pieces are recognised as lines, and small pieces on the same line with similar height and small gaps are merged into text blocks. It only runs when you click it — auto splitting never merges silently.
- **Batch consistency.** After importing several images, “Re-split all” appears and re-runs every image with the current settings, so results do not drift image by image.
- **Layered SVG is labelled honestly.** A layered SVG exported from Extract contains embedded PNG bitmaps per layer, not vector paths, so it still blurs when enlarged. The export toast, button tooltip, SVG Library note and SVG Canvas title now say “embedded bitmap”, and the file itself carries a `<desc>`.
- **Board layer panel.** “Layers” at the top-right opens a real column (the canvas becomes narrower rather than being covered). Each layer can be shown/hidden, locked, or renamed by double-click; the properties area sets opacity and blend mode (normal / multiply / screen / overlay / darken / lighten), and layers can be grouped / ungrouped (clicking any member drags the whole group).
- **Text effects / sticker stroke & shadow.** The same properties area adds stroke (width + colour) and shadow (blur, X/Y offset, colour) to both images and text; exports and “Save to library” include them.
- **Equal spacing.** With three or more elements selected, “Distribute H / V” makes the gaps equal using real ink edges (measured: three elements of different widths ended up with identical gaps).
- **Board archives.** Save the canvas size, background, background image, every layer, text and effects locally, then reopen it later; keep several and delete them. Stored in the user-data folder, so updates keep them.
- **Marquee batch delete in the Library / SVG Library.** Every card has a checkbox in its corner; drag on empty space to marquee-select, Ctrl / Shift-click to add. The header shows the selected count and a trash button, with the same 3-second undo.

## 1.1.2

Follow-up fixes and additions from testing 1.1.1.

- **Fixed: using the eraser made the whole background look erased.** The first stroke used to switch the layer to a “manual mask”, dropping everything the edge post-processing had filled in — so the background appeared to vanish. The visible mask is now materialised before the first stroke, and the eraser only clears under the brush. Measured on a 1459×928 full-image element: one stroke removes about 7,000 pixels, while far-away pixels stay opaque.
- **The eraser no longer breaks up during fast drags.** Intermediate points are interpolated between pointer events, on both the Extract page and the Board preview.
- **Undo inside the preview.** Ctrl+Z (or the ↶ button in the title bar) undoes the previous eraser stroke: the mask on the Extract page, the bitmap on the Board. The button disables itself when there is nothing to undo.
- **New “send to back” button.** A down arrow at the bottom-right of the selection box, the counterpart of the single-selection-only “bring to front” arrow.
- **New text remembers the last style.** Font, size, colour, line height, letter spacing, bold/italic and alignment are reused for the next text. A “Reset style” button in the text panel is the only way back to the defaults. The style is stored locally and survives restarts.
- **Preview and delete from the Board’s material panel.** Hovering a material shows a magnifier and a trash can: the magnifier opens the same preview layout as elements (thumbnail strip + large view, no checkboxes), and the trash deletes with a 3-second undo. The Library page also gained a magnifier.
- **Delete is now a trash icon everywhere**: Extract element list, Board, Library, SVG Library and SVG Canvas — no more guessing the word in the other language.
- **SVG Canvas rotation handle fixed.** The stem now starts at the midpoint of the top edge like the Board, instead of drawing a diagonal line from the top-left corner; the handle follows the top edge when rotated.
- **Resizable, reflowing workspace** (real layout changes, not overlays):
  - Extract: drag the divider between the stage and the element panel; a wider panel fits more columns.
  - Board: drag the left material panel wider; resize material tiles with the − / + buttons in its header or Ctrl+wheel to show more items.
  - Library: Ctrl+wheel or the − / + buttons in the header resize the cards.
  - Navigation: the ‹ button collapses it to a 16px strip with ›, and the main area grows to fill the space.
  - All widths and zoom levels are remembered locally.
- **Shortcuts now have visible controls**: Duplicate (Ctrl+D) on the Board, Hide (Esc) on the Extract page, and zoom − / +, Fit and Undo in the preview.
- The snapping guides, background image, font library and wheel-adjusted sliders from 1.1.1 are unchanged.

## 1.1.1

- **Board: the alignment buttons are gone, replaced by snapping guides.** The old left / centre / right / top / middle / bottom bar has been removed. While dragging, an element within 6 screen pixels of a canvas edge, a canvas centre line, or another element's real ink edge / centre line snaps to it, and orange dashed guides show the alignment. Multi-selections snap as one group.
- **Board: a “bring to front” button on the selection frame.** A small up-arrow appears at the top-right of the dashed box when exactly one element is selected; clicking it moves that element above all others. It is hidden for multi-selection.
- **Board: background eyedropper and background image.** The background row now has an eyedropper (pick a colour anywhere on screen) and a background-image button. The background image is always drawn beneath every element — it is not a layer, cannot be selected or dragged — and can be switched between “cover / contain” or removed. Export and “Save to library” include it.
- **Board: many more fonts, plus your own.** Eight free, open-source (SIL OFL) fonts are bundled: Ma Shan Zheng, ZCOOL KuaiLe, Long Cang, Anton, Bebas Neue, Caveat, Pacifico and Press Start 2P. The “Aa” button opens a font library where you can import local `.ttf / .otf / .woff / .woff2` files or download more free fonts in-app (ZCOOL XiaoWei, Liu Jian Mao Cao, Playfair Display, Orbitron, Monoton, Bungee, via npmmirror). Imported and downloaded fonts are stored in the user-data folder, survive updates, and can be deleted from the library.
- **Board: parameter sliders with wheel adjustment.** Font size, line height, letter spacing, angle and scale now have sliders; hovering a slider or number field and scrolling changes it (Shift for bigger steps), and the canvas does not zoom while you do so.
- **Element preview can zoom and erase.** The preview now supports scroll-to-zoom centred on the pointer, middle-drag to pan and double-click to reset. An eraser button adds a brush-size slider; paint on the preview to remove unwanted parts. On the Extract page this edits the element mask (and persists on export — the layer is marked as manual so hole filling no longer restores it). In the Board preview it edits a bitmap copy inside the board only (library files untouched, and undo works).
- **New “Preview” entry on the Board.** The magnifier in the bottom toolbar opens a board-element preview with the same layout as the Extract page preview, minus the checkboxes. Text layers cannot be erased; image layers can.
- **Fixed: framed screenshots / posters could only ever select the whole image.** Edge background removal was blocked by the outer frame, so everything inside it became one connected element. When the foreground covers nearly the whole image, PixPeel now re-splits using the inner dominant colour as the background. Measured on a 1459×928 poster with its own border: the result went from 1 element to 8, and the “PixPeel” title, subtitle and every icon can be selected individually.
- Font import and download are saved by the main process under `userData/fonts`; downloads are restricted to `registry.npmmirror.com`.

## 1.1.0

- **New on the Board: text.** A “Text” button adds a text layer. Pick from system fonts (Hei / Song / Kai / serif / mono — no font files are bundled) and set size, line height, letter spacing, colour, bold, italic and left/centre/right alignment. Double-click text on the canvas to select it and edit it in the panel. Text is drawn as vectors from its parameters, so it stays sharp when you zoom in and on export (measured: the same text on a 2× canvas has exactly 2× the ink, and the anti-aliasing band is 2 px).
- **New on the Board: alignment.** A bar under the canvas has left / centre / right / top / middle / bottom, plus a “Centre” button that puts the selection in the middle of the canvas. The reference is either the canvas or the selected elements — with the latter, several elements align to each other.
- **Alignment uses the actual pixel edges, not the PNG's transparent box.** Image layers are scanned for the real ink bounds (sampled up to 1024 px and cached); text layers use `measureText`'s tight box; after rotation/scaling the four corners are transformed into world space. Measured: a 200×200 image whose content only occupies 60×40 in the bottom-right corner lands exactly on 0 / 1080 / 0 / 1080 / 540 / 540 for left / right / top / bottom / centre-h / centre-v (0 px error); text ink matches the computed box to 0.41 px.
- **Fixed: importing or capturing repeatedly got slower and slower.** Every new image used to leave the previous batch's canvases and pixel arrays in memory, layers piled up, and the element list was rebuilt from scratch on every click. Re-importing now clears the previous batch first (canvases, pixel data and thumbnail caches are released); the element list only updates checkboxes and names when the set of layers is unchanged, and lasso repaints are coalesced to one per frame.
  - Measured (900×650, 8 elements per image): re-importing one image 104 ms (old: 443 ms); redrawing the element list 20× 3 ms (old: 1057 ms); after five re-imports, 20 redraws 2 ms (old: 2427–7010 ms); JS heap steady at 13 MB (old: 21 MB and rising with every import).
- **Fixed: element numbering continued from the previous batch** after a re-import (the second batch started at “Element 9”). Every re-import / capture / paste / cleared canvas now starts again at 1.
- **Fixed: toggling “Edge smoothing” did nothing**, and after changing “Gap repair width” the thumbnails could stay stale. Both settings now invalidate the repaired mask *and* the cut-out bitmap and repaint immediately (measured: the thumbnail hash changes after each toggle; going from gap 0 to 6 raises the ink pixel count from 19272 to 19476).
- Also fixed the cut-out bitmap cache writing into an orphaned object, i.e. not caching at all (element-list thumbnails are now about 20× faster because of it).

## 1.0.10

- **Donation links.** Settings now has a “Support PixPeel” section: [Ko-fi](https://ko-fi.com/lertone) for international supporters (credit card, PayPal, Apple Pay, Google Pay) and [Afdian](https://ifdian.net/a/lt20061229) for mainland China (WeChat Pay, Alipay). Entirely optional — nothing is locked behind it.
- Added `.github/FUNDING.yml`, so the repository shows a Sponsor button (Ko-fi + Afdian). GitHub Sponsors itself is not available in mainland China, so it is not used.
- Both READMEs gained a “Support PixPeel” section that also states **a donation is not a commercial license**.
- The links live in the `donate` field of `config.js`; leave one empty and its button disappears.
- No functional changes in this release.

## 1.0.9

- **Fix: the license page in the Chinese installer showed English only.** The wizard's license page is now a single bilingual file (`build/license.rtf`): a Chinese summary first (free for noncommercial use, commercial use needs a license, v1.0.7 and earlier stay MIT), then the English terms and the privacy note.
- Removed `build/license_zh_CN.rtf` / `build/license_en_US.rtf`, which never took effect — electron-builder uses `build/license.rtf` whenever it exists and ignores the language-suffixed files.
- `build/gen-license-rtf.js` now generates just that one file, and its header comment documents the pitfall.
- No functional changes in this release.

## 1.0.8

- **License changed from MIT to the PolyForm Noncommercial License 1.0.0.** Personal study, research, hobby projects, teaching, charity and religious use stay free, and you can still read and modify the source. **Commercial use now needs a license first** (using it for your company's business, shipping it inside a commercial product, or offering a paid service based on it). The installer's license page, the `LICENSE` file and the READMEs are all updated, and the license now ships inside the app.
- Note: releases up to and including v1.0.7 were published under the MIT License, and anyone who already has those versions keeps those terms — this change is not retroactive.
- No functional changes in this release.

## 1.0.7

- **Fixed: “Subtract from current” appeared to do nothing.** After cutting a detail out of an element (by hand-drawn shape or the magic wand), the edge post-processing “fill enclosed holes” step put it straight back on export, so the work was lost. Layers you created, added to, or subtracted from by hand are now left alone by gap repair and hole filling, so a subtraction sticks (measured: the centre pixel of a disc went from alpha 255 to 0).
- **New: element preview.** Every element card has a zoom button in its bottom-right corner. It opens a preview panel: a vertical strip of thumbnails on the left, one enlarged view on the right (small elements are magnified up to 3×; beyond that it is just pixel mush). Scroll the strip with the wheel, or step through with ↑ ↓ / PageUp / PageDown. Each row has a checkbox that is the same state as the element list; Space toggles the current element, Esc closes the panel.
- **New: drag an element from the library or the board’s material bar onto “Extract” to split it again.** Library cards and the board’s material tiles can be dropped on the “Extract” entry in the left rail; the PNG is read back in and split automatically, so you can keep peeling details off elements you already saved. Dropping on any other section just says “Library elements can only be dropped on ‘Extract’ to split again”.
- Fix: while the preview panel was open, Space and the arrow keys were swallowed by the Extract page’s “Space + drag to pan” gesture, so paging and ticking did nothing.

## 1.0.6

- **Fixed: uneven cards in the library.** When a tall image and a square one shared a row, the tall thumbnail stretched its box and left a large blank area under the other card. Thumbnails are now a fixed 1:1 box, so every card is the same height and images are scaled to fit and centred.
- **New: auto-update (Windows / Linux AppImage).** When the settings page finds a new version you can hit “Download & install”, watch the progress on the button, then choose “Restart now”. Your library and settings are kept. macOS (unsigned) and deb / rpm (no in-place update channel) still open the download page. Downloads only start when you click — the app never pulls installers in the background.
- **Fixed: with batch import, “Also save the remainder as one layer (background)” only handled the current image** and silently dropped the rest of the others. Each image now gets its own background layer, named after the source file (`Background - Element 309.png`) instead of `Background_2.png`.
- Docs: added a [Linux desktop support table](../README.en.md#linux-desktop-support) (X11 vs Wayland, feature by feature) with a Wayland workaround (desktop screenshot → import).

## 1.0.5

- **Better gap repair**: only gaps of 2 px or less could be closed before. There is now a crack filler that joins a break **only where there is foreground on both sides and the gap is narrow**, so 3–4 px notches and stepped/jagged cracks get closed up (measured: 1–4 px straight gaps fully repaired, jagged cracks completely closed) without two distant elements being glued together.
- New setting “Gap repair width”: widen or narrow how much gets bridged (default 4 px). The wider it is, the more likely two very close elements get merged into one — your call.
- Measured effect of the edge smoothing: a hard edge used to have only two alpha levels (0 / 255); it now gets a gradient transition band (measured: 0 → 200 transitional pixels), which noticeably reduces stair-step jaggies.

## 1.0.4

- **Batch splitting**: you can now select several images at once (button or drag & drop). Each one is split automatically and every element ends up in a single list; clicking an element jumps to the image it came from.
- **The Extract page is now a contact sheet**: images are scaled to a uniform size and tiled in a grid on one big canvas. The one you are working on is highlighted; scroll to zoom in for detail, drag to pan, and get the whole batch at a glance before you pick.
- **Edge smoothing & gap repair (on by default)**: on export, small gaps along the edge are filled, enclosed holes are closed, and the alpha transition is smoothed — no more broken outlines or stair-stepped jaggies. Pure local math, no network and no model; switch it off in Settings to export exactly as split.
- The rail logo is now redrawn from the icon’s own geometry: the white dashed frame inside the orange rounded square keeps flowing around the centre dot.
- Fix: the SVG canvas kept the previous language’s wording after switching the interface language.
- Fix: the element list jumped back to the top when it was redrawn (scrolling down and then clicking an element sent you back to the first row). The scroll position is kept now.
- The element panel is a denser card grid that reflows with the sidebar width, so the empty space is used.
- Fix: importing several images at once made them fight over “the image currently being split”, so elements could be cut from the wrong source (a red photo yielding blue pixels). Images are now processed one after another.
- Fix: importing an image could hang forever while the app was in the background (image decoding never returned when the window was hidden).
- Fix: clicking “SVG Canvas” in the rail before opening any SVG crashed the page. It now shows an empty state with “Import SVG” and “SVG Library” entry points.
- Fix: the element list still jumped back to the top when you clicked an element after scrolling — the scroll position was being saved on the outer panel instead of the list that actually scrolls. The list now stays where you left it.
- Fix: element names (“元素 1” / “Element 1”) were frozen in whichever language was active when you split the image, so switching the interface language left the old wording behind. Auto-generated names now follow the language; names you renamed yourself are left alone.
- AI picking with the full-precision model used to fail outright on machines without enough memory. It now falls back to the quantized model automatically and tells you it did.

## 1.0.3

- Fix: “Check for updates” reported HTTP 301. The GitHub account was renamed, so the old repository path redirects — the correct path is used now and the request follows redirects automatically.
- Fix: library card buttons were cut off in English (“Board” showed as “oard”). The action buttons moved to the bottom of the card and are allowed to wrap.
- Fix: reordering layers in the SVG canvas did nothing (the DOM order is really changed now, so the stacking updates).
- Fix: layers in the SVG canvas rotated around the canvas origin; they now rotate around their own centre.
- Fix: the middle mouse button could not pan the SVG canvas.
- SVG canvas: marquee multi-select, corner-scale + top-rotate handles, Delete to remove the selection, Clear all, arrow-key nudging.
- Board: marquee multi-select (the selection can then be deleted / scaled / rotated together), Clear canvas. The middle button still pans.
- The Extract page’s element list gained “Clear”; the element library and the SVG library gained “Clear” as well (everything is marked first and can be undone within 3 seconds — only then is it really deleted).
- The AI pick panel now spells out which model is in use, how big it is, what hardware it wants and whether it is already downloaded; you can download it or switch between quantized and full precision with one click.
- The logo in the left rail now has a dashed ring slowly turning around its centre dot.
- Images can be dropped straight onto the rail buttons: “Extract” splits them, “Library” stores them, “Board” adds a layer, “SVG Library / SVG Canvas” treat them as SVG — which is different from dropping onto the working area on the right.

## 1.0.2

- New “SVG Library” and “SVG Canvas” sections: layered SVGs are stored on their own; in the SVG canvas you can show/hide, move, scale, rotate, fade and delete each layer, and export any single layer as a transparent PNG back into the element library. See docs/LINK-PROTOCOL.md for the interface contract.
- Deletes are now undoable for 3 seconds: the library, the Extract page and the Board all show a toast with a shrinking progress bar; the delete only happens when the bar runs out.
- The element list is now a responsive card grid — thumbnails grow and reflow with the sidebar width instead of squeezing into thin rows.
- New ↩ button on the Extract page to leave the current image and go back to the empty page.
- Drag an image from the desktop onto any page: the Extract page splits it, the Board takes it as a material, the Library stores it, the SVG Library treats it as an SVG. A hint at the top tells you what the current page will do with it.
- HD enhance upgraded: on top of Lanczos + unsharp masking it now does iterative back-projection (tighter outlines) and de-fringing (fewer white/black halos).
- The AI model is now your choice: quantized (default, ~15–40 MB, fast, light) or full precision (~40–100 MB, slightly more accurate, heavier), switchable in Settings. Once the model is downloaded it goes straight to “AI is looking at the image”.
- Library items gained a “Board” button that copies them onto the board while the original stays in the library for repeated use.
- Fix: white icon for the taskbar / notifications on Windows (the window now uses a multi-size ICO and the Start Menu shortcut is recreated on every install).
- Fix: after installing a new build, launch-at-login still pointed at the old path so nothing started on boot; it now re-aligns to the current executable on startup.

## 1.0.1

- The companion web animation editor “小剪动画” now ships with every release (`xiaoji-animation.html`, single file, double-click to open).
- Fix: after moving the install or switching from the dev build to the packaged one, the launch-at-login entry still pointed at the old path and nothing started on boot. It is now re-aligned to the current executable on startup.
- The in-app hint for linking with the editor now shows the real file name, and the tab is called “贴纸” (matching the editor) instead of “贴图”.

## 1.0.0

First public release.

- Undo / redo (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y) on both the Extract page and the Board.
- Extract page zoom: wheel, + / −, Fit, 100%, pan with Space-drag or middle button; Board gets a “Zoom…” menu (incl. zoom to selection).
- Settings: a keyboard-shortcut cheat sheet.
- Library: shows each item’s resolution, flags low-res items and offers one-click / batch “Enhance” (local upscale + sharpen, saved as a new -HD file, original kept); optional “auto-enhance small images on save”.
- Fix: lasso / wand “Subtract” with no element picked now applies to the ticked or touched element.

- New “Board”: compose images from library elements or imported pictures. Preset / custom canvas size, transparent or solid background; click or drag materials in; move, scale, rotate, delete, reorder, wheel-zoom and pan; export PNG / JPG or save back to the library.

- Capture hotkey: dims the screen, drag a region, elements are split automatically, pick the ones you want and save as transparent PNGs.
- Click-to-extract hotkey: the screen is not dimmed; hover to highlight an element, click to save it straight to the library.
- Import images (button, drag & drop, or paste) and split them the same way. Pick / Wand / Lasso / optional AI pick tools; export layered SVG.
- Library with copy-to-clipboard, reveal in folder and delete (to trash).
- Optional link with the “小剪动画” video editor: saved elements appear in its sticker library.
- Windows installer with license, install path and desktop-shortcut options; macOS (Intel / Apple Silicon) and Linux builds.
- Settings: language (简体中文 / English), theme (system / light / dark), save folder, hotkeys, launch at login, close-to-tray, notifications, update check, changelog, privacy policy.
- Clicking the “saved” notification opens the library.
