/** Controlled presentation/host patch over the SHA-pinned upstream archive. */
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function patchGridcraft(root) {
  const change = async (path, before, after) => {
    const file = join(root, path), source = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n')
    if (source.split(before).length !== 2) throw Error(`Gridcraft patch no longer applies uniquely: ${path}`)
    await writeFile(file, source.replace(before, after))
  }
  await copyFile(new URL('./pm_host.rs', import.meta.url), join(root, 'apps/gridcraft-web/src/pm_host.rs'))
  await copyFile(new URL('./pm_budget.rs', import.meta.url), join(root, 'crates/calc/src/pm_budget.rs'))
  await copyFile(new URL('./Cargo.lock', import.meta.url), join(root, 'Cargo.lock'))
  await change('crates/formula/src/printer.rs', `    // 15 significant digits can round past f64::MAX, which no longer parses.
    if text.parse::<f64>().is_ok_and(f64::is_finite) {`, `    // P-M transport must preserve the parsed binary64 constant through fill and XLSX export.
    if text.parse::<f64>().is_ok_and(|value| value.to_bits() == n.to_bits()) {`)
  await change('crates/formula/src/printer.rs', '/// Prints an expression in A1 notation.', `#[cfg(test)]
mod pm_precision_tests {
    #[test]
    fn formula_constants_round_trip_exactly() {
        for n in [22.56758334191025, 0.12345678901234568, 1.234567890123456e-100,
            -0.0, f64::MAX, f64::MIN_POSITIVE, f64::from_bits(1)] {
            let printed = super::number(n);
            assert_eq!(printed.parse::<f64>().unwrap().to_bits(), n.to_bits());
            let expr = crate::parse(&printed).unwrap();
            let parsed = match expr {
                crate::ast::Expr::Number(value) => value,
                crate::ast::Expr::Unary(crate::ast::UnOp::Neg, value) => match *value {
                    crate::ast::Expr::Number(value) => -value,
                    _ => panic!("Expected a numeric constant"),
                },
                _ => panic!("Expected a numeric constant"),
            };
            assert_eq!(parsed.to_bits(), n.to_bits());
        }
    }
}

/// Prints an expression in A1 notation.`)
  await change('Cargo.toml', 'zip = { version = "3",', 'zip = { version = "=9.2.0",')
  await change('crates/xlsx/src/package.rs', '                names.entry(normalize(n)).or_insert(i);', '                let n = n.map_err(|e| IoError::Zip(e.to_string()))?;\n                names.entry(normalize(n.as_ref())).or_insert(i);')
  await change('crates/xlsx/src/package.rs', '(f.size() > MAX_PART).then(|| (f.name().to_string(), f.size()))', '(f.size() > MAX_PART).then(|| (f.name().map(|name| name.into_owned()).unwrap_or_else(|_| "<invalid part name>".into()), f.size()))')
  await change('crates/xlsx/src/ods.rs', 'None => match r.as_ref() {', 'None => match r.decode().map_err(xml_error)?.as_ref() {')
  for (const entity of ['amp', 'lt', 'gt', 'apos', 'quot']) await change('crates/xlsx/src/ods.rs', `b"${entity}" =>`, `"${entity}" =>`)
  await change('crates/calc/src/lib.rs', 'pub mod eval;', 'pub mod eval;\npub mod pm_budget;')
  await change('crates/calc/src/recalc.rs', '    pub fn recalc_all(&mut self, wb: &mut Workbook) {', '    pub fn recalc_all(&mut self, wb: &mut Workbook) {\n        let _budget = crate::pm_budget::begin();')
  await change('crates/calc/src/recalc.rs', '    pub fn cells_changed(&mut self, wb: &mut Workbook, changed: &[Key]) {', '    pub fn cells_changed(&mut self, wb: &mut Workbook, changed: &[Key]) {\n        let _budget = crate::pm_budget::begin();')
  await change('crates/calc/src/recalc.rs', 'impl Calc {', 'impl Calc {\n    pub fn pm_resource_exhausted(&self) -> bool { crate::pm_budget::exhausted() }')
  await change('crates/calc/src/eval.rs', '    pub fn eval(&mut self, e: &Expr) -> Ev {', '    pub fn eval(&mut self, e: &Expr) -> Ev {\n        if !crate::pm_budget::spend() { return err(CellError::Num); }')
  await change('crates/calc/src/eval.rs', 'pub const MAX_CELLS: u64 = 16_000_000;', 'pub const MAX_CELLS: u64 = 100_000;')
  await change('crates/calc/src/eval/array.rs', 'const MAX_CONCAT_ARRAY_BYTES: usize = 512 * 1024 * 1024;', 'const MAX_CONCAT_ARRAY_BYTES: usize = 16 * 1024 * 1024;')
  await change('crates/ui-egui/src/dialogs/about.rs', 'A clean-room, open-source, Rust-native spreadsheet. Part of ArtCraft.', 'P-M spreadsheet component based on GridCraft by the ArtCraft team.')
  await change('crates/ui-egui/src/dialogs/about.rs', 'ui.hyperlink_to("getartcraft.com/apps/gridcraft", "https://getartcraft.com/apps/gridcraft");', 'ui.hyperlink_to("GridCraft source", "https://github.com/storytold/gridcraft");')
  await change('crates/ui-egui/src/dialogs/about.rs', 'ui.hyperlink_to("Join the ArtCraft Discord", "https://discord.gg/artcraft");', '')
  await change('apps/gridcraft-web/src/main.rs', 'mod host;', 'mod host;\n#[cfg(target_arch = "wasm32")]\nmod pm_host;')
  await change('crates/ui-egui/src/services.rs', 'pub file_tab: bool,', 'pub file_tab: bool,\n    /// P-M host owns all surrounding chrome.\n    pub cells_only: bool,')
  await change('crates/ui-egui/src/services.rs', 'Chrome { title_bar: true, file_tab: true }', 'Chrome { title_bar: true, file_tab: true, cells_only: false }')
  await change('crates/ui-egui/src/app.rs', 'if self.backstage.is_none() || self.keytips.prefix().is_some() {', 'if !self.chrome.cells_only && (self.backstage.is_none() || self.keytips.prefix().is_some()) {')
  await change('crates/ui-egui/src/app.rs', '            ribbon::show(self, ui);', '            if !self.chrome.cells_only {\n            ribbon::show(self, ui);')
  await change('crates/ui-egui/src/app.rs', '            panes::show(self, ui);', '            panes::show(self, ui);\n            }')
  await change('crates/ui-egui/src/grid/quadrant.rs', '    pub(crate) active_row: Option<u32>,', '    pub(crate) active_row: Option<u32>,\n    pub(crate) show_notes: bool,')
  await change('crates/ui-egui/src/grid/show.rs', '            active_row,', '            active_row,\n            show_notes: !app.chrome.cells_only,')
  await change('crates/ui-egui/src/paper_view.rs', '            active_row,', '            active_row,\n            show_notes: !app.chrome.cells_only,')
  await change('crates/ui-egui/src/grid/quadrant.rs', '        if let Some(cm) = sh.comments.get(c) {', '        if q.show_notes && let Some(cm) = sh.comments.get(c) {')
  await change('crates/ui-egui/src/grid/show.rs', '    for (c, cm) in &sh.comments {', '    for (c, cm) in sh.comments.iter().filter(|_| !app.chrome.cells_only) {')
  await change('crates/ui-egui/src/grid/menus.rs', '            if let Some(item) = insert_copied {\n                items.insert(6, item);', `            if app.chrome.cells_only {
                if let Some(index) = items.iter().position(|(_, id)| *id == "ui:newComment") {
                    items.drain(index..index + 3);
                }
            }
            if let Some(item) = insert_copied {
                items.insert(6, item);`)
  await change('crates/ui-egui/src/app.rs', '    /// Lays out the whole window.', `    pub fn pm_can_close(&self) -> bool {
        self.editor.is_none() && self.dialog.is_none() && self.message.is_none() && self.session.clipboard.is_none()
            && self.grid.filter_menu.is_none() && self.grid.list_picker.is_none()
            && self.grid.header_menu.is_none() && self.grid.fill_menu.is_none()
    }

    /// Lays out the whole window.`)
  await change('crates/ui-egui/src/app/commands.rs', '        let switches_window =', `        if self.chrome.cells_only && (id.starts_with("ui.") || id.starts_with("automate.") || id.starts_with("file.") || id.starts_with("sheet.") || id.starts_with("link.") || id.starts_with("view.") || id.starts_with("review.")) {
            return Err("Use the spreadsheet header for file actions.".into());
        }
        let switches_window =`)
  await change('crates/ui-egui/src/grid/keyboard.rs', '    for ev in events {', '    for (event_index, ev) in events.iter().cloned().enumerate() {')
  await change('crates/ui-egui/src/grid/keyboard.rs', '                app.begin_edit(Some(text), false);', `                // The cell editor must own the remaining events in this same frame. Without
                // this, a fast entry loses characters before its next focus/paint pass.
                if app.chrome.cells_only {
                    ctx.input_mut(|input| input.events = events[event_index + 1..].to_vec());
                }
                app.begin_edit(Some(text), false);`)
  await change('crates/ui-egui/src/grid/keyboard.rs', '                    ed.caret = ed.text.chars().count();', `                    ed.caret = ed.text.chars().count();
                    if app.chrome.cells_only {
                        let id = egui::Id::unique("gridcraft.cell_editor");
                        let mut state = egui::TextEdit::load_state(ctx, id).unwrap_or_default();
                        state.cursor.set_char_range(Some(egui::text::CCursorRange::one(egui::text::CCursor::new(ed.caret))));
                        state.store(ctx, id);
                        ctx.memory_mut(|memory| memory.request_focus(id));
                        ed.request_focus = false; ed.sync_caret = false;
                    }`)
  await change('apps/gridcraft-web/src/web.rs', 'file_tab: false },', 'file_tab: false, cells_only: false },')
  await change('apps/gridcraft-web/src/web.rs', '                    let mut app = SheetApp::new(session, services);', `                    let pm = crate::pm_host::Bridge::new(cc.egui_ctx.clone());
                    if pm.is_some() {
                        services.open_url = None; services.open_async = None; services.download = None;
                        services.print = None; services.inbox = None;
                    }
                    let mut app = SheetApp::new(session, services);`)
  await change('apps/gridcraft-web/src/web.rs', '                    crate::prefs::restore(&mut app, stored_ui.as_deref(), stored_prefs.as_deref());', '                    if pm.is_none() { crate::prefs::restore(&mut app, stored_ui.as_deref(), stored_prefs.as_deref()); }')
  await change('apps/gridcraft-web/src/web.rs', '                    Ok(Box::new(WebShell { app, inbox, bridge: app_bridge, prefs }))', `                    if let Some(pm) = &pm {
                        app.chrome = gridcraft_ui_egui::Chrome { title_bar: false, file_tab: false, cells_only: true };
                        app.ui.autosave = false;
                        pm.ready();
                    }
                    Ok(Box::new(WebShell { app, inbox, bridge: app_bridge, prefs, pm }))`)
  await change('apps/gridcraft-web/src/web.rs', '    prefs: crate::prefs::PrefsSync,', '    prefs: crate::prefs::PrefsSync,\n    pm: Option<crate::pm_host::Bridge>,')
  await change('apps/gridcraft-web/src/web.rs', '        for f in dropped {', '        for f in dropped.into_iter().filter(|_| self.pm.is_none()) {')
  await change('apps/gridcraft-web/src/web.rs', '        let changed = self.prefs.changed(&self.app);', '        let changed = if self.pm.is_none() { self.prefs.changed(&self.app) } else { Vec::new() };')
  await change('apps/gridcraft-web/src/web.rs', '        self.app.ui(ui);', `        let ctx = ui.ctx().clone();
        let close = self.pm.is_some() && self.app.pm_can_close() && !egui::Popup::is_any_open(&ctx) && ctx.input(|i| i.key_pressed(egui::Key::Escape));
        self.app.ui(ui);
        if let Some(pm) = &self.pm {
            pm.poll(&mut self.app, &ctx);
            if close { pm.close(); }
        }`)
}
