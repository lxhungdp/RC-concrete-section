//! P-M's narrow, same-origin host protocol. No general command/automation transport.
use std::cell::RefCell;
use std::rc::Rc;

use gridcraft_engine::{DocState, Trust, core::{CellRef, Value}, io};
use gridcraft_ui_egui::SheetApp;
use serde_json::{Value as Json, json};
use wasm_bindgen::{JsCast as _, JsValue, closure::Closure};

const MAX_BYTES: usize = 10 * 1024 * 1024;
const MAX_ROWS: u32 = 100_001;
const MAX_COLS: u32 = 64;
const MAX_CELLS: usize = 1_000_000;
const MAX_SHEETS: usize = 256;

#[derive(Clone)]
enum Mapping { Table { sheet: String, columns: u32 }, Workbook { sheet: String } }
impl Mapping {
    fn sheet(&self) -> &str { match self { Self::Table { sheet, .. } | Self::Workbook { sheet } => sheet } }
}
struct Request { id: f64, action: String, bytes: Vec<u8>, dark: bool, mapping: Option<Mapping>, name: String, busy: bool, message: String, failed: bool, saved: bool }

pub struct Bridge {
    window: web_sys::Window,
    parent: web_sys::Window,
    origin: String,
    session: String,
    requests: Rc<RefCell<Vec<Request>>>,
    mapping: RefCell<Option<Mapping>>,
    project: bool,
    actions: Rc<RefCell<Vec<String>>>,
}

fn field(v: &JsValue, key: &str) -> JsValue {
    js_sys::Reflect::get(v, &key.into()).unwrap_or(JsValue::UNDEFINED)
}

impl Bridge {
    pub fn new(ctx: egui::Context) -> Option<Self> {
        let window = web_sys::window()?;
        let parent = window.parent().ok().flatten()?;
        let query = web_sys::UrlSearchParams::new_with_str(&window.location().search().ok()?).ok()?;
        let session = query.get("pm")?;
        let project = query.get("project").as_deref() == Some("1");
        if session.is_empty() || session.len() > 80 || js_sys::Object::is(&parent, &window) { return None; }
        let origin = window.location().origin().ok()?;
        let bridge = Self { window, parent, origin, session, requests: Rc::default(), mapping: RefCell::new(None), project, actions: Rc::default() };
        let queue = bridge.requests.clone();
        let expected_parent = bridge.parent.clone();
        let expected_origin = bridge.origin.clone();
        let expected_session = bridge.session.clone();
        let listener = Closure::<dyn FnMut(web_sys::MessageEvent)>::new(move |event: web_sys::MessageEvent| {
            if event.origin() != expected_origin || !event.source().is_some_and(|s| js_sys::Object::is(&s, &expected_parent)) { return; }
            let data = event.data();
            if field(&data, "type").as_string().as_deref() != Some("pm-gridcraft") ||
                field(&data, "version").as_f64() != Some(4.0) ||
                field(&data, "session").as_string().as_deref() != Some(expected_session.as_str()) { return; }
            let Some(id) = field(&data, "id").as_f64().filter(|id| id.is_finite() && *id > 0.0 && id.fract() == 0.0) else { return };
            let Some(action) = field(&data, "action").as_string() else { return };
            if !matches!(action.as_str(), "open" | "values" | "export" | "theme" | "status") || queue.borrow().len() >= 4 { return; }
            let raw = field(&data, "bytes");
            let bytes = if raw.is_instance_of::<js_sys::ArrayBuffer>() {
                let a = js_sys::Uint8Array::new(&raw);
                if a.length() as usize > MAX_BYTES { return; }
                a.to_vec()
            } else { Vec::new() };
            let mapping = field(&data, "mapping");
            let name = field(&mapping, "sheet").as_string().filter(|name| !name.is_empty() && name.chars().count() <= 31 && !name.contains(['\\', '/', '?', '*', '[', ']', ':']));
            let mapping = name.and_then(|sheet| match field(&mapping, "kind").as_string().as_deref() {
                Some("workbook") => Some(Mapping::Workbook { sheet }),
                None => field(&mapping, "columns").as_f64().filter(|cols| cols.is_finite() && *cols >= 2.0 && *cols <= MAX_COLS as f64 && cols.fract() == 0.0)
                    .map(|cols| Mapping::Table { sheet, columns: cols as u32 }),
                _ => None,
            });
            let name = field(&data, "name").as_string().filter(|s| !s.is_empty() && s.chars().count() <= 240 && !s.chars().any(|c| c.is_control() || c == '/' || c == '\\')).unwrap_or_else(|| "table.xlsx".into());
            let message: String = field(&data, "message").as_string().unwrap_or_default().chars().take(4000).collect();
            queue.borrow_mut().push(Request { id, action, bytes, mapping, name, message,
                busy: field(&data, "busy").as_bool().unwrap_or(false), failed: field(&data, "failed").as_bool().unwrap_or(false),
                saved: field(&data, "saved").as_bool().unwrap_or(false), dark: field(&data, "dark").as_bool().unwrap_or(false) });
            ctx.request_repaint();
        });
        bridge.window.add_event_listener_with_callback("message", listener.as_ref().unchecked_ref()).ok()?;
        listener.forget();
        Some(bridge)
    }

