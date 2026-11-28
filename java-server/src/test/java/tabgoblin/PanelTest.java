package tabgoblin;

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
        return model(connected, off, 0);
    }

    /** @param closeCode why the browser is not connected, as the connection knows it */
    private static PanelModel model(boolean connected, boolean off, int closeCode) {
        var sessions = List.of(
                new Protocol.Session("s1", "c-1a2b3c4d", "a1", "https://mail.example.com", 7, 0, "d1", "write", 2, "active",
                        "Inbox (3) - private mail", "https://mail.example.com/mail/u/0/#inbox"),
                new Protocol.Session("s2", "c-1a2b3c4d", "a2", "https://docs.example.org", 8, 0, "d2", "read", 1, "paused",
                        "Quarterly figures", "https://docs.example.org/d/quarterly"));
        return PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7", null, connected, off, 1_000, closeCode,
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
    void eachCardCanFoldAndReopenAcrossRefreshes() throws Exception {
        inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model(true, false));
            var scene = new javafx.scene.Scene(view.frame(false));
            scene.getRoot().applyCss();
            var headings = view.root().lookupAll(".card-toggle").stream()
                    .map(javafx.scene.control.ToggleButton.class::cast).toList();
            assertEquals(4, headings.size());
            for (var heading : headings) {
                assertTrue(heading.isSelected());
                heading.fire();
                view.show(model(false, false));
                var card = (javafx.scene.layout.VBox) heading.getParent().getParent();
                var children = card.getChildren();
                for (var body : children.subList(1, children.size())) {
                    assertFalse(body.isVisible());
                    assertFalse(body.isManaged());
                }
                assertEquals(3, headings.stream().filter(javafx.scene.control.ToggleButton::isSelected).count());
                heading.fire();
                for (var body : children.subList(1, children.size())) {
                    assertTrue(body.isVisible());
                    assertTrue(body.isManaged());
                }
            }
            assertTrue(sent.isEmpty());
            return true;
        });
    }

    @Test
    void itSaysWhatTheServerHoldsAndNothingOfAPage() throws Exception {
        List<String> words = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model(true, false));
            return view.words();
        });
        String all = String.join("\n", words);
        for (String shown : List.of("TabGoblin server", "claude-code  ·  c-1a2b3c4d", "Port 47821",
                "Connected to the browser since 00:00:01", "SESSIONS", "2 tabs", "s1", "mail.example.com", "Read / Write",
                "s2", "docs.example.org", "Read", "paused", "METRICS", "time of the last 5 calls", "Agent and its model",
                "90%", "Waiting for you", "3%", "LOG", "Connection to the browser", "On: the extension may connect.",
                "Stop server", "Kill", "TabGoblin 9.8.7 · protocol " + Protocol.VERSION)) {
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
    void whileTheBrowserHoldsAnotherTokenTheWindowSaysAtItsTopWhatToDoAndHasTheButtonForIt() throws Exception {
        List<String> seen = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            var steps = new ArrayList<String>();
            // No browser has come: one that is paired is on its way as a rule, and nothing is asked of the user.
            view.show(model(false, false));
            steps.add("waiting: shown=" + view.pairShown());
            // One came with another token: the step, and its button, which asks for the token as the other one does.
            view.show(model(false, false, Protocol.CLOSE_UNAUTHORIZED));
            steps.add("another token: shown=" + view.pairShown() + " words="
                    + view.words().containsAll(List.of("Pair the browser with this server",
                            "Copy the token, then paste it into the TabGoblin popup in Chrome.")));
            view.pairCopy().fire();
            steps.add(view.pairCopy().getText() + " -> " + sent);
            // Paired, or switched off here: there is nothing to pair, and the box is gone.
            view.show(model(true, false));
            steps.add("paired: shown=" + view.pairShown());
            view.show(model(false, true, Protocol.CLOSE_UNAUTHORIZED));
            steps.add("switched off: shown=" + view.pairShown());
            return steps;
        });
        assertEquals(List.of("waiting: shown=false", "another token: shown=true words=true", "Copied -> [CopyToken[]]",
                "paired: shown=false", "switched off: shown=false"), seen);
    }

    @Test
    void aClickOnThePortCopiesItsNumberAndNothingElse() throws Exception {
        var system = Panel.portClipboard;
        try {
            List<String> seen = inTheWindow(sent -> {
                // A clipboard of the test's own: the system's is the user's and is not touched here.
                var clipboard = new String[] {"what the user had"};
                Panel.portClipboard = text -> clipboard[0] = text;
                var view = new Panel.View(sent::add);
                view.show(model(true, false));
                var steps = new ArrayList<String>();
                java.util.function.Supplier<String> ports = () -> view.root().lookupAll(".port").stream()
                        .filter(javafx.scene.Node::isVisible).map(javafx.scene.control.Label.class::cast)
                        .map(javafx.scene.control.Label::getText).toList().toString();
                // The port the popup is told is in the header, and it is the one port there is: an agent has none of its own.
                steps.add(ports.get());
                view.show(PanelModel.of(List.of(new PanelModel.Facts("claude-code", "c-1a2b3c4d", null, true, 1_000, 0,
                        List.of(), TIME, java.util.Map.of())), 47821, "9.8.7", false, List.of(), ZoneId.of("UTC")));
                steps.add(ports.get());
                view.show(model(true, false));
                var port = (Panel.PortLabel) view.root().lookup(".header .port");
                steps.add(port.getText() + " shown=" + port.isVisible() + " -> " + clipboard[0]);
                port.copy();
                steps.add(port.getText() + " -> " + clipboard[0] + " asked=" + sent);
                // Bringing the view up to date leaves what it says for the moment.
                view.show(model(true, false));
                steps.add(port.getText());
                view.show(PanelModel.of(List.of(), 37821, "9.8.7", false, List.of(), ZoneId.of("UTC")));
                // No agent: the server's port shows all the same.
                assertEquals(1, view.root().lookupAll(".port").stream().filter(javafx.scene.Node::isVisible).count());
                steps.add(port.getText());
                port.copy();
                steps.add(clipboard[0]);
                // The keyboard reaches it as it reaches a button, and Enter or Space presses it.
                clipboard[0] = "what the user had";
                for (var code : List.of(javafx.scene.input.KeyCode.ENTER, javafx.scene.input.KeyCode.SPACE, javafx.scene.input.KeyCode.A)) {
                    javafx.event.Event.fireEvent(port, new javafx.scene.input.KeyEvent(javafx.scene.input.KeyEvent.KEY_PRESSED, "", "",
                            code, false, false, false, false));
                    steps.add(code + " -> " + clipboard[0]);
                    clipboard[0] = "what the user had";
                }
                steps.add("reached by Tab: " + port.isFocusTraversable());
                return steps;
            });
            assertEquals(List.of("[Port 47821]", "[Port 47821]",
                    "Port 47821 shown=true -> what the user had", "copied -> 47821 asked=[]", "copied",
                    "Port 37821", "37821", "ENTER -> 37821", "SPACE -> 37821", "A -> what the user had",
                    "reached by Tab: true"), seen);
        } finally {
            Panel.portClipboard = system;
        }
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
            steps.add(String.valueOf(view.words().containsAll(List.of("Pairing token", "Paste in the popup."))));
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
        List<String> icons = inTheWindow(sent -> Panel.icons().stream().map(icon -> {
            int size = (int) icon.getWidth();
            var pixels = icon.getPixelReader();
            // Between the eyes is the goblin's skin at every size, and the corner is clear: the face is the icon.
            var face = pixels.getColor(size / 2, size * 3 / 8);
            boolean green = face.getGreen() > 0.7 && face.getGreen() > face.getRed() + 0.2 && face.getOpacity() > 0.99;
            // Made larger in whole squares: no pixel is a blend of two, so every one is a colour of the drawing or clear.
            boolean sharp = true;
            for (int y = 0; y < size; y++) {
                for (int x = 0; x < size; x++) {
                    double alpha = pixels.getColor(x, y).getOpacity();
                    sharp &= alpha == 0 || alpha == 1;
                }
            }
            return size + "x" + (int) icon.getHeight() + " " + pixels.getPixelFormat().getType()
                    + (green ? " green face" : " face is " + face) + (pixels.getColor(0, 0).getOpacity() == 0 ? " clear corner" : " corner is filled")
                    + (sharp ? " sharp" : " smoothed");
        }).toList());
        // Bytes, and not one number for a pixel as a drawing comes: a window passes that kind over
        // without a word and keeps Java's own icon, which is what the taskbar then shows.
        assertEquals(List.of(16, 32, 48, 64, 128, 256).stream()
                .map(size -> size + "x" + size + " BYTE_BGRA_PRE green face clear corner sharp").toList(), icons);
    }

    @Test
    void theGoblinPlaysWhatTheModelSaysAndOnlyWhileItIsSeen() throws Exception {
        List<String> steps = inTheWindow(sent -> {
            List<String> seen = new java.util.ArrayList<>();
            var mascot = new Panel.Mascot();
            var view = (javafx.scene.image.ImageView) mascot.node();
            // Each pixel of the drawing is a square of four in the sheet as it is read: four columns alike, and four rows.
            var pixels = view.getImage().getPixelReader();
            boolean squares = true;
            for (int y = 0; y < view.getImage().getHeight(); y++) {
                for (int x = 0; x < view.getImage().getWidth(); x++) {
                    squares &= pixels.getArgb(x, y) == pixels.getArgb(x - x % 4, y - y % 4);
                }
            }
            seen.add("made: " + mascot.mood() + " smooth=" + view.isSmooth() + " cell " + (int) view.getViewport().getWidth()
                    + " shown " + (int) view.getFitWidth() + "x" + (int) view.getFitHeight() + " squares=" + squares
                    + " animating=" + mascot.animating());
            mascot.running(true);
            seen.add("seen: animating=" + mascot.animating());
            mascot.show(PanelModel.Mood.WORKING);
            var cell = view.getViewport();
            seen.add("working: row " + (int) (cell.getMinY() / 128) + " animating=" + mascot.animating());
            // A refresh with the same mood leaves the animation where it is.
            for (int i = 0; i < 3; i++) {
                mascot.show(PanelModel.Mood.WORKING);
            }
            seen.add("same again: animating=" + mascot.animating());
            mascot.running(false);
            seen.add("hidden: animating=" + mascot.animating());
            mascot.show(PanelModel.Mood.SLEEPING);
            seen.add("asleep while hidden: row " + (int) (view.getViewport().getMinY() / 128) + " frame " + mascot.frame()
                    + " animating=" + mascot.animating());

            // Busy, and seen again: a new mood waits until what plays has come round once.
            mascot.show(PanelModel.Mood.WORKING);
            mascot.running(true);
            mascot.show(PanelModel.Mood.READING);
            seen.add("reading asked while working: " + mascot.mood() + ", then " + mascot.next());
            int rounds = Panel.Mascot.play(PanelModel.Mood.WORKING).frames();
            for (int i = 1; i < rounds; i++) {
                mascot.tick();
            }
            seen.add("one frame short of a round: " + mascot.mood() + " frame " + mascot.frame());
            mascot.tick();
            seen.add("round done: " + mascot.mood() + " frame " + mascot.frame());
            // Asked for what plays, the wait is called off.
            mascot.show(PanelModel.Mood.WALKING);
            mascot.show(PanelModel.Mood.READING);
            seen.add("asked back: " + mascot.mood() + ", then " + mascot.next());
            mascot.running(false);
            return seen;
        });
        assertEquals(List.of(
                "made: IDLE smooth=false cell 128 shown 64x64 squares=true animating=false",
                "seen: animating=true",
                "working: row 1 animating=true",
                "same again: animating=true",
                "hidden: animating=false",
                "asleep while hidden: row 4 frame 0 animating=false",
                "reading asked while working: WORKING, then READING",
                "one frame short of a round: WORKING frame 5",
                "round done: READING frame 0",
                "asked back: READING, then null"), steps);
        // Every mood has its animation in the sheet, of four to eight frames.
        for (var mood : PanelModel.Mood.values()) {
            var play = Panel.Mascot.play(mood);
            // At rest it holds still: one frame, and a blink now and then. The others go round, four to eight frames.
            assertTrue(play.hold() ? mood == PanelModel.Mood.IDLE && play.frames() == 2 : play.frames() >= 4 && play.frames() <= 8,
                    mood + " has " + play.frames());
        }
    }

    @Test
    void whereNothingIsKnownItSaysSoInWords() throws Exception {
        List<String> words = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(PanelModel.of("", "c-1a2b3c4d", 47821, "9.8.7",
                    Agent.noPort(47821, false),
                    false, false, 0, 0, List.of(), new Timings.Shares(0, 0, 0, 0, 0), List.of(), ZoneId.of("UTC")));
            return view.words();
        });
        for (String shown : List.of("Agent c-1a2b3c4d", "Port 47821",
                "Not connected: this server has no port to listen on",
                // What is wrong, why, and what to do: a line each, and no word of it changed.
                Agent.noPort(47821, false).replaceAll("(?<=[.]) (?=[A-Z])", "\n"),
                "Tabs show here once the browser is connected", "No tool call has ended yet", "Nothing logged yet.")) {
            assertTrue(words.contains(shown), shown + " is not among:\n" + String.join("\n", words));
        }
    }

    @Test
    void aClickOnATabShowsThatTabsMetricsAndLogAndAnotherClickShowsAllAgain() throws Exception {
        record Seen(List<String> all, List<String> one, List<String> other, List<String> again, List<String> gone,
                String chosenAtTheEnd, boolean marked, boolean unmarked, int sentToTheServer) {
        }
        var sessions = List.of(
                new Protocol.Session("s1", "c-1a2b3c4d", "a1", "https://mail.example.com", 7, 0, "d1", "write", 2, "active",
                        "Inbox", "https://mail.example.com/mail"),
                new Protocol.Session("s2", "c-1a2b3c4d", "a2", "https://docs.example.org", 8, 0, "d2", "read", 1, "active",
                        "Guide", "https://docs.example.org/guide"));
        var log = List.of(
                new Log.Line(1_000, "info", "extension connected client=c-1a2b3c4d protocol=2"),
                new Log.Line(2_000, "debug", "command id=1 session=s1 action=snapshot ms=12 outcome=ok", "s1"),
                new Log.Line(3_000, "info", "command id=2 session=s2 action=fill ms=4 outcome=error code=PAUSED category=AUTHORIZATION",
                        "s2"));
        var times = java.util.Map.of("s1", new Timings.Shares(4, 1_000, 0, 1_000, 0), "s2", new Timings.Shares(1, 0, 0, 0, 500));
        PanelModel model = PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7", null, true, false, 1_000, 0, sessions,
                TIME, times, log, ZoneId.of("UTC"));
        PanelModel without = PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7", null, true, false, 1_000, 0,
                sessions.subList(0, 1), TIME, times, log, ZoneId.of("UTC"));

        Seen seen = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model);
            var all = view.words();
            // A click on the second tab, as a user's.
            view.tabs().get(1).fire();
            var one = view.words();
            boolean marked = view.tabs().get(1).isSelected() && !view.tabs().get(0).isSelected();
            // Bringing the view up to date keeps what is chosen.
            view.show(model);
            // A click on the first chooses that one instead.
            view.tabs().get(0).fire();
            var other = view.words();
            // A click on the chosen tab gives the choice up.
            view.tabs().get(0).fire();
            var again = view.words();
            boolean unmarked = view.tabs().stream().noneMatch(javafx.scene.control.ToggleButton::isSelected);
            // A chosen tab whose session ends is chosen no more: everything shows.
            view.tabs().get(1).fire();
            view.show(without);
            return new Seen(all, one, other, again, view.words(), view.chosen(), marked, unmarked, sent.size());
        });

        // Nothing chosen: the shares over all calls, every line, and nothing said under the list.
        for (String shown : List.of("time of the last 5 calls", "90%", "the last 300 lines")) {
            assertTrue(seen.all().contains(shown), shown + " is not among:\n" + String.join("\n", seen.all()));
        }
        assertTrue(String.join("\n", seen.all()).contains("extension connected"));
        assertTrue(seen.all().contains("2 tabs"), "the corner of the sessions' card counts the tabs");

        // The second tab: its one call, all of it the user's, and the one line of its command.
        for (String shown : List.of("s2  ·  time of the last call", "100%", "s2  ·  1 of the last 300 lines",
                "showing s2 only  ·  click again for all")) {
            assertTrue(seen.one().contains(shown), shown + " is not among:\n" + String.join("\n", seen.one()));
        }
        String ofOne = String.join("\n", seen.one());
        assertTrue(ofOne.contains("s2 fill  4 ms  PAUSED"), ofOne);
        assertFalse(ofOne.contains("extension connected"), "a line of no tab is not a chosen tab's");
        assertFalse(ofOne.contains("s1 snapshot"), ofOne);
        assertTrue(seen.marked(), "the chosen row is marked and the other is not");

        // The first tab instead.
        for (String shown : List.of("s1  ·  time of the last 4 calls", "50%", "s1  ·  1 of the last 300 lines",
                "showing s1 only  ·  click again for all")) {
            assertTrue(seen.other().contains(shown), shown + " is not among:\n" + String.join("\n", seen.other()));
        }
        assertTrue(String.join("\n", seen.other()).contains("s1 snapshot  12 ms  ok"));

        // Given up: as at the start.
        assertEquals(seen.all(), seen.again());
        assertTrue(seen.unmarked());
        // The tab that was chosen is gone with its session: all show, and none is chosen.
        assertEquals(null, seen.chosenAtTheEnd());
        assertTrue(seen.gone().contains("time of the last 5 calls"), String.join("\n", seen.gone()));
        assertFalse(seen.gone().contains("docs.example.org"));
        // Choosing is the window's own affair: the server was sent nothing.
        assertEquals(0, seen.sentToTheServer());
    }

    @Test
    void aServerWithoutAnAgentSaysSoUnderItsStatusAndInItsCards() throws Exception {
        record Shown(List<String> empty, List<String> withOne) {
        }
        PanelModel empty = PanelModel.of(List.of(), 47821, "9.8.7", false, List.of(), ZoneId.of("UTC"));
        Shown shown = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(empty);
            var first = view.words();
            // The same view when an agent has connected: the note goes, and the agent's words come.
            view.show(model(true, false));
            return new Shown(first, view.words());
        });
        for (String said : List.of("one server for all your agents", "No agent connected", empty.note(),
                "No tabs", "No calls yet", "Nothing logged yet.")) {
            assertTrue(shown.empty().contains(said), said + " is not among:\n" + String.join("\n", shown.empty()));
        }
        assertFalse(empty.note().isEmpty());
        assertFalse(shown.withOne().contains(empty.note()), String.join("\n", shown.withOne()));
        assertTrue(shown.withOne().containsAll(List.of("claude-code  ·  c-1a2b3c4d", "Port 47821")));
    }

    @Test
    void severalAgentsEachHaveAHeadingOverTheirTabsAndAClickOnOneShowsThatAgentAlone() throws Exception {
        record Seen(List<String> all, List<String> agent, List<String> tab, List<String> again, int rows, int sentToTheServer) {
        }
        var open = new Protocol.Session("s3", "", "a3", "https://wiki.example.net", 9, 0, "d3", "read", 1, "active", "", "", true);
        var first = new PanelModel.Facts("claude-code", "c-11111111", null, true, 1_000, 0,
                List.of(new Protocol.Session("s1", "c-11111111", "a1", "https://mail.example.com", 7, 0, "d1", "write", 2, "active",
                        "Inbox", "https://mail.example.com/mail"), open),
                new Timings.Shares(4, 1_000, 0, 1_000, 0), java.util.Map.of("s1", new Timings.Shares(3, 0, 0, 900, 100)));
        var second = new PanelModel.Facts("IntelliJ IDEA", "c-22222222", null, false, 0, 0, List.of(),
                new Timings.Shares(1, 0, 0, 0, 500), java.util.Map.of());
        var log = List.of(
                new Log.Line(1_000, "info", "server listening port=47821"),
                new Log.Line(2_000, "debug", "command id=1 session=s1 action=snapshot ms=12 outcome=ok", "s1", "c-11111111"),
                new Log.Line(3_000, "info", "serving client=c-22222222 port=47821", null, "c-22222222"));
        PanelModel model = PanelModel.of(List.of(first, second), 47821, "9.8.7", false, log, ZoneId.of("UTC"));

        Seen seen = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model);
            var all = view.words();
            int rows = view.tabs().size();
            // The rows in the list's order: the first agent, its two tabs, the second agent.
            view.tabs().get(3).fire();
            var agent = view.words();
            view.tabs().get(1).fire();
            var tab = view.words();
            view.tabs().get(1).fire();
            return new Seen(all, agent, tab, view.words(), rows, sent.size());
        });

        // Both agents, each with what it has: the first its tabs, the second the words in their place.
        for (String shown : List.of("2 agents", "1 of 2 agents is connected to the browser", "2 agents  ·  2 tabs",
                "claude-code", "c-11111111", "s1", "mail.example.com", "owner: claude-code", "s3", "wiki.example.net", "any agent",
                "IntelliJ IDEA", "c-22222222", "Port 47821", "not connected", "Tabs show here once the browser is connected",
                "time of the last 5 calls", "the last 300 lines")) {
            assertTrue(seen.all().contains(shown), shown + " is not among:\n" + String.join("\n", seen.all()));
        }
        // Whose a tab is, is said in its row: one tab is the first agent's, the other nobody's yet.
        assertEquals(1, seen.all().stream().filter(word -> word.startsWith("owner: ")).count());
        assertEquals(4, seen.rows(), "two headings and two tabs can be chosen");
        // The second agent chosen: its one call, all of it the user's, and its one line.
        for (String shown : List.of("IntelliJ IDEA  ·  time of the last call", "100%", "IntelliJ IDEA  ·  1 of the last 300 lines",
                "showing IntelliJ IDEA only  ·  click again for all")) {
            assertTrue(seen.agent().contains(shown), shown + " is not among:\n" + String.join("\n", seen.agent()));
        }
        assertTrue(String.join("\n", seen.agent()).contains("serving client=c-22222222"));
        assertFalse(String.join("\n", seen.agent()).contains("session=s1"));
        // A tab of the first agent chosen instead.
        for (String shown : List.of("s1  ·  time of the last 3 calls", "s1  ·  1 of the last 300 lines",
                "showing s1 only  ·  click again for all")) {
            assertTrue(seen.tab().contains(shown), shown + " is not among:\n" + String.join("\n", seen.tab()));
        }
        assertEquals(seen.all(), seen.again());
        assertEquals(0, seen.sentToTheServer());
    }

    @Test
    void theBlockedSitesAreSaidInTheControlsAndEditAsksForTheSettingsFile() throws Exception {
        var facts = List.of(new PanelModel.Facts("claude-code", "c-1a2b3c4d", null, true, 1_000, 0,
                List.of(new Protocol.Session("s1", "c-1a2b3c4d", "a1", "https://mail.example.org", 7, 0, "d1", "write", 2, "active",
                        "Inbox (3) - private mail", "https://mail.example.org/mail/u/0/#inbox")), TIME, java.util.Map.of()));
        String file = "~/.tabgoblin/tabgoblin.properties";
        List<String> seen = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            var steps = new ArrayList<String>();
            view.show(PanelModel.of(facts, 47821, "9.8.7", false, List.of(), ZoneId.of("UTC"), BlockedSites.Rule.NONE, file));
            steps.add(String.valueOf(view.words().containsAll(List.of("Blocked sites", "No site is blocked"))));
            steps.add(String.valueOf(view.words().contains("blocked")));
            // The user's click asks for the file; bringing the view up to date asks for nothing.
            view.edit().fire();
            view.show(PanelModel.of(facts, 47821, "9.8.7", false, List.of(), ZoneId.of("UTC"),
                    new BlockedSites.Rule(List.of("example.org"), null), file));
            steps.add(sent.toString());
            // The site that is blocked now is named, and the tab on it is marked.
            steps.add(String.valueOf(view.words().containsAll(List.of("example.org", "blocked"))));
            steps.add(String.valueOf(view.blockedExplained().contains("Blocked now:\n  example.org") && view.blockedExplained().endsWith(file)));
            // The path is under the mouse, and in no line of the window.
            steps.add(String.valueOf(view.words().stream().noneMatch(word -> word.contains("tabgoblin.properties"))));
            view.show(PanelModel.of(facts, 47821, "9.8.7", false, List.of(), ZoneId.of("UTC"),
                    new BlockedSites.Rule(List.of(), "it cannot be read (AccessDeniedException)"), file));
            steps.add(String.valueOf(view.words().containsAll(List.of("Every site is refused: the file has a mistake",
                    "Every site is refused until the settings file is mended: it cannot be read (AccessDeniedException)."))));
            return steps;
        });
        assertEquals(List.of("true", "false", "[EditSettings[]]", "true", "true", "true", "true"), seen);
    }

    @Test
    void theMetricsSayHowLongACallTypicallyTakesInEachHeapBesideItsShare() throws Exception {
        var each = List.of(new Timings.Spent(-1, 2, 30, 0), new Timings.Spent(4_000, 1, 20, 0),
                new Timings.Spent(6_000, 3, 1_200, 0), new Timings.Spent(346_000, 2, 26, 0));
        var facts = List.of(new PanelModel.Facts("claude-code", "c-1a2b3c4d", null, true, 1_000, 0, List.of(),
                new Timings.Shares(4, 70_000, 8, 1_276, 0, each), java.util.Map.of()));
        List<String> words = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(PanelModel.of(facts, 47821, "9.8.7", false, List.of(), ZoneId.of("UTC")));
            return view.words();
        });
        // Over the numbers stands what they are; each heap has its share and its typical time.
        int at = words.indexOf("share");
        assertEquals(List.of("share", "typical",
                "Agent and its model", "98%", "6.0 s",
                "This server", "0%", "2 ms",
                "Extension and page", "2%", "28 ms",
                "Waiting for you", "0%", "0 ms"), words.subList(at, at + 14));

        // Where only the sums are known there is the share alone, and no column without a number in it.
        List<String> sums = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model(true, false));
            return view.words();
        });
        assertTrue(sums.contains("share"), sums.toString());
        assertFalse(sums.contains("per call"), sums.toString());
    }

    @Test
    void aLogThatIsHeldSaysSoWithWhatHasComeSinceAndAButtonGoesToItsNewestLine() throws Exception {
        var held = new Object() {
            Panel.View view;
            javafx.scene.Scene scene;
        };
        Runnable drawn = () -> {
            held.scene.getRoot().resize(Panel.WIDTH, Panel.HEIGHT);
            held.scene.getRoot().applyCss();
            held.scene.getRoot().layout();
        };
        java.util.function.IntFunction<PanelModel> lines = count -> PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7",
                null, true, false, 0, 0, List.of(), TIME,
                java.util.stream.IntStream.rangeClosed(1, count).mapToObj(n -> new Log.Line(n * 1000L, "info", "line " + n)).toList(),
                ZoneId.of("UTC"));
        java.util.function.Supplier<String> corner = () -> held.view.logCorner() + " | "
                + (held.view.follow().isVisible() ? "button '" + held.view.follow().getText() + "'" : "no button");
        java.util.function.Supplier<String> last = () -> {
            String text = held.view.log().getText();
            return "last is '" + text.substring(text.lastIndexOf('\n') + 1) + "'";
        };
        var seen = new ArrayList<String>();
        inTheWindow(sent -> {
            held.view = new Panel.View(sent::add);
            held.scene = new javafx.scene.Scene(held.view.frame(false));
            held.view.show(lines.apply(60));
            drawn.run();
            return null;
        });
        inTheWindow(sent -> {
            drawn.run();
            seen.add("it follows: " + corner.get());
            // The user scrolls up to read. Nothing has come since: there is nothing to say.
            held.view.log().setScrollTop(0);
            drawn.run();
            held.view.show(lines.apply(60));
            seen.add("scrolled up, nothing new: " + corner.get());
            // Lines arrive while they read: the log stands still, and its corner says so and how many.
            held.view.show(lines.apply(61));
            seen.add("one line later: " + corner.get());
            held.view.show(lines.apply(112));
            seen.add("fifty-two later: " + corner.get() + ", " + last.get());
            // The button goes to the newest line.
            held.view.follow().fire();
            drawn.run();
            return null;
        });
        inTheWindow(sent -> {
            drawn.run();
            seen.add("pressed: " + corner.get() + ", " + last.get() + ", reading=" + held.view.readingLog());
            held.view.show(lines.apply(113));
            drawn.run();
            return null;
        });
        inTheWindow(sent -> {
            drawn.run();
            seen.add("and it follows again: " + corner.get() + ", " + last.get());
            // A mark holds it as well, and the button gives the mark up.
            int length = held.view.log().getLength();
            held.view.log().selectRange(length - 8, length);
            held.view.show(lines.apply(115));
            seen.add("some of it marked: " + corner.get());
            held.view.follow().fire();
            seen.add("pressed again: " + corner.get() + ", marked '" + held.view.log().getSelectedText() + "', " + last.get());
            // A log that is folded away is read by nobody: a mark left in it holds nothing.
            length = held.view.log().getLength();
            held.view.log().selectRange(length - 8, length);
            held.view.show(lines.apply(116));
            seen.add("marked again: " + corner.get());
            var fold = held.view.root().lookupAll(".card-toggle").stream().map(javafx.scene.control.ToggleButton.class::cast)
                    .filter(toggle -> "Log".equals(toggle.getAccessibleText())).findFirst().orElseThrow();
            fold.fire();
            held.view.show(lines.apply(117));
            seen.add("folded: " + corner.get() + ", " + last.get());
            fold.fire();
            held.view.show(lines.apply(118));
            seen.add("opened again: " + corner.get() + ", " + last.get());
            return null;
        });
        assertEquals(List.of(
                "it follows: the last 300 lines | no button",
                "scrolled up, nothing new: the last 300 lines | no button",
                "one line later: held while you read | button '1 newer line  ↓'",
                "fifty-two later: held while you read | button '52 newer lines  ↓', last is '00:01:00  line 60'",
                "pressed: the last 300 lines | no button, last is '00:01:52  line 112', reading=false",
                "and it follows again: the last 300 lines | no button, last is '00:01:53  line 113'",
                "some of it marked: held while you read | button '2 newer lines  ↓'",
                "pressed again: the last 300 lines | no button, marked '', last is '00:01:55  line 115'",
                "marked again: held while you read | button '1 newer line  ↓'",
                "folded: the last 300 lines | no button, last is '00:01:57  line 117'",
                "opened again: the last 300 lines | no button, last is '00:01:58  line 118'"), seen);
    }

    @Test
    void theWindowTakesTheSystemsThemeKeepsStillWhereAskedAndIsPutBackOnlyOnAScreen() throws Exception {
        // Daylight is a class on the body, which the stylesheet has the light colours for; taken off, it is the cave again.
        List<String> classes = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            var seen = new ArrayList<String>();
            seen.add(String.valueOf(view.root().getStyleClass().contains("light")));
            view.light(true);
            view.light(true);
            seen.add(String.valueOf(view.root().getStyleClass().stream().filter("light"::equals).count()));
            view.light(false);
            seen.add(String.valueOf(view.root().getStyleClass().contains("light")));
            return seen;
        });
        assertEquals(List.of("false", "1", "false"), classes);
        // Less motion, where the system asks for it: the switch is where it belongs at once, without a slide.
        boolean was = Panel.calm;
        try {
            double[] knob = inTheWindow(sent -> {
                Panel.calm = true;
                var view = new Panel.View(sent::add);
                view.show(model(true, false));
                var toggle = (javafx.scene.control.ToggleButton) view.root().lookup(".switch");
                double on = toggle.getGraphic().lookup(".knob").getTranslateX();
                toggle.fire();
                return new double[] {on, toggle.getGraphic().lookup(".knob").getTranslateX()};
            });
            assertEquals(20, knob[0]);
            assertEquals(0, knob[1], "off, and there already");
        } finally {
            Panel.calm = was;
        }
        // A place that was kept is used only while it is on a screen: a screen that is gone does not take the window with it.
        assertFalse(new Panel.Place(0, 0, 0, false).onAScreen(Panel.WIDTH), "nothing was kept");
        boolean[] on = inTheWindow(sent -> {
            var screen = javafx.stage.Screen.getPrimary().getVisualBounds();
            return new boolean[] {
                new Panel.Place(screen.getMinX() + 10, screen.getMinY() + 10, 700, true).onAScreen(Panel.WIDTH),
                new Panel.Place(-90_000, -90_000, 700, true).onAScreen(Panel.WIDTH)};
        });
        assertTrue(on[0], "a place on the main screen");
        assertFalse(on[1], "a place on no screen");
        // With several agents the list shows as many rows as with one: the window itself need not scroll.
        assertEquals(Panel.TABS_IN_VIEW, Panel.ROWS_IN_VIEW_OF_SEVERAL);
    }

    @Test
    void whereTheWindowHasTheSystemsFrameAroundItsOwnHeaderTheHeaderHasAButtonThatHidesIt() throws Exception {
        List<String> seen = inTheWindow(sent -> {
            var view = new Panel.View(sent::add);
            view.show(model(true, false));
            var steps = new ArrayList<String>();
            java.util.function.Supplier<String> buttons = () -> view.root().lookupAll(".window-button").stream()
                    .map(javafx.scene.control.Button.class::cast)
                    .map(button -> button.getAccessibleText().split("\\.")[0] + (button.isVisible() ? "" : " (not shown)")
                            + " as " + javafx.scene.layout.HeaderBar.getButtonType(button)).toList().toString();
            // A window with the system's whole frame, or with none, has that frame's button to close it, or none.
            steps.add(buttons.get());
            view.ownsItsHeader();
            // The header is the window's own: its two buttons are the system's two, and the port still takes its click.
            steps.add(buttons.get());
            var port = (Panel.PortLabel) view.root().lookup(".header .port");
            steps.add("header " + javafx.scene.layout.HeaderBar.getDragType(view.root().lookup(".header"))
                    + ", port " + javafx.scene.layout.HeaderBar.getDragType(port));
            // And the body is as it was but for that: what the window says has not changed.
            steps.add(String.valueOf(view.words().containsAll(List.of("TabGoblin server", "Port 47821", "SESSIONS", "Stop server"))));
            return steps;
        });
        assertEquals(List.of("[Minimize as null, Close (not shown) as null]", "[Minimize as ICONIFY, Close as CLOSE]",
                "header DRAGGABLE_SUBTREE, port NONE", "true"), seen);

    }
}
