# Brick V1 Phase 7 — Real OPPO + Parent Browser Acceptance

This checklist closes the gap between CI correctness and actual Phase 7 acceptance. It is intentionally evidence-driven: a state that cannot be safely/naturally produced on the OPPO is not faked merely to obtain a checkbox. Synthetic/fixture proof remains valid for rare internal states, while common user-visible paths require real-device/browser proof.

## Preconditions

- OPPO Reno10 Pro remains paired to the Phase 7 development worker.
- Brick remains Device Owner. Do not uninstall Brick to perform this checklist.
- Development parent worker is the card-free `brick-family-v1-dev` environment.
- Production remains untouched.
- Record exact Android app version and parent portal header/version before testing.
- Start with phone Location ON, Brick healthy, no SOS active, and network available.

## A. Parent browser smoke — desktop

PASS only if all of the following work without console/runtime failure visible to the user:

1. Parent login succeeds using the development auth path.
2. Paired OPPO appears without re-pairing.
3. Now / History / Trips / Places / Health / Debug tabs all open.
4. Map loads, or the explicit map-unavailable fallback appears while the rest of the portal remains usable.
5. Live state continues updating after leaving the tab open and after switching away/back.
6. Browser network disconnect/reconnect does not require a manual page reload to recover live updates.
7. Device Health and Position Health are shown separately.
8. Evidence Providers render without unsupported hardware becoming a red whole-device failure.
9. `Why this position` shows position class, geometry, evidence freshness, source and explanation.
10. No degraded AREA/CORRIDOR/LAST_KNOWN/UNKNOWN state is represented as a precise current marker.
11. If a newer WebSocket fix arrives before the normalized REST read model catches up, the portal must not attach the older Phase 7 geometry/explanation/health presentation to the newer fix. A temporary pending/phone-only view followed by automatic refresh is acceptable; stale cross-fix presentation is not.

## B. Parent browser smoke — mobile-width browser

PASS only if:

1. Header/device/status controls remain readable without horizontal page overflow.
2. Map remains usable and the details panel is reachable.
3. Tab strip remains usable at phone width.
4. Now / History / Trips / Places / Health / Debug content is reachable.
5. Long evidence/provider text wraps instead of covering controls.
6. SOS/safety information is not hidden by responsive layout.
7. History playback controls remain usable.

A desktop browser resized to a narrow viewport is useful evidence, but one real phone-browser smoke is still preferred before Phase 7 is marked ACCEPTED.

## C. Current position presentation

### Outdoor precise/assisted fix

- Go outdoors with clear sky.
- Wait for a fresh position.
- Parent must show PRECISE or ASSISTED only if that is what Brick actually reports.
- Exact marker may be shown only for CIRCLE geometry.
- Uncertainty must be visible.
- Evidence freshness must advance from the actual observation, not from server refresh time.
- Speed/mode/battery/live freshness must update plausibly.

### Indoor/degraded fix

- Move indoors where GNSS naturally degrades.
- Brick may remain precise/assisted if the phone genuinely retains a trustworthy fix; do not require artificial degradation.
- If Brick becomes ESTIMATED/COARSE/ANCHORED/LAST_KNOWN, parent must switch to area/corridor semantics and remove an exact-looking current marker.
- Device Health may stay healthy while Position Health degrades.

### Evidence conflict

- Do not manufacture contradictory radio/location evidence on the real phone.
- CI fixture proof is the normal acceptance evidence unless a natural conflict occurs.
- If one occurs naturally, parent must explicitly say evidence conflicts and widen uncertainty.

### UNKNOWN / no trustworthy coordinate

- Prefer a safe temporary Location-off control test rather than destructive permission/package changes.
- Parent must not leave a stale exact marker pretending to be current.
- Restore Location ON and confirm automatic recovery without reboot/re-pair.

## D. Requested / actual / acknowledged Location control

Test ON -> OFF -> ON once.

For each command record:

1. Requested state changes immediately as the parent's intent.
2. Actual state remains separately reported by the phone.
3. Current command is `Pending` until the phone acknowledges that exact command ID.
4. A matching old actual-state observation must not be labelled confirmed.
5. After phone applies it, parent shows actual state + acknowledgement + recent observation time.
6. ON restoration recovers tracking automatically with no app reopen/reboot/re-pair.

Always finish with Location ON.

## E. History and playback

Test Today and one broader range that actually has data.

PASS only if:

- Today works.
- Yesterday handles both data and no-data cleanly.
- 7 days works.
- 30 days stays bounded and usable when sufficient history exists.
- Custom range works and rejects/handles invalid range cleanly.
- Distance, duration, average moving speed, max trusted speed, modes and meaningful stops render.
- Playback works at 0.5x / 1x / 2x / 5x / 10x.
- Scrubbing does not corrupt the base history route.
- Trusted route remains the base evidence route.
- Refined overlay can be toggled independently.
- If no refined frames exist for the chosen range, UI says so rather than inventing them.
- If real refined frames later exist, verify dashed/secondary refined visualization is visibly distinct and trusted history is unchanged.

## F. Places / geofence safety

Use a temporary test Place with a sensible radius.

PASS only if:

- A qualified PRECISE/ASSISTED/ANCHORED observation can establish/transition place state after existing dwell/hysteresis rules.
- ESTIMATED/COARSE/LAST_KNOWN/UNKNOWN observations do not create enter/exit transitions from their displayed centre.
- If a pending enter/exit dwell candidate is interrupted by any degraded/unqualified positioning interval, that pending dwell is broken. One later trusted fix must not complete dwell using time accumulated before the degraded interval.
- Boundary noise does not spam enter/exit events.
- Deleting/disabling the temporary Place works.

Do not reduce the radius to an unrealistic value just to force events.

## G. Trip safety

Create one short test trip.

PASS only if:

- start/end/cancel still work.
- arrival requires a qualified position and existing dwell/repeat logic.
- a degraded estimated centre alone does not mark arrival.
- if an arrival or prolonged-stop dwell candidate is interrupted by degraded/unqualified positioning, the pending coordinate-dependent dwell is broken and must start again from later qualified evidence.
- prolonged-stop location logic does not use a degraded guessed centre.
- time-based overdue logic still works when position is degraded; if the test is performed, its event must omit guessed coordinates/distance.

Do not deliberately strand the phone for a long interval merely to test overdue if a shorter controlled test fixture already proves the server logic. Real overdue proof is useful but is not worth unsafe or disruptive behavior.

## H. Health and providers

PASS only if:

- Device Owner is reported as managed.
- tracker/service health is separate from position quality.
- Location enabled/subscribed/last-location age are visible under Position Health.
- GNSS satellite information is shown only when reported.
- Wi-Fi, Wi-Fi RTT, BLE, cellular, LAN, GNSS sky, network context and device context statuses render when reported.
- unsupported hardware is neutral.
- optional privileged/Shizuku fallback being absent/degraded does not imply Brick Core failed.
- queue/ACK/recovery values remain measured, not invented.
- manual interventions remain `Not measured` until Brick has a real measurement source.

## I. I’M SAFE and SOS regression

### Online

- I’M SAFE queues/sends and appears in parent safety events.
- SOS 3-second cancel window works.
- SOS activation appears in parent promptly.
- SOS end/cancel update reaches parent.

### Offline/reconnect

Use a controlled temporary network loss.

- I’M SAFE or SOS event must persist locally if it cannot send.
- Restore network.
- Event must send automatically without reopening Brick or re-pairing.
- No duplicate user-visible safety event should be created by retry.

Finish with SOS inactive and network restored.

## J. Restart/recovery smoke

These are Phase 6C reliability behaviors but Phase 7 must not break them:

- screen off/on
- browser background/foreground
- Wi-Fi/mobile switch where available
- temporary airplane/offline period followed by recovery
- child app swiped from recents (do not force-stop unless specifically testing force-stop semantics)
- one normal phone reboot when appropriate for the broader OPPO qualification

No recoverable scenario may require manual sync, re-pair, app reopen or repeated reboot.

## K. Revocation/read-only history

Do not revoke the only real test phone merely for Phase 7 if re-pairing would disturb Device Owner qualification.

Use retained automated/backend regression as primary proof. If a disposable test device/identity is available later:

- revoke blocks future child uploads/control mutation.
- already retained history remains readable according to the V1 contract.

## L. Evidence required for Phase 7 closure

Record only facts actually observed:

- cloud branch SHA and green CI run
- Android branch SHA and green build/instrumentation run
- exact live deployed development SHA
- parent desktop browser + version
- mobile browser + version if used
- OPPO app version and Device Owner status
- PASS/FAIL per exercised scenario
- screenshots only where they help prove UI state
- diagnostic report if any failure occurs

Rare/unavailable states are recorded as `VERIFIED BY FIXTURE` or `NOT NATURALLY OBSERVED`, never falsely marked as real-device PASS.

Phase 7 closes only with categories:

- `ACCEPTED`
- `OPEN BLOCKER`
- `VERIFIED UNSUPPORTED`
- `VERIFIED BY FIXTURE / NOT NATURALLY OBSERVED` for rare state-rendering scenarios where forcing the state would be dishonest or destructive.