    fn send(&self, mut data: Json, bytes: Option<Vec<u8>>) {
        data["type"] = json!("pm-gridcraft"); data["version"] = json!(4); data["session"] = json!(self.session);
        let Ok(message) = js_sys::JSON::parse(&data.to_string()) else { return };
        if let Some(bytes) = bytes {
            let buffer = js_sys::Uint8Array::from(bytes.as_slice()).buffer();
            if js_sys::Reflect::set(&message, &"bytes".into(), &buffer).is_ok() {
                let _ = self.parent.post_message_with_transfer(&message, &self.origin, &js_sys::Array::of1(&buffer));
            }
        } else { let _ = self.parent.post_message(&message, &self.origin); }
    }

    pub fn ready(&self) { self.send(json!({"event": "ready"}), None); }
    pub fn close(&self) { self.send(json!({"event": "close"}), None); }
    pub fn project_window(&self) -> bool { self.project }
    pub fn connect(&self, services: &mut gridcraft_ui_egui::Services) {
        if !self.project { return; }
        let actions = self.actions.clone();
        services.pm_action = Some(Box::new(move |action| {
            if actions.borrow().is_empty() && matches!(action, "open" | "save" | "saveAs") { actions.borrow_mut().push(action.into()); }
        }));
        let actions = self.actions.clone();
        services.open_async = Some(Box::new(move || { if actions.borrow().is_empty() { actions.borrow_mut().push("open".into()); } }));
        services.pm_busy = true;
    }

