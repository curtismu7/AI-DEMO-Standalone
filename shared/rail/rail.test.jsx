import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Rail from "./Rail";

// Vendored with Rail.jsx: the tri-state storage ("1" collapsed, "0" expanded, absent = the lab's default) and the defaultCollapsed prop.
const KEY = "test.rail";
const mount = (props = {}) => render(<Rail storageKey={KEY} label="Setup" {...props}><p>sidebar content</p></Rail>);
const collapsed = () => screen.getByTestId("rail").className.includes("rail-wrap--collapsed");

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("Rail", () => {
  test("expanded on the first visit unless the lab asks otherwise", () => {
    mount();
    expect(collapsed()).toBe(false);
    expect(screen.getByTestId("rail-toggle").getAttribute("aria-expanded")).toBe("true");
  });

  test("defaultCollapsed starts collapsed on the first visit, and the first visit writes nothing", () => {
    mount({ defaultCollapsed: true });
    expect(collapsed()).toBe(true);
    expect(screen.getByTestId("rail-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("a click expands, remembers it, and an explicit expand beats defaultCollapsed on the next visit", () => {
    const first = mount({ defaultCollapsed: true });
    fireEvent.click(screen.getByTestId("rail-toggle"));
    expect(collapsed()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("0");
    first.unmount();
    mount({ defaultCollapsed: true });
    expect(collapsed()).toBe(false);
  });

  test("collapsing is remembered too (and still is for a default-expanded lab)", () => {
    const first = mount();
    fireEvent.click(screen.getByTestId("rail-toggle"));
    expect(collapsed()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("1");
    first.unmount();
    mount();
    expect(collapsed()).toBe(true);
  });

  test("the toggle names the sidebar it shows or hides", () => {
    mount({ defaultCollapsed: true });
    expect(screen.getByTestId("rail-toggle").getAttribute("title")).toBe("Show setup");
    fireEvent.click(screen.getByTestId("rail-toggle"));
    expect(screen.getByTestId("rail-toggle").getAttribute("title")).toBe("Hide setup");
  });
});
