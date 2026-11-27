package tabgoblin;

import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;

/**
 * The one definition of the tools, in no protocol's terms: what each is called, what it does, what
 * it takes, whether it only reads, and whether it returns an object. The MCP server builds its tool
 * specifications from it ({@link McpMain#toolSpecs}), and the command line reads its commands and
 * their arguments from it ({@link Cli}); nothing of a tool is written a second time, and neither
 * adapter has a tool of its own.
 *
 * <p>What a tool does is in {@link BrowserService}; this is only how it is described.
 */
final class ToolDefs {

    /**
     * One tool.
     *
     * @param name        its name, as both interfaces know it (browser_click)
     * @param readOnly    it changes nothing in the page
     * @param description what an agent is told it does
     * @param inputSchema its arguments, as a JSON schema
     */
    record Tool(String name, boolean readOnly, String description, String inputSchema) {

        /** What it is called where a person reads it. */
        String title() {
            return TITLES.get(name);
        }

        /** Whether its result is an object, given next to its text. */
        boolean structured() {
            return STRUCTURED.contains(name);
        }

        /** Its arguments, as the schema's tree. */
        JsonNode schema() {
            return TREE.readTree(inputSchema);
        }
    }

    private static final tools.jackson.databind.ObjectMapper TREE = new tools.jackson.databind.ObjectMapper();

    private static final String SESSION = """
            "session":{"type":"string","description":"Session id from browser_status (s1, s2, ...). Optional while exactly one tab is authorized for this agent."}""";

    private ToolDefs() {
    }

    /** The tool of this name, or null. */
    static Tool named(String name) {
        return ALL.stream().filter(tool -> tool.name().equals(name)).findFirst().orElse(null);
    }

    /** Every tool, in the order the server lists them. */
    static final List<Tool> ALL = List.copyOf(all());

