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

#[derive(Clone)]
struct Table { sheet: String, columns: u32 }
struct Request { id: f64, action: String, bytes: Vec<u8>, dark: bool, table: Option<Table> }

pub struct Bridge {
    window: web_sys::Window,
    parent: web_sys::Window,
    origin: String,
    session: String,
    requests: Rc<RefCell<Vec<Request>>>,
    table: RefCell<Option<Table>>,
}

fn field(v: &JsValue, key: &str) -> JsValue {
    js_sys::Reflect::get(v, &key.into()).unwrap_or(JsValue::UNDEFINED)
}

impl Bridge {
    pub fn new(ctx: egui::Context) -> Option<Self> {
        let window = web_sys::window()?;
        let parent = window.parent().ok().flatten()?;
        let session = web_sys::UrlSearchParams::new_with_str(&window.location().search().ok()?).ok()?.get("pm")?;
        if session.is_empty() || session.len() > 80 || js_sys::Object::is(&parent, &window) { return None; }
        let origin = window.location().origin().ok()?;
        let bridge = Self { window, parent, origin, session, requests: Rc::default(), table: RefCell::new(None) };
        let queue = bridge.requests.clone();
        let expected_parent = bridge.parent.clone();
        let expected_origin = bridge.origin.clone();
        let expected_session = bridge.session.clone();
        let listener = Closure::<dyn FnMut(web_sys::MessageEvent)>::new(move |event: web_sys::MessageEvent| {
            if event.origin() != expected_origin || !event.source().is_some_and(|s| js_sys::Object::is(&s, &expected_parent)) { return; }
            let data = event.data();
            if field(&data, "type").as_string().as_deref() != Some("pm-gridcraft") ||
                field(&data, "version").as_f64() != Some(2.0) ||
                field(&data, "session").as_string().as_deref() != Some(expected_session.as_str()) { return; }
            let Some(id) = field(&data, "id").as_f64().filter(|id| id.is_finite() && *id > 0.0 && id.fract() == 0.0) else { return };
            let Some(action) = field(&data, "action").as_string() else { return };
            if !matches!(action.as_str(), "open" | "values" | "export" | "theme") || queue.borrow().len() >= 4 { return; }
            let raw = field(&data, "bytes");
            let bytes = if raw.is_instance_of::<js_sys::ArrayBuffer>() {
                let a = js_sys::Uint8Array::new(&raw);
                if a.length() as usize > MAX_BYTES { return; }
                a.to_vec()
            } else { Vec::new() };
            let mapping = field(&data, "mapping");
            let table = field(&mapping, "sheet").as_string().zip(field(&mapping, "columns").as_f64())
                .filter(|(name, cols)| !name.is_empty() && name.chars().count() <= 31 && !name.contains(['\\', '/', '?', '*', '[', ']', ':']) &&
                    cols.is_finite() && *cols >= 2.0 && *cols <= MAX_COLS as f64 && cols.fract() == 0.0)
                .map(|(sheet, cols)| Table { sheet, columns: cols as u32 });
            queue.borrow_mut().push(Request { id, action, bytes, table, dark: field(&data, "dark").as_bool().unwrap_or(false) });
            ctx.request_repaint();
        });
        bridge.window.add_event_listener_with_callback("message", listener.as_ref().unchecked_ref()).ok()?;
        listener.forget();
        Some(bridge)
    }

