#!/usr/bin/env bash
set -e

# ANSI Color Codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${RED}${BOLD}======================================================${NC}"
echo -e "${RED}${BOLD}   ⚠️  WARNING: DESTRUCTIVE GIT REPOSITORY RESET  ⚠️   ${NC}"
echo -e "${RED}${BOLD}======================================================${NC}"
echo ""
echo -e "This script will perform the following actions:"
echo -e " 1. Verify there are no uncommitted changes in your working tree."
echo -e " 2. Switch to the ${BOLD}main${NC} branch."
echo -e " 3. Fetch latest changes from ${BOLD}origin/main${NC} and reset local main to match remote exactly."
echo -e " 4. ${RED}${BOLD}DELETE ALL local branches${NC} (except main)."
echo -e " 5. Create and switch to a fresh ${BOLD}dev${NC} branch branched directly off ${BOLD}main${NC}."
echo ""

# Ensure we are in a git repository and navigate to the repo root
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo -e "${RED}Error: Not inside a Git repository.${NC}"
  exit 1
fi
cd "$(git rev-parse --show-toplevel)"

# Check if origin remote is configured
if ! git remote get-url origin >/dev/null 2>&1; then
  echo -e "${RED}Error: Git remote 'origin' is not configured.${NC}"
  exit 1
fi

# Check for uncommitted / unstaged / untracked changes
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}${BOLD}Error: You have uncommitted changes or untracked files!${NC}"
  echo ""
  git status --short
  echo ""
  echo -e "${YELLOW}Please commit, stash, or discard your changes before running this script.${NC}"
  exit 1
fi

# Fetch list of local branches other than main
BRANCHES_TO_DELETE=$(git branch --format="%(refname:short)" | grep -v -E '^main$' || true)

if [ -n "$BRANCHES_TO_DELETE" ]; then
  echo -e "${YELLOW}${BOLD}The following local branch(es) will be PERMANENTLY DELETED:${NC}"
  while IFS= read -r branch; do
    echo -e "  - ${RED}${branch}${NC}"
  done <<< "$BRANCHES_TO_DELETE"
  echo ""
  echo -e "${RED}${BOLD}RISK: Any unpushed commits on these branches will be LOST!${NC}"
else
  echo -e "${BLUE}No other local branches found to delete.${NC}"
fi
echo ""

# Require explicit "YES" confirmation
echo -e "${YELLOW}Are you sure you want to proceed? Type ${BOLD}YES${NC}${YELLOW} (in all caps) to continue:${NC} "
read -r CONFIRMATION </dev/tty || read -r CONFIRMATION

if [ "$CONFIRMATION" != "YES" ]; then
  echo -e "${BLUE}Operation aborted. No changes were made.${NC}"
  exit 0
fi

echo ""
echo -e "${BLUE}==> Switching to main...${NC}"
git checkout main

echo -e "${BLUE}==> Fetching origin/main...${NC}"
git fetch origin main

echo -e "${BLUE}==> Resetting local main to origin/main...${NC}"
git reset --hard origin/main

if [ -n "$BRANCHES_TO_DELETE" ]; then
  echo -e "${BLUE}==> Deleting local branches...${NC}"
  while IFS= read -r branch; do
    git branch -D "$branch"
  done <<< "$BRANCHES_TO_DELETE"
fi

echo -e "${BLUE}==> Creating and checking out fresh dev branch from main...${NC}"
git checkout -B dev main

echo ""
echo -e "${GREEN}${BOLD}✓ Success!${NC} You are now on a clean ${BOLD}dev${NC} branch synced with ${BOLD}origin/main${NC}."
echo ""
