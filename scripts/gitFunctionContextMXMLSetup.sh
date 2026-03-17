#!/usr/bin/env bash

# setup-git-musicxml.sh
# Run this once to configure git for intelligent MusicXML diffing

echo "🎵 Setting up MusicXML Git Diff Configuration..."
echo ""

# Step 1: Create .gitattributes if it doesn't exist
if [ ! -f .gitattributes ]; then
  echo "Creating .gitattributes..."
  touch .gitattributes
fi

# Step 2: Add XML diff configuration to .gitattributes
if ! grep -q "*.xml diff=musicxml" .gitattributes; then
  echo "*.xml diff=musicxml" >>.gitattributes
  echo "Added XML diff configuration to .gitattributes"
else
  echo ".gitattributes already configured"
fi

# Step 3: Configure git diff driver for musicxml
git config diff.musicxml.xfuncname "^[[:space:]]*<(measure|part-list|score-part|credit|defaults|identification|attributes|direction|barline).*$"

echo "Configured git diff.musicxml.xfuncname"
echo ""

# Step 4: Verify configuration
echo "Current configuration:"
echo "   xfuncname pattern: $(git config diff.musicxml.xfuncname)"
echo ""

# Step 5: Test if it works
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Git repository detected"
  echo ""
  echo "Setup complete! You can now use:"
  echo "   git diff -w --function-context your-file.xml"
  echo "   bun run test-diff.ts your-file.xml"
else
  echo "⚠️  Not in a git repository. Make sure to run this in your repo!"
fi
