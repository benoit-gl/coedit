from pathlib import Path

# Exact corrections found in manual review.
p = Path('docs/MVP_IMPLEMENTATION_SPEC.md')
t = p.read_text(encoding='utf-8')
t = t.replace('Every valid Media Type other than the recognized Coedit collaborative-text type initially uses generic opaque handling:', 'Every valid Media Type whose normalized type/subtype is not in the fine-grained allowlist initially uses generic opaque handling:')
t = t.replace('deferred in section 9.1 of that authority', 'deferred in section 10.1 of that authority')
p.write_text(t, encoding='utf-8')

p = Path('docs/PRODUCT_DOMAIN_MODEL.md')
t = p.read_text(encoding='utf-8').replace('### 4.8 Copy and move preserve different identities', '### 4.7 Copy and move preserve different identities').replace('### 4.9 Durable Range references are allowlisted fine-grained text values', '### 4.8 Durable Range references are allowlisted fine-grained text values')
p.write_text(t, encoding='utf-8')

# Keep Gate B references aligned with the renumbered payload authority.
for name in ['SCAFFOLDING_PLAN.md','docs/MVP_VERIFICATION_PLAN.md','docs/PRESERVED_BRANCH_RECONCILIATION.md']:
    p=Path(name); t=p.read_text(encoding='utf-8'); t=t.replace('INLINE_CONTENT_PAYLOADS.md` section 9.1','INLINE_CONTENT_PAYLOADS.md` section 10.1'); p.write_text(t,encoding='utf-8')

# Semantic audit of current (non-historical) authorities.
files=[Path('README.md'),Path('SCAFFOLDING_PLAN.md'),*Path('docs').glob('*.md'),Path('docs/decisions/0010-typed-inline-content-payloads.md')]
for p in files:
    t=p.read_text(encoding='utf-8')
    for forbidden in ['application/vnd.coedit.text','recognized Coedit collaborative-text type','intrinsic internal-link mark','native formatting semantics']:
        if forbidden in t:
            raise SystemExit(f'{p}: forbidden active contract phrase: {forbidden}')
# Focused docs must not claim engine-owned formatting.
for name in ['docs/INLINE_CONTENT_PAYLOADS.md','docs/PRODUCT_DOMAIN_MODEL.md','docs/MVP_CONTRACT.md','docs/MVP_ARCHITECTURE.md','docs/MVP_IMPLEMENTATION_SPEC.md','docs/MARKDOWN_INTERCHANGE.md']:
    t=Path(name).read_text(encoding='utf-8')
    for forbidden in ['intrinsic formatting marks','Formatting marks commit atomically','formatting-only side channel','fine-grained text and formatting operations']:
        if forbidden in t:
            raise SystemExit(f'{name}: stale formatting contract: {forbidden}')