    fn send(&self, mut data: Json, bytes: Option<Vec<u8>>) {
        data["type"] = json!("pm-gridcraft"); data["version"] = json!(2); data["session"] = json!(self.session);
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

    pub fn poll(&self, app: &mut SheetApp, ctx: &egui::Context) {
        let requests = std::mem::take(&mut *self.requests.borrow_mut());
        for request in requests {
            let result = match request.action.as_str() {
                "open" => match request.table {
                    Some(table) => open(app, &request.bytes, &table).map(|data| { *self.table.borrow_mut() = Some(table); (data, None) }),
                    None => Err("Invalid spreadsheet table mapping.".into()),
                },
                "theme" => {
                    app.ui.system_theme = false; app.ui.dark = request.dark;
                    ctx.set_theme(if request.dark { egui::ThemePreference::Dark } else { egui::ThemePreference::Light });
                    Ok((json!({}), None))
                },
                "values" | "export" => {
                    if !app.commit_edit(0, 0, false, false) { Err("Finish the current cell edit first.".into()) }
                    else { match self.table.borrow().as_ref() {
                        Some(table) => snapshot(app, request.action == "export", table),
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

fn open(app: &mut SheetApp, bytes: &[u8], table: &Table) -> Result<Json, String> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES { return Err("The XLSX file exceeds the spreadsheet limit.".into()); }
    let (mut wb, warnings) = io::open_bytes("table.xlsx", bytes).map_err(|e| e.to_string())?;
    if !warnings.is_empty() { return Err(format!("Unsupported XLSX content: {}", warnings.join("; "))); }
    check_workbook(&wb)?;
    let sheet = wb.sheets.iter().position(|s| s.name == table.sheet).ok_or("The mapped worksheet is missing.")?;
    wb.calc.mode = gridcraft_engine::model::CalcMode::Automatic;
    wb.set_active_sheet(sheet);
    let doc = DocState::new(wb, None, "table.xlsx".into(), Trust::FromFile);
    if doc.calc.pm_resource_exhausted() { return Err("Calculation limit reached. Simplify the sheet.".into()); }
    while !app.session.documents().is_empty() { app.session.close_document(0); }
    app.session.add_document(doc);
    app.session.execute("selection.set", json!({"cell": "B2"})).map_err(|e| e.to_string())?;
    Ok(json!({"opened": true}))
}

// Recheck the edited draft at every Update/Save boundary, including unmapped helper cells.
fn check_workbook(wb: &gridcraft_engine::model::Workbook) -> Result<(), String> {
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

fn snapshot(app: &mut SheetApp, export: bool, table: &Table) -> Result<(Json, Option<Vec<u8>>), String> {
    if !export {
        if app.session.doc().map_err(|e| e.to_string())?.calc.pm_resource_exhausted() {
            return Err("Calculation limit reached. Simplify the sheet.".into());
        }
    }
    let d = app.session.doc().map_err(|e| e.to_string())?;
    check_workbook(&d.wb)?;
    let sh = d.wb.sheets.iter().find(|sh| sh.name == table.sheet).ok_or("The mapped worksheet is missing.")?;
    let end = sh.used_range().map(|r| r.end.row).unwrap_or(0);
    if end >= MAX_ROWS { return Err("Spreadsheet row limit exceeded.".into()); }
    if !export && (end as usize + 1) * table.columns as usize > MAX_CELLS {
        return Err("Mapped spreadsheet snapshot exceeds 1,000,000 cells.".into());
    }
    if export {
        let bytes = io::save_bytes(&d.wb, "table.xlsx").map_err(|e| e.to_string())?;
        if bytes.len() > MAX_BYTES { return Err("The saved XLSX exceeds 10 MiB.".into()); }
        return Ok((json!({"name": "table.xlsx"}), Some(bytes)));
    }
    let mut rows = Vec::new();
    for row in 0..=end {
        let mut cells = Vec::new();
        for col in 0..table.columns {
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
                Value::Number(n) => gridcraft_engine::display::number_format(d.wb.styles.get(sh.style_id(at)).num_fmt.as_str()).date_shape(n).is_some(),
                _ => false,
            };
            cells.push(json!({"value": value, "date": date, "formula": cell.is_some_and(|c| c.formula.is_some()) || sh.spill_anchor(at).is_some(),
                "note": sh.comments.get(&at).map(|n| n.text.as_str())}));
        }
        rows.push(cells);
    }
    Ok((json!({"rows": rows}), None))
}
