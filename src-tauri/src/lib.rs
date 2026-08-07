mod models;
mod store;

use std::{path::PathBuf, sync::Mutex};

use models::{
    Contribution, ContributionContext, ContributionQuery, Contributor, DocumentOperation,
    DocumentView, ExportResult,
};
use store::DocumentStore;
use tauri::State;

#[derive(Default)]
struct AppState {
    document: Mutex<Option<DocumentStore>>,
}

fn lock_document<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Option<DocumentStore>>, String> {
    state
        .document
        .lock()
        .map_err(|_| "The document lock was poisoned.".to_owned())
}

#[tauri::command]
fn create_document(
    state: State<'_, AppState>,
    path: String,
    title: String,
    contributor: Contributor,
) -> Result<DocumentView, String> {
    let store = DocumentStore::create(PathBuf::from(path), title, contributor)
        .map_err(|error| error.to_string())?;
    let view = store.view().map_err(|error| error.to_string())?;
    *lock_document(&state)? = Some(store);
    Ok(view)
}

#[tauri::command]
fn open_document(state: State<'_, AppState>, path: String) -> Result<DocumentView, String> {
    let store = DocumentStore::open(PathBuf::from(path)).map_err(|error| error.to_string())?;
    let view = store.view().map_err(|error| error.to_string())?;
    *lock_document(&state)? = Some(store);
    Ok(view)
}

#[tauri::command]
fn close_document(state: State<'_, AppState>) -> Result<(), String> {
    *lock_document(&state)? = None;
    Ok(())
}

#[tauri::command]
fn get_document(state: State<'_, AppState>) -> Result<DocumentView, String> {
    lock_document(&state)?
        .as_ref()
        .ok_or_else(|| "No document is open.".to_owned())?
        .view()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn apply_operation(
    state: State<'_, AppState>,
    operation: DocumentOperation,
    context: ContributionContext,
) -> Result<DocumentView, String> {
    lock_document(&state)?
        .as_mut()
        .ok_or_else(|| "No document is open.".to_owned())?
        .apply(operation, context)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_contributions(
    state: State<'_, AppState>,
    query: ContributionQuery,
) -> Result<Vec<Contribution>, String> {
    lock_document(&state)?
        .as_ref()
        .ok_or_else(|| "No document is open.".to_owned())?
        .contributions(query)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn restore_revision(
    state: State<'_, AppState>,
    revision: i64,
    context: ContributionContext,
) -> Result<DocumentView, String> {
    lock_document(&state)?
        .as_mut()
        .ok_or_else(|| "No document is open.".to_owned())?
        .restore(revision, context)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn backup_document(state: State<'_, AppState>, path: String) -> Result<ExportResult, String> {
    lock_document(&state)?
        .as_mut()
        .ok_or_else(|| "No document is open.".to_owned())?
        .backup(&PathBuf::from(path))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn export_document(
    state: State<'_, AppState>,
    format: String,
    path: String,
) -> Result<ExportResult, String> {
    lock_document(&state)?
        .as_ref()
        .ok_or_else(|| "No document is open.".to_owned())?
        .export(&format, &PathBuf::from(path))
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            create_document,
            open_document,
            close_document,
            get_document,
            apply_operation,
            list_contributions,
            restore_revision,
            backup_document,
            export_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Coedit Local");
}
