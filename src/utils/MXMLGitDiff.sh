#!/bin/bash
# Smart MusicXML diff - shows full measures and selected XML blocks when they change

# Treat these tags as blocks: measure, defaults, identification, credit, part-list
git diff -w -u100 "$@" | awk '
BEGIN {
    in_block = 0
    block_tag = ""
    block_lines = ""
    split("measure defaults identification credit part-list", tags, " ")
    ntags = length(tags)
}

{
    line = $0
    if (!in_block) {
        # Check for self-closing (<tag .../> ) or opening+closing on same line (<tag>...</tag>)
        for (i = 1; i <= ntags; i++) {
            tag = tags[i]
            sc_regex = "<" tag "([^>]*)/>"
            oc_regex = "<" tag "([^>]*)>.*</" tag ">"
            if (line ~ sc_regex) { print; next }
            if (line ~ oc_regex) { print; next }
        }
        # Check for opening-only (<tag ...>)
        for (i = 1; i <= ntags; i++) {
            tag = tags[i]
            op_only_regex = "<" tag "([^/>]*)>"
            if (line ~ op_only_regex) {
                in_block = 1
                block_tag = tag
                block_lines = line "\n"
                next
            }
        }
        # Normal line
        print
    } else {
        # Accumulate lines inside the current block until the matching closing tag
        block_lines = block_lines line "\n"
        close_regex = "</" block_tag ">"
        if (line ~ close_regex) {
            print block_lines
            in_block = 0
            block_tag = ""
            block_lines = ""
        }
    }
}
'