    private static List<Tool> all() {
        List<Tool> tools = new ArrayList<>();
        tools.add(new Tool("browser_status", true,
                "List this agent's browser sessions: for each authorized tab its session id, origin, access level "
                        + "(read, explore or read/write), pause state and current page. Also reports whether the "
                        + "Chrome extension is connected.",
                """
                {"type":"object","properties":{
                  "diagnostics":{"type":"boolean","description":"Also say where the time of the last tool calls went (the agent between calls, this server, the extension and the page, the user) and list recent operations with durations and error codes (no page content)."}}}"""));
        tools.add(new Tool("browser_snapshot", true,
                "Structured view of the visible page: sections, lists, tables, headings, text, links, buttons and "
                        + "form fields, nested by indentation, each listed element with a numbered ref like [12] for "
                        + "the other tools. Bounded: use start_line to page, ref to snapshot one section, diff to "
                        + "see only what changed. Never includes passwords, hidden inputs, scripts or raw HTML.",
                schema("", """
                        "interactive_only":{"type":"boolean","description":"Omit plain text; list only structure, headings and interactive elements."}""", """
                        "viewport_only":{"type":"boolean","description":"Only what is currently scrolled into view; combine with browser_scroll on long pages."}""", """
                        "ref":{"type":"integer","description":"Snapshot only this section, list, table or heading section."}""", """
                        "max_lines":{"type":"integer","description":"Lines to return (default 250, max 1000)."}""", """
                        "start_line":{"type":"integer","description":"First line to return, to continue a long snapshot (default 0)."}""", """
                        "diff":{"type":"boolean","description":"Return only lines added or removed since the previous snapshot of this page."}""")));
        tools.add(new Tool("browser_extract", true,
                "Read the visible content of the page as structured text: headings, paragraphs, lists, tables and "
                        + "nested replies keep their structure, and links carry their ref. Bounded: continue with "
                        + "offset, or use outline=true to list sections and then ref to read one. To take the "
                        + "relevant parts out of a long page (the errors in a log, the tables), use find, which "
                        + "returns only the matching lines with the lines around them, or kind; refs reads "
                        + "several sections at once. Every match and region says its line, the offset to read on "
                        + "from, and the heading above it. States how complete the result is.",
                schema("", """
                        "max_chars":{"type":"integer","description":"Maximum characters to return (default 12000, max 100000)."}""", """
                        "offset":{"type":"integer","description":"Character offset to continue from (default 0)."}""", """
                        "outline":{"type":"boolean","description":"Return only the section outline (headings with refs and sizes)."}""", """
                        "ref":{"type":"integer","description":"Read only this section: a heading ref from the outline, or a section, list or table ref from a snapshot."}""", """
                        "refs":{"type":"array","items":{"type":"integer"},"minItems":1,"maxItems":10,"description":"Read several sections in one result, each under its own header, sharing max_chars. A stale ref is reported in its place. Not together with ref, offset or outline."}""", """
                        "find":{"type":"string","minLength":1,"maxLength":200,"description":"Return only the lines that contain this text (case is ignored), with context_lines around each. Works with ref, refs, main_only and kind; not with outline. With offset, the search starts there."}""", """
                        "regex":{"type":"boolean","description":"Treat find as a regular expression, tested against one line at a time. Supported: literals, . [ ] classes, \\\\d \\\\w \\\\s \\\\b, ^ $, groups, |, and * + ? {n,m}. Not supported: backreferences, lookaround, and a repetition inside a repeated group."}""", """
                        "context_lines":{"type":"integer","description":"Lines shown before and after each matching line (default 2, 0-20)."}""", """
                        "max_matches":{"type":"integer","description":"Matching lines to show (default 20, 1-200). The result says how many match in all and how to get the rest."}""", """
                        "kind":{"type":"string","enum":["tables","code","articles"],"description":"Return only the regions of this kind, each under a header with its lines and offset: tables, blocks of code or preformatted text, or articles (posts, comments, feed entries). With find, only these are searched."}""", """
                        "main_only":{"type":"boolean","description":"Leave out navigation, banners and footers when the page marks its main content."}""", """
                        "links":{"type":"string","enum":["none","ref","url"],"description":"How links appear: plain text, text with {ref} (default), or with destination and {ref}."}""")));
        tools.add(new Tool("browser_click", false,
                "Click an element by ref. Following same-origin links and expanding sections needs Explore access; "
                        + "other controls need Write access. A control that submits or changes data is refused "
                        + "unless intent=\"submit\" (prefer browser_submit, which also verifies the outcome). "
                        + "Reports the navigation that followed, if any. Clicks cannot be undone.",
                schema("\"ref\"", """
                        "ref":{"type":"integer","description":"Element ref from the latest browser_snapshot."}""", """
                        "intent":{"type":"string","enum":["interact","submit"],"description":"\\"interact\\" (default) for ordinary UI; \\"submit\\" to submit or change data on the user's explicit request."}""")));
        tools.add(new Tool("browser_fill", false,
                "Enter text into an input, textarea, select, or a rich-text or code editor (listed as Textbox, "
                        + "Editable or Editor) by ref. Needs Write access. Replaces the content unless append is true; "
                        + "empty text clears it. Several lines and code are entered as given. For a select use the "
                        + "option label or value; for a checkbox, radio button or switch use \"true\" or \"false\". "
                        + "method=\"type\" sends key events per character, for fields that react to typing. "
                        + "It types one line: text with line breaks is entered in one piece, because a fill never "
                        + "presses Enter (browser_press_key does). "
                        + "The result says whether the element shows the text afterwards (valueMatches). If it does "
                        + "not, take a snapshot before trying again: never repeat a fill blindly. "
                        + "Password fields are not supported. Does not submit anything.",
                schema("\"ref\",\"text\"", """
                        "ref":{"type":"integer","description":"Element ref from the latest browser_snapshot."}""", """
                        "text":{"type":"string","description":"Text to enter."}""", """
                        "append":{"type":"boolean","description":"Append instead of replacing (default false)."}""", """
                        "method":{"type":"string","enum":["set","type"],"description":"\\"set\\" (default) sets the value at once; \\"type\\" types it key by key (max 2000 characters)."}""")));
        tools.add(new Tool("browser_press_key", false,
                "Press one key on an element (by ref) or on the focused element: Enter, Escape, Tab, Shift+Tab, "
                        + "Space, Backspace, Delete, arrow keys, Home, End, PageUp, PageDown, or one character. "
                        + "Navigation keys need Explore access, others Write. Enter in a text box of any kind (a form "
                        + "field, a text area, an editor, a message box) can send or submit what is written there: it "
                        + "needs intent=\"submit\", the user is asked to confirm, and it runs as a submission: sent "
                        + "once, the same content refused within two minutes unless repeat is true, and reported as "
                        + "CONFIRMED, FAILED or UNCERTAIN. For a line break use browser_fill. "
                        + "Enter or Space on a button or link follows the rules of browser_click. "
                        + "The result's effect says what the key did. "
                        + "In a rich-text or code editor a note is added when that could not be confirmed: "
                        + "never press the key again because of it.",
                schema("\"key\"", """
                        "key":{"type":"string","description":"Key name, e.g. Enter, Escape, Tab, ArrowDown, or a single character."}""", """
                        "ref":{"type":"integer","description":"Element to focus first. Default: the currently focused element."}""", """
                        "intent":{"type":"string","enum":["interact","submit"],"description":"\\"submit\\" when the key press sends or submits something on the user's explicit request."}""", """
                        "repeat":{"type":"boolean","description":"With intent=submit: send again although the same content was just sent here. Only on the user's explicit request."}""")));
        tools.add(new Tool("browser_scroll", true,
                "Scroll the page, or a scrollable element given by ref. With a ref that is not scrollable, the "
                        + "element is scrolled into view. Reports the position and whether the page loaded more content.",
                schema("", """
                        "direction":{"type":"string","enum":["up","down","left","right","top","bottom"],"description":"Default down."}""", """
                        "amount":{"type":"integer","description":"Pixels to scroll (default: most of one viewport)."}""", """
                        "ref":{"type":"integer","description":"Optional element ref to scroll instead of the page."}""")));
        tools.add(new Tool("browser_hover", false,
                "Move the pointer over an element, to open what a page shows on hovering: a menu, a tooltip, a row's "
                        + "actions. Needs Explore access. Nothing is clicked. Take a snapshot with diff=true afterwards. It "
                        + "sends the events a page listens for; what a page shows by a hover style alone does not appear.",
                schema("\"ref\"", """
                        "ref":{"type":"integer","description":"Element ref from the latest snapshot."}""")));
        tools.add(new Tool("browser_collect", false,
                "Read what a page shows over several steps, in one call, with what was read before left out: a feed "
                        + "or log that loads on scrolling, a list that draws only the rows in view, or a list in pages. "
                        + "By default it scrolls down from where the page is, each step, and reads (Read access). With "
                        + "next it follows the link of that name from page to page instead (Explore access; only a link "
                        + "or control that an ordinary click may press). It stops at the end, or at the first limit: "
                        + "max_steps, max_ms, max_chars. The result says why it stopped and how complete it is. With find "
                        + "only matching lines and their context are returned, however much was gone through.",
                schema("", """
                        "max_steps":{"type":"integer","description":"Scrolls or pages after the first reading (default 5, max 20)."}""", """
                        "max_ms":{"type":"integer","description":"Longest time in milliseconds (default 15000, max 30000)."}""", """
                        "max_chars":{"type":"integer","description":"Most characters returned (default 12000, max 100000)."}""", """
                        "ref":{"type":"integer","description":"Scroll and read inside this scrollable element instead of the page. Not with next."}""", """
                        "next":{"type":"string","description":"The exact name of the link or button to the next page, such as Next or Older. It is looked for anew on every page."}""", """
                        "find":{"type":"string","description":"Return only lines that contain this text (case-insensitive), with context."}""", """
                        "regex":{"type":"boolean","description":"Treat find as a regular expression, as browser_extract does."}""", """
                        "context_lines":{"type":"integer","description":"Lines shown before and after a matching line (default 2, max 20)."}""")));
        tools.add(new Tool("browser_request_access", false,
                "Ask the user for access you do not have: a higher level on one of your sessions (give level, and "
                        + "session if you have several), or a tab on another website (give site and level). The user is "
                        + "asked in the TabGoblin popup; nothing is granted by this call, and it returns at once. A tab "
                        + "on another site is given by the user's click on that tab, and nothing of the site can be read "
                        + "before. Give a short reason: it is shown to the user as your words. One request waits at a "
                        + "time, and a request the user declined is not put to them again for a few minutes. "
                        + "browser_status shows what is waiting and what you have.",
                schema("\"level\"", """
                        "level":{"type":"string","enum":["read","explore","write"],"description":"The access level asked for."}""", """
                        "site":{"type":"string","description":"The website to ask a tab for, such as https://example.org. Leave out to ask for a higher level on a session you have."}""", """
                        "reason":{"type":"string","description":"Why, in a few words (at most 200 characters). Shown to the user."}""")));
        tools.add(new Tool("browser_navigate", false,
                "Navigate the session's tab: to an absolute or relative URL, or back, forward or reload. Needs "
                        + "Explore access. The destination must stay on the authorized origin; anything else is "
                        + "rejected, and a redirect that leaves the origin ends the session. Returns what happened: "
                        + "new document, same-document route change, redirect, or timeout.",
                schema("", """
                        "url":{"type":"string","description":"Absolute URL on the authorized origin, or a path relative to the current page."}""", """
                        "history":{"type":"string","enum":["back","forward","reload"],"description":"Move through the tab's history instead of opening a URL."}""")));
        tools.add(new Tool("browser_screenshot", true,
                "Capture the visible viewport of the session's tab as an image, with a note saying how much of the "
                        + "page lies above and below it. Scroll and capture again for the rest. The tab must be the "
                        + "visible tab of its window.",
                schema("")));
        tools.add(new Tool("browser_wait_for", true,
                "Wait (bounded) for a UI condition: visible text to appear or disappear, or an element ref to become "
                        + "visible, gone, enabled or disabled, or to change (its text, value or state is other than "
                        + "when the wait began: a status that moves on, a counter, a log that grows). Provide exactly "
                        + "one of text or ref.",
                schema("", """
                        "text":{"type":"string","description":"Visible text to wait for (case-insensitive substring)."}""", """
                        "ref":{"type":"integer","description":"Element ref to wait for."}""", """
                        "condition":{"type":"string","enum":["visible","gone","enabled","disabled","changed"],"description":"Default visible. changed is for a ref only."}""", """
                        "gone":{"type":"boolean","description":"Same as condition=\\"gone\\"."}""", """
                        "timeout_ms":{"type":"integer","description":"Maximum wait in milliseconds (default 5000, max 30000)."}""")));
        tools.add(new Tool("browser_submit", false,
                "Submit something the user explicitly asked for, exactly once, and verify it. Optionally fills "
                        + "fields first, clicks the submit control (or presses Enter in it when ref is a text box, such as "
                        + "a message box), then watches the page and returns CONFIRMED, "
                        + "FAILED (for example validation errors) or UNCERTAIN, with the evidence seen. Needs Write "
                        + "access; the user may be asked to confirm. A submission_id is never processed twice, and "
                        + "an identical submission is refused unless repeat is true. Cannot be undone.",
                schema("\"ref\"", """
                        "ref":{"type":"integer","description":"Ref of the control that submits: a button or link, or a text box that is sent with Enter."}""", """
                        "fields":{"type":"array","description":"Fields to fill before submitting.","items":{"type":"object","required":["ref","text"],"properties":{"ref":{"type":"integer"},"text":{"type":"string"}}}}""", """
                        "expect_text":{"type":"string","description":"Text that should be visible afterwards if it worked, e.g. the comment just written. Makes verification much stronger."}""", """
                        "submission_id":{"type":"string","description":"Your own id for this submission; reusing it never submits again."}""", """
                        "repeat":{"type":"boolean","description":"Allow submitting content identical to a recent submission (default false)."}""")));
        return tools;
    }

