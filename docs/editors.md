# Editors

Rich-text and code editors are not ordinary form fields. The text you see is drawn from a model
the editor keeps for itself, and that model changes only when the editor receives the input it
expects from a person at a keyboard. A browser extension that does not use Chrome's debugger
cannot produce real keystrokes, so TabGoblin gives an editor the same sequence of events a
keystroke or a paste produces, and then checks what the editor shows.

This page says which editors that works for, how it was measured, and where it stops.

## What was measured

Fourteen editor libraries, each on its own local page, filled through the whole chain (MCP client
→ server → extension in Chrome 157) and then compared with **the editor's own model**, not with
what the page displays. Fifteen checks per editor:

| Check | What is entered |
|---|---|
| replace | A line, over the existing content |
| append | Text at the end of the existing content |
| lines | Three lines |
| brackets | `if (a[0] == "x") { return {b: 1}; }`, which trips editors that complete brackets |
| indent | Five lines of indented code, which trips editors that indent automatically |
| unicode | Accents, CJK, an emoji, and text that looks like HTML |
| long | 4,600 characters |
| clear | Empty text |
| type | Character by character (`method: "type"`) |
| keys | Single keys, including Backspace |
| enter | Enter, then a character where the keyboard now is |
| empty | A line into an emptied editor |
| empty + lines | Two lines into an emptied editor |
| shrink | A line over content of several paragraphs |
| refill | Two fills in a row |

### Results

| Editor | Used by, for example | Tab in front | Tab in the background |
|---|---|---|---|
| Plain textarea | most comment boxes | 15 of 15 | 15 of 15 |
| Plain editable region | simple rich-text boxes | 15 of 15 | 15 of 15 |
| Monaco | VS Code for the Web, code playgrounds | 15 of 15 | 15 of 15, unconfirmed ¹ |
| CodeMirror 6 | GitHub's file editor, Replit, Obsidian | 15 of 15 | 15 of 15 |
| CodeMirror 5 | older code and Markdown editors | 15 of 15 | 15 of 15 |
| Ace | AWS consoles, Wikipedia's source editor | 15 of 15 | 15 of 15, unconfirmed ¹ |
| TipTap (ProseMirror) | Jira, Confluence, GitLab, many chat inputs | 15 of 15 | 15 of 15 |
| Lexical | Facebook, WhatsApp Web | 15 of 15 | 15 of 15 |
| Slate | Discord, GitBook | 15 of 15 | 15 of 15 |
| Quill | Slack, LinkedIn | 15 of 15 | 15 of 15 |
| Draft.js | older React applications | 15 of 15 | 15 of 15 |
| TinyMCE | WordPress's classic editor | 15 of 15 | 15 of 15 |
| CKEditor 5 | Drupal, enterprise CMS | 15 of 15 | 14 of 15 ² |
| Trix | Basecamp, HEY | 15 of 15 | 14 of 15 ³ |
| Editor.js | block editors in the style of Notion | 12 of 15 ⁴ | 11 of 15 ³ ⁴ |
| **All** | | **222 of 225** | **219 of 225** |

¹ The text is in the editor, but these two redraw only while their tab is visible, so the tool
cannot see it and says so instead of confirming.
² Indented lines arrive with one space less of indentation; the tool reports it.
³ Enter does not start a new paragraph while the tab is in the background, and the tool does not
notice.
⁴ One block holds one paragraph: several lines sent to a block become new blocks after it, and
content spread over several blocks is not replaced from one of them. The tool reports that the
block does not show the requested text.

In no check, in either condition, was text entered twice.

Before this work the first twelve checks gave: 6 editors that worked, 2 that did nothing while
the tool reported success, 3 that could not be addressed at all, and 4 that worked in part.

"Used by" names where a library is known to be used; those products were **not** tested, and they
wrap the library in behaviour of their own. Expect the library's result to be the best case.

### On the makers' own demo pages

The same fill on public demo pages, as a check against editors configured by someone else. Here
only what the page shows can be compared.

