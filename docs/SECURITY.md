# Security model

## Defaults

- No local HTTP server
- No remote JavaScript, stylesheets, fonts, images, or frames
- No network-capable Tauri plugin or AI provider
- Production CSP denies ordinary network connections
- Vite development server binds to loopback only
- File access occurs only through explicit native dialogs and narrow Tauri commands
- HTML is sanitized with DOMPurify before persistence and independently sanitized with Ammonia in Rust
- Document mutations have size limits, tree validation, transactions, and contributor attribution

## Trust boundaries

`.coedit` files and imported HTML are untrusted input. Opening a document validates its SQLite application ID, schema version, integrity, metadata marker, node types, JSON, and hierarchy. Rich text is never evaluated as JSX or inserted as arbitrary executable application code.

The local contributor profile in browser storage contains only a random identifier and display name. Secrets and AI credentials must not be stored there.

## Future network features

AI and collaboration must remain opt-in. A future provider must:

1. display its endpoint and the content being sent;
2. require an explicit user action for each request;
3. validate protocols and block unexpected redirects or private-network targets where applicable;
4. preview returned changes before applying them;
5. attribute accepted changes to both the provider and approving human;
6. remain outside the base application's CSP and capability set until enabled by a dedicated build or permission flow.

Report vulnerabilities privately to the project maintainers before public disclosure.

