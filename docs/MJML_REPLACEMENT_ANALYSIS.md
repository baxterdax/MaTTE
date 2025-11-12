# MJML Replacement Analysis: Handlebars + HTML-Crush vs Current Stack

## Current Architecture

### MJML Usage Pattern
- **File**: `src/utils/templateRenderer.ts`
- **Method**: `TemplateRenderer.processMjml(mjmlContent: string): string`
- **Dependency**: MJML 4.16.1 (latest stable)
- **Integration**: Optional template engine (`engine: 'handlebars' | 'mjml'`)
- **Vulnerability**: html-minifier REDoS (GHSA-pfq8-rq6v-vf5m) in transitive dependencies
  - Cannot be fixed in 4.x stable (only 5.x alphas available)
  - Affects 31 high-severity npm audit entries

### Current Template Flow
1. User creates template with `engine: 'handlebars' | 'mjml'`
2. Store template content in `tenant_templates.content`
3. On render:
   - Compile template with Handlebars (all data substitution)
   - If MJML engine: Pass to `mjml2html()` for markup→HTML compilation
   - Inline CSS with `juice`
   - Sanitize with DOMPurify
   - Generate plaintext with `html-to-text`

### MJML's Core Function
MJML is a **markup-to-HTML framework** (like a DSL for responsive emails):
- Input: `<mjml><mj-body><mj-text>Hello</mj-text></mj-body></mjml>`
- Output: Fully responsive HTML with media queries, inlined styles, etc.
- **NOT just for minification** - it's a complete template language

### html-crush Alternative
**Purpose**: Minify/compress HTML (remove whitespace, unnecessary attributes)
- Input: `<div>  Hello  </div>`
- Output: `<div>Hello</div>`
- **Cannot replace MJML** - html-crush only crushes existing HTML, doesn't transform markup DSL

## Three Options Compared

### Option A: Keep MJML, Accept Vulnerability ✅ Current State
**Pros:**
- No code changes required
- MJML templates continue working
- Handlebars templates unaffected
- All tests pass
- Single moderate CVE (nodemailer) fixed

**Cons:**
- 31 high-severity npm audit entries (dependency chain)
- REDoS vulnerability is low-probability in practice (requires malicious email template)
- Carries security debt

**Best For:** Production deployments that prioritize stability over audit perfection

---

### Option B: Migrate to MJML 5.x Alpha ⚠️ High Risk
**Approach:**
1. Update `package.json`: `mjml: "^5.0.0-alpha.4"`
2. Regenerate lockfile
3. Test for breaking changes in template rendering
4. Update documentation

**Pros:**
- Resolves html-minifier vulnerability chain
- npm audit would show ~0 vulnerabilities
- No code changes needed (MJML API should be compatible)

**Cons:**
- Alpha software in production = unstable
- Potential breaking changes not yet documented
- MJML project actively developing v5 with possible future changes
- **NOT recommended for production**

**Risk Level:** 🔴 HIGH

---

### Option C: Deprecate MJML, Use Pure Handlebars ✅ Safest Long-term
**Approach:**
1. Remove MJML dependency from `package.json`
2. Update `TemplateRenderer.ts` to reject `engine: 'mjml'` or convert MJML→HTML separately
3. Users create templates in **standard HTML + Handlebars**
4. Apply html-crush for minification (optional)
5. Keep juice, DOMPurify, html-to-text as utilities

**Code Changes:**
```typescript
// Before (Option A/B)
if (templateRecord.engine === 'mjml') {
  renderedContent = this.processMjml(renderedContent);
}

// After (Option C)
if (templateRecord.engine === 'mjml') {
  throw new AppError('MJML engine deprecated. Please convert to Handlebars + HTML.', 400);
}
// OR: Remove the check entirely, only support 'handlebars'
```

**HTML Output Comparison:**
- **MJML Input**: `<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>`
- **MJML Output**: Full responsive HTML with media queries, Outlook fallbacks
- **HTML+Handlebars Input**: `<table role="presentation"><tr><td><p>Hello</p></td></tr></table>`
- **HTML+Handlebars Output**: Same (user controls)

**Pros:**
- ✅ Zero transitive vulnerabilities from MJML
- ✅ Simpler dependency graph (remove mjml, juice maybe)
- ✅ Full control over output HTML
- ✅ Users learn standard HTML instead of MJML DSL
- ✅ Removes 31 high-severity audit items
- ✅ Production-ready (no alphas)

