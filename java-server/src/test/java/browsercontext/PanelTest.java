package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The window's content, made and used as the window does it, without a window being shown. It
 * needs a display, because JavaFX does not start without one: where there is none, as on the CI
 * runner for the server, these tests are skipped and say so.
 */
class PanelTest {

    private static final Timings.Shares TIME = new Timings.Shares(5, 9_000, 200, 500, 300);

    @BeforeEach
    void needsADisplay() {
        Assumptions.assumeTrue(Panel.possible(), "no display: the panel's view cannot be made here");
    }

    private static PanelModel model(boolean connected, boolean off) {
        var sessions = List.of(
                new Protocol.Session("s1", "c-1a2b3c4d", "a1", "https://mail.example.com", 7, 0, "d1", "write", 2, "active",
                        "Inbox (3) - private mail", "https://mail.example.com/mail/u/0/#inbox"),
                new Protocol.Session("s2", "c-1a2b3c4d", "a2", "https://docs.example.org", 8, 0, "d2", "read", 1, "paused",
                        "Quarterly figures", "https://docs.example.org/d/quarterly"));
        return PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7", null, connected, off, 1_000, 0,
                connected ? sessions : List.of(), TIME,
                List.of(new Log.Line(2_000, "info", "extension connected client=c-1a2b3c4d protocol=2"),
                        new Log.Line(3_000, "warn", "connection rejected reason=pairing_proof")),
                ZoneId.of("UTC"));
    }

    /** Runs on JavaFX's thread, as everything that touches the view has to, and hands back what it returns. */
    private static <T> T inTheWindow(Function<List<Panel.Command>, T> work) throws Exception {
        var result = new CompletableFuture<T>();
        Panel.onFxThread(() -> {
            try {
                result.complete(work.apply(new ArrayList<>()));
            } catch (Throwable e) {
                result.completeExceptionally(e);
            }
        });
        return result.get(30, TimeUnit.SECONDS);
    }

    @Test
    void itSaysWhatTheServerHoldsAndNothingOfAPage() throws Exception {
        List<String> words = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model(true, false));
            return view.words();
        });
        String all = String.join("\n", words);
        for (String shown : List.of("TabGoblin server", "claude-code  ·  c-1a2b3c4d  ·  port 47821",
                "Connected to the browser since 00:00:01", "SESSIONS", "2 tabs", "s1", "mail.example.com", "Read / Write",
                "s2", "docs.example.org", "Read", "paused", "WHERE THE TIME WENT", "the last 5 calls", "Agent and its model",
                "90%", "Waiting for you", "3%", "LOG", "Connection to the browser", "On: the extension may connect.",
                "Stop server", "Kill", "TabGoblin 9.8.7 · protocol 2")) {
            assertTrue(words.contains(shown), shown + " is not among:\n" + all);
        }
        // The log's lines, each with its time; a warning is marked.
        assertTrue(all.contains("00:00:02  extension connected client=c-1a2b3c4d protocol=2"), all);
        assertTrue(all.contains("00:00:03  ! connection rejected reason=pairing_proof"), all);
        // An active session carries no state, and nothing of a tab's title or address is anywhere.
        assertFalse(words.contains("active"));
        for (String ofThePage : List.of("Inbox", "private mail", "/mail/u/0", "Quarterly", "/d/quarterly")) {
            assertFalse(all.contains(ofThePage), ofThePage);
        }
    }

    @Test
    void aButtonThatEndsTheServerActsOnTheSecondClickOnly() throws Exception {
        List<String> seen = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model(true, false));
            var steps = new ArrayList<String>();
            var stop = view.ends().get(0);
            var kill = view.ends().get(1);
            stop.fire();
            steps.add(stop.getText() + " -> " + sent);
            stop.fire();
            steps.add(stop.getText() + " -> " + sent);
            kill.fire();
            steps.add(kill.getText() + " -> " + sent);
            kill.fire();
            steps.add(kill.getText() + " -> " + sent);
            return steps;
        });
        assertEquals(List.of(
                "Click again to stop -> []",
                "Stop server -> [Stop[]]",
                "Click again to kill -> [Stop[]]",
                "Kill -> [Stop[], Kill[]]"), seen);
    }

    @Test
    void theSwitchReachesTheServerOnTheUsersClickAndNotWhenTheViewIsBroughtUpToDate() throws Exception {
        List<String> seen = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            var steps = new ArrayList<String>();
            view.show(model(true, false));
            steps.add("shown on: " + view.browser().isSelected() + " " + sent);
            view.browser().fire();
            steps.add("clicked: " + view.browser().isSelected() + " " + sent);
            // The server now reports that it is switched off, and later that it is on again.
            view.show(model(false, true));
            steps.add("shown off: " + view.browser().isSelected() + " " + sent);
            view.show(model(true, false));
            steps.add("shown on again: " + view.browser().isSelected() + " " + sent);
            steps.add(String.join(" | ", view.words().stream().filter(word -> word.startsWith("On:") || word.startsWith("Off:")).toList()));
            return steps;
        });
        assertEquals(List.of(
                "shown on: true []",
                "clicked: false [Connection[on=false]]",
                "shown off: false [Connection[on=false]]",
                "shown on again: true [Connection[on=false]]",
                "On: the extension may connect."), seen);
    }

    @Test
    void theLogShowsItsNewestLineAndHoldsStillWhileTheUserReadsInIt() throws Exception {
        var held = new Object() {
            Panel.View view;
            javafx.scene.Scene scene;
        };
        // What a window does between two looks at the server: lay out what has changed.
        Runnable drawn = () -> {
            held.scene.getRoot().resize(Panel.WIDTH, Panel.HEIGHT);
            held.scene.getRoot().applyCss();
            held.scene.getRoot().layout();
        };
        java.util.function.IntFunction<PanelModel> lines = count -> PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7",
                null, true, false, 0, 0, List.of(), TIME,
                java.util.stream.IntStream.rangeClosed(1, count).mapToObj(n -> new Log.Line(n * 1000L, "info", "line " + n)).toList(),
                ZoneId.of("UTC"));
        java.util.function.Function<String, String> now = what -> {
            String text = held.view.log().getText();
            return what + ": reading=" + held.view.readingLog() + ", last is '" + text.substring(text.lastIndexOf('\n') + 1) + "'";
        };
        var seen = new ArrayList<String>();
        // Each of these is one turn on JavaFX's thread. The view brings itself down to its last line
        // a moment after new lines were laid out, and that moment is between two turns, as in a window.
        inTheWindow(sent -> {
            held.view = new Panel.View(sent::add);
            held.scene = new javafx.scene.Scene(held.view.frame(false));
            held.view.show(lines.apply(60));
            drawn.run();
            return null;
        });
        inTheWindow(sent -> {
            drawn.run();
            seen.add(now.apply("60 lines"));
            // The user scrolls up to read, and lines arrive meanwhile.
            held.view.log().setScrollTop(0);
            drawn.run();
            held.view.show(lines.apply(65));
            drawn.run();
            seen.add(now.apply("scrolled up"));
            // They scroll back down to the last line they had, and the server is looked at again.
            held.view.logToEnd();
            drawn.run();
            held.view.show(lines.apply(65));
            drawn.run();
            return null;
        });
        inTheWindow(sent -> {
            drawn.run();
            seen.add(now.apply("back at its end"));
            // They mark the end of the last line to copy it, and lines arrive meanwhile.
            int length = held.view.log().getLength();
            held.view.log().selectRange(length - 8, length);
            held.view.show(lines.apply(70));
            drawn.run();
            seen.add(now.apply("some of it marked"));
            held.view.log().deselect();
            held.view.show(lines.apply(70));
            drawn.run();
            return null;
        });
        inTheWindow(sent -> {
            drawn.run();
            seen.add(now.apply("the mark gone"));
            return null;
        });
        assertEquals(List.of(
                "60 lines: reading=false, last is '00:01:00  line 60'",
                "scrolled up: reading=true, last is '00:01:00  line 60'",
                "back at its end: reading=false, last is '00:01:05  line 65'",
                "some of it marked: reading=true, last is '00:01:05  line 65'",
                "the mark gone: reading=false, last is '00:01:10  line 70'"), seen);
    }

    @Test
    void theCopyButtonAsksForThePairingTokenAndTheWindowNeverHoldsIt() throws Exception {
        List<String> seen = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model(true, false));
            var steps = new ArrayList<String>();
            steps.add(view.copy().getText() + " -> " + sent);
            view.copy().fire();
            steps.add(view.copy().getText() + " -> " + sent);
            // Bringing the view up to date asks for nothing again.
            view.show(model(true, false));
            steps.add(view.copy().getText() + " -> " + sent);
            steps.add(String.valueOf(view.words().containsAll(List.of("Pairing token", "Paste it into the extension's popup."))));
            return steps;
        });
        assertEquals(List.of("Copy -> []", "Copied -> [CopyToken[]]", "Copied -> [CopyToken[]]", "true"), seen);
    }

    @Test
    void aSecretLeavesTheClipboardAgainUnlessSomethingElseWasCopiedSince() throws Exception {
        List<String> seen = inTheWindow(sent -> {
            // A clipboard of the test's own: the system's is the user's and is not touched here.
            var clipboard = new String[] {"what the user had"};
            var secret = new Panel.Secret(() -> clipboard[0], text -> clipboard[0] = text, () -> clipboard[0] = null);
            var steps = new ArrayList<String>();
            secret.copy("the token");
            steps.add("copied: " + clipboard[0] + ", holds=" + secret.holds());
            secret.forget();
            steps.add("forgotten: " + clipboard[0] + ", holds=" + secret.holds());
            secret.copy("the token");
            clipboard[0] = "something the user copied since";
            secret.forget();
            steps.add("forgotten after another copy: " + clipboard[0] + ", holds=" + secret.holds());
            // Forgetting twice, or with nothing copied, takes nothing away.
            clipboard[0] = "the token";
            secret.forget();
            steps.add("forgotten again: " + clipboard[0]);
            return steps;
        });
        assertEquals(List.of(
                "copied: the token, holds=true",
                "forgotten: null, holds=false",
                "forgotten after another copy: something the user copied since, holds=false",
                "forgotten again: the token"), seen);
        assertEquals(60, (int) Panel.Secret.STAYS.toSeconds());
    }

    @Test
    void theWindowsIconIsTheGoblinInAFormTheWindowTakes() throws Exception {
        List<String> icons = inTheWindow(sent -> Panel.Goblin.icons().stream().map(icon -> {
            int size = (int) icon.getWidth();
            var pixels = icon.getPixelReader();
            // The forehead, above the eyes at every size, is the goblin's green, and the corner outside the tile is clear.
            var face = pixels.getColor(size / 2, size * 5 / 16);
            boolean green = face.getGreen() > 0.7 && face.getGreen() > face.getRed() + 0.2 && face.getOpacity() > 0.99;
            return size + "x" + (int) icon.getHeight() + " " + pixels.getPixelFormat().getType()
                    + (green ? " green face" : " face is " + face) + (pixels.getColor(0, 0).getOpacity() == 0 ? " clear corner" : " corner is filled");
        }).toList());
        // Bytes, and not one number for a pixel as a drawing comes: a window passes that kind over
        // without a word and keeps Java's own icon, which is what the taskbar then shows.
        assertEquals(List.of(16, 24, 32, 48, 64, 128, 256).stream()
                .map(size -> size + "x" + size + " BYTE_BGRA_PRE green face clear corner").toList(), icons);
    }

    @Test
    void whereNothingIsKnownItSaysSoInWords() throws Exception {
        List<String> words = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(PanelModel.of("", "c-1a2b3c4d", 47821, "9.8.7",
                    "Could not listen on any of ports 47821-47828 on 127.0.0.1: too many TabGoblin servers are running.",
                    false, false, 0, 0, List.of(), new Timings.Shares(0, 0, 0, 0, 0), List.of(), ZoneId.of("UTC")));
            return view.words();
        });
        for (String shown : List.of("Agent c-1a2b3c4d  ·  port 47821",
                "Not connected: waiting for the extension",
                "Could not listen on any of ports 47821-47828 on 127.0.0.1: too many TabGoblin servers are running.",
                "no tabs", "Not known while the browser is not connected", "No tool call has ended yet", "Nothing logged yet.")) {
            assertTrue(words.contains(shown), shown + " is not among:\n" + String.join("\n", words));
        }
    }
}
