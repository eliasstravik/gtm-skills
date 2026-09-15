import { test } from "node:test";
import assert from "node:assert/strict";
import { webUrl } from "../templates/viewer/web-url";

test("web addresses become links without changing their displayed value", () => {
  for (const [input, expected] of [
    [
      "https://example.com/profile?a=1#about",
      "https://example.com/profile?a=1#about",
    ],
    ["HTTP://example.com", "http://example.com/"],
    [" example.com ", "https://example.com/"],
    ["www.example.com/profile", "https://www.example.com/profile"],
    ["example.com:8443/a%20b", "https://example.com:8443/a%20b"],
    ["https://例え.テスト/", "https://xn--r8jz45g.xn--zckzah/"],
  ])
    assert.equal(webUrl(input), expected, input);
});

test("prose, emails, malformed addresses and non-web schemes remain text", () => {
  for (const value of [
    null,
    42,
    {},
    "",
    "Ada Example",
    "name@example.com",
    "42.5",
    "See https://example.com",
    "https:example.com",
    "//example.com",
    "https://",
    "example..com",
    "-example.com",
    "https://example.com/a b",
    "https://user:secret@example.com",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:name@example.com",
    "ftp://example.com",
    "file:///tmp/example.com",
    "https://exam\nple.com",
    "https://example.com\\@other.example",
    "https://example.com:99999",
  ])
    assert.equal(webUrl(value), undefined, JSON.stringify(value));
});