**Cons:**
- ❌ Breaking change for existing MJML templates
- ❌ Users lose MJML's responsive email helpers
- ❌ Requires migration guide for existing deployments
- ❌ More manual HTML work for complex layouts

**Effort:** Medium (1-2 days development + testing + documentation)

**Best For:** New deployments, teams comfortable with HTML, security-first orgs

---

## Recommendation: Hybrid Approach (Option C + D)

### Option D: Keep MJML Separate, Optional Feature
**Hybrid**: Support both engines, but make MJML optional
1. Keep current implementation as-is for backward compatibility
2. Add **template conversion tool** to migrate MJML→HTML
3. New templates default to `engine: 'handlebars'`
4. Document MJML as "legacy/optional"
5. Eventually deprecate MJML (timeline: 12+ months)

**Package.json Changes:**
- Move mjml to optional dependencies or separate security-only installs
- Document the audit limitation

**Benefits:**
- ✅ Backward compatible with existing MJML templates
- ✅ Allows gradual migration
- ✅ New users don't learn MJML
- ✅ Path to zero vulnerabilities over time
- ✅ No breaking changes immediately

**Timeline:**
1. **Now**: Document MJML limitation, add deprecation warning
2. **v1.2.0**: Add conversion tool (MJML template → HTML)
3. **v2.0.0**: Default to handlebars only, MJML as optional/legacy

---

## Implementation Steps for Chosen Option

### For Option C (Full MJML Deprecation):
1. **Step 1**: Create new branch `chore/remove-mjml-dependency`
2. **Step 2**: Update `package.json` - remove mjml
3. **Step 3**: Update `templateRenderer.ts`:
   - Remove `mjml2html` require
   - Remove `processMjml()` method
   - Update `renderTemplate()` to throw on MJML engine
4. **Step 4**: Update `templateController.ts` - remove 'mjml' from engine validation
5. **Step 5**: Update tests:
   - Remove/update MJML-specific tests
   - Add test for rejection of MJML engine
6. **Step 6**: Update database schema/docs to note engine change
7. **Step 7**: Run full test suite (should pass ~30/34 after removing MJML tests)
8. **Step 8**: Create PR, document migration path

### For Option D (Hybrid):
Same as Option C, but:
- **Keep** mjml in `package.json` with warning in comments
- **Don't reject** MJML engine, just mark deprecated in logs
- **Add** conversion utility/docs
- Gradual timeline vs. immediate removal

---

## Dependency Impact Analysis

### Current Dependencies (MJML included)
```
mjml@4.16.1
├── mjml-cli (vulnerable)
├── mjml-core (vulnerable html-minifier)
│   ├── html-minifier@4.0.0 ⚠️ CVE: REDoS (GHSA-pfq8-rq6v-vf5m)
│   └── ...
├── mjml-accordion, mjml-body, mjml-button, etc.
└── mjml-preset-core (brings in all components)
```

### After Option C (MJML removed)
- html-minifier: ✅ REMOVED (not used elsewhere)
- npm audit result: **CLEAN** (0 high-severity via MJML)
- Package count: -27 packages (~200→173)

### html-crush Use Case
If wanted for minification instead of MJML:
```typescript
import { crush } from 'html-crush';

const result = crush(renderedContent, { removeLineBreaks: true });
// Only minifies, doesn't transform markup
```

---

## Decision Matrix

| Factor | Keep (A) | Alpha (B) | Remove (C) | Hybrid (D) |
|--------|----------|----------|-----------|-----------|
| Security Risk | 🔴 High | 🟡 Med | 🟢 None | 🟡 Med |
| Stability | 🟢 High | 🔴 Low | 🟢 High | 🟢 High |
| Backward Compat | 🟢 Yes | 🟢 Yes | 🔴 No | 🟢 Yes |
| Audit Friendly | 🔴 No | 🟢 Yes | 🟢 Yes | 🟡 Partial |
| Migration Effort | 🟢 None | 🟡 Med | 🟡 Med | 🟢 Low |
| Prod Ready | 🟢 Yes | 🔴 No | 🟢 Yes | 🟢 Yes |

---

## Conclusion

**Recommended**: **Option D (Hybrid)** for existing deployments, **Option C (Full Removal)** for net-new projects

- **Short-term** (weeks): Document MJML limitation, merge PR #4 (nodemailer fix)
- **Medium-term** (months): Create migration guide, deprecation warnings
- **Long-term** (1-2 years): Remove MJML entirely, achieve audit-clean status

**For this session**: Merge current PRs (#1, #3, #4) as-is. Schedule MJML migration as separate epic.