    private static String schema(String required, String... properties) {
        StringBuilder sb = new StringBuilder("{\"type\":\"object\",");
        if (!required.isEmpty()) {
            sb.append("\"required\":[").append(required).append("],");
        }
        sb.append("\"properties\":{").append(SESSION.strip());
        for (String property : properties) {
            sb.append(',').append(property.strip());
        }
        return sb.append("}}").toString();
    }

    /** What each tool is called where a person reads it: in a client's list of tools, when it asks for approval, in the commands' list. */
    static final java.util.Map<String, String> TITLES = java.util.Map.ofEntries(
            java.util.Map.entry("browser_status", "Browser sessions"),
            java.util.Map.entry("browser_snapshot", "Page snapshot"),
            java.util.Map.entry("browser_extract", "Read page text"),
            java.util.Map.entry("browser_click", "Click"),
            java.util.Map.entry("browser_fill", "Fill in a field"),
            java.util.Map.entry("browser_press_key", "Press a key"),
            java.util.Map.entry("browser_scroll", "Scroll"),
            java.util.Map.entry("browser_hover", "Hover"),
            java.util.Map.entry("browser_request_access", "Ask the user for access"),
            java.util.Map.entry("browser_collect", "Collect over scrolling or pages"),
            java.util.Map.entry("browser_navigate", "Navigate"),
            java.util.Map.entry("browser_screenshot", "Screenshot"),
            java.util.Map.entry("browser_wait_for", "Wait for the page"),
            java.util.Map.entry("browser_submit", "Submit"));

    /** Tools whose result is an object. They say so with an output schema, and give the object next to their text. */
    static final java.util.Set<String> STRUCTURED = java.util.Set.of("browser_click", "browser_fill", "browser_press_key", "browser_hover", "browser_request_access",
            "browser_scroll", "browser_navigate", "browser_wait_for", "browser_submit");

    /**
     * What such a result is. It says no more than "an object": the fields come from the page and
     * the extension and differ from case to case, and the SDK refuses a result that does not fit
     * the schema a tool declared. The fields are described in the tool reference.
     */
    static final String OUTPUT_SCHEMA = """
            {"type":"object","description":"The result as an object, with the same fields as the JSON in the text of the result."}""";

    /** What a client that asked for progress is told while a call runs. */
    static String stillRunning(String tool, JsonNode arguments) {
        boolean submission = tool.equals("browser_submit")
                || (arguments != null && "submit".equals(arguments.path("intent").asString("")));
        return submission
                ? "Still running. If the user is asked to allow this in the TabGoblin popup, it waits for their answer."
                : "Still running in the browser.";
    }
}
