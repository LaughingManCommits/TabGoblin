# Editors

Can an agent write into a rich-text or code editor through TabGoblin? For most editors, yes.
This page says which, what to watch for, and how it was measured.

## In short

- **Thirteen editor libraries were tested,** plus a plain text area and a plain editable
  region. Fourteen of the fifteen pass every check with the tab in front.
- **Text goes in as plain text.** Bold, headings, links and mentions are made with the editor's
  own buttons or shortcuts.
- **The tool always says what it saw.** It reads the editor back after every fill and reports
  whether the text is there. It never reports success for text the editor does not hold, and
  it never enters text twice.
- **Keep the tab in front where you can.** In a background tab everything is slower, and a few
  results cannot be confirmed.
- **Out of reach:** editors that draw to a canvas, such as Google Docs and Google Sheets.

## Results

Each editor ran fifteen checks, once with its tab in front and once with the tab in the
background. The numbers say how many checks passed.

| Editor | Used by, for example | Tab in front | Tab in the background | Note |
|---|---|---|---|---|
| Plain textarea | most comment boxes | 15 | 15 | |
| Plain editable region | simple rich-text boxes | 15 | 15 | In the background, Enter comes with a warning it does not need |
| Monaco | VS Code for the Web, code playgrounds | 15 | 15 | In the background the text arrives but cannot be confirmed |
| CodeMirror 6 | GitHub's file editor, Replit, Obsidian | 15 | 15 | |
| CodeMirror 5 | older code and Markdown editors | 15 | 15 | |
| Ace | AWS consoles, Wikipedia's source editor | 15 | 15 | In the background the text arrives but cannot be confirmed |
| TipTap (ProseMirror) | Jira, Confluence, GitLab, many chat inputs | 15 | 15 | |
| Lexical | Facebook, WhatsApp Web | 15 | 15 | |
| Slate | Discord, GitBook | 15 | 15 | |
| Quill | Slack, LinkedIn | 15 | 15 | |
| Draft.js | older React applications | 15 | 15 | Two lines into an emptied editor arrive, but are reported as not confirmed |
| TinyMCE | WordPress's classic editor | 15 | 15 | |
| CKEditor 5 | Drupal, enterprise CMS | 15 | 14 | In the background, indented lines lose one space; the tool reports it |
| Trix | Basecamp, HEY | 15 | 14 | In the background, what is typed after Enter lands on the previous line |
| Editor.js | block editors in the style of Notion | 12 | 12 | One block holds one paragraph: several lines cannot go into one block |
| **All** | | **222 of 225** | **220 of 225** | |

How to read it:

- **"Used by" names products that are known to use the library. Those products were not
  tested.** They wrap the library in behaviour of their own, so take the library's result as
  the best case.
- **"Cannot be confirmed"** (Monaco, Ace): these editors redraw only while their tab is
  visible. The text is in the editor, but the tool cannot see it and says so.
- **Trix and Enter in the background:** this editor finishes a new paragraph only when it is
  drawn, and a background tab is not drawn. The tool cannot see that, so it warns after every
  Enter in a background tab and recommends filling the whole text in one piece.
- **Editor.js:** several lines sent to a block become new blocks after it, and content spread
  over several blocks is not replaced from one of them. The tool reports that the block does
  not show the requested text.

Measured on 21 November 2026, in Chrome 157 on Windows, with the library versions pinned in
`e2e/editors/package.json`.

## What the agent is told

After a fill (`browser_fill`):

| Result | Meaning |
|---|---|
| `valueMatches: true` | The editor shows the requested text |
| `valueMatches: false`, with a `note` | Nothing changed, something else is shown, the indentation changed, or the tab is in the background and the result could not be checked |

After a single key (`browser_press_key`), `effect` says what happened: a character typed, a
paragraph started, a character deleted, the key taken with no change, or no reaction. A `note`
is added when the tab is in the background and the effect could not be confirmed.

