import { expect, test } from "@playwright/test";

const budgets = [
  { route: "/dashboard", response: 2_500, dom: 5_000, load: 7_000 },
  { route: "/agenda", response: 2_500, dom: 5_000, load: 7_000 },
  { route: "/pos", response: 2_500, dom: 5_000, load: 7_000 },
  { route: "/analitica", response: 3_000, dom: 6_000, load: 8_000 },
] as const;

for (const budget of budgets) {
  test(`@performance respeta el presupuesto de ${budget.route}`, async ({ page }, testInfo) => {
    await page.goto(budget.route);
    const timing = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      return {
        responseStart: navigation.responseStart,
        domContentLoaded: navigation.domContentLoadedEventEnd,
        load: navigation.loadEventEnd,
      };
    });

    await testInfo.attach("performance-budget.json", {
      body: JSON.stringify({ route: budget.route, budget, timing }, null, 2),
      contentType: "application/json",
    });

    expect(timing.responseStart, `TTFB de ${budget.route}`).toBeLessThanOrEqual(budget.response);
    expect(timing.domContentLoaded, `DOMContentLoaded de ${budget.route}`).toBeLessThanOrEqual(
      budget.dom,
    );
    expect(timing.load, `Load de ${budget.route}`).toBeLessThanOrEqual(budget.load);
  });
}
