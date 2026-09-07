import { expect, test, type Page } from "@playwright/test";

for (const candidate of ["yjs", "automerge"] as const) {
  test.describe(`${candidate} browser carrier`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(
        `/qualification/step3/browser.html?candidate=${candidate}`,
      );
      await page.locator(".ProseMirror").click();
    });

    test("typing, deletion, replacement, formatting, hard break, undo, and redo", async ({
      page,
    }) => {
      const editor = page.locator(".ProseMirror");
      await editor.pressSequentially("abc");
      await expect.poll(() => visibleText(page)).toBe("abc");

      await page.keyboard.press("Backspace");
      await expect.poll(() => visibleText(page)).toBe("ab");

      await page.evaluate(() => window.coeditQualification.select(1, 2));
      await page.keyboard.insertText("X");
      await expect.poll(() => visibleText(page)).toBe("aX");

      await page.evaluate(() => {
        window.coeditQualification.select(0, 1);
        window.coeditQualification.addBold();
      });
      const snapshot = await page.evaluate(() =>
        window.coeditQualification.snapshot(),
      );
      expect(
        snapshot.items[0]?.marks.some((mark) => mark.kind === "bold"),
      ).toBe(true);

      await page.evaluate(() => window.coeditQualification.select(2, 2));
      await page.keyboard.press("Enter");
      await expect.poll(() => visibleText(page)).toBe("aX\n");

      expect(await page.evaluate(() => window.coeditQualification.undo())).toBe(
        true,
      );
      await expect.poll(() => visibleText(page)).toBe("aX");
      expect(await page.evaluate(() => window.coeditQualification.redo())).toBe(
        true,
      );
      await expect.poll(() => visibleText(page)).toBe("aX\n");
    });

    test("composition-style insertion keeps the explicit Origin protected", async ({
      page,
    }) => {
      const editor = page.locator(".ProseMirror");
      await editor.evaluate((element) => {
        element.dispatchEvent(
          new CompositionEvent("compositionstart", { bubbles: true, data: "" }),
        );
        document.execCommand("insertText", false, "é");
        element.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "é" }),
        );
      });

      await expect.poll(() => visibleText(page)).toBe("é");
      const snapshot = await page.evaluate(() =>
        window.coeditQualification.snapshot(),
      );
      expect(snapshot.items).toHaveLength(1);
      expect(snapshot.origins).toHaveLength(1);
      expect(snapshot.items[0]?.originId).toBe(snapshot.origins[0]?.id);
    });

    test("cut, ordinary paste, and editor remount preserve canonical state", async ({
      page,
    }) => {
      const editor = page.locator(".ProseMirror");
      await editor.pressSequentially("abc");
      await page.evaluate(() => window.coeditQualification.select(1, 2));
      await page.keyboard.press("Control+x");
      await expect.poll(() => visibleText(page)).toBe("ac");

      await page.evaluate(() => window.coeditQualification.select(2, 2));
      await page.keyboard.press("Control+v");
      await expect.poll(() => visibleText(page)).toBe("acb");
      const beforeRemount = await page.evaluate(() =>
        window.coeditQualification.snapshot(),
      );
      await page.evaluate(() => window.coeditQualification.remount());
      expect(
        await page.evaluate(() => window.coeditQualification.snapshot()),
      ).toEqual(beforeRemount);
    });

    test("sanitizes external HTML before schema filtering", async ({
      page,
    }) => {
      const sanitized = await page.evaluate(() =>
        window.coeditQualification.sanitizeClipboardHtml(
          '<strong onclick="attack()">safe</strong><script>attack()</script><img src=x onerror=attack()>',
        ),
      );
      expect(sanitized).toBe("<strong>safe</strong>");
    });
  });
}

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() =>
    window.coeditQualification
      .snapshot()
      .items.map((item) => (item.kind === "text" ? item.text : "\n"))
      .join(""),
  );
}
