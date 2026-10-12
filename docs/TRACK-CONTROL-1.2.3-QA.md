# 1.2.3 CI repair

The failed hosted runs were inspected rather than treating a successful Pages deployment as a passing test run. Release-path, replaced-demo-control and resize expectations were repaired first. Startup transfer limits remain unchanged, and mute verification still requires the same measured silence threshold.

The complete run then exposed three additional failures:

- Crossfade invoked a developer's Windows Node executable on Linux. Crossfade and artwork fixtures now use Node from PATH.
- Preview lifecycle checks sampled worklet connections before the asynchronous disconnect completed. They now wait for the required disconnected state, with the browser timeout unchanged.
- The Natural renderer's `ended` callback could clear its gain before the final offline render block was copied. A new unit regression reproduces an early event. Cleanup now waits for the scheduled audio-clock end; reset/dispose cancels the pending cleanup timer. Audio comparison tolerances were not relaxed.

Local checks: 584 unit tests passed with no skips; type checking passed; Natural output and truncation comparisons passed in the pinned Playwright Chromium build; crossfade and preview lifecycle checks passed. The new early-ended regression was run failing before the renderer fix and passing afterward.

All 102 focused feature/set PNGs were recaptured against userscript SHA256 `a42d70917347a886c911e7b1e950a241371953a2b889f57b65363892402e4504`. The UI and copy styles are unchanged from the previously reviewed 1.2.2 controls. Historical screenshot provenance remains historical, not relabelled as current capture.

The browser runner now attempts all independent suites and reports every failure, retaining a failing exit status. Natural and website checks also run after a browser-suite failure if the build succeeded. An injected-failure self-check confirmed all 23 browser suites execute and exit status remains 1.

Hosted CI is still the final gate. Local passes do not establish a green Actions result. No live SoundCloud/Widevine or Discord-client listening test was performed for this repair. The installed desktop adapter remains 1.2.2 until the new adapter is applied; replacing it can reload playback.
