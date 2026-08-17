use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, Transaction};
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

use crate::models::{
    Contribution, ContributionContext, ContributionQuery, Contributor, ContributorKind,
    DocumentMetadata, DocumentNode, DocumentOperation, DocumentState, DocumentView, ExportResult,
    WritingSession, APPLICATION_ID, FORMAT_VERSION,
};

const MAGIC: &str = "coedit-local-document";
const MAX_TAGS_PER_NODE: usize = 20;
const MAX_TAG_CHARACTERS: usize = 64;
const MAX_TAG_BYTES: usize = 256;
const MAX_TITLE_BYTES: usize = 4_096;
const MAX_METADATA_BYTES: usize = 1_048_576;
const MAX_BODY_BYTES: usize = 16_777_216;
const MAX_YJS_BYTES: usize = 33_554_432;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("{0}")]
    Invalid(String),
    #[error("SQLite error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("File error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("The document is read-only.")]
    ReadOnly,
}

type Result<T> = std::result::Result<T, StoreError>;

pub struct DocumentStore {
    path: PathBuf,
    connection: Connection,
    read_only: bool,
    recovery_warning: Option<String>,
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn clean_title(value: &str, fallback: &str) -> Result<String> {
    let value = value.trim();
    let value = if value.is_empty() { fallback } else { value };
    if value.len() > MAX_TITLE_BYTES {
        return Err(StoreError::Invalid("A title is too long.".into()));
    }
    Ok(value.to_owned())
}

fn check_size(label: &str, value: &str, limit: usize) -> Result<()> {
    if value.len() > limit {
        Err(StoreError::Invalid(format!(
            "{label} exceeds the {limit}-byte limit."
        )))
    } else {
        Ok(())
    }
}

fn clean_tags(values: &[String]) -> Result<Vec<String>> {
    let mut result = Vec::new();
    let mut identities = HashSet::new();
    for value in values {
        let tag = value.split_whitespace().collect::<Vec<_>>().join(" ");
        if tag.is_empty() {
            continue;
        }
        if tag.chars().any(char::is_control) {
            return Err(StoreError::Invalid(
                "Tags cannot contain control characters.".into(),
            ));
        }
        if tag.chars().count() > MAX_TAG_CHARACTERS {
            return Err(StoreError::Invalid(format!(
                "A tag cannot exceed {MAX_TAG_CHARACTERS} characters."
            )));
        }
        if tag.len() > MAX_TAG_BYTES {
            return Err(StoreError::Invalid(format!(
                "A tag cannot exceed {MAX_TAG_BYTES} UTF-8 bytes."
            )));
        }
        if identities.insert(tag.to_lowercase()) {
            result.push(tag);
        }
    }
    if result.len() > MAX_TAGS_PER_NODE {
        return Err(StoreError::Invalid(format!(
            "A node cannot have more than {MAX_TAGS_PER_NODE} tags."
        )));
    }
    Ok(result)
}

fn meta(connection: &Connection, key: &str) -> Result<String> {
    connection
        .query_row("SELECT value FROM metadata WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()?
        .ok_or_else(|| StoreError::Invalid(format!("Document metadata is missing {key}.")))
}

fn initialize_schema(connection: &Connection) -> Result<()> {
    connection.execute_batch(&format!(
        r#"
        PRAGMA application_id = {APPLICATION_ID};
        PRAGMA user_version = {FORMAT_VERSION};
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = DELETE;
        PRAGMA synchronous = FULL;

        CREATE TABLE metadata (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        ) STRICT;

        CREATE TABLE contributors (
            id TEXT PRIMARY KEY NOT NULL,
            display_name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('human', 'automation', 'ai', 'imported')),
            created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE writing_sessions (
            id TEXT PRIMARY KEY NOT NULL,
            contributor_id TEXT NOT NULL REFERENCES contributors(id),
            started_at TEXT NOT NULL,
            ended_at TEXT,
            description TEXT
        ) STRICT;

        CREATE TABLE nodes (
            id TEXT PRIMARY KEY NOT NULL,
            parent_id TEXT REFERENCES nodes(id),
            position INTEGER NOT NULL,
            tags_json TEXT NOT NULL,
            title TEXT NOT NULL,
            body_html TEXT NOT NULL,
            yjs_state BLOB NOT NULL,
            metadata_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        ) STRICT;
        CREATE INDEX nodes_parent_position ON nodes(parent_id, position);

        CREATE TABLE contributions (
            id TEXT PRIMARY KEY NOT NULL,
            revision INTEGER NOT NULL UNIQUE,
            contributor_id TEXT NOT NULL REFERENCES contributors(id),
            session_id TEXT,
            group_id TEXT,
            timestamp TEXT NOT NULL,
            operation_type TEXT NOT NULL,
            affected_node_ids_json TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            base_revision INTEGER NOT NULL,
            resulting_hash TEXT NOT NULL,
            message TEXT
        ) STRICT;
        CREATE INDEX contributions_node_time ON contributions(timestamp DESC);

        CREATE TABLE snapshots (
            revision INTEGER PRIMARY KEY NOT NULL,
            state_json TEXT NOT NULL,
            state_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE attachments (
            id TEXT PRIMARY KEY NOT NULL,
            mime_type TEXT NOT NULL,
            checksum TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            content BLOB NOT NULL,
            created_at TEXT NOT NULL
        ) STRICT;
        "#
    ))?;
    Ok(())
}

fn load_state(connection: &Connection) -> Result<DocumentState> {
    let document = DocumentMetadata {
        id: meta(connection, "document_id")?,
        title: meta(connection, "title")?,
        format_version: meta(connection, "format_version")?
            .parse()
            .map_err(|_| StoreError::Invalid("Invalid format version.".into()))?,
        revision: meta(connection, "revision")?
            .parse()
            .map_err(|_| StoreError::Invalid("Invalid document revision.".into()))?,
        created_at: meta(connection, "created_at")?,
        updated_at: meta(connection, "updated_at")?,
    };

    let mut contributor_statement = connection
        .prepare("SELECT id, display_name, kind, created_at FROM contributors ORDER BY id")?;
    let contributor_rows = contributor_statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    let mut contributors = Vec::new();
    for row in contributor_rows {
        let (id, display_name, kind, created_at) = row?;
        contributors.push(Contributor {
            id,
            display_name,
            kind: ContributorKind::try_from(kind.as_str()).map_err(StoreError::Invalid)?,
            created_at,
        });
    }

    let mut session_statement = connection.prepare(
        "SELECT id, contributor_id, started_at, ended_at, description FROM writing_sessions ORDER BY id",
    )?;
    let sessions = session_statement
        .query_map([], |row| {
            Ok(WritingSession {
                id: row.get(0)?,
                contributor_id: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                description: row.get(4)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let mut node_statement = connection.prepare(
        "SELECT id, parent_id, position, tags_json, title, body_html, yjs_state, metadata_json, created_at, updated_at, deleted_at FROM nodes ORDER BY id",
    )?;
    let node_rows = node_statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, Vec<u8>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, Option<String>>(10)?,
        ))
    })?;
    let mut nodes = Vec::new();
    for row in node_rows {
        let (
            id,
            parent_id,
            position,
            tags_json,
            title,
            body_html,
            yjs_state,
            metadata_json,
            created_at,
            updated_at,
            deleted_at,
        ) = row?;
        let tags: Vec<String> = serde_json::from_str(&tags_json)?;
        nodes.push(DocumentNode {
            id,
            parent_id,
            position,
            tags: clean_tags(&tags)?,
            title,
            body_html,
            yjs_state: BASE64.encode(yjs_state),
            metadata: serde_json::from_str(&metadata_json)?,
            created_at,
            updated_at,
            deleted_at,
        });
    }

    validate_tree(&nodes)?;
    Ok(DocumentState {
        document,
        nodes,
        contributors,
        sessions,
    })
}

fn validate_tree(nodes: &[DocumentNode]) -> Result<()> {
    let by_id: HashMap<&str, &DocumentNode> =
        nodes.iter().map(|node| (node.id.as_str(), node)).collect();
    if by_id.len() != nodes.len() {
        return Err(StoreError::Invalid(
            "The document contains duplicate node identifiers.".into(),
        ));
    }
    for node in nodes {
        let mut visited = HashSet::from([node.id.as_str()]);
        let mut parent_id = node.parent_id.as_deref();
        while let Some(id) = parent_id {
            if !visited.insert(id) {
                return Err(StoreError::Invalid(
                    "The document hierarchy contains a cycle.".into(),
                ));
            }
            let parent = by_id.get(id).ok_or_else(|| {
                StoreError::Invalid(format!("Node {} refers to a missing parent.", node.id))
            })?;
            parent_id = parent.parent_id.as_deref();
        }
    }
    Ok(())
}

fn state_hash(state: &DocumentState) -> Result<String> {
    let encoded = serde_json::to_vec(state)?;
    Ok(hex::encode(Sha256::digest(encoded)))
}

fn insert_snapshot(
    transaction: &Transaction<'_>,
    state: &DocumentState,
    hash: &str,
    timestamp: &str,
) -> Result<()> {
    transaction.execute(
        "INSERT INTO snapshots(revision, state_json, state_hash, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![state.document.revision, serde_json::to_string(state)?, hash, timestamp],
    )?;
    Ok(())
}

fn normalize_positions(transaction: &Transaction<'_>, parent_id: Option<&str>) -> Result<()> {
    let mut statement = transaction.prepare(
        "SELECT id FROM nodes WHERE parent_id IS ?1 AND deleted_at IS NULL ORDER BY position, id",
    )?;
    let ids = statement
        .query_map([parent_id], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    drop(statement);
    for (position, id) in ids.iter().enumerate() {
        transaction.execute(
            "UPDATE nodes SET position = ?1 WHERE id = ?2",
            params![position as i64, id],
        )?;
    }
    Ok(())
}

fn node_exists(state: &DocumentState, node_id: &str) -> bool {
    state.nodes.iter().any(|node| node.id == node_id)
}

fn descendants(state: &DocumentState, node_id: &str) -> HashSet<String> {
    let mut result = HashSet::new();
    let mut pending = vec![node_id.to_owned()];
    while let Some(parent_id) = pending.pop() {
        for node in &state.nodes {
            if node.parent_id.as_deref() == Some(parent_id.as_str())
                && result.insert(node.id.clone())
            {
                pending.push(node.id.clone());
            }
        }
    }
    result
}

impl DocumentStore {
    pub fn create(path: PathBuf, title: String, contributor: Contributor) -> Result<Self> {
        if path.exists() {
            return Err(StoreError::Invalid(
                "The selected document already exists.".into(),
            ));
        }
        if path.extension().and_then(|value| value.to_str()) != Some("coedit") {
            return Err(StoreError::Invalid(
                "Documents must use the .coedit extension.".into(),
            ));
        }
        if let Some(parent) = path.parent() {
            if !parent.is_dir() {
                return Err(StoreError::Invalid(
                    "The destination folder does not exist.".into(),
                ));
            }
        }
        let temporary = path.with_extension(format!("coedit.tmp-{}", Uuid::new_v4()));
        let creation = (|| -> Result<()> {
            let connection = Connection::open(&temporary)?;
            connection.busy_timeout(Duration::from_secs(5))?;
            initialize_schema(&connection)?;
            let timestamp = now();
            let document_id = Uuid::new_v4().to_string();
            let title = clean_title(&title, "Untitled document")?;
            let transaction = connection.unchecked_transaction()?;
            for (key, value) in [
                ("magic", MAGIC.to_owned()),
                ("document_id", document_id),
                ("title", title.clone()),
                ("format_version", FORMAT_VERSION.to_string()),
                ("revision", "0".to_owned()),
                ("created_at", timestamp.clone()),
                ("updated_at", timestamp.clone()),
            ] {
                transaction.execute(
                    "INSERT INTO metadata(key, value) VALUES (?1, ?2)",
                    params![key, value],
                )?;
            }
            transaction.execute(
                "INSERT INTO contributors(id, display_name, kind, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![contributor.id, clean_title(&contributor.display_name, "Local author")?, contributor.kind.as_str(), contributor.created_at],
            )?;
            let state = load_state(&transaction)?;
            let hash = state_hash(&state)?;
            transaction.execute(
                "INSERT INTO contributions(id, revision, contributor_id, timestamp, operation_type, affected_node_ids_json, payload_json, base_revision, resulting_hash, message) VALUES (?1, 0, ?2, ?3, 'createDocument', '[]', ?4, -1, ?5, 'Created document')",
                params![Uuid::new_v4().to_string(), contributor.id, timestamp, json!({"title": title}).to_string(), hash],
            )?;
            insert_snapshot(&transaction, &state, &hash, &timestamp)?;
            transaction.commit()?;
            connection.execute_batch("PRAGMA optimize;")?;
            drop(connection);
            fs::rename(&temporary, &path)?;
            Ok(())
        })();
        if creation.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        creation?;
        Self::open(path)
    }

    pub fn open(path: PathBuf) -> Result<Self> {
        if !path.is_file() {
            return Err(StoreError::Invalid(
                "The selected document does not exist.".into(),
            ));
        }
        let journal_path = PathBuf::from(format!("{}-journal", path.display()));
        let had_recovery_journal = journal_path.exists();
        let probe = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let application_id: i64 = probe.query_row("PRAGMA application_id", [], |row| row.get(0))?;
        let format_version: i64 = probe.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        drop(probe);
        if application_id != APPLICATION_ID {
            return Err(StoreError::Invalid("This is not a Coedit document.".into()));
        }
        let read_only = format_version > FORMAT_VERSION;
        let flags = if read_only {
            OpenFlags::SQLITE_OPEN_READ_ONLY
        } else {
            OpenFlags::SQLITE_OPEN_READ_WRITE
        };
        let connection = Connection::open_with_flags(&path, flags)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;
        let integrity: String =
            connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
        if integrity != "ok" {
            return Err(StoreError::Invalid(format!(
                "SQLite integrity check failed: {integrity}"
            )));
        }
        if meta(&connection, "magic")? != MAGIC {
            return Err(StoreError::Invalid("This is not a Coedit document.".into()));
        }
        let state = load_state(&connection)?;
        if state.document.format_version != format_version {
            return Err(StoreError::Invalid(
                "Document format metadata is inconsistent.".into(),
            ));
        }
        Ok(Self {
            path,
            connection,
            read_only,
            recovery_warning: had_recovery_journal.then(|| "SQLite recovered an interrupted transaction. Review recent history before continuing.".to_owned()),
        })
    }

    pub fn view(&self) -> Result<DocumentView> {
        Ok(DocumentView {
            state: load_state(&self.connection)?,
            path: Some(self.path.display().to_string()),
            read_only: self.read_only,
            recovery_warning: self.recovery_warning.clone(),
        })
    }

    pub fn apply(
        &mut self,
        operation: DocumentOperation,
        context: ContributionContext,
    ) -> Result<DocumentView> {
        if self.read_only {
            return Err(StoreError::ReadOnly);
        }
        let before = load_state(&self.connection)?;
        let base_revision = before.document.revision;
        if !before
            .contributors
            .iter()
            .any(|item| item.id == context.contributor_id)
        {
            return Err(StoreError::Invalid(
                "The contributor is not registered in this document.".into(),
            ));
        }
        let timestamp = now();
        let transaction = self.connection.transaction()?;
        if let Some(session_id) = &context.session_id {
            transaction.execute(
                "INSERT OR IGNORE INTO writing_sessions(id, contributor_id, started_at) VALUES (?1, ?2, ?3)",
                params![session_id, context.contributor_id, timestamp],
            )?;
        }
        Self::apply_sql(&transaction, &before, &operation, &timestamp)?;
        let revision = base_revision + 1;
        transaction.execute(
            "UPDATE metadata SET value = ?1 WHERE key = 'revision'",
            [revision.to_string()],
        )?;
        transaction.execute(
            "UPDATE metadata SET value = ?1 WHERE key = 'updated_at'",
            [&timestamp],
        )?;
        let state = load_state(&transaction)?;
        let hash = state_hash(&state)?;
        let affected = operation.affected_node_ids();
        transaction.execute(
            "INSERT INTO contributions(id, revision, contributor_id, session_id, group_id, timestamp, operation_type, affected_node_ids_json, payload_json, base_revision, resulting_hash, message) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![Uuid::new_v4().to_string(), revision, context.contributor_id, context.session_id, context.group_id, timestamp, operation.operation_type(), serde_json::to_string(&affected)?, serde_json::to_string(&operation)?, base_revision, hash, context.message],
        )?;
        // MVP stores every revision. A later compactor can retain periodic full snapshots
        // because the immutable operation payload remains authoritative.
        insert_snapshot(&transaction, &state, &hash, &timestamp)?;
        transaction.commit()?;
        self.view()
    }

    fn apply_sql(
        transaction: &Transaction<'_>,
        state: &DocumentState,
        operation: &DocumentOperation,
        timestamp: &str,
    ) -> Result<()> {
        match operation {
            DocumentOperation::CreateNode { node, index } => {
                if node_exists(state, &node.id) {
                    return Err(StoreError::Invalid(
                        "Node identifier already exists.".into(),
                    ));
                }
                if let Some(parent_id) = &node.parent_id {
                    if !node_exists(state, parent_id) {
                        return Err(StoreError::Invalid(
                            "The parent node does not exist.".into(),
                        ));
                    }
                }
                let sibling_count = state
                    .nodes
                    .iter()
                    .filter(|item| item.parent_id == node.parent_id && item.deleted_at.is_none())
                    .count() as i64;
                let position = index.unwrap_or(sibling_count).clamp(0, sibling_count);
                transaction.execute(
                    "UPDATE nodes SET position = position + 1 WHERE parent_id IS ?1 AND deleted_at IS NULL AND position >= ?2",
                    params![node.parent_id, position],
                )?;
                let title = clean_title(&node.title, "Untitled idea")?;
                let body = ammonia::clean(node.body_html.as_deref().unwrap_or_default());
                check_size("Body", &body, MAX_BODY_BYTES)?;
                let yjs = BASE64
                    .decode(node.yjs_state.as_deref().unwrap_or_default())
                    .map_err(|_| StoreError::Invalid("Invalid Yjs state.".into()))?;
                if yjs.len() > MAX_YJS_BYTES {
                    return Err(StoreError::Invalid("Yjs state is too large.".into()));
                }
                transaction.execute(
                    "INSERT INTO nodes(id, parent_id, position, tags_json, title, body_html, yjs_state, metadata_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
                    params![node.id, node.parent_id, position, serde_json::to_string(&clean_tags(node.tags.as_deref().unwrap_or_default())?)?, title, body, yjs, serde_json::to_string(node.metadata.as_ref().unwrap_or(&json!({})))?, timestamp],
                )?;
                normalize_positions(transaction, node.parent_id.as_deref())?;
            }
            DocumentOperation::UpdateNode { node_id, changes } => {
                if !node_exists(state, node_id) {
                    return Err(StoreError::Invalid("The node does not exist.".into()));
                }
                if let Some(title) = &changes.title {
                    transaction.execute(
                        "UPDATE nodes SET title = ?1 WHERE id = ?2",
                        params![clean_title(title, "Untitled idea")?, node_id],
                    )?;
                }
                if let Some(tags) = &changes.tags {
                    transaction.execute(
                        "UPDATE nodes SET tags_json = ?1 WHERE id = ?2",
                        params![serde_json::to_string(&clean_tags(tags)?)?, node_id],
                    )?;
                }
                if let Some(metadata) = &changes.metadata {
                    let value = serde_json::to_string(metadata)?;
                    check_size("Metadata", &value, MAX_METADATA_BYTES)?;
                    transaction.execute(
                        "UPDATE nodes SET metadata_json = ?1 WHERE id = ?2",
                        params![value, node_id],
                    )?;
                }
                transaction.execute(
                    "UPDATE nodes SET updated_at = ?1 WHERE id = ?2",
                    params![timestamp, node_id],
                )?;
            }
            DocumentOperation::UpdateBody {
                node_id,
                body_html,
                yjs_update,
                yjs_state,
            } => {
                if !node_exists(state, node_id) {
                    return Err(StoreError::Invalid("The node does not exist.".into()));
                }
                check_size("Body", body_html, MAX_BODY_BYTES)?;
                check_size("Yjs update", yjs_update, MAX_YJS_BYTES * 2)?;
                let _update = BASE64
                    .decode(yjs_update)
                    .map_err(|_| StoreError::Invalid("Invalid Yjs update.".into()))?;
                let yjs = BASE64
                    .decode(yjs_state)
                    .map_err(|_| StoreError::Invalid("Invalid Yjs state.".into()))?;
                if yjs.len() > MAX_YJS_BYTES {
                    return Err(StoreError::Invalid("Yjs state is too large.".into()));
                }
                let clean_html = ammonia::clean(body_html);
                transaction.execute(
                    "UPDATE nodes SET body_html = ?1, yjs_state = ?2, updated_at = ?3 WHERE id = ?4",
                    params![clean_html, yjs, timestamp, node_id],
                )?;
            }
            DocumentOperation::MoveNode {
                node_id,
                parent_id,
                index,
            } => {
                let node = state
                    .nodes
                    .iter()
                    .find(|node| node.id == *node_id)
                    .ok_or_else(|| StoreError::Invalid("The node does not exist.".into()))?;
                if let Some(parent_id) = parent_id {
                    if !node_exists(state, parent_id) {
                        return Err(StoreError::Invalid(
                            "The parent node does not exist.".into(),
                        ));
                    }
                    if descendants(state, node_id).contains(parent_id) {
                        return Err(StoreError::Invalid(
                            "A node cannot be moved into its descendant.".into(),
                        ));
                    }
                }
                let old_parent = node.parent_id.clone();
                transaction.execute(
                    "UPDATE nodes SET position = position + 1 WHERE parent_id IS ?1 AND deleted_at IS NULL AND position >= ?2 AND id <> ?3",
                    params![parent_id, (*index).max(0), node_id],
                )?;
                transaction.execute(
                    "UPDATE nodes SET parent_id = ?1, position = ?2, updated_at = ?3 WHERE id = ?4",
                    params![parent_id, (*index).max(0), timestamp, node_id],
                )?;
                normalize_positions(transaction, old_parent.as_deref())?;
                normalize_positions(transaction, parent_id.as_deref())?;
            }
            DocumentOperation::SoftDeleteNode { node_id } => {
                let node = state
                    .nodes
                    .iter()
                    .find(|node| node.id == *node_id)
                    .ok_or_else(|| StoreError::Invalid("The node does not exist.".into()))?;
                transaction.execute(
                    "WITH RECURSIVE subtree(id) AS (SELECT ?1 UNION ALL SELECT nodes.id FROM nodes JOIN subtree ON nodes.parent_id = subtree.id) UPDATE nodes SET deleted_at = ?2, updated_at = ?2 WHERE id IN (SELECT id FROM subtree)",
                    params![node_id, timestamp],
                )?;
                normalize_positions(transaction, node.parent_id.as_deref())?;
            }
            DocumentOperation::RestoreNode { node_id } => {
                let by_id: HashMap<&str, &DocumentNode> = state
                    .nodes
                    .iter()
                    .map(|node| (node.id.as_str(), node))
                    .collect();
                let mut current = Some(node_id.as_str());
                while let Some(id) = current {
                    let node = by_id
                        .get(id)
                        .ok_or_else(|| StoreError::Invalid("The node does not exist.".into()))?;
                    transaction.execute(
                        "UPDATE nodes SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
                        params![timestamp, id],
                    )?;
                    current = node.parent_id.as_deref();
                }
            }
            DocumentOperation::RenameDocument { title } => {
                transaction.execute(
                    "UPDATE metadata SET value = ?1 WHERE key = 'title'",
                    [clean_title(title, "Untitled document")?],
                )?;
            }
        }
        Ok(())
    }

    pub fn contributions(&self, query: ContributionQuery) -> Result<Vec<Contribution>> {
        let mut statement = self.connection.prepare(
            "SELECT c.id, c.revision, c.contributor_id, u.display_name, u.kind, c.session_id, c.group_id, c.timestamp, c.operation_type, c.affected_node_ids_json, c.payload_json, c.base_revision, c.resulting_hash, c.message FROM contributions c JOIN contributors u ON u.id = c.contributor_id ORDER BY c.revision DESC LIMIT 100000",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, i64>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, Option<String>>(13)?,
            ))
        })?;
        let mut result = Vec::new();
        for row in rows {
            let (
                id,
                revision,
                contributor_id,
                contributor_name,
                kind,
                session_id,
                group_id,
                timestamp,
                operation_type,
                affected_json,
                payload_json,
                base_revision,
                resulting_hash,
                message,
            ) = row?;
            let contribution = Contribution {
                id,
                revision,
                contributor_id,
                contributor_name,
                contributor_kind: ContributorKind::try_from(kind.as_str())
                    .map_err(StoreError::Invalid)?,
                session_id,
                group_id,
                timestamp,
                operation_type,
                affected_node_ids: serde_json::from_str(&affected_json)?,
                payload: serde_json::from_str(&payload_json)?,
                base_revision,
                resulting_hash,
                message,
            };
            if query
                .before_revision
                .is_some_and(|before| contribution.revision >= before)
            {
                continue;
            }
            if query
                .contributor_id
                .as_ref()
                .is_some_and(|id| contribution.contributor_id.as_str() != id)
            {
                continue;
            }
            if query
                .node_id
                .as_ref()
                .is_some_and(|id| !contribution.affected_node_ids.contains(id))
            {
                continue;
            }
            if let Some(search) = &query.search {
                let haystack = format!(
                    "{} {} {}",
                    contribution.operation_type,
                    contribution.contributor_name,
                    contribution.message.as_deref().unwrap_or_default()
                )
                .to_lowercase();
                if !haystack.contains(&search.to_lowercase()) {
                    continue;
                }
            }
            result.push(contribution);
            if result.len() >= query.limit.unwrap_or(200).min(100_000) {
                break;
            }
        }
        Ok(result)
    }

    pub fn restore(&mut self, revision: i64, context: ContributionContext) -> Result<DocumentView> {
        if self.read_only {
            return Err(StoreError::ReadOnly);
        }
        let before = load_state(&self.connection)?;
        if !before
            .contributors
            .iter()
            .any(|item| item.id == context.contributor_id)
        {
            return Err(StoreError::Invalid(
                "The contributor is not registered in this document.".into(),
            ));
        }
        let state_json: String = self
            .connection
            .query_row(
                "SELECT state_json FROM snapshots WHERE revision = ?1",
                [revision],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| StoreError::Invalid(format!("Revision {revision} is unavailable.")))?;
        let target: DocumentState = serde_json::from_str(&state_json)?;
        let timestamp = now();
        let new_revision = before.document.revision + 1;
        let transaction = self.connection.transaction()?;
        transaction.execute_batch("PRAGMA defer_foreign_keys = ON;")?;
        if let Some(session_id) = &context.session_id {
            transaction.execute("INSERT OR IGNORE INTO writing_sessions(id, contributor_id, started_at) VALUES (?1, ?2, ?3)", params![session_id, context.contributor_id, timestamp])?;
        }
        transaction.execute("DELETE FROM nodes", [])?;
        for node in &target.nodes {
            transaction.execute(
                "INSERT INTO nodes(id, parent_id, position, tags_json, title, body_html, yjs_state, metadata_json, created_at, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![node.id, node.parent_id, node.position, serde_json::to_string(&clean_tags(&node.tags)?)?, node.title, ammonia::clean(&node.body_html), BASE64.decode(&node.yjs_state).map_err(|_| StoreError::Invalid("Snapshot contains invalid Yjs state.".into()))?, serde_json::to_string(&node.metadata)?, node.created_at, node.updated_at, node.deleted_at],
            )?;
        }
        transaction.execute(
            "UPDATE metadata SET value = ?1 WHERE key = 'title'",
            [&target.document.title],
        )?;
        transaction.execute(
            "UPDATE metadata SET value = ?1 WHERE key = 'revision'",
            [new_revision.to_string()],
        )?;
        transaction.execute(
            "UPDATE metadata SET value = ?1 WHERE key = 'updated_at'",
            [&timestamp],
        )?;
        let restored = load_state(&transaction)?;
        let hash = state_hash(&restored)?;
        let affected: Vec<_> = restored.nodes.iter().map(|node| node.id.clone()).collect();
        transaction.execute(
            "INSERT INTO contributions(id, revision, contributor_id, session_id, group_id, timestamp, operation_type, affected_node_ids_json, payload_json, base_revision, resulting_hash, message) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'restoreRevision', ?7, ?8, ?9, ?10, ?11)",
            params![Uuid::new_v4().to_string(), new_revision, context.contributor_id, context.session_id, context.group_id, timestamp, serde_json::to_string(&affected)?, json!({"restoredRevision": revision}).to_string(), before.document.revision, hash, context.message.or_else(|| Some(format!("Restored revision {revision}")))],
        )?;
        insert_snapshot(&transaction, &restored, &hash, &timestamp)?;
        transaction.commit()?;
        self.view()
    }

    pub fn backup(&mut self, destination: &Path) -> Result<ExportResult> {
        if !self.read_only {
            self.connection.execute_batch("PRAGMA optimize;")?;
        }
        atomic_copy(&self.path, destination)?;
        Ok(ExportResult {
            path: destination.display().to_string(),
            bytes_written: fs::metadata(destination)?.len(),
        })
    }

    pub fn export(&self, format: &str, destination: &Path) -> Result<ExportResult> {
        let state = load_state(&self.connection)?;
        let bytes = match format {
            "json" => {
                #[derive(Serialize)]
                #[serde(rename_all = "camelCase")]
                struct RecoveryExport {
                    export_version: i64,
                    exported_at: String,
                    state: DocumentState,
                    contributions: Vec<Contribution>,
                }
                serde_json::to_vec_pretty(&RecoveryExport {
                    export_version: 1,
                    exported_at: now(),
                    state,
                    contributions: self.contributions(ContributionQuery {
                        limit: Some(100_000),
                        ..Default::default()
                    })?,
                })?
            }
            "markdown" => markdown(&state).into_bytes(),
            _ => return Err(StoreError::Invalid("Unsupported export format.".into())),
        };
        atomic_write(destination, &bytes)?;
        Ok(ExportResult {
            path: destination.display().to_string(),
            bytes_written: bytes.len() as u64,
        })
    }
}

fn atomic_write(destination: &Path, bytes: &[u8]) -> Result<()> {
    let parent = destination
        .parent()
        .ok_or_else(|| StoreError::Invalid("The destination has no parent folder.".into()))?;
    if !parent.is_dir() {
        return Err(StoreError::Invalid(
            "The destination folder does not exist.".into(),
        ));
    }
    let temporary = parent.join(format!(".coedit-write-{}.tmp", Uuid::new_v4()));
    let mut file = File::create(&temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    replace_file(&temporary, destination)
}

fn atomic_copy(source: &Path, destination: &Path) -> Result<()> {
    let parent = destination
        .parent()
        .ok_or_else(|| StoreError::Invalid("The destination has no parent folder.".into()))?;
    if !parent.is_dir() {
        return Err(StoreError::Invalid(
            "The destination folder does not exist.".into(),
        ));
    }
    let temporary = parent.join(format!(".coedit-copy-{}.tmp", Uuid::new_v4()));
    fs::copy(source, &temporary)?;
    File::options().write(true).open(&temporary)?.sync_all()?;
    replace_file(&temporary, destination)
}

fn replace_file(temporary: &Path, destination: &Path) -> Result<()> {
    if !destination.exists() {
        fs::rename(temporary, destination)?;
        return Ok(());
    }
    let previous = destination.with_extension(format!("replace-{}", Uuid::new_v4()));
    fs::rename(destination, &previous)?;
    match fs::rename(temporary, destination) {
        Ok(()) => {
            fs::remove_file(previous)?;
            Ok(())
        }
        Err(error) => {
            let _ = fs::rename(&previous, destination);
            let _ = fs::remove_file(temporary);
            Err(error.into())
        }
    }
}

fn plain_text(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for character in html.chars() {
        match character {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                result.push(' ');
            }
            _ if !in_tag => result.push(character),
            _ => {}
        }
    }
    result
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn markdown(state: &DocumentState) -> String {
    fn visit(state: &DocumentState, parent: Option<&str>, depth: usize, output: &mut String) {
        let mut children: Vec<_> = state
            .nodes
            .iter()
            .filter(|node| node.parent_id.as_deref() == parent && node.deleted_at.is_none())
            .collect();
        children.sort_by(|left, right| {
            left.position
                .cmp(&right.position)
                .then_with(|| left.id.cmp(&right.id))
        });
        for node in children {
            output.push_str(&format!(
                "{} {}\n\n",
                "#".repeat((depth + 2).min(6)),
                node.title
            ));
            let text = plain_text(&node.body_html);
            if !text.is_empty() {
                output.push_str(&text);
                output.push_str("\n\n");
            }
            visit(state, Some(&node.id), depth + 1, output);
        }
    }
    let mut output = format!("# {}\n\n", state.document.title);
    visit(state, None, 0, &mut output);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn human() -> Contributor {
        Contributor {
            id: "test-author".into(),
            display_name: "Test Author".into(),
            kind: ContributorKind::Human,
            created_at: now(),
        }
    }

    fn context(message: &str) -> ContributionContext {
        ContributionContext {
            contributor_id: "test-author".into(),
            session_id: Some("test-session".into()),
            group_id: None,
            message: Some(message.into()),
        }
    }

    #[test]
    fn rejects_tree_cycles() {
        let timestamp = now();
        let nodes = vec![
            DocumentNode {
                id: "a".into(),
                parent_id: Some("b".into()),
                position: 0,
                tags: vec![],
                title: "A".into(),
                body_html: "".into(),
                yjs_state: "".into(),
                metadata: json!({}),
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
                deleted_at: None,
            },
            DocumentNode {
                id: "b".into(),
                parent_id: Some("a".into()),
                position: 0,
                tags: vec![],
                title: "B".into(),
                body_html: "".into(),
                yjs_state: "".into(),
                metadata: json!({}),
                created_at: timestamp.clone(),
                updated_at: timestamp,
                deleted_at: None,
            },
        ];
        assert!(validate_tree(&nodes).is_err());
    }

    #[test]
    fn removes_executable_html() {
        let clean =
            ammonia::clean("<p>Hello<img src=x onerror=alert(1)><script>alert(2)</script></p>");
        assert!(!clean.contains("onerror"));
        assert!(!clean.contains("script"));
    }

    #[test]
    fn portable_document_round_trip_preserves_history() {
        let directory = std::env::temp_dir().join(format!("coedit-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let document_path = directory.join("report.coedit");
        let backup_path = directory.join("report.coedit-backup");
        let json_path = directory.join("report.json");
        let markdown_path = directory.join("report.md");

        let mut store =
            DocumentStore::create(document_path.clone(), "Report".into(), human()).unwrap();
        store
            .apply(
                DocumentOperation::CreateNode {
                    node: crate::models::NewNode {
                        id: "introduction".into(),
                        parent_id: None,
                        tags: Some(vec!["section".into()]),
                        title: "Introduction".into(),
                        body_html: None,
                        yjs_state: None,
                        metadata: None,
                    },
                    index: None,
                },
                context("Added introduction"),
            )
            .unwrap();
        store
            .apply(
                DocumentOperation::UpdateBody {
                    node_id: "introduction".into(),
                    body_html: "<p>Temporary body</p>".into(),
                    yjs_update: "".into(),
                    yjs_state: "".into(),
                },
                context("Drafted introduction"),
            )
            .unwrap();
        let restored = store.restore(1, context("Restored first draft")).unwrap();
        assert_eq!(restored.state.document.revision, 3);
        assert_eq!(restored.state.nodes[0].title, "Introduction");
        assert_eq!(restored.state.nodes[0].body_html, "");
        assert_eq!(
            store
                .contributions(ContributionQuery::default())
                .unwrap()
                .len(),
            4
        );
        store.backup(&backup_path).unwrap();
        store.export("json", &json_path).unwrap();
        store.export("markdown", &markdown_path).unwrap();
        drop(store);

        let reopened = DocumentStore::open(document_path).unwrap();
        let view = reopened.view().unwrap();
        assert_eq!(view.state.document.title, "Report");
        assert_eq!(view.state.nodes[0].id, "introduction");
        assert!(backup_path.is_file());
        assert!(fs::read_to_string(json_path)
            .unwrap()
            .contains("restoreRevision"));
        assert!(fs::read_to_string(markdown_path)
            .unwrap()
            .contains("Introduction"));

        drop(reopened);
        fs::remove_dir_all(directory).unwrap();
    }
}
