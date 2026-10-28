// @vitest-environment jsdom
// The paste converter (docs/RICH_TEXT_PLAN.md, R3.3): a table copied from Excel, Google Sheets, Word or a web
// page becomes rows of cells, and then a Markdown table the parser reads back. The HTML below is shaped like
// what those programs put on the clipboard (trimmed, but with their own habits kept: Excel's conditional
// comments and bare attributes, Sheets' `<br>` in a cell, Word's `<p>` and `<o:p>` in every cell).
//   npx vitest run __tests__/rich-text-paste.test.ts
import { describe, expect, it } from "vitest";
import { tableToMarkdown } from "@/lib/rich-text/build";
import { cellsFromText, htmlTableToCells, tableFromClipboard, tsvToCells } from "@/lib/rich-text/paste";
import { parseRichText } from "@/lib/rich-text/parse";
import { toPlainText } from "@/lib/rich-text/plain";

const EXCEL_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta name=ProgId content=Excel.Sheet><style><!--table {mso-displayed-decimal-separator:"\\."} .xl65 {font-weight:700;} --></style></head>
<body link="#0563C1" vlink="#954F72">
<table border=0 cellpadding=0 cellspacing=0 width=192 style='border-collapse:collapse;width:144pt'>
<!--StartFragment-->
 <col width=64 span=3 style='width:48pt'>
 <tr height=20 style='height:15.0pt'>
  <td height=20 class=xl65 width=64 style='height:15.0pt;width:48pt'>Region</td>
  <td class=xl65 width=64 style='width:48pt'>Q1</td>
  <td class=xl65 width=64 style='width:48pt'>Q2</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 style='height:15.0pt'>North</td>
  <td align=right x:num>120</td>
  <td align=right x:num>150</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 style='height:15.0pt'>South</td>
  <td align=right x:num>90</td>
  <td align=right x:num>80</td>
 </tr>
<!--EndFragment-->
</table>
</body>
</html>`;

const SHEETS_HTML = `<meta charset='utf-8'><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" data-sheets-root="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none"><colgroup><col width="100"/><col width="100"/></colgroup><tbody><tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Step&quot;}">Step</td><td style="overflow:hidden;padding:2px 3px;">Action</td></tr><tr style="height:21px;"><td>1</td><td>Open the file<br />then save it | quickly</td></tr><tr style="height:21px;"><td>2</td><td>Close</td></tr></tbody></table></google-sheets-html-origin></b>`;

const WORD_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta name=ProgId content=Word.Document><style><!-- p.MsoNormal {margin:0cm;} --></style></head>
<body lang=EN-US>
<!--StartFragment-->
<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'>
 <tr>
  <td width=123 valign=top style='width:92.1pt;border:solid windowtext 1.0pt'><p class=MsoNormal><b>Item</b><o:p></o:p></p></td>
  <td width=123 valign=top style='width:92.1pt;border:solid windowtext 1.0pt'><p class=MsoNormal><b>Cost</b><o:p></o:p></p></td>
 </tr>
 <tr>
  <td width=123 valign=top><p class=MsoNormal>Pens<o:p></o:p></p>
  <p class=MsoNormal>(box of 10)<o:p></o:p></p></td>
  <td width=123 valign=top><p class=MsoNormal>&nbsp;4.50<o:p></o:p></p></td>
 </tr>
</table>
<p class=MsoNormal><o:p>&nbsp;</o:p></p>
<!--EndFragment-->
</body>
</html>`;

const text = (rows: string[][] | null) => (rows ? rows.map((row) => row.join(" / ")).join(" ; ") : null);

describe("htmlTableToCells", () => {
  it("reads an Excel selection: bare attributes, comments, a style block and a col element", () => {
    expect(htmlTableToCells(EXCEL_HTML)).toEqual([
      ["Region", "Q1", "Q2"],
      ["North", "120", "150"],
      ["South", "90", "80"],
    ]);
  });

  it("reads Google Sheets: a line break in a cell becomes a space, other markup around the table is ignored", () => {
    expect(htmlTableToCells(SHEETS_HTML)).toEqual([
      ["Step", "Action"],
      ["1", "Open the file then save it | quickly"],
      ["2", "Close"],
    ]);
  });

  it("reads Word: a paragraph per line in a cell, o:p, non-breaking spaces and the empty paragraph after the table", () => {
    expect(htmlTableToCells(WORD_HTML)).toEqual([
      ["Item", "Cost"],
      ["Pens (box of 10)", "4.50"],
    ]);
  });

  it("repeats the text of a merged cell in every cell it covers", () => {
    const html = `<table>
      <tr><th colspan="2">Sales</th><th>Total</th></tr>
      <tr><td rowspan="2">North</td><td>Q1</td><td>10</td></tr>
      <tr><td>Q2</td><td>20</td></tr>
    </table>`;
    expect(htmlTableToCells(html)).toEqual([
      ["Sales", "Sales", "Total"],
      ["North", "Q1", "10"],
      ["North", "Q2", "20"],
    ]);
  });

  it("flattens a table inside a cell into the cell's words", () => {
    const html = `<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td><table><tr><td>x</td><td>y</td></tr></table></td></tr></table>`;
    expect(htmlTableToCells(html)).toEqual([["A", "B"], ["1", "x y"]]);
  });

  it("drops empty rows at the end", () => {
    expect(htmlTableToCells(`<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr><tr><td></td><td>&nbsp;</td></tr></table>`)).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
  });

  it("leaves a script or style inside a cell out", () => {
    const html = `<table><tr><td>A<script>alert(1)</script></td><td>B</td></tr><tr><td><style>p{}</style>1</td><td>2</td></tr></table>`;
    expect(htmlTableToCells(html)).toEqual([["A", "B"], ["1", "2"]]);
  });

  it("does not take a one-row or one-column table, or more than one table, for a paste to convert", () => {
    expect(htmlTableToCells(`<table><tr><td>A</td><td>B</td></tr></table>`)).toBeNull();
    expect(htmlTableToCells(`<table><tr><td>A</td></tr><tr><td>B</td></tr></table>`)).toBeNull();
    expect(htmlTableToCells(`<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table><table><tr><td>C</td><td>D</td></tr><tr><td>3</td><td>4</td></tr></table>`)).toBeNull();
  });

  it("answers null for html with no table", () => {
    expect(htmlTableToCells("<p>Just <b>a paragraph</b></p>")).toBeNull();
    expect(htmlTableToCells("")).toBeNull();
  });

  it("leaves a table too big for a question to the browser", () => {
    const row = `<tr>${"<td>x</td>".repeat(50)}</tr>`;
    expect(htmlTableToCells(`<table>${row.repeat(50)}</table>`)).toBeNull();
  });
});

