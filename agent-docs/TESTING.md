# Testing Documentation Discoverability

Verify that AI tools can discover, read, and navigate the documentation system.

---

## Automated Tests (Run These)

### 1. **Link Validation** — Verify all markdown links exist

```bash
cd /Users/chandrasjr/Documents/SparkyApps/SparkyFitness

# Check that all agent-docs are referenced from AGENTS.md
grep -c "agent-docs" AGENTS.md
# Expected: At least 5 references (in top section + cross-references)

# Check that agent-docs/README.md is linked from root AGENTS.md
grep "agent-docs/README.md" AGENTS.md
# Expected: Link appears early (line 5-11)

# Verify all docs in agent-docs/ actually exist
for doc in file-and-domain-reference.md testing-patterns.md architecture-permissions.md data-flow-patterns.md new-domain-template.md new-migration-checklist.md plan-review-checklist.md anti-patterns.md README.md; do
  [ -f "agent-docs/$doc" ] && echo "✓ $doc" || echo "✗ $doc MISSING"
done

# Verify all links in agent-docs/README.md point to real files
grep -o '`[^`]*\.md`' agent-docs/README.md | sed 's/`//g' | while read doc; do
  [ -f "agent-docs/$doc" ] && echo "✓ $doc" || echo "✗ $doc MISSING"
done
```

### 2. **Markdown Syntax Validation** — Check formatting is correct

```bash
# Verify markdown tables are properly formatted
grep -c "| Doc | Duration" agent-docs/README.md
# Expected: 1 (the main table)

# Check for broken relative paths
grep -o '\[.*\](.*\.md)' agent-docs/*.md | grep -v "^\[.*\]" || echo "All links valid"

# Verify no orphaned links (links to non-existent files)
grep -oE '\]\(\.\.?/[^)]+\)' agent-docs/*.md | sort -u
# Manually verify each path exists
```

### 3. **Discoverability Check** — Verify key docs are referenced early

```bash
# Check that file-and-domain-reference.md is mentioned in top 15 lines of root AGENTS.md
head -15 AGENTS.md | grep -c "file-and-domain-reference"
# Expected: At least 1

# Check that testing-patterns.md is mentioned in top 15 lines of root AGENTS.md
head -15 AGENTS.md | grep -c "testing-patterns"
# Expected: At least 1

# Check that Server AGENTS.md links to agent-docs
head -20 SparkyFitnessServer/AGENTS.md | grep -c "agent-docs"
# Expected: At least 1
```

---

## Manual Tests (Do These Once)

### 1. **Simulate AI Tool Discovery**

**Step 1: Start fresh**
```bash
# Pretend you're an AI tool entering the repo for the first time
# Read: ./AGENTS.md (first 30 lines)
head -30 AGENTS.md

# Question: Can you find a link to agent-docs/README.md?
# Expected: Yes, in the first 11 lines
```

**Step 2: Follow the link**
```bash
# Read: agent-docs/README.md
cat agent-docs/README.md | head -50

# Question: Can you find all 9 docs listed with their purpose?
# Expected: Yes, in the navigation table
```

**Step 3: Read one example doc**
```bash
# Read: agent-docs/file-and-domain-reference.md (first 50 lines)
head -50 agent-docs/file-and-domain-reference.md

# Question: Is it clear and navigable?
# Expected: Yes, has domain tables with file paths
```

### 2. **Test Each Link Manually**

```bash
# Verify each link in AGENTS.md's "For AI Tools" section works
grep "agent-docs" AGENTS.md | head -5

# For each link, verify the file exists and is readable
cat agent-docs/file-and-domain-reference.md > /dev/null && echo "✓ Readable"
cat agent-docs/testing-patterns.md > /dev/null && echo "✓ Readable"
cat agent-docs/architecture-permissions.md > /dev/null && echo "✓ Readable"
```

### 3. **Test with Real AI Tools** (The Real Test)

**With Claude Code or Claude Web:**
```
1. Open the repo
2. Ask: "Where's the code for medications?"
3. Expect: Agent reads AGENTS.md, finds agent-docs/file-and-domain-reference.md, 
           navigates to Medications row, gives you exact file paths
4. Check: Does it work without you telling it where to look?
```

**With Gemini:**
```
1. Same as above
2. Verify Gemini also discovers the same docs
```

---

## Automated Validation Script

```bash
#!/bin/bash
# Save as: validate-docs.sh

set -e
cd "$(git rev-parse --show-toplevel)"

echo "=== Documentation Validation ==="
echo ""

# 1. Check all referenced docs exist
echo "1. Checking all referenced docs exist..."
missing=0
for doc in file-and-domain-reference.md testing-patterns.md architecture-permissions.md data-flow-patterns.md new-domain-template.md new-migration-checklist.md plan-review-checklist.md anti-patterns.md README.md; do
  if [ ! -f "agent-docs/$doc" ]; then
    echo "   ✗ Missing: agent-docs/$doc"
    missing=$((missing + 1))
  fi
done
[ $missing -eq 0 ] && echo "   ✓ All docs present" || exit 1

# 2. Check AGENTS.md has early reference
echo "2. Checking AGENTS.md discoverability..."
if head -15 AGENTS.md | grep -q "agent-docs/README.md"; then
  echo "   ✓ agent-docs/README.md referenced in top 15 lines"
else
  echo "   ✗ agent-docs/README.md NOT found in top 15 lines"
  exit 1
fi

# 3. Check Server AGENTS.md has reference
echo "3. Checking SparkyFitnessServer/AGENTS.md discoverability..."
if head -20 SparkyFitnessServer/AGENTS.md | grep -q "agent-docs"; then
  echo "   ✓ agent-docs referenced in SparkyFitnessServer/AGENTS.md"
else
  echo "   ✗ agent-docs NOT referenced in SparkyFitnessServer/AGENTS.md"
  exit 1
fi

# 4. Check agent-docs/README.md exists and has navigation table
echo "4. Checking agent-docs/README.md structure..."
if grep -q "| Doc | Duration" agent-docs/README.md; then
  echo "   ✓ Navigation table present"
else
  echo "   ✗ Navigation table NOT found"
  exit 1
fi

# 5. Check critical docs are referenced somewhere
echo "5. Checking critical docs are referenced..."
critical_docs=("file-and-domain-reference" "testing-patterns" "architecture-permissions")
for doc in "${critical_docs[@]}"; do
  if grep -r "$doc" AGENTS.md agent-docs/README.md > /dev/null; then
    echo "   ✓ $doc referenced"
  else
    echo "   ✗ $doc NOT referenced"
    exit 1
  fi
done

echo ""
echo "✅ All documentation validation checks passed!"
```

Run it:
```bash
bash validate-docs.sh
```

---

## What to Verify

| Test | How | Expected Result |
|------|-----|---|
| **Link validity** | `validate-docs.sh` | All links resolve ✓ |
| **Early discovery** | `head -15 AGENTS.md` | agent-docs/README.md in top section ✓ |
| **Navigation clarity** | Read agent-docs/README.md | Can find any doc in < 1 min ✓ |
| **Path accuracy** | Read file-and-domain-reference.md | File paths are correct ✓ |
| **AI tool test** | Ask Claude/Gemini a question | Finds docs without your help ✓ |

---

## Quick Check (30 seconds)

```bash
# Copy-paste this to validate everything at once:

cd /Users/chandrasjr/Documents/SparkyApps/SparkyFitness && \
echo "🔍 Checking links..." && \
for doc in file-and-domain-reference.md testing-patterns.md architecture-permissions.md data-flow-patterns.md new-domain-template.md new-migration-checklist.md plan-review-checklist.md anti-patterns.md README.md; do
  [ -f "agent-docs/$doc" ] || echo "MISSING: $doc"
done && \
echo "✓ All docs present" && \
echo "" && \
echo "🔍 Checking discoverability..." && \
head -15 AGENTS.md | grep -q "agent-docs/README.md" && echo "✓ Root AGENTS.md links to agent-docs/README.md" || echo "✗ Link not found" && \
head -20 SparkyFitnessServer/AGENTS.md | grep -q "agent-docs" && echo "✓ Server AGENTS.md links to agent-docs" || echo "✗ Link not found" && \
grep -q "| Doc | Duration" agent-docs/README.md && echo "✓ Navigation table present" || echo "✗ Table not found" && \
echo "" && \
echo "✅ Documentation validation complete!"
```

---

## The Real Test: Ask Claude or Gemini

Go to Claude Code or Gemini AI, point it at your repo, and ask one of these:

1. **"Where's the code for the Medications feature?"**
   - Should find: agent-docs/file-and-domain-reference.md → Medications row
   - Should return: Exact file paths for backend, frontend, mobile

2. **"How do I write a test for a new route?"**
   - Should find: agent-docs/testing-patterns.md
   - Should return: Concrete supertest example

3. **"What permission type does fasting use?"**
   - Should find: agent-docs/architecture-permissions.md
   - Should return: Permission matrix with answer

If the AI tool finds the docs and gives you the answer without you having to tell it where to look, **the discoverability is working.**
