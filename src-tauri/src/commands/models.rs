use serde::{Deserialize, Serialize};
use crate::db::{self, custom_models};

/// A model entry the UI can render: built-in alias or user-defined.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelEntry {
    pub value: String,            // canonical id passed to claude --model
    pub label: String,
    pub color: Option<String>,    // tailwind class fragment
    pub source: String,           // "builtin" or "custom"
    pub input_cost_per_mtok: Option<f64>,
    pub output_cost_per_mtok: Option<f64>,
    pub custom_id: Option<i64>,   // present for source="custom"
}

fn builtin_models() -> Vec<ModelEntry> {
    // Generic aliases route to "latest" of each family; specific ids pin a version.
    // Costs are USD per million tokens (Anthropic public pricing as of 2026 cutoff).
    vec![
        // ── Aliases (track latest) ──
        ModelEntry {
            value: "haiku".into(), label: "Haiku (latest)".into(),
            color: Some("bg-green-500/20 text-green-300".into()), source: "builtin".into(),
            input_cost_per_mtok: Some(1.0), output_cost_per_mtok: Some(5.0),
            custom_id: None,
        },
        ModelEntry {
            value: "sonnet".into(), label: "Sonnet (latest)".into(),
            color: Some("bg-blue-500/20 text-blue-300".into()), source: "builtin".into(),
            input_cost_per_mtok: Some(3.0), output_cost_per_mtok: Some(15.0),
            custom_id: None,
        },
        ModelEntry {
            value: "opus".into(), label: "Opus (latest)".into(),
            color: Some("bg-purple-500/20 text-purple-300".into()), source: "builtin".into(),
            input_cost_per_mtok: Some(15.0), output_cost_per_mtok: Some(75.0),
            custom_id: None,
        },
        // ── Pinned versions ──
        ModelEntry {
            value: "claude-haiku-4-5".into(), label: "Haiku 4.5".into(),
            color: Some("bg-green-500/20 text-green-300".into()), source: "builtin".into(),
            input_cost_per_mtok: Some(1.0), output_cost_per_mtok: Some(5.0),
            custom_id: None,
        },
        ModelEntry {
            value: "claude-sonnet-4-6".into(), label: "Sonnet 4.6".into(),
            color: Some("bg-blue-500/20 text-blue-300".into()), source: "builtin".into(),
            input_cost_per_mtok: Some(3.0), output_cost_per_mtok: Some(15.0),
            custom_id: None,
        },
        ModelEntry {
            value: "claude-opus-4-6".into(), label: "Opus 4.6".into(),
            color: Some("bg-purple-500/20 text-purple-300".into()), source: "builtin".into(),
            input_cost_per_mtok: Some(15.0), output_cost_per_mtok: Some(75.0),
            custom_id: None,
        },
        ModelEntry {
            value: "claude-opus-4-7".into(), label: "Opus 4.7".into(),
            color: Some("bg-purple-500/20 text-purple-300".into()), source: "builtin".into(),
            input_cost_per_mtok: Some(15.0), output_cost_per_mtok: Some(75.0),
            custom_id: None,
        },
        ModelEntry {
            value: "claude-opus-4-7[1m]".into(), label: "Opus 4.7 (1M context)".into(),
            color: Some("bg-fuchsia-500/20 text-fuchsia-300".into()), source: "builtin".into(),
            input_cost_per_mtok: Some(15.0), output_cost_per_mtok: Some(75.0),
            custom_id: None,
        },
    ]
}

#[tauri::command]
pub fn list_models() -> Result<Vec<ModelEntry>, String> {
    let db = db::get_db();
    let mut out = builtin_models();
    let customs = custom_models::list(&db);
    for c in customs {
        out.push(ModelEntry {
            value: c.model_id,
            label: c.label,
            color: c.color,
            source: "custom".into(),
            input_cost_per_mtok: c.input_cost_per_mtok,
            output_cost_per_mtok: c.output_cost_per_mtok,
            custom_id: Some(c.id),
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn add_custom_model(
    model_id: String,
    label: String,
    color: Option<String>,
    input_cost_per_mtok: Option<f64>,
    output_cost_per_mtok: Option<f64>,
    sort_order: Option<i64>,
) -> Result<custom_models::CustomModel, String> {
    let model_id = model_id.trim();
    let label = label.trim();
    if model_id.is_empty() { return Err("Model id is required".into()); }
    if label.is_empty() { return Err("Label is required".into()); }
    if builtin_models().iter().any(|m| m.value == model_id) {
        return Err("Built-in model id cannot be used as a custom model".into());
    }

    let db = db::get_db();
    let id = custom_models::create(
        &db, model_id, label, color.as_deref(),
        input_cost_per_mtok, output_cost_per_mtok,
        sort_order.unwrap_or(0),
    )?;
    custom_models::list(&db).into_iter().find(|m| m.id == id)
        .ok_or_else(|| "Failed to fetch created model".into())
}

#[tauri::command]
pub fn update_custom_model(
    id: i64,
    model_id: String,
    label: String,
    color: Option<String>,
    input_cost_per_mtok: Option<f64>,
    output_cost_per_mtok: Option<f64>,
    sort_order: Option<i64>,
) -> Result<custom_models::CustomModel, String> {
    let model_id = model_id.trim();
    let label = label.trim();
    if model_id.is_empty() { return Err("Model id is required".into()); }
    if label.is_empty() { return Err("Label is required".into()); }

    let db = db::get_db();
    custom_models::update(
        &db, id, model_id, label, color.as_deref(),
        input_cost_per_mtok, output_cost_per_mtok,
        sort_order.unwrap_or(0),
    )?;
    custom_models::list(&db).into_iter().find(|m| m.id == id)
        .ok_or_else(|| "Failed to fetch updated model".into())
}

#[tauri::command]
pub fn delete_custom_model(id: i64) -> Result<(), String> {
    let db = db::get_db();
    custom_models::delete(&db, id)
}