describe("tsvToCells", () => {
  it("reads what Excel and Sheets put on the clipboard as text", () => {
    expect(tsvToCells("Region\tQ1\tQ2\r\nNorth\t120\t150\r\nSouth\t90\t80\r\n")).toEqual([
      ["Region", "Q1", "Q2"],
      ["North", "120", "150"],
      ["South", "90", "80"],
    ]);
  });

  it("keeps a quoted cell with a line break in it as one cell, with the break turned into a space", () => {
    expect(tsvToCells('Step\tAction\r\n1\t"Open the file\nthen save it"\r\n')).toEqual([
      ["Step", "Action"],
      ["1", "Open the file then save it"],
    ]);
  });

  it("keeps empty cells", () => {
    expect(tsvToCells("A\tB\tC\n1\t\t3\n")).toEqual([["A", "B", "C"], ["1", "", "3"]]);
  });

  it("is not for text that merely has a tab in it", () => {
    expect(tsvToCells("no tabs here\nsecond line")).toBeNull();
    expect(tsvToCells("a\tb")).toBeNull(); // one row: not a table
    expect(tsvToCells("a\tb\nc")).toBeNull(); // ragged
    expect(tsvToCells("a\nb\nc\td")).toBeNull();
  });

  it("is not for indented code", () => {
    expect(tsvToCells("\tif (x) {\n\t\treturn 1;\n\t}\n")).toBeNull();
    expect(tsvToCells("\tone\n\ttwo\n\tthree\n")).toBeNull();
  });

  it("is not for a single column of values or a quote that never closes", () => {
    expect(tsvToCells("1\n2\n3\n")).toBeNull();
    expect(tsvToCells('a\tb\n"oops\tc\n')).toBeNull();
  });
});

describe("cellsFromText", () => {
  it("answers a single value with null, so the browser pastes it as it always did", () => {
    expect(cellsFromText("just words")).toBeNull();
    expect(cellsFromText("just words\n")).toBeNull();
  });

  it("reads any block of cells, even one row or a ragged one (the table editor wants these)", () => {
    expect(cellsFromText("a\tb")).toEqual([["a", "b"]]);
    expect(cellsFromText("a\tb\nc\n")).toEqual([["a", "b"], ["c"]]);
  });
});

describe("tableFromClipboard", () => {
  it("prefers the HTML table (it knows merged cells) and falls back to the text", () => {
    const html = `<table><tr><th colspan="2">Sales</th></tr><tr><td>A</td><td>B</td></tr></table>`;
    expect(tableFromClipboard({ html, text: "Sales\t\nA\tB" })).toEqual([["Sales", "Sales"], ["A", "B"]]);
    expect(tableFromClipboard({ html: "<p>x</p>", text: "A\tB\n1\t2" })).toEqual([["A", "B"], ["1", "2"]]);
    expect(tableFromClipboard({ text: "A\tB\n1\t2" })).toEqual([["A", "B"], ["1", "2"]]);
  });

  it("takes plain text for plain text", () => {
    expect(tableFromClipboard({ html: "<p>Hello</p>", text: "Hello" })).toBeNull();
    expect(tableFromClipboard({})).toBeNull();
  });

  it("falls back to the text half when the HTML has several tables (Word gives tabs for those)", () => {
    const two = `<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table><table><tr><td>C</td><td>D</td></tr><tr><td>3</td><td>4</td></tr></table>`;
    expect(tableFromClipboard({ html: two, text: "A\tB\n1\t2" })).toEqual([["A", "B"], ["1", "2"]]);
  });
});

describe("a paste becomes a table the parser reads back", () => {
  it("shows the same words in the same places, with pipes and marks kept as text", () => {
    const rows = htmlTableToCells(SHEETS_HTML)!;
    const markdown = tableToMarkdown(rows.map((row) => row.map((cell) => cell.replace(/\|/g, "\\|"))));
    const table = parseRichText(markdown).blocks[0];
    expect(table.type).toBe("table");
    if (table.type !== "table") return;
    const flat = [table.header, ...table.rows].map((row) =>
      row.map((cell) => toPlainText([{ type: "paragraph", children: cell }]))
    );
    expect(text(flat)).toBe(text(rows));
  });
});
