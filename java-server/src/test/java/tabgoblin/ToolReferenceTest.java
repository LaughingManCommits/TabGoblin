package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.spec.McpSchema;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * The tool reference, {@code docs/tool-reference.md}, held to the tools the server defines: every
 * tool has its section and no other has one, and a section names every input its tool takes.
 * What the page says about an input is not checked; that it says something is.
 */
class ToolReferenceTest {

    /** A tool's heading, at any level below the page's title. */
    private static final Pattern TOOL_HEADING = Pattern.compile("(?m)^(#{2,6}) (browser_[a-z_]+)$");

    /** The page without its fenced examples: a line of an example may begin like a heading. */
    private static String page() throws Exception {
        String text = Files.readString(Path.of("..", "docs", "tool-reference.md"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        return text.replaceAll("(?ms)^```.*?^```$", "");
    }

    /** Each tool's section: from its heading to the next heading of its level or above. */
    private static Map<String, String> sections(String page) {
        Map<String, String> sections = new LinkedHashMap<>();
        Matcher heading = TOOL_HEADING.matcher(page);
        while (heading.find()) {
            Matcher next = Pattern.compile("(?m)^#{1," + heading.group(1).length() + "} ").matcher(page);
            int end = next.find(heading.end()) ? next.start() : page.length();
            assertTrue(sections.put(heading.group(2), page.substring(heading.end(), end)) == null,
                    heading.group(2) + " has two headings");
        }
        return sections;
    }

    private static Map<String, McpSchema.Tool> tools() {
        WebSocketBridge bridge = new WebSocketBridge(null, "c-tools");
        Map<String, McpSchema.Tool> tools = new LinkedHashMap<>();
        McpMain.toolSpecs(new BrowserService(bridge, null), McpJsonDefaults.getMapper())
                .forEach(spec -> tools.put(spec.tool().name(), spec.tool()));
        return tools;
    }

    @Test
    void everyToolOfTheServerHasItsSectionAndNoOtherHasOne() throws Exception {
        assertEquals(new TreeSet<>(tools().keySet()), new TreeSet<>(sections(page()).keySet()));
    }

    @Test
    void aSectionNamesEveryInputItsToolTakes() throws Exception {
        String page = page();
        Map<String, String> sections = sections(page);
        // The session is the same for every tool that takes it, and is described once, before the first group.
        assertTrue(page.substring(0, page.indexOf("\n## ")).contains("`session`"), "the session is described at the top");
        for (McpSchema.Tool tool : tools().values()) {
            String section = sections.getOrDefault(tool.name(), "");
            Object properties = tool.inputSchema().get("properties");
            assertTrue(properties instanceof Map, tool.name() + " has an input schema with properties");
            for (Object property : ((Map<?, ?>) properties).keySet()) {
                if (!property.equals("session")) {
                    assertTrue(section.contains("`" + property + "`"), tool.name() + ": the reference says nothing of " + property);
                }
            }
        }
    }
}
