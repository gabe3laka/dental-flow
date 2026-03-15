import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logError, LogContext } from "@/lib/logger";

describe("logError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("calls console.error with [arcline] tag and structured object", () => {
    logError(new Error("msg"), { operation: "test/op" });

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const [tag, obj] = consoleErrorSpy.mock.calls[0] as [string, Record<string, any>];
    expect(tag).toBe("[arcline]");
    expect(obj.operation).toBe("test/op");
  });

  it("includes userId when provided", () => {
    logError(new Error("msg"), { operation: "test/op", userId: "u1" });

    const [, obj] = consoleErrorSpy.mock.calls[0];
    expect(obj.userId).toBe("u1");
  });

  it("defaults userId to 'anonymous' when not provided", () => {
    logError(new Error("msg"), { operation: "test/op" });

    const [, obj] = consoleErrorSpy.mock.calls[0];
    expect(obj.userId).toBe("anonymous");
  });

  it("includes a valid ISO timestamp", () => {
    logError(new Error("msg"), { operation: "test/op" });

    const [, obj] = consoleErrorSpy.mock.calls[0];
    expect(obj.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/);
  });

  it("includes error.message for Error instances", () => {
    logError(new Error("msg"), { operation: "test/op" });

    const [, obj] = consoleErrorSpy.mock.calls[0];
    expect(obj.error.message).toBe("msg");
  });

  it("does not throw and includes string error when passed a string", () => {
    expect(() => logError("string error", { operation: "test/op" })).not.toThrow();

    const [, obj] = consoleErrorSpy.mock.calls[0];
    expect(obj.error).toBe("string error");
  });

  it("does not throw when passed an unknown object", () => {
    expect(() => logError({ code: 404 }, { operation: "test/op" })).not.toThrow();
  });

  it("spreads extra fields to the top level of the entry object", () => {
    logError(new Error("msg"), { operation: "test/op", extra: { key: "val" } });

    const [, obj] = consoleErrorSpy.mock.calls[0];
    expect(obj.key).toBe("val");
  });
});
