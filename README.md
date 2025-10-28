# 🥞 pr-stacker

> What are stacked PR's? Learn more at [stacking.dev](https://www.stacking.dev/)

**Stacked Pull Requests meet GitHub's merge limitations.**

Stacked PRs (small, incremental changes built on top of each other) are a best practice for breaking down large features into reviewable chunks. However, GitHub's merge strategy enforcement creates a painful dilemma.

### Why Squash Merging is Standard
Most repositories enforce "squash merge only" for valid reasons:

![image](https://github.com/user-attachments/assets/1613f276-7e8d-45ae-9a6c-50a9d728840c)

- 👎 **Rebase merging** creates noisy, unstructured commit histories
- 👎 **Merge commits** add clutter and are controversial
- 👍 **Squash merging** keeps the main branch clean with one commit per feature

### The Stacked PR Dilemma
When you have a stack of PRs (PR1 → PR2 → PR3 → main) and can only squash merge:

**Option 1: Merge sequentially**
- Merge PR1, wait for CI
- Restack PR2 on main, wait for CI
- Restack PR3 on main, wait for CI
- Repeat for every PR in the stack

**Problems:**
- ❌ Extremely tedious manual process
- ❌ Expensive (multiple CI runs)
- ❌ Time-consuming (sequential waiting)

**Option 2: "Fold" PRs together**
- Fold PR3 into PR2, then PR2 into PR1
- Squash everything into one mega-PR
- Merge to main

**Problems:**
- ❌ **All commit history is lost** - your careful breakdown is gone
- ❌ **All PRs except the last are closed without being "merged"** - no merge records
- ❌ **All work history consolidated into one PR** - difficult to trace changes later

## The Solution

**pr-stacker automates the "proper" way to merge stacked PRs while preserving complete history.**

Simply comment `/stackbot fold` on any PR in your stack, and the bot:
1. Squashes each PR into a single commit (using PR title/body as commit message)
2. Sequentially rebases each commit onto the trunk branch
3. Ensures GitHub properly marks each PR as "merged"
4. Preserves the full changeset history for every PR

### Key Benefits

✅ **One command** instead of manual sequential merging

✅ **Single CI run** instead of re-running CI for each restack

✅ **Complete history preserved** - each PR remains traceable with its original context

✅ **GitHub "merged" status** - all PRs properly marked as merged, not closed

✅ **Clean main branch** - maintains squash-merge benefits

## Setup
1. Install the [pr-stacker GitHub App](https://github.com/apps/pr-stacker)
2. Add `pr-stacker` to your branch protection bypass list and ensure it is allowed to force-push to your trunk branch.
3. Optionally configure via `.github/pr-stacker.yml`

### Usage
Comment on any PR in your stack:
- `/stackbot fold` - Squash and fold from current PR down to trunk
- `/stackbot squash` - Squash each PR without folding to trunk
- `/stackbot help` - Show available commands

### Automatic Stack Visualization
The bot automatically comments on each PR with a tree view showing its position in the stack, keeping developers informed as the stack evolves.

## Configuration Options

- **mainBranch**: Override default trunk branch
- **restrictCommandsToOriginator**: Only PR creator can run commands (default: true)
- **singleComment**: Edit one comment vs. create multiple (default: false)
- **skipReadyCheck**: Allow folding PRs that haven't passed CI (default: false)
- **stackTreeComment**: Control automatic stack visualization comments

## Trade-offs

**Minor drawback**: After folding, each PR's base branch will reference the temporary branch used during the operation. This is a cosmetic issue and doesn't affect functionality.

**Force Push Override**: Requires the bot to have an override to be able to force push to the protected trunk branch.

## How It Works

### Technical Approach

When `/stackbot fold` is executed:

1. **Graph Construction**: Build a directed graph of all open PRs based on their base/head branch relationships to identify the full stack

2. **Validation**: Check that all PRs in the stack are ready to merge (CI passing, approved, etc.) unless `skipReadyCheck` is configured

3. **Squash Phase**: For each PR in the stack (bottom to top):
   - Squash all commits into one
   - Use PR title as commit message, PR body as commit description

4. **Rebase Phase**: Using a temporary branch strategy:
   - Create temp branch from current main
   - Apply first squashed commit to temp branch
   - Use Git's commit creation API to preserve metadata while changing parent SHA
   - Force-update the PR's head branch to point to this new commit
   - GitHub automatically detects this and marks PR as "merged"
   - Repeat for next PR, building on the previous commit

5. **Finalization**:
   - Update main branch to final state
   - Clean up temporary branch
   - Handle race conditions if main advanced during operation

### Why Temporary Branches?

This approach preserves commit trees (file contents) while changing commit parentage to create the desired linear history. It allows GitHub to properly recognize PRs as merged rather than just closed.

## Deployment

**Hosted**: Free GitHub App available at [github.com/apps/pr-stacker](https://github.com/apps/pr-stacker)
**Self-hosted**: Docker images and source code available for organizations requiring full control
