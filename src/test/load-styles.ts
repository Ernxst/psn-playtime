/**
 * Browser-project setup: pull the app's compiled Tailwind entry stylesheet into
 * the test DOM. Vitest browser mode runs a real browser (Playwright), so this
 * module-graph CSS import — compiled by the browser project's `tailwindcss()`
 * Vite plugin — is injected into the page, giving rendered components real
 * computed styles instead of unstyled defaults. Without it, layout/box metrics
 * and any CSS-dependent assertion (widths, `max-w-*`, flex/grid, `display`)
 * measure nothing meaningful.
 */
import "@/styles.css";