| Page | Result |
|---|---|
| codemirror.net/try | Text shown, confirmed |
| Monaco playground (microsoft.github.io) | Text shown, confirmed |
| Ace kitchen sink (ace.c9.io) | Text shown, confirmed |
| prosemirror.net basic example | Text shown, confirmed |
| playground.lexical.dev (rich content with lists and tables) | Text shown, confirmed |
| slatejs.org rich text example | Text shown, confirmed |
| CKEditor 5 feature-rich demo | Text shown, confirmed |
| trix-editor.org | Text shown, confirmed |
| draftjs.org | Not shown; the tool reported it as not confirmed. Cause not investigated. |
| quilljs.com playground | Not testable: the editor is in a frame from another website |
| editorjs.io | Not testable: no editor was offered on the page |

These pages change; `node live.mjs` in `e2e/editors` repeats the check.

## What the tool tells the agent

Every fill ends with the tool reading back what the editor shows:

- `valueMatches: true`: the editor shows the requested text.
- `valueMatches: false` with a note: nothing changed, something else is shown, the indentation
  changed, or the result could not be checked because the tab is in the background.

Two rules follow from how this was built, and both are tested:

- **Text is never entered twice to be on the safe side.** Another way of entering it is tried only
  when the first demonstrably did nothing.
- **Success is never assumed.** In the lab a run fails if the tool reports success for text the
  editor does not hold.

## How it works

An editor is recognised by what it is in the page, never by its name or the website:

| Kind | In the snapshot | Text goes in as |
|---|---|---|
| An editable region (`contenteditable`) | `Editable`, or `Textbox` if the page calls it that | An edit, or a paste for several lines |
| A code editor that draws its own text and takes the keyboard through a hidden textarea or an `EditContext` | `Editor` | The editor's own select-all shortcut, then a paste |

**An edit** is what one keystroke amounts to for the page: a `beforeinput` event, and then, unless
the editor cancels that event because it applied the change itself, the browser's own editing
command, which changes the page and fires `input`. Editors that run on `beforeinput` and editors
that watch the page for changes both receive what they wait for.

**A paste** is a `paste` event that carries the given text and nothing else. Your clipboard is not
read and not written. It is how several lines and code go in unchanged: typed in, they would be
re-indented and have their brackets completed by the editor.

Three details turned out to decide whether an editor cooperates:

- **Its own selection.** Editors keep a selection of their own. An editable region follows the
  page's selection, which says exactly what is meant; the editor's select-all shortcut is used
  where there is no page selection to follow (a code editor that draws its own text) or where it
  is not followed (a window that is not in front). Not otherwise: to some editors that shortcut
  first means "the current block".
- **Several paragraphs.** Replacing content of several paragraphs is left to the editor through a
  paste; the browser's own edit across paragraphs leaves some editors with a page that no longer
  matches their model.
- **Focus.** A window that is not in front receives no focus events, so an editor there believes it
  is not focused and ignores input. TabGoblin tells the editor it has the keyboard.
- **Claiming.** An editor that takes an event cancels it. That, not a redraw, is the signal that
  the text arrived, because a hidden tab is not redrawn.

A hidden field is offered as an `Editor` only if it can be an editor's keyboard input: a textarea
without a name, reachable by keyboard, not hidden from assistive technology, sitting inside a
visible box. A hidden field that a form submits is never offered; those are traps for bots.

## Limits

- **Editors that draw to a canvas**, such as Google Docs and Google Sheets, have nothing in the
  page to address. They are out of reach without the debugger, by design.
- **Editors that insist on real keystrokes.** An editor may ignore events that do not come from the
  user. None of the fourteen does; the tool reports "did not take the text" if one does.
- **A tab in the background.** Timers there run about once a second, so a fill takes a few seconds
  instead of a fraction of one, and two editors cannot be checked (¹).
- **Formatting.** Text is entered as plain text. Bold, headings, links and mentions are made with
  the editor's own controls or shortcuts.
- **Autocomplete and suggestions.** A pasted text does not open them; a typed one may. Menus that
  an editor opens while typing are operated with clicks and keys like any other.
- **Products, not libraries.** Jira, Slack, Notion and the like were not tested.
- **Only Chrome on Windows was run**, with the library versions pinned in
  `e2e/editors/package.json`.

## Run it yourself

```sh
cd e2e && npm install
cd editors && npm install
npm test                 # tab in front
BACKGROUND=1 npm test    # tab in the background
```

See [Development](development.md#the-editor-lab) for the options and for adding an editor.
