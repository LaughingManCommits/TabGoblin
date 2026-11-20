package browsercontext;

/** A structured browser error: a stable code plus a message that is safe to show to the agent. */
public class BrowserException extends RuntimeException {

    private final String code;

    public BrowserException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