    pub fn poll(&self, app: &mut SheetApp, ctx: &egui::Context) {
        for action in std::mem::take(&mut *self.actions.borrow_mut()) {
            app.services.pm_busy = true;
            let name = app.session.active().map(|doc| doc.display_title()).unwrap_or_else(|| "Book.xlsx".into());
            self.send(json!({"event": "action", "action": action, "name": name}), None);
        }
        let requests = std::mem::take(&mut *self.requests.borrow_mut());
        for request in requests {
            let result = match request.action.as_str() {
                "open" => match request.mapping {
                    Some(mapping) => open(app, &request.bytes, &mapping, &request.name, self.project).map(|data| { *self.mapping.borrow_mut() = Some(mapping); (data, None) }),
                    None => Err("Invalid spreadsheet mapping.".into()),
                },
                "theme" => {
                    app.ui.system_theme = false; app.ui.dark = request.dark;
                    ctx.set_theme(if request.dark { egui::ThemePreference::Dark } else { egui::ThemePreference::Light });
                    Ok((json!({}), None))
                },
                "status" if self.project => {
                    app.services.pm_busy = request.busy;
                    app.notice = if request.failed { Some(gridcraft_ui_egui::Notice { text: request.message.clone(), kind: gridcraft_ui_egui::NoticeKind::Warning, action: None }) } else { None };
                    if !request.failed && !request.message.is_empty() { app.toast = Some((request.message, gridcraft_ui_egui::now_ms())); }
                    if request.saved && let Some(doc) = app.session.active_mut() { doc.saved = doc.wb.clone(); }
                    Ok((json!({}), None))
                },
                "values" | "export" => {
                    if !app.commit_edit(0, 0, false, false) { Err("Finish the current cell edit first.".into()) }
                    else { match self.mapping.borrow().as_ref() {
                        Some(mapping) => snapshot(app, request.action == "export", mapping),
                        None => Err("Open a spreadsheet first.".into()),
                    } }
                },
                _ => Err("Unsupported spreadsheet operation.".into()),
            };
            match result {
                Ok((data, bytes)) => self.send(json!({"id": request.id, "ok": true, "data": data}), bytes),
                Err(error) => self.send(json!({"id": request.id, "ok": false, "error": error}), None),
            }
            ctx.request_repaint();
        }
    }
}

fn open(app: &mut SheetApp, bytes: &[u8], mapping: &Mapping, name: &str, project: bool) -> Result<Json, String> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES { return Err("The XLSX file exceeds the spreadsheet limit.".into()); }
    let (mut wb, warnings) = io::open_bytes("table.xlsx", bytes).map_err(|e| e.to_string())?;
    if !warnings.is_empty() { return Err(format!("Unsupported XLSX content: {}", warnings.join("; "))); }
    check_workbook(&wb)?;
    let sheet = wb.sheets.iter().position(|s| s.name == mapping.sheet()).ok_or("The mapped worksheet is missing.")?;
    wb.calc.mode = gridcraft_engine::model::CalcMode::Automatic;
    if matches!(mapping, Mapping::Workbook { .. }) {
        wb.view.show_sheet_tabs = true;
        wb.view.show_horizontal_scroll = true;
    }
    wb.set_active_sheet(sheet);
    let doc = DocState::new(wb, None, name.into(), Trust::FromFile);
    if doc.calc.pm_resource_exhausted() { return Err("Calculation limit reached. Simplify the sheet.".into()); }
    while !app.session.documents().is_empty() { app.session.close_document(0); }
    app.session.add_document(doc);
    app.chrome = gridcraft_ui_egui::Chrome { title_bar: project, file_tab: project, cells_only: !project, project_host: project };
    app.backstage = None;
    let first_cell = if matches!(mapping, Mapping::Workbook { .. }) { "A1" } else { "B2" };
    app.session.execute("selection.set", json!({"cell": first_cell})).map_err(|e| e.to_string())?;
    Ok(json!({"opened": true}))
}

// Recheck the edited draft at every Update/Save boundary, including unmapped helper cells.
fn check_workbook(wb: &gridcraft_engine::model::Workbook) -> Result<(), String> {
    if wb.sheets.is_empty() || wb.sheets.len() > MAX_SHEETS { return Err("Spreadsheet sheet limit exceeded.".into()); }
    if wb.calc.iterative || wb.vba_project.is_some() || !wb.macros.is_empty() || !wb.macros_unread.is_empty() {
        return Err("Iterative calculation and active code are unsupported in the spreadsheet.".into());
    }
    let mut count = 0;
    for sh in &wb.sheets {
        if sh.used_range().is_some_and(|r| r.end.row >= MAX_ROWS || r.end.col >= MAX_COLS) {
            return Err("The spreadsheet exceeds 100,001 rows or 64 columns.".into());
        }
        for (_, cell) in sh.cells.iter() {
            count += 1;
            if count > MAX_CELLS { return Err("The spreadsheet exceeds 1,000,000 populated cells.".into()); }
            if cell.py.is_some() { return Err("Python cells are unsupported in the spreadsheet.".into()); }
            if let Some(formula) = &cell.formula {
                if formula.text.contains('[') || formula.text.len() > 8192 {
                    return Err("External/structured references or oversized formulas are unsupported in the spreadsheet.".into());
                }
            }
        }
    }
    Ok(())
}

