// @vitest-environment jsdom
// What the rich-text renderer puts on the page: real tables, safe output, the scroll region and the
// fallback to plain text:
//   npx vitest run __tests__/rich-text-render.test.tsx
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RichText from "@/components/rich-text/RichText";

const parse = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/rich-text/parse", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rich-text/parse")>();
  return {
    ...real,
    parseRichText: (...args: Parameters<typeof real.parseRichText>) => {
      if (parse.fail) throw new Error("forced parser failure");
      return real.parseRichText(...args);
    },
  };
});

afterEach(() => {
  cleanup();
  parse.fail = false;
  vi.restoreAllMocks();
});

const SALES = "A company recorded these sales.\n\n| Region | Q1 | Q2 |\n|:--|--:|--:|\n| North | 120 | 150 |\n| South | 90 | 80 |\n\nWhich grew?";

describe("RichText blocks", () => {
  it("shows a scenario, a real table and the question", async () => {
    const { container } = render(<RichText text={SALES} />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
    const table = await screen.findByRole("table");
    const heads = within(table).getAllByRole("columnheader");
    expect(heads.map((th) => th.textContent)).toEqual(["Region", "Q1", "Q2"]);
    expect(heads.every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    const cells = within(table).getAllByRole("cell");
    expect(cells.map((td) => td.textContent)).toEqual(["North", "120", "150", "South", "90", "80"]);
  });

  it("shows a table whose header cells are all empty without a header row", async () => {
    render(<RichText text={"|  |  |\n|---|---|\n| a | b |\n| c | d |"} />);
    const table = await screen.findByRole("table");
    expect(within(table).queryAllByRole("columnheader")).toHaveLength(0);
    expect(table.querySelector("thead")).toBeNull();
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getAllByRole("cell").map((td) => td.textContent)).toEqual(["a", "b", "c", "d"]);
  });

  it("aligns columns only where the author said so", async () => {
    render(<RichText text={SALES} />);
    const [region, q1] = await screen.findAllByRole("columnheader");
    expect(region.className).toContain("text-left");
    expect(q1.className).toContain("text-right");
    expect(q1.className).toContain("tabular-nums");
  });

  it("renders plain text as paragraphs and line breaks, with no other element", () => {
    const { container } = render(<RichText text={"first line\nsecond line\n\nnext paragraph"} />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelectorAll("br")).toHaveLength(1);
    expect(container.textContent).toBe("first linesecond linenext paragraph");
    expect(container.querySelector("table, ul, ol, pre, strong, em, code")).toBeNull();
  });

  it("renders marks, lists and code blocks as elements", async () => {
    const { container } = render(
      <RichText text={"**b** _i_ `c`\n\n3. x\n4. y\n\n- p\n- q\n\n```\nlet a = 1;\n```"} />
    );
    expect(container.querySelector("strong")?.textContent).toBe("b");
    expect(container.querySelector("em")?.textContent).toBe("i");
    expect(container.querySelector("p code")?.textContent).toBe("c");
    expect(container.querySelector("ol")?.getAttribute("start")).toBe("3");
    expect([...container.querySelectorAll("ol li")].map((li) => li.textContent)).toEqual(["x", "y"]);
    expect([...container.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual(["p", "q"]);
    await waitFor(() => expect(container.querySelector("pre")?.textContent).toBe("let a = 1;"));
  });

  it("passes the class on to its wrapper", () => {
    const { container } = render(<RichText text="x" className="text-lg" />);
    expect((container.firstChild as HTMLElement).className).toContain("text-lg");
  });
});

describe("RichText inline", () => {
  it("renders a span with marks and breaks, never a block element", () => {
    const { container } = render(<RichText text={"**a**\n- b\n- c"} mode="inline" />);
    const root = container.firstChild as HTMLElement;
    expect(root.tagName).toBe("SPAN");
    expect(root.querySelector("p, ul, ol, table, pre")).toBeNull();
    expect(root.querySelector("strong")?.textContent).toBe("a");
    expect(root.querySelectorAll("br")).toHaveLength(2);
  });
});

describe("safety", () => {
  it("shows HTML as inert text", () => {
    const evil = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      '<a href="javascript:alert(1)">x</a>',
      "[x](javascript:alert(1))",
      "![x](http://a.b/c.png)",
    ].join("\n\n");
    for (const mode of ["blocks", "inline"] as const) {
      const { container, unmount } = render(<RichText text={evil} mode={mode} />);
      expect(container.querySelector("script, img, a, iframe, style")).toBeNull();
      expect(container.innerHTML).not.toContain("onerror=alert(1)>");
      expect(container.textContent).toContain("<script>alert(1)</script>");
      expect(container.textContent).toContain("[x](javascript:alert(1))");
      unmount();
    }
  });

  it("shows HTML inside a table cell as text too", async () => {
    const { container } = render(<RichText text={"| a |\n|---|\n| <img src=x onerror=alert(1)> |"} />);
    const cell = await screen.findByRole("cell");
    expect(container.querySelector("img")).toBeNull();
    expect(cell.textContent).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("the scroll region", () => {
  const widths = (scrollWidth: number, clientWidth: number) => {
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
  };

  it("is a plain box (no tab stop, no label) while the table fits", async () => {
    widths(300, 300);
    render(<RichText text={SALES} />);
    await screen.findByRole("table");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("becomes a focusable, labelled region once the table is wider than its box", async () => {
    widths(900, 300);
    render(<RichText text={SALES} />);
    const region = await screen.findByRole("region", { name: "Table, scrolls sideways" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(within(region).getByRole("table")).toBeTruthy();
  });

  it("does the same for a wide code block", async () => {
    widths(900, 300);
    render(<RichText text={"```\nvery long line\n```"} />);
    expect(await screen.findByRole("region", { name: "Code, scrolls sideways" })).toBeTruthy();
  });
});

describe("fallback", () => {
  it("shows the text as typed if the parser throws", () => {
    parse.fail = true;
    const { container } = render(<RichText text={"| a |\n|---|\n| 1 |\n\nstill here"} className="x" />);
    expect(container.querySelector("table")).toBeNull();
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("whitespace-pre-line");
    expect(root.textContent).toBe("| a |\n|---|\n| 1 |\n\nstill here");
  });

  it("falls back in inline mode too", () => {
    parse.fail = true;
    const { container } = render(<RichText text="**a**" mode="inline" />);
    expect((container.firstChild as HTMLElement).tagName).toBe("SPAN");
    expect(container.textContent).toBe("**a**");
  });
});
