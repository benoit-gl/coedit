use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const FORMAT_VERSION: i64 = 1;
pub const APPLICATION_ID: i64 = 0x434F4544;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contributor {
    pub id: String,
    pub display_name: String,
    pub kind: ContributorKind,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContributorKind {
    Human,
    Automation,
    Ai,
    Imported,
}

impl ContributorKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Human => "human",
            Self::Automation => "automation",
            Self::Ai => "ai",
            Self::Imported => "imported",
        }
    }
}

impl TryFrom<&str> for ContributorKind {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "human" => Ok(Self::Human),
            "automation" => Ok(Self::Automation),
            "ai" => Ok(Self::Ai),
            "imported" => Ok(Self::Imported),
            _ => Err(format!("Unknown contributor kind: {value}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingSession {
    pub id: String,
    pub contributor_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
    pub id: String,
    pub title: String,
    pub format_version: i64,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub position: i64,
    pub tags: Vec<String>,
    pub title: String,
    pub summary: String,
    pub content_html: String,
    pub yjs_state: String,
    pub metadata: Value,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentState {
    pub document: DocumentMetadata,
    pub nodes: Vec<DocumentNode>,
    pub contributors: Vec<Contributor>,
    pub sessions: Vec<WritingSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentView {
    #[serde(flatten)]
    pub state: DocumentState,
    pub path: Option<String>,
    pub read_only: bool,
    pub recovery_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub title: String,
    pub summary: Option<String>,
    pub content_html: Option<String>,
    pub yjs_state: Option<String>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeChanges {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub tags: Option<Vec<String>>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DocumentOperation {
    CreateNode {
        node: NewNode,
        index: Option<i64>,
    },
    UpdateNode {
        node_id: String,
        changes: NodeChanges,
    },
    UpdateContent {
        node_id: String,
        content_html: String,
        yjs_update: String,
        yjs_state: String,
    },
    MoveNode {
        node_id: String,
        parent_id: Option<String>,
        index: i64,
    },
    SoftDeleteNode {
        node_id: String,
    },
    RestoreNode {
        node_id: String,
    },
    RenameDocument {
        title: String,
    },
}

impl DocumentOperation {
    pub fn operation_type(&self) -> &'static str {
        match self {
            Self::CreateNode { .. } => "createNode",
            Self::UpdateNode { .. } => "updateNode",
            Self::UpdateContent { .. } => "updateContent",
            Self::MoveNode { .. } => "moveNode",
            Self::SoftDeleteNode { .. } => "softDeleteNode",
            Self::RestoreNode { .. } => "restoreNode",
            Self::RenameDocument { .. } => "renameDocument",
        }
    }

    pub fn affected_node_ids(&self) -> Vec<String> {
        match self {
            Self::CreateNode { node, .. } => vec![node.id.clone()],
            Self::UpdateNode { node_id, .. }
            | Self::UpdateContent { node_id, .. }
            | Self::MoveNode { node_id, .. }
            | Self::SoftDeleteNode { node_id }
            | Self::RestoreNode { node_id } => vec![node_id.clone()],
            Self::RenameDocument { .. } => Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributionContext {
    pub contributor_id: String,
    pub session_id: Option<String>,
    pub group_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contribution {
    pub id: String,
    pub revision: i64,
    pub contributor_id: String,
    pub contributor_name: String,
    pub contributor_kind: ContributorKind,
    pub session_id: Option<String>,
    pub group_id: Option<String>,
    pub timestamp: String,
    pub operation_type: String,
    pub affected_node_ids: Vec<String>,
    pub payload: Value,
    pub base_revision: i64,
    pub resulting_hash: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributionQuery {
    pub search: Option<String>,
    pub node_id: Option<String>,
    pub contributor_id: Option<String>,
    pub before_revision: Option<i64>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub bytes_written: u64,
}