When a result could not be confirmed, the agent should not fill again. It should take a
snapshot once the tab is visible. The exact notes are in the
[tool reference](tool-reference.md#browser_fill).

## Limits

- **Canvas editors,** such as Google Docs and Google Sheets, have nothing in the page to
  address. They are out of reach without the browser's debugger, which TabGoblin does not use.
- **Editors that insist on real keystrokes.** An editor may ignore events that do not come
  from the user. None of the tested editors does. If one does, the tool reports "did not take
  the text".
- **A tab in the background.** A fill takes a few seconds instead of a fraction of one, because
  timers there run about once a second. What an editor holds and what the page shows can also
  differ until the tab is visible. A text filled in one piece is not affected; Enter followed
  by more keys can be.
- **Formatting.** Only plain text is entered.
- **Autocomplete and suggestions.** A pasted text does not open them; a typed one may. A menu
  that an editor opens is operated with clicks and keys like any other.
- **Products, not libraries.** Jira, Slack, Notion and the like were not tested.
- **One system.** Only Chrome on Windows was run.

## How it was measured

Each editor sits on its own local page. A check fills it through the whole chain (MCP client,
server, extension, page) and then compares the result with **the editor's own model**, not
with what the page displays.

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
| enter | Enter, then a character where the keyboard now is. Enter in an editor is a submission to the tool: the lab declares it, with the user's confirmation switched off |
| empty | A line into an emptied editor |
| empty + lines | Two lines into an emptied editor |
| shrink | A line over content of several paragraphs |
| refill | Two fills in a row |

A run fails if the tool reports success for text the editor does not hold. In no check, front
or background, did that happen, and in none was text entered twice.

To run it:

```sh
cd e2e && npm install
cd editors && npm install
npm test                 # tab in front
BACKGROUND=1 npm test    # tab in the background
```

The options, and how to add an editor, are in
[development](development.md#the-editor-lab).

### On the makers' own demo pages

The same fill was tried on public demo pages, to see editors as someone else configured them.
There only what the page shows can be compared.

| Page | Result |
|---|---|
| codemirror.net/try | Text shown, confirmed |
| Monaco playground (microsoft.github.io) | Text shown, confirmed |
| Ace kitchen sink (ace.c9.io) | Text shown, confirmed |
| prosemirror.net basic example | Text shown, confirmed |
| playground.lexical.dev | Text shown, confirmed |
| slatejs.org rich text example | Text shown, confirmed |
| CKEditor 5 feature-rich demo | Text shown, confirmed |
| trix-editor.org | Text shown, confirmed |
| draftjs.org | Not shown; the tool reported it as not confirmed. The cause was not investigated |
| quilljs.com playground | Not testable: the editor is in a frame from another website |
| editorjs.io | Not testable: no editor was offered on the page |

These pages change. `node live.mjs` in `e2e/editors` repeats the check.

## How it works

An editor's text comes from a model the editor keeps for itself, and that model changes only
when the editor gets the input it expects from a person at a keyboard. TabGoblin cannot
produce real keystrokes without the browser's debugger. So it sends the editor the same events
a keystroke or a paste produces, and then checks what the editor shows.

An editor is recognised by what it is in the page, never by its name or its website:

| Kind | In the snapshot | Text goes in as |
|---|---|---|
| An editable region (`contenteditable`) | `Editable`, or `Textbox` if the page calls it that | An edit, or a paste for several lines |
| A code editor that draws its own text and takes the keyboard through a hidden textarea or an `EditContext` | `Editor` | The editor's own select-all shortcut, then a paste |

- **An edit** is what one keystroke amounts to for the page: a `beforeinput` event and then,
  unless the editor cancels it because it applied the change itself, the browser's own editing
  command.
- **A paste** is a `paste` event that carries the given text and nothing else. Your clipboard
  is neither read nor written. Several lines and code go in this way, because typed in they
  would be re-indented and have their brackets completed.

Details that decide whether an editor cooperates, for those who change this code:

| Detail | What TabGoblin does |
|---|---|
| Selection | An editable region follows the page's selection. The editor's select-all shortcut is used only where there is no page selection to follow, or where it is not followed. To some editors that shortcut first means "the current block" |
| Several paragraphs | Replacing them is left to the editor through a paste. The browser's own edit across paragraphs leaves some editors out of step with their model |
| Focus | A window that is not in front gets no focus events, and an editor there ignores input. TabGoblin tells the editor it has the keyboard |
| Knowing the text arrived | An editor that takes an event cancels it. That is the signal, not a redraw, because a hidden tab is not redrawn |
| Enter | To many editors Enter is a command: send the message, accept the suggestion. A fill never presses it. A text with line breaks goes in in one piece |
| The caret | A key goes where the caret is. An editor that does not hold the caret gets the key at the end of its text |
| The keyboard after Enter | A block editor moves the caret into a new block. A key without a target goes to the editable region that holds the caret |

A hidden field is offered as an `Editor` only if it can be an editor's keyboard input: a
textarea without a name, reachable by keyboard, not hidden from assistive technology, inside a
visible box. A hidden field that a form submits is never offered.