fn snapshot(app: &mut SheetApp, export: bool, mapping: &Mapping) -> Result<(Json, Option<Vec<u8>>), String> {
    if !export {
        if app.session.doc().map_err(|e| e.to_string())?.calc.pm_resource_exhausted() {
            return Err("Calculation limit reached. Simplify the sheet.".into());
        }
    }
    let d = app.session.doc().map_err(|e| e.to_string())?;
    check_workbook(&d.wb)?;
    if export {
        let bytes = io::save_bytes(&d.wb, "table.xlsx").map_err(|e| e.to_string())?;
        if bytes.len() > MAX_BYTES { return Err("The saved XLSX exceeds 10 MiB.".into()); }
        return Ok((json!({"name": "table.xlsx"}), Some(bytes)));
    }
    if matches!(mapping, Mapping::Workbook { .. }) {
        let slots: usize = d.wb.sheets.iter().map(|sh| sh.used_range().map(|r| (r.end.row as usize + 1) * (r.end.col as usize + 1)).unwrap_or(0)).sum();
        if slots > MAX_CELLS { return Err("Project snapshot exceeds 1,000,000 cells.".into()); }
        let sheets: Vec<Json> = d.wb.sheets.iter().map(|sh| {
            let columns = sh.used_range().map(|r| r.end.col + 1).unwrap_or(0);
            json!({"name": sh.name, "rows": evaluated_rows(&d.wb, sh, columns)})
        }).collect();
        return Ok((json!({"properties": {"subject": d.wb.props.subject, "description": d.wb.props.description}, "sheets": sheets}), None));
    }
    let Mapping::Table { sheet, columns } = mapping else { return Err("Invalid spreadsheet mapping.".into()); };
    let sh = d.wb.sheets.iter().find(|sh| &sh.name == sheet).ok_or("The mapped worksheet is missing.")?;
    let end = sh.used_range().map(|r| r.end.row).unwrap_or(0);
    if (end as usize + 1) * *columns as usize > MAX_CELLS { return Err("Mapped spreadsheet snapshot exceeds 1,000,000 cells.".into()); }
    Ok((json!({"rows": evaluated_rows(&d.wb, sh, *columns)}), None))
}

fn evaluated_rows(wb: &gridcraft_engine::model::Workbook, sh: &gridcraft_engine::model::Sheet, columns: u32) -> Vec<Vec<Json>> {
    let mut rows = Vec::new();
    let Some(range) = sh.used_range() else { return rows; };
    let end = range.end.row;
    for row in 0..=end {
        let mut cells = Vec::new();
        for col in 0..columns {
            let at = CellRef::new(row, col);
            let cell = sh.cell(at);
            let value = match sh.value(at) {
                Value::Empty => Json::Null,
                Value::Number(v) if v.is_finite() => json!(v),
                Value::Text(v) => json!(v),
                Value::Bool(v) => json!(v),
                Value::Error(e) => json!({"error": e.as_str()}),
                _ => json!({"error": "Invalid numeric result"}),
            };
            let date = match sh.value(at) {
                Value::Number(n) => gridcraft_engine::display::number_format(wb.styles.get(sh.style_id(at)).num_fmt.as_str()).date_shape(n).is_some(),
                _ => false,
            };
            cells.push(json!({"value": value, "date": date, "formula": cell.is_some_and(|c| c.formula.is_some()) || sh.spill_anchor(at).is_some(),
                "note": sh.comments.get(&at).map(|n| n.text.as_str())}));
        }
        rows.push(cells);
    }
    rows
}
